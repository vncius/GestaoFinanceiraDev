# Tool calling — Arquitetura

Mecanismo genérico da plataforma de IA para o modelo solicitar ações ao
backend. Implementado em `backend/src/modules/ai/ai-tool.types.ts` e
`backend/src/modules/ai/tool-registry.ts`.

## Conceito

Uma **tool** é a única forma de o modelo interagir com a aplicação. Cada tool
tem:

- `name` — identificador exato usado na resolução;
- `description` — anunciada ao modelo (faz parte do prompt);
- `kind` — `'read'` (consulta contexto autorizado) ou `'proposal'` (altera
  apenas draft/estado de fluxo — nunca dados financeiros, ADR 0003);
- `inputSchema` — schema Zod que valida os argumentos **e** é a fonte do JSON
  Schema anunciado ao modelo (via `zod-to-json-schema`, sem contrato duplicado);
- `execute(input, context)` — executor rodando no backend.

## Registro e resolução

`AiToolRegistry` mantém a **lista fechada** de tools de um fluxo (ex.: o
onboarding registra as suas). Registro duplicado falha na inicialização
(`AiConfigError`). A resolução é por nome exato; nome desconhecido não lança —
vira resultado de erro devolvido ao modelo (`ai.tool.unknown`).

## Contexto de execução

`AiToolContext` (`tenantId`, `language`, estendível por domínio) é montado
**exclusivamente pelo backend** a partir da requisição autenticada
(`req.tenantId` do JWT). O modelo nunca fornece tenant/usuário: os schemas
`z.object` descartam chaves desconhecidas, então um argumento `tenantId`
injetado pelo modelo simplesmente não chega ao executor (coberto por teste).

## Entrada e saída

- Entrada: `AiToolCall { id, name, input }` (formato neutro do provedor).
- Saída: `AiToolResult { toolCallId, name, ok, output }`.
- Sucesso → `output` estruturado da tool.
- Falha → `ok: false` com `AiToolErrorOutput { code, message, params?, details? }`:
  - argumentos inválidos → `validation.generic` + `details` por campo;
  - `AppError` do domínio → `code` i18n original (ex.:
    `onboarding.draft.invalidRef`) + `params`;
  - erro inesperado → `ai.tool.failed` **sem nenhum detalhe interno** (stack,
    mensagens de driver e afins não vazam ao modelo; coberto por teste).

Erros voltam ao modelo como resultado da tool, permitindo autocorreção sem
quebrar o turno.

## Limites

`AiToolRunner` aplica o orçamento de tool calls **por turno** (default
`AI_MAX_TOOL_ROUNDS` → `ai.config.ts`). Excedido, a chamada não executa e o
modelo recebe `ai.tool.limitExceeded`. Chamadas com nome desconhecido também
consomem orçamento (evita loop infinito de tentativas). O loop da conversa
(etapa da conversa) usa `runner.remaining` para encerrar o turno.

## Tools do onboarding

Registradas em `backend/src/modules/onboarding/onboarding-tools.ts`
(`createOnboardingToolRegistry`, wiring em `container.ts`):

| Tool | Kind | Efeito |
|---|---|---|
| `get_onboarding_context` | read | Status, draft compacto (com draftItemIds), pendências e **nomes** de contas/categorias existentes (UUIDs reais nunca circulam pelo modelo) |
| `propose_account` | proposal | Conta no draft; `accountTypeName` resolve/cria o tipo internamente; `isMain` marca a principal |
| `propose_income` | proposal | Receita no draft; `categoryName` resolve/cria categoria INCOME |
| `propose_expense` | proposal | Despesa no draft; `categoryName` resolve/cria categoria EXPENSE |
| `propose_credit_card` | proposal | Cartão no draft |
| `propose_settings` | proposal | Configurações (singleton; substitui proposta anterior) |
| `update_draft_item` | proposal | Patch em item por draftItemId (revalidação completa) |
| `remove_draft_item` | proposal | Remove item (falha se referenciado) |
| `present_setup_summary` | proposal | Sinaliza fim da coleta: `IN_PROGRESS → AWAITING_CONFIRMATION` (idempotente); retorna draft + pendências |

Decisão de escopo: `propose_account_type` e `propose_category` **não** são
tools — a resolução por nome é interna às propostas (reusa item homônimo do
draft ou cria), reduzindo as refs que o modelo precisa administrar.

Pendências calculadas (`computePendencies`): `noAccounts`, `noMainAccount`,
`noIncomes`, `noSettings` — retornadas em toda proposta para guiar o modelo.

Nenhuma dessas tools toca coleções financeiras (coberto por teste que verifica
os repositórios após todas as propostas).

## Como adicionar uma nova tool

1. Defina o schema Zod dos argumentos (reaproveite schemas do domínio quando
   possível).
2. Implemente `AiTool` com `kind` correto — regras do ADR 0003: tools nunca
   gravam/alteram/excluem entidades financeiras; `proposal` só toca draft.
3. Registre no `AiToolRegistry` do fluxo (wiring no `container.ts`).
4. Escreva testes: sucesso, argumentos inválidos, erros de domínio.
5. A definição para o modelo (nome + descrição + JSON Schema) sai de graça de
   `registry.definitions()`.
