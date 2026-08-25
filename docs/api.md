# Referência da API

Base URL em desenvolvimento: `http://localhost:3100`.

Todos os endpoints (exceto `/health`) retornam JSON. Erros de validação (Zod) retornam `400` com `{ error: 'Erro de validação', details: [{ field, message }] }`. Erros de negócio (`AppError`) retornam o `statusCode` da regra violada com `{ error: string }`.

Valores monetários são sempre inteiros em centavos, tanto no corpo das requisições quanto nas respostas.

**Autenticação e multi-tenant**: toda rota (exceto `/health` e `/auth/*`) exige um cookie de sessão válido, obtido via `POST /auth/google` (ID-token do provedor). O `tenantId` é resolvido a partir do JWT da sessão pelo `authMiddleware` — nunca de um header do cliente. Cada usuário recebe um tenant novo e vazio; a base mínima (conta principal, tipos de conta e categorias) só é criada automaticamente se o usuário optar por "Configuração Manual" no onboarding (`POST /onboarding/skip` → `backend/src/modules/tenant-bootstrap/`) — quem segue pelo assistente de IA tem essas entidades propostas/criadas pelo próprio onboarding.

**Onboarding e IA**: endpoints de `/onboarding/*` (chat conversacional, draft e confirmação da configuração inicial) estão documentados em [`docs/architecture/onboarding-ai.md`](architecture/onboarding-ai.md), não nesta referência.

- [Accounts](#accounts)
- [Categories](#categories)
- [Settings](#settings)
- [Cash Flow](#cash-flow)
- [Transfers](#transfers)
- [Credit Cards](#credit-cards)
- [Dashboard](#dashboard)
- [Backup](#backup)

---

## Accounts

Contas (ex.: Conta Principal, Reserva de Emergência). `GET /` retorna só contas ativas.

Reserva automática (refactor de contas PF/PJ, entrega E8 — ver [`docs/refactor-contas-pf-pj.md`](refactor-contas-pf-pj.md)): `autoReserveEnabled`/`autoReservePercentage`/`autoReserveTargetAccountId` ficam na conta de **origem** (não mais na conta marcada como reserva). Ao receber uma entrada nessa conta, uma transferência automática de `autoReservePercentage`% do valor é gerada para `autoReserveTargetAccountId` — ver [Transfers](#transfers). `POST /accounts` aceita a regra sem validar (fica inerte até ter destino); `PUT /accounts/:id`, ao ativar ou já ter a regra ativa, exige `autoReserveTargetAccountId` diferente do próprio id e apontando para uma conta existente e ativa (`400 account.autoReserveTargetRequired`/`account.autoReserveSameAccount`, `404 account.autoReserveTargetNotFound`).

| Método | Rota          | Body / Query                                                                 |
|--------|---------------|-------------------------------------------------------------------------------|
| GET    | `/accounts`     | —                                                                              |
| GET    | `/accounts/:id` | —                                                                              |
| POST   | `/accounts`     | `{ name, accountTypeId?, initialBalance?, initialBalanceDate?, autoReserveEnabled?, autoReservePercentage?, autoReserveTargetAccountId? }` |
| PUT    | `/accounts/:id` | mesmos campos, todos opcionais                                                |
| DELETE | `/accounts/:id` | — (soft delete: `active = false`)                                            |

## Categories

Categorias de receita/despesa.

| Método | Rota             | Body / Query                                     |
|--------|------------------|---------------------------------------------------|
| GET    | `/categories`      | `?type=INCOME\|EXPENSE` (opcional)                 |
| GET    | `/categories/:id`  | —                                                   |
| POST   | `/categories`      | `{ name, type: 'INCOME'|'EXPENSE' }`               |
| PUT    | `/categories/:id`  | campos opcionais                                    |
| DELETE | `/categories/:id`  | — (soft delete)                                     |

## Settings

Configurações globais (singleton — sempre um único registro).

| Método | Rota        | Body / Query |
|--------|-------------|--------------|
| GET    | `/settings`   | —              |
| PUT    | `/settings`   | `{ dashboardScope?: 'CONSOLIDATED'\|'ACCOUNT' }` — `mainAccountId` foi removido (refactor de contas PF/PJ, entrega E5: cada conta agora é seu próprio contexto financeiro; ver [`docs/refactor-contas-pf-pj.md`](refactor-contas-pf-pj.md)). Limites de faturamento, período de controle e Nota Fiscal já haviam saído na E4. |

## Cash Flow

Fluxo de caixa **por conta** (entradas, pagamentos, gastos extraordinários, transferências e faturas de cartão do mês daquela conta) + CRUD de entradas, pagamentos e gastos extraordinários. Desde a E5, não existe mais fluxo "consolidado" — toda consulta é de uma conta específica; o `initialBalance`/`projectedBalance` do resumo são o saldo daquela conta.

Desde a E7, `GET /cash-flow` também retorna `transfers` — a(s) perna(s) de transferência (ver [Transfers](#transfers)) que tocam a conta selecionada naquele mês, já com a contraparte resolvida (`counterpartAccountId`/`counterpartAccountName`, já que a outra perna pertence a outra conta e não aparece em nenhuma outra lista da resposta). Os totais de `summary` (`receivedIncome`/`paidPayments`/`expectedIncome`/`expectedPayments`/`realizedBalance`/`projectedBalance`) já incluem as transferências efetivadas/pendentes da conta — não há campos novos dedicados a transferência no resumo.

`/cash-flow/income` é o CRUD de entrada (`FinancialTransaction` tipo `INCOME`) e a única fonte de `entries` no `GET /cash-flow`. O módulo `/receivables` foi removido (refactor de contas PF/PJ, entrega E3 — ver [`docs/refactor-contas-pf-pj.md`](refactor-contas-pf-pj.md)); dados antigos foram migrados para `income` pelo script `migrate-receivables-to-income` (removido do código após a migração — disponível no commit `9acc18c`).

| Método | Rota                               | Body / Query |
|--------|-------------------------------------|--------------|
| GET    | `/cash-flow`                          | `?month=&year=&accountId=` (todos obrigatórios) — dispara a geração sob demanda de ocorrências fixas antes de responder; `404 account.notFound` se a conta não existir |
| POST   | `/cash-flow/income`                   | `?accountId=` (obrigatório — default de `targetAccountId` quando o corpo não informa) — corpo: `{ description, categoryId, amount, expectedDate, targetAccountId?, recurrence?, notes? }` |
| PUT    | `/cash-flow/income/:id`               | campos opcionais |
| DELETE | `/cash-flow/income/:id`               | `?scope=&month=&year=` (mesma regra de recorrência fixa acima) |
| POST   | `/cash-flow/income/:id/receive`       | `{ actualDate?, amountReceived? }` (opcional) — marca como `RECEIVED` |
| POST   | `/cash-flow/income/:id/revert`        | — volta para `PENDING` |
| POST   | `/cash-flow/payments`                 | `?accountId=` (obrigatório — default de `sourceAccountId`) — corpo: `{ description, categoryId, amount, expectedDate, sourceAccountId?, recurrence?, notes? }` |
| PUT    | `/cash-flow/payments/:id`             | campos opcionais |
| DELETE | `/cash-flow/payments/:id`             | `?scope=&month=&year=` (mesma regra de recorrência fixa acima) |
| POST   | `/cash-flow/payments/:id/pay`         | `{ actualDate?, amountPaid? }` (opcional) |
| POST   | `/cash-flow/payments/:id/revert`      | — |
| POST   | `/cash-flow/extra-expenses`           | `?accountId=` (obrigatório) — mesmo shape de `payments` |
| PUT    | `/cash-flow/extra-expenses/:id`       | idem |
| DELETE | `/cash-flow/extra-expenses/:id`       | idem |
| POST   | `/cash-flow/extra-expenses/:id/pay`   | idem |
| POST   | `/cash-flow/extra-expenses/:id/revert`| idem |

Fatura de cartão: cartões continuam globais ao tenant (`GET /credit-cards` lista todos, de qualquer conta), mas a saída de uma fatura só aparece no fluxo da conta que a paga — `invoice.paymentAccountId ?? card.defaultPaymentAccountId`.

## Transfers

Transferência entre contas do mesmo tenant (refactor de contas PF/PJ, entrega E7 — ver [`docs/refactor-contas-pf-pj.md`](refactor-contas-pf-pj.md)). Sempre gera **duas** `FinancialTransaction` tipo `TRANSFER` ligadas por `transferGroupId` — uma saída (`sourceAccountId`, status `PAID`) na conta de origem e uma entrada (`targetAccountId`, status `RECEIVED`) na conta de destino, ambas já efetivadas na data informada (uma transferência entre contas próprias representa um movimento que já aconteceu, não uma obrigação futura). O identificador usado nas rotas de edição/exclusão/reversão é o `transferGroupId` do par, não o `id` de uma perna individual.

**Reserva automática (entrega E8)**: transferências também podem ser geradas automaticamente pelo `CashFlowService` — `originType: AUTO_RESERVE` em vez de `TRANSFER` — quando `POST /cash-flow/income/:id/receive` confirma uma entrada numa conta com regra ativa (ver [Accounts](#accounts)). O par nasce com `originId` apontando para a entrada que o originou; reverter essa entrada (`POST /cash-flow/income/:id/revert`) reverte o par em cascata, e recebê-la de novo reconfirma o mesmo par (sem duplicar) com o valor recalculado. Endpoints deste módulo funcionam sobre esses pares como qualquer outro, mas normalmente não precisam ser chamados diretamente para eles — o ciclo de vida é o da entrada de origem. `GET /cash-flow` marca essas pernas com `isAutoReserve: true`.

| Método | Rota                          | Body / Query |
|--------|-------------------------------|--------------|
| POST   | `/transfers`                    | `{ sourceAccountId, targetAccountId, amount, date, description, notes? }` — `400 transfer.sameAccount` se as contas forem iguais; `404 transfer.sourceAccountNotFound`/`transfer.targetAccountNotFound` se alguma conta não existir ou estiver inativa |
| PUT    | `/transfers/:transferGroupId`   | campos opcionais (mesmo shape do POST) — aplicados às duas pernas |
| DELETE | `/transfers/:transferGroupId`   | `400 transfer.settledCannotDelete` se as pernas ainda estiverem efetivadas — reverta primeiro |
| POST   | `/transfers/:transferGroupId/revert` | volta as duas pernas para `PENDING` (`actualDate: null`) — `400 transfer.notSettledCannotRevert` se já não estiverem efetivadas |

## Credit Cards

Cartões, lançamentos (à vista/parcelado/fixo), fatura por mês. Ver [`docs/domain-logic.md`](domain-logic.md) para a regra de fechamento/parcelamento/recorrência.

| Método | Rota                                          | Body / Query |
|--------|------------------------------------------------|--------------|
| GET    | `/credit-cards`                                   | `?month=&year=` (opcionais — default é o mês atual) |
| POST   | `/credit-cards`                                   | `{ name, bank, closingDay, dueDay, limit?, defaultPaymentAccountId? }` |
| PUT    | `/credit-cards/:id`                               | campos opcionais |
| DELETE | `/credit-cards/:id`                               | — (soft delete) |
| GET    | `/credit-cards/:id/flow`                          | `?month=&year=` (obrigatórios) — parcelas + fatura daquele mês |
| POST   | `/credit-cards/:id/entries`                       | `{ description, expenseCategoryId, totalAmount, purchaseDate, entryType: 'CASH'\|'INSTALLMENT'\|'FIXED', installmentsCount? (≥2, obrigatório se INSTALLMENT), notes? }` |
| PUT    | `/credit-cards/:id/entries/:entryId`              | campos opcionais — mudar `totalAmount`/`purchaseDate`/`entryType`/`installmentsCount` recria as parcelas |
| DELETE | `/credit-cards/:id/entries/:entryId`              | `?scope=CURRENT\|CURRENT_AND_FUTURE&month=&year=` obrigatórios se a entry for `FIXED` |
| POST   | `/credit-cards/:id/invoices/:invoiceId/pay`       | `{ paymentAccountId?, paymentDate? }` (opcional) |
| POST   | `/credit-cards/:id/invoices/:invoiceId/revert`    | — reverte fatura paga |

## Dashboard

Agregações para a tela inicial (saldos, resumo do mês, alertas, vencimentos próximos, evolução mensal, breakdown por categoria).

| Método | Rota         | Query |
|--------|--------------|-------|
| GET    | `/dashboard`   | `?month=&year=&upcomingDays=` (default 15) `&evolutionMonths=` (default 6) `&accountId=` — todos opcionais, exceto `accountId` quando `settings.dashboardScope === 'ACCOUNT'` (`400 dashboard.accountRequired` se faltar). Em `CONSOLIDATED` (default), `monthSummary`/`upcomingDues`/`alerts`/`monthlyEvolution`/`categoryBreakdown` somam todas as contas ativas; em `ACCOUNT`, são só da conta informada. `accounts.list`/`totalBalance` sempre listam todas as contas, nos dois modos. |

## Backup

Backup completo, exportação de lançamentos em CSV e importação de extrato bancário (CSV/OFX). Todos os dados são escopados pelo tenant da requisição.

| Método | Rota                       | Body / Query |
|--------|----------------------------|--------------|
| GET    | `/backup/export`             | — retorna `{ version, exportedAt, data: { accounts, categories, settings, financialTransactions, creditCards, creditCardEntries, creditCardInstallments, creditCardInvoices } }` como download |
| POST   | `/backup/import`              | `{ confirm: true, bundle }` — **destrutivo**: substitui todos os dados do tenant pelos do bundle. `tenantId` de cada registro é sempre re-carimbado com o tenant de quem importa, nunca confia no valor do arquivo. Bundles antigos com a chave `receivables` continuam aceitos (ignorada) |
| GET    | `/backup/export-csv`          | `?from=YYYY-MM-DD&to=YYYY-MM-DD` ou `?all=true` — CSV (delimitador `;`) com todos os `FinancialTransaction` do período |
| POST   | `/backup/statement/parse`     | `{ filename, content }` — detecta CSV vs OFX pela extensão/conteúdo, retorna `{ entries: [{ date, description, amount, type, possibleDuplicate }] }` **sem persistir** |
| POST   | `/backup/statement/import`    | `{ accountId, entries }` — cria um `FinancialTransaction` por entrada revisada na pré-visualização |
