# Lógica de domínio: fatura de cartão e lançamentos recorrentes

Este documento centraliza as duas regras de negócio mais não-óbvias do sistema, que hoje só existem espalhadas em comentários inline. Ambas vivem no backend, em `backend/src/modules/`.

## Convenções gerais

- **Datas**: sempre que uma data ISO precisa ser decomposta em ano/mês/dia, o código faz isso via `string.slice(0, 10).split('-')` (`monthYearOf` em `shared/utils/date.utils.ts`), nunca via `new Date(iso).getMonth()`. Passar por `Date` sofre o deslocamento de fuso horário: `new Date('2026-06-01T00:00:00.000Z')` em UTC-3 vira 31/05 21:00 local, o que classificaria um lançamento do dia 1º de junho como maio.
- **Dinheiro**: todo valor monetário é um inteiro em centavos. `toCents`/`fromCents`/`formatCurrency` em `shared/utils/money.utils.ts`.

## 1. Fatura de cartão de crédito

Módulo: `backend/src/modules/credit-cards/credit-cards.service.ts`.

### 1.1 Em qual fatura uma compra cai

Toda compra tem uma `purchaseDate` e o cartão tem um `closingDay` (dia do fechamento, 1–28). `getInvoiceMonth` decide o mês/ano da fatura:

- Se o dia da compra é **≤ closingDay**, a compra entra na fatura do mês corrente.
- Se é **> closingDay**, entra na fatura do mês seguinte (rolando o ano se for compra em dezembro).

```ts
private getInvoiceMonth(purchaseDateISO: string, closingDay: number): { month: number; year: number }
```

Cada `CreditCardEntry` grava o `closingDayUsed` no momento da criação. Uma compra parcelada recriada depois (`updateEntry`) usa esse valor congelado, **não** o `closingDay` atual do cartão — o fechamento pode ter mudado desde a compra original, mas o parcelamento já em andamento não deve pular de mês retroativamente.

### 1.2 Parcelamento

`createEntry`/`updateEntry` dividem `totalAmount` em `count` parcelas: `base = floor(totalAmount / count)`, e o resto da divisão inteira é somado à **primeira** parcela (`amount = base + (i === 0 ? remainder : 0)`), para que a soma das parcelas seja sempre exatamente `totalAmount` sem perder centavos.

Cada parcela `i` cai no mês `addMonths(firstMonth, firstYear, i)` — mês da primeira parcela + i meses.

### 1.3 Faturas são criadas sob demanda

Não existe uma tabela de "todas as faturas futuras". `findOrCreateInvoice(cardId, month, year, dueDay)` busca a fatura daquele cartão+mês e cria uma nova (com `totalAmount: 0`, status `OPEN`) se não existir. O total da fatura (`recalcInvoiceTotal`/`recalcInvoiceTotals`) é recalculado somando as parcelas não-canceladas vinculadas a ela, toda vez que uma parcela é criada, cancelada ou uma fatura é estornada.

### 1.4 Lançamentos fixos (assinaturas) no cartão

Um `CreditCardEntry` do tipo `FIXED` (ex.: assinatura mensal) representa uma recorrência por tempo indeterminado. Diferente de um parcelamento (que já nasce com todas as `N` parcelas), um lançamento fixo só tem a parcela do mês em que foi criado — as próximas são geradas **sob demanda**, em `ensureFixedInstallments`, toda vez que o usuário navega até um mês (`findAll`/`getCardFlow`):

1. Encontra a última parcela existente da entry (`lastMonth`/`lastYear`).
2. Se já cobre o mês pedido (`targetMonth`/`targetYear`), não faz nada.
3. Caso contrário, gera uma parcela para cada mês entre a última existente e o mês alvo (todas com o mesmo `amount = entry.totalAmount`, já que não há parcelamento).

Isso significa que **o histórico de parcelas de um lançamento fixo cresce conforme o usuário navega no tempo**, não é pré-gerado.

### 1.5 Exclusão de lançamento fixo: escopo

Como um lançamento fixo é "infinito", excluir precisa de um escopo (`deleteFixedEntry`):

- `CURRENT`: cancela só a parcela do mês de referência informado. A recorrência continua ativa para os meses seguintes.
- `CURRENT_AND_FUTURE`: cancela a parcela do mês de referência em diante e marca a entry como `active: false`, encerrando a recorrência. Meses **anteriores** ao de referência nunca são alterados — o histórico já lançado/pago é imutável.

O mesmo padrão de escopo (`CURRENT` vs `CURRENT_AND_FUTURE`) se repete em pagamentos, gastos extraordinários e recebíveis fixos (ver seção 2).

## 2. Lançamentos recorrentes (fixos) fora do cartão

Módulos: `backend/src/modules/cash-flow/cash-flow.service.ts` (`ensureFixedTransactions`) e `backend/src/modules/receivables/receivables.service.ts` (`ensureFixedOccurrences`). A mesma regra é implementada duas vezes (payments/extra-expenses e receivables) — candidata a unificação futura.

Um lançamento com `recurrence: FIXED` também é gerado sob demanda, mas por um mecanismo ligeiramente diferente do cartão, porque aqui não existe um "dia de fechamento": a recorrência é ancorada no **dia do mês da primeira ocorrência da série**.

1. Todos os lançamentos fixos são agrupados por `recurringGroupId` (o id do lançamento raiz da série; `null` para lançamentos `UNIQUE`).
2. Dentro de cada grupo, encontra a ocorrência mais recente (`latest`) e a mais antiga (`anchor`, cujo dia do mês é o "ancorador" — `anchorDay`).
3. Se `latest.recurringActive === false`, a série foi encerrada por um delete `CURRENT_AND_FUTURE` — não gera mais nada.
4. Se o mês de `latest` já é ≥ ao mês pedido, nada a fazer.
5. Caso contrário, cria uma ocorrência por mês entre `latest` e o mês pedido, todas com o dia `anchorDay` (com `addMonths(..., anchorDay)`, que faz clamp para o último dia do mês em meses mais curtos — ex.: ancorado no dia 31, fevereiro usa dia 28/29).

Cada nova ocorrência copia os dados de `latest` (categoria, valor, conta, etc.), com `status` resetado para pendente/esperado e o mesmo `recurringGroupId`.

Isso roda toda vez que `GET /cash-flow` ou `GET /receivables` é chamado para um mês (`ensureFixedOccurrences`), então a série "alcança" o mês pedido antes de qualquer leitura ou escrita subsequente.
