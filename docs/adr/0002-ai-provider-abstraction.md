# ADR 0002: Abstração de provedor de IA

- **Status**: Aceito
- **Data**: 2026-07-10

## Contexto

A aplicação vai ganhar uma plataforma de IA cuja primeira capacidade é o
onboarding conversacional (ver `docs/architecture/ai-platform.md`). A
comunicação com o modelo exige um SDK/HTTP específico de provedor (Anthropic,
OpenAI, Gemini...), com formatos próprios de mensagens, tool definitions e tool
calls.

## Problema

Se os services de domínio (onboarding e futuros) importarem diretamente o SDK
do provedor, a aplicação fica acoplada a um fornecedor: trocar de provedor ou
testar o fluxo conversacional passaria a exigir mudanças espalhadas pelo
domínio e chamadas reais (caras, lentas e não determinísticas) nos testes.

## Decisão

Criar um módulo de infraestrutura `backend/src/modules/ai/` contendo:

- uma interface neutra `AiProvider` com um método `chat(...)` que recebe
  system prompt, mensagens, tool definitions, limite de tokens e `AbortSignal`,
  e retorna um resultado neutro (texto e/ou tool calls);
- tipos próprios (`ChatMessage`, `ToolDefinition`, `ToolCall`, resultado) sem
  nenhuma referência a SDKs;
- uma implementação por provedor (a primeira: Anthropic), único lugar do
  código que conhece o SDK;
- um `FakeAiProvider` determinístico para testes automatizados;
- configuração centralizada (`ai.config.ts`) lida de variáveis de ambiente
  apenas no backend.

Nenhum service de domínio importa tipos do SDK do provedor. A escolha do
provedor é feita no wiring (`container.ts`), como já ocorre com repositórios.

## Alternativas consideradas

- **Usar o SDK do provedor diretamente nos services**: menos código no curto
  prazo, mas acopla domínio a fornecedor e inviabiliza testes determinísticos.
- **Biblioteca de abstração de terceiros (LangChain e similares)**: adiciona
  dependência pesada e camadas de abstração muito além do necessário — o
  projeto usa poucas operações (chat com tools), e o padrão do código é wiring
  manual e explícito.
- **Microserviço separado de IA**: complexidade operacional injustificada para
  um backend single-process.

## Consequências

- Testes do fluxo conversacional rodam com `FakeAiProvider`, sem rede e sem
  custo, com roteiros determinísticos de tool calls.
- Trocar ou adicionar provedor é criar uma classe nova e ajustar o wiring.
- Há um custo de tradução (tipos neutros ↔ formato do provedor) concentrado na
  implementação concreta — aceitável e localizado.

## Limitações

- A interface inicial cobre apenas o necessário (chat com tools, resposta
  única). Streaming, visão, embeddings etc. só entrarão quando houver uso
  concreto, possivelmente exigindo evolução do contrato.
- A abstração não normaliza diferenças semânticas finas entre modelos (ex.:
  comportamento de tool choice); prompts podem precisar de ajustes ao trocar de
  provedor.
