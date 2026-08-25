# ADR 0004: Draft estruturado com confirmação explícita

- **Status**: Aceito
- **Data**: 2026-07-10

## Contexto

No onboarding conversacional, a IA coleta progressivamente informações (contas,
receitas, despesas fixas, cartões, reservas, configurações) que precisam virar
entidades reais criadas pelos services existentes. Complementa o ADR 0003, que
proíbe tools de escreverem dados financeiros.

## Problema

Como transformar uma conversa em configuração real garantindo que (a) o usuário
veja e aprove exatamente o que será criado, (b) a fonte da verdade não seja
texto livre de modelo, e (c) o usuário possa corrigir erros de interpretação
sem depender da IA?

## Decisão

A conversa produz um **draft estruturado e persistido** (documento próprio por
tenant), composto de itens tipados com identificador estável (`draftItemId`) e
payloads espelhando os schemas de criação já existentes nos módulos
financeiros. Itens se referenciam por **refs simbólicas** (ex.:
`accountRef: 'acc_1'`), resolvidas para UUIDs reais apenas na aplicação.

O fluxo de confirmação:

1. o frontend renderiza o **draft retornado pelo backend** (nunca o texto da
   IA) como resumo estruturado por seções;
2. o usuário pode editar e remover itens diretamente pela UI (endpoint de
   edição manual, sem passar pelo modelo), voltar ao chat ou cancelar;
3. a criação real só ocorre em `POST /onboarding/confirm`, após ação explícita;
4. na confirmação, a aplicação **revalida o draft inteiro** (schemas + regras
   cruzadas: conta principal única, percentuais 0–100, refs resolvíveis,
   duplicidades) e executa via services existentes;
5. a aplicação final **ignora completamente o texto da conversa** — apenas o
   draft validado é processado.

## Alternativas consideradas

- **Criar entidades durante a conversa, com confirmação verbal** — rejeitada
  (ver ADR 0003): confirmação interpretada pelo modelo e dados parciais.
- **Resumo apenas textual gerado pela IA + botão "confirmar"** — o texto pode
  divergir do que seria criado; o usuário confirmaria uma descrição, não os
  dados. O resumo deve ser renderizado a partir do draft real.
- **Wizard tradicional sem draft persistido (estado só no frontend)** —
  impediria retomada da conversa e edição server-side validada, e duplicaria
  validação no cliente.

## Consequências

- O usuário tem uma prévia fiel, editável e cancelável do que será criado.
- Erros do modelo são corrigíveis pela UI sem nova rodada de conversa.
- O draft persistido permite interromper e retomar o onboarding.
- Exige manter os schemas do draft alinhados aos schemas de criação dos
  módulos financeiros (custo de manutenção aceito; mitigado por reutilizar os
  schemas Zod existentes como base).

## Limitações

- O draft cobre apenas as entidades suportadas pelo domínio atual (tipos de
  conta, contas, categorias, receitas, despesas, cartões, transferências
  pontuais, reservas automáticas via conta, configurações). *Atualização
  (refactor de contas PF/PJ, entrega E9): transferências entre contas passaram
  a existir no domínio desde a E7 e já são propostas pelo onboarding
  (`propose_transfer`) — a limitação original abaixo não vale mais para elas.*
  Objetivos financeiros continuam fora do domínio e fora do draft.
- Edições manuais no draft não realimentam automaticamente o contexto textual
  da conversa; o modelo as verá via tool de leitura de contexto no turno
  seguinte.
