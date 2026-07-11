# Contexto enviado ao modelo

Como cada turno de conversa do onboarding é montado
(`onboarding-conversation.service.ts` + `onboarding-context.service.ts` +
`onboarding-prompts.ts`).

## Montagem do turno

```
system  = system prompt estático por idioma (onboarding-prompts.ts)
messages =
  1. mensagem de contexto gerada pelo sistema (OnboardingContextService):
     { status, draft compacto (com draftItemIds), pendências, nota de resumo }
  2. últimas 12 mensagens persistidas da conversa (janela)
  3. mensagem atual do usuário
tools   = definições do AiToolRegistry do onboarding (JSON Schema derivado do Zod)
```

O loop de tool calls acontece dentro do turno: cada rodada anexa a resposta do
assistente (com tool calls) e os resultados estruturados das tools, até o
modelo responder sem tools ou o orçamento (`AI_MAX_TOOL_ROUNDS`, default 8)
acabar.

## O que é enviado

- Instruções do sistema (estáticas por idioma, sem interpolação de dados).
- Status do onboarding e draft compacto — a proposta em construção, com
  draftItemIds/refs simbólicas.
- Pendências calculadas (`noAccounts`, `noMainAccount`, `noIncomes`,
  `noSettings`).
- Janela das últimas mensagens da conversa.
- Via tool de leitura (`get_onboarding_context`), quando o modelo pede: nomes
  de contas/categorias já existentes do próprio tenant.

## O que NUNCA é enviado

- `tenantId`, `userId`, tokens, cookies, JWT, hashes, credenciais (coberto por
  teste que serializa a requisição inteira e verifica a ausência do tenant).
- Dados de outros tenants (impossível por construção: repositórios filtram por
  tenant e o contexto sai do estado do próprio onboarding).
- Histórico financeiro (transações, faturas, saldos) — desnecessário para
  onboarding de tenant vazio.
- UUIDs reais de entidades — apenas nomes circulam pelo modelo.

## Janela de mensagens e resumo

Apenas as **últimas 12 mensagens** vão ao modelo. A estratégia de "resumo" da
primeira versão é estrutural, não textual: tudo que o modelo extraiu de
mensagens antigas já está registrado no **draft**, que é reenviado inteiro (e
compacto) a cada turno. A mensagem de contexto informa quantas mensagens foram
omitidas para o modelo não estranhar o corte. Um resumo textual gerado pelo
modelo pode ser adicionado depois sem mudar o contrato
(`OnboardingState.conversationSummary` já existe para isso).

## Idioma

`language` (pt/en/es) chega no primeiro turno (`POST /onboarding/messages`),
fica persistido no estado e seleciona o system prompt, que instrui o modelo a
responder sempre nesse idioma. O texto da IA não passa pelo i18next.

## Controle de tokens

- Mensagem do usuário ≤ 2000 caracteres (Zod).
- `AI_MAX_OUTPUT_TOKENS` (default 1024) por resposta.
- Janela de 12 mensagens + draft compacto mantêm a entrada enxuta.
- Teto de `AI_MAX_TOOL_ROUNDS` tool calls por turno e de 60 turnos por
  conversa (`onboarding.conversation.turnLimit`).

## Prompt injection

Conteúdo do usuário entra somente como mensagem `user`; a mensagem de contexto
é delimitada e gerada exclusivamente pelo sistema; o system prompt instrui a
tratar conteúdo do usuário como dados. A defesa principal continua
arquitetural (ADR 0003) — detalhes em [ai-security.md](ai-security.md).
