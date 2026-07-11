# Plataforma de IA — Arquitetura

> Documento vivo. Criado na Etapa 1 (apenas arquitetura planejada); as seções são
> atualizadas conforme cada etapa de implementação é concluída. O status de cada
> componente está marcado ao longo do texto.

## Objetivo

Construir uma infraestrutura de IA **extensível** dentro da aplicação de gestão
financeira — não uma funcionalidade isolada. A primeira capacidade é o
**onboarding conversacional** de novos usuários (ver
[onboarding-ai.md](onboarding-ai.md), criado na etapa correspondente), mas a
mesma base deverá suportar capacidades futuras: criação de receitas/despesas por
conversa, consultas financeiras, análises de fluxo de caixa, projeções e
recomendações — sempre por meio de **tools registradas no backend**.

Princípio central e inegociável:

> **A IA interpreta e propõe. A aplicação valida e executa.**

A IA nunca acessa o banco, nunca gera/executa SQL, nunca escolhe endpoints
arbitrários, nunca recebe `tenantId`/`userId` do frontend e nunca grava dados
financeiros. Tudo o que ela pode fazer é definido por uma lista fechada de tools
validadas por Zod e executadas pelo backend com o tenant autenticado.

## Componentes principais

Dois módulos novos no backend, seguindo o padrão de módulos já existente
(`*.types.ts`, `*.schemas.ts`, `*.repository.ts`, `*.mongo-repository.ts`,
`*.service.ts`, `*.controller.ts`, `*.routes.ts`, wiring manual em
`backend/src/container.ts`, rotas montadas em `backend/src/server.ts` **depois**
do `authMiddleware`).

### Módulo `ai/` — infraestrutura (sem regra de negócio)

Responsável apenas por comunicação com provedores e contratos genéricos:

| Componente | Responsabilidade | Status |
|---|---|---|
| `ai-provider.types.ts` | Contrato neutro: `AiMessage`, `AiToolDefinition`, `AiToolCall`, `AiChatResult` e a interface `AiProvider` | implementado |
| `ai.config.ts` | Configuração centralizada (`loadAiConfig`): provider, modelo, max tokens, timeout, limite de tool rounds — via env `AI_*` | implementado |
| `ai.errors.ts` | Erros da integração (`AiConfigError`, `AiProviderUnavailableError`, `AiTimeoutError`, `AiRateLimitedError`), subclasses de `AppError` com códigos i18n `ai.*` | implementado |
| `providers/fake-ai.provider.ts` | `FakeAiProvider`: roteiro determinístico de respostas/tool calls/erros, captura requisições para asserções | implementado |
| `create-ai-provider.ts` | Factory que seleciona a implementação pela config; wiring em `container.ts` (`aiConfig`, `aiProvider`). Default `AI_PROVIDER=fake` até a integração real | implementado |
| `providers/anthropic.provider.ts` | Único código que conhece o SDK da Anthropic (`@anthropic-ai/sdk`): mapeia mensagens/tools neutras ↔ formato do provedor, mescla tool results paralelos em uma única mensagem user, timeout via cliente + `AbortSignal`, retry limitado (`maxRetries: 1` do SDK para 408/429/5xx), erros mapeados por status para os `AppError` de `ai.errors.ts`. Sem extended thinking (o formato neutro não transporta thinking blocks para replay no loop de tools) | implementado |
| Registro/execução de tools | Definição de tool (nome + schema Zod + executor), resolução por nome, validação, limites de chamadas | planejado (Etapa 5) |

### Módulo `onboarding/` — primeiro domínio consumidor

Estado do onboarding por tenant, draft estruturado, conversa, tools de proposta,
aplicação idempotente após confirmação. Detalhado em `onboarding-ai.md`
(Etapas 3–9).

## Responsabilidades por camada

| Camada | Responsabilidade |
|---|---|
| Frontend | UI de chat e de revisão do draft; nunca fala com o provedor de IA; nunca envia `tenantId` |
| Controller/Routes | Autenticação via `authMiddleware` (JWT → `req.tenantId`), validação Zod do body, limites de payload |
| Serviço de conversa (domínio) | Orquestra o turno: monta contexto, chama `AiProvider`, processa tool calls em loop limitado, persiste mensagens/draft |
| Registro de tools (`ai/`) | Lista fechada de tools; valida argumentos com Zod; executa com contexto controlado pelo backend |
| `AiProvider` (`ai/`) | Comunicação com o modelo; sem conhecimento de domínio |
| Serviço de aplicação (domínio) | Executa o draft confirmado **reusando os services financeiros existentes** (`AccountsService`, `ReceivablesService` etc.), com idempotência |
| Repositórios/`MongoStore` | Persistência sempre filtrada por `tenantId` |

## Fluxo de requisição (turno de conversa)

```
Usuário → POST /onboarding/messages (cookie de sessão)
  → authMiddleware popula req.tenantId / req.userId
  → controller valida body (Zod, limite de caracteres)
  → conversation service:
      1. carrega estado + draft + resumo + últimas N mensagens
      2. monta system prompt + contexto mínimo do tenant
      3. chama AiProvider.chat({ system, messages, tools, maxTokens, signal })
      4. para cada tool call retornada:
         a. resolve a tool pelo nome no registro (lista fechada)
         b. valida argumentos com Zod
         c. executa com contexto do backend (tenant autenticado, draft, idioma)
         d. devolve resultado estruturado ao modelo (erros de validação inclusive,
            permitindo autocorreção)
         e. repete até resposta final ou teto de tool rounds
      5. persiste mensagens e draft atualizado
  → resposta ao frontend (texto do assistente + estado/draft atualizados)
```

A execução final (criação de contas, receitas etc.) **não** faz parte deste
fluxo: acontece somente em `POST /onboarding/confirm`, a partir do draft
validado, ignorando qualquer texto da conversa (ver ADR 0004).

## Abstração de provedor

Decisão registrada no [ADR 0002](../adr/0002-ai-provider-abstraction.md).
Contrato conceitual:

```ts
interface AiProvider {
  chat(request: {
    system: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<AiCompletionResult>;
}
```

- Nenhum service de domínio importa tipos do SDK de um provedor.
- `ToolDefinition` carrega JSON Schema derivado dos schemas Zod das tools.
- O provider fake implementa a mesma interface e permite testes determinísticos
  de todo o fluxo conversacional sem chamadas reais.

## Configuração

Variáveis de ambiente **somente no backend** (`backend/.env`, com exemplo em
`backend/.env.example` — mesmo padrão de `JWT_SECRET`/`GOOGLE_CLIENT_ID`):

| Variável | Uso |
|---|---|
| `AI_PROVIDER` | `fake` (default — determinístico, sem rede) ou `anthropic`. O default `fake` mantém o boot independente de credenciais; o provedor real é ativado explicitamente |
| `AI_API_KEY` | Chave do provedor. Obrigatória com `AI_PROVIDER=anthropic`. Nunca enviada ao frontend, nunca logada, nunca commitada |
| `AI_MODEL` | Modelo utilizado (default `claude-opus-4-8`) |
| Demais limites (timeout, max tokens, tool rounds) | Centralizados em `ai.config.ts`, com defaults seguros e override por env quando fizer sentido |

## Tratamento de erros

Segue o padrão existente `AppError(message, statusCode, code, params)` +
`errorHandler` (`backend/src/shared/middlewares/error-handler.ts`): o backend
devolve `{ error, code, params }` e o frontend traduz o `code` via i18next
(pt/en/es), namespace `errors`.

- Falha/timeout do provedor → erro com código próprio (ex.:
  `ai.providerUnavailable`, `ai.timeout`), retry limitado para falhas
  transitórias, e fallback claro na UI para a configuração manual.
- Tool call inválida → o erro volta ao modelo como resultado da tool (uma
  chance de autocorreção); persistindo, o turno falha de forma controlada sem
  corromper estado.
- Nenhum erro técnico expõe conteúdo financeiro em logs (política detalhada em
  `ai-security.md`, criado na etapa de tool calling).

## Estratégia de evolução

- **Novas capacidades = novas tools + novos prompts**, nunca acesso mais amplo.
  O registro de tools é genérico (Etapa 5); o onboarding apenas registra o seu
  conjunto. Uma futura capacidade de "consultas financeiras" registraria tools
  de leitura próprias, reutilizando provider, registro, validação e limites.
- **Troca de provedor = nova implementação de `AiProvider`** + configuração;
  zero mudança nos domínios.
- **Streaming (SSE)** fica fora da primeira versão; a interface do provider
  poderá ganhar um método opcional de stream sem quebrar consumidores.
- Fora de escopo da primeira versão (não criar código antecipado): múltiplos
  agentes, RAG/embeddings, memória permanente, troca dinâmica de provedor pelo
  usuário, painel administrativo de IA.

## Documentos relacionados

- [ADR 0002 — Abstração de provedor de IA](../adr/0002-ai-provider-abstraction.md)
- [ADR 0003 — Tools de IA não escrevem dados financeiros](../adr/0003-ai-tools-cannot-write-financial-data.md)
- [ADR 0004 — Draft estruturado com confirmação explícita](../adr/0004-onboarding-draft-confirmation.md)
- [ADR 0005 — Idempotência na confirmação do onboarding](../adr/0005-onboarding-idempotency.md)
- `onboarding-ai.md`, `tool-calling.md`, `ai-context.md`, `ai-security.md` —
  criados nas etapas que introduzem cada assunto.
