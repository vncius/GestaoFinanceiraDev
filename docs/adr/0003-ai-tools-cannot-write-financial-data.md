# ADR 0003: Tools de IA não escrevem dados financeiros

- **Status**: Aceito
- **Data**: 2026-07-10

## Contexto

A plataforma de IA expõe ao modelo um conjunto de tools executadas pelo
backend. No onboarding, a conversa precisa resultar na criação de contas,
categorias, receitas, despesas, cartões e configurações — dados financeiros do
usuário, isolados por tenant.

Conteúdo de conversa é entrada não confiável por definição: o usuário pode
digitar qualquer coisa e o modelo pode ser manipulado (prompt injection) ou
simplesmente errar a interpretação.

## Problema

Se as tools chamadas pelo modelo gravassem diretamente nas coleções
financeiras, um erro de interpretação ou uma injeção de prompt poderia criar,
alterar ou poluir dados reais do usuário sem que ele visse ou aprovasse nada.

## Decisão

**Nenhuma tool invocável pelo modelo grava, altera ou exclui entidades
financeiras.** As tools se dividem em exatamente duas categorias:

1. **Leitura de contexto autorizado** — retornam dados estruturados do próprio
   tenant autenticado (ex.: contas existentes, draft atual);
2. **Proposta** — gravam apenas no **draft** do onboarding (documento próprio,
   sem efeito financeiro), sempre após validação Zod + regras de negócio.

A escrita financeira real acontece exclusivamente no endpoint de confirmação
(`ADR 0004`), executado pela aplicação a partir do draft validado, reusando os
services existentes (`AccountsService`, `ReceivablesService` etc.).

Complementos arquiteturais: lista fechada de tools resolvidas por nome no
backend; schemas rígidos; tenant sempre obtido do JWT (nunca de argumento de
tool); nenhum acesso a banco, SQL ou endpoint arbitrário a partir do modelo.

## Alternativas consideradas

- **Tools de escrita direta com confirmação por turno** ("posso criar? sim") —
  a confirmação vira texto interpretado pelo próprio modelo, exatamente o canal
  não confiável que se quer evitar; e cria dados parciais durante a conversa.
- **Escrita direta com rollback posterior** — exigiria transações/compensações
  complexas e deixaria janelas de estado inconsistente visíveis ao usuário.
- **Sandbox de permissões por tool com escrita permitida a algumas** — mais
  flexível, porém mais difícil de auditar; a regra binária (draft ou leitura)
  é trivial de revisar em code review.

## Consequências

- O pior resultado possível de uma alucinação ou injeção de prompt é um draft
  incorreto — visível, editável e descartável pelo usuário antes de qualquer
  efeito real.
- O modelo pode "tentar" à vontade: erros de validação voltam como resultado da
  tool e permitem autocorreção sem risco.
- Capacidades futuras que exijam escrita (ex.: criar despesa por chat) deverão
  seguir o mesmo padrão: proposta estruturada + confirmação explícita fora do
  canal do modelo.

## Limitações

- O fluxo tem um passo a mais para o usuário (revisar e confirmar) — é o custo
  aceito da segurança.
- A regra vale para dados financeiros; o draft e o estado da conversa são
  graváveis por tools, e a integridade deles depende da validação Zod.
