# Referência da API

Base URL em desenvolvimento: `http://localhost:3100`.

Todos os endpoints (exceto `/health`) retornam JSON. Erros de validação (Zod) retornam `400` com `{ error: 'Erro de validação', details: [{ field, message }] }`. Erros de negócio (`AppError`) retornam o `statusCode` da regra violada com `{ error: string }`.

Valores monetários são sempre inteiros em centavos, tanto no corpo das requisições quanto nas respostas.

**Autenticação e multi-tenant**: toda rota (exceto `/health` e `/auth/*`) exige um cookie de sessão válido, obtido via `POST /auth/google` (ID-token do provedor). O `tenantId` é resolvido a partir do JWT da sessão pelo `authMiddleware` — nunca de um header do cliente. Cada usuário recebe um tenant novo e vazio; a base mínima (conta principal, tipos de conta e categorias) só é criada automaticamente se o usuário optar por "Configuração Manual" no onboarding (`POST /onboarding/skip` → `backend/src/modules/tenant-bootstrap/`) — quem segue pelo assistente de IA tem essas entidades propostas/criadas pelo próprio onboarding.

**Onboarding e IA**: endpoints de `/onboarding/*` (chat conversacional, draft e confirmação da configuração inicial) estão documentados em [`docs/architecture/onboarding-ai.md`](architecture/onboarding-ai.md), não nesta referência.

- [Accounts](#accounts)
- [Categories](#categories)
- [Settings](#settings)
- [Receivables](#receivables)
- [Cash Flow](#cash-flow)
- [Credit Cards](#credit-cards)
- [Dashboard](#dashboard)
- [Backup](#backup)

---

## Accounts

Contas (ex.: Conta Principal, Reserva de Emergência). `GET /` retorna só contas ativas.

| Método | Rota          | Body / Query                                                                 |
|--------|---------------|-------------------------------------------------------------------------------|
| GET    | `/accounts`     | —                                                                              |
| GET    | `/accounts/:id` | —                                                                              |
| POST   | `/accounts`     | `{ name, type: 'MAIN'|'EMERGENCY_RESERVE'|..., initialBalance?, initialBalanceDate? }` |
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
| PUT    | `/settings`   | qualquer subconjunto de: `defaultReservePercentage, applyReserveByDefault, allowDisableReserve, mainAccountId, emergencyReserveAccountId, minimumMainBalance, annualRevenueLimit, controlStartMonth, controlStartYear, pjLimitControlEnabled` |

## Receivables

Contas a receber (entradas). Suporta recorrência fixa — ver [`docs/domain-logic.md`](domain-logic.md).

| Método | Rota                    | Body / Query |
|--------|-------------------------|--------------|
| GET    | `/receivables`            | `?month=&year=&status=EXPECTED\|RECEIVED\|CANCELED` (todos opcionais) |
| GET    | `/receivables/:id`        | — |
| POST   | `/receivables`            | `{ description, expectedPaymentDate, grossAmount, incomeCategoryId, separateReservePercentage?, recurrence?: 'UNIQUE'\|'FIXED', targetAccountId?, notes?, ... campos de NF opcionais }` |
| PUT    | `/receivables/:id`        | mesmos campos, todos opcionais |
| DELETE | `/receivables/:id`        | `?scope=CURRENT\|CURRENT_AND_FUTURE&month=&year=` — `scope`/`month`/`year` obrigatórios apenas se o item for `recurrence: FIXED` |
| POST   | `/receivables/:id/receive` | `{ actualPaymentDate? }` (opcional) — marca como `RECEIVED` |
| POST   | `/receivables/:id/revert`  | — volta para `EXPECTED` |

> **Em fase de descontinuação** (refactor de contas PF/PJ, ver [`docs/refactor-contas-pf-pj.md`](refactor-contas-pf-pj.md)): `npm run migrate:receivables-to-income` (dry-run por padrão; `-- --apply` grava) converte cada `Receivable` em `FinancialTransaction` tipo `INCOME` no Cash Flow, iterando todos os tenants. Idempotente — pode ser rodado quantas vezes forem necessárias antes de confirmar. Este módulo será removido depois que a migração for aplicada e conferida (entrega E3).

## Cash Flow

Visão consolidada do fluxo de caixa mensal (entradas, pagamentos, gastos extraordinários e faturas de cartão do mês) + CRUD de entradas, pagamentos e gastos extraordinários.

`/cash-flow/income` é o CRUD nativo de entrada (`FinancialTransaction` tipo `INCOME`), que hoje coexiste com `/receivables` — o `GET /cash-flow` ainda lista `entries` a partir de Recebimentos; a migração para `income` como fonte única do fluxo acontece em entregas futuras do refactor de contas.

| Método | Rota                               | Body / Query |
|--------|-------------------------------------|--------------|
| GET    | `/cash-flow`                          | `?month=&year=` (obrigatórios) — dispara a geração sob demanda de ocorrências fixas antes de responder |
| POST   | `/cash-flow/income`                   | `{ description, categoryId, amount, expectedDate, targetAccountId?, recurrence?, notes? }` |
| PUT    | `/cash-flow/income/:id`               | campos opcionais |
| DELETE | `/cash-flow/income/:id`               | `?scope=&month=&year=` (mesma regra de recorrência fixa acima) |
| POST   | `/cash-flow/income/:id/receive`       | `{ actualDate?, amountReceived? }` (opcional) — marca como `RECEIVED` |
| POST   | `/cash-flow/income/:id/revert`        | — volta para `PENDING` |
| POST   | `/cash-flow/payments`                 | `{ description, categoryId, amount, expectedDate, sourceAccountId?, recurrence?, notes? }` |
| PUT    | `/cash-flow/payments/:id`             | campos opcionais |
| DELETE | `/cash-flow/payments/:id`             | `?scope=&month=&year=` (mesma regra de recorrência fixa acima) |
| POST   | `/cash-flow/payments/:id/pay`         | `{ actualDate?, amountPaid? }` (opcional) |
| POST   | `/cash-flow/payments/:id/revert`      | — |
| POST   | `/cash-flow/extra-expenses`           | mesmo shape de `payments` |
| PUT    | `/cash-flow/extra-expenses/:id`       | idem |
| DELETE | `/cash-flow/extra-expenses/:id`       | idem |
| POST   | `/cash-flow/extra-expenses/:id/pay`   | idem |
| POST   | `/cash-flow/extra-expenses/:id/revert`| idem |

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
| GET    | `/dashboard`   | `?month=&year=&upcomingDays=` (default 15) `&evolutionMonths=` (default 6) — todos opcionais |

## Backup

Backup completo, exportação de lançamentos em CSV e importação de extrato bancário (CSV/OFX). Todos os dados são escopados pelo tenant da requisição.

| Método | Rota                       | Body / Query |
|--------|----------------------------|--------------|
| GET    | `/backup/export`             | — retorna `{ version, exportedAt, data: { accounts, categories, settings, receivables, financialTransactions, creditCards, creditCardEntries, creditCardInstallments, creditCardInvoices } }` como download |
| POST   | `/backup/import`              | `{ confirm: true, bundle }` — **destrutivo**: substitui todos os dados do tenant pelos do bundle. `tenantId` de cada registro é sempre re-carimbado com o tenant de quem importa, nunca confia no valor do arquivo |
| GET    | `/backup/export-csv`          | `?from=YYYY-MM-DD&to=YYYY-MM-DD` ou `?all=true` — CSV (delimitador `;`) unificando `FinancialTransaction` + `Receivable` do período |
| POST   | `/backup/statement/parse`     | `{ filename, content }` — detecta CSV vs OFX pela extensão/conteúdo, retorna `{ entries: [{ date, description, amount, type, possibleDuplicate }] }` **sem persistir** |
| POST   | `/backup/statement/import`    | `{ accountId, entries }` — cria um `FinancialTransaction` por entrada revisada na pré-visualização |
