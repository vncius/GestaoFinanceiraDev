# Refactor: Conta como contexto financeiro (separação PF/PJ)

> Plano de execução incremental. Cada entrega é fechada, compila e mantém a aplicação funcional.
> Status: **E1 a E5 implementadas** (código, na branch `refactor/contas-pf-pj`). A migração de dados da E2 já rodou contra produção (idempotência verificada). E5 é só backend — o frontend (`/cash-flow` GET agora exige `accountId`) só passa a funcionar de ponta a ponta depois da E6 (seletor de conta ativa). E6 em diante seguem pendentes.

## Objetivo

Cada conta passa a funcionar como um contexto financeiro isolado (PF, PJ, Investimentos, …), com fluxo de caixa próprio. Recebimentos deixam de existir como entidade; Limites/Período saem das Parametrizações; transferências entre contas viram entidade de primeira classe e absorvem a reserva automática.

---

## Diagnóstico da base atual

### O que já está pronto e favorece o refactor

| Ponto | Situação |
|---|---|
| `FinancialTransaction.sourceAccountId` / `targetAccountId` | Já existem. Não é preciso mudar o schema para representar origem/destino. |
| `TransactionType.TRANSFER` | Já existe no enum e no rótulo do CSV do backup, mas **nenhum service o gera** — enum "morto" pronto para uso. |
| `calcAccountBalance` (`shared/utils/balance.utils.ts`) | Já é por conta: `initialBalance + Σ(target === id) − Σ(source === id)`, só status `PAID`/`RECEIVED`. Já contabiliza transferência corretamente, sem alteração. |
| `Dashboard` → `accounts.list` | Já lista saldo por conta individual. |
| Cartões de crédito | Já são globais ao tenant; nenhuma FK prende cartão a conta (só `defaultPaymentAccountId`, que é conveniência). |
| `MonthContext` (frontend) | Molde pronto para o novo `AccountContext`. |
| `migrate-legacy-account-config.ts` | Precedente de migração idempotente (reserva global → reserva por conta). Serve de modelo para as novas migrações. |

### O que hoje impede a separação

| Ponto | Situação |
|---|---|
| Fluxo de caixa | **Global**. `getCashFlow` ancora em `settings.mainAccountId` e agrega todas as contas com `autoReserveEnabled` num bucket único (`reserveInflow`/`reserveOutflow`/`reserveEndBalance`). Não existe `accountId` na rota. |
| `Receivable` | Entidade separada, com recorrência fixa duplicada (`ensureFixedOccurrences` vs `ensureFixedTransactions`) e reserva embutida (`reserveAllocations`). |
| Reserva automática | `Account.autoReserveEnabled` + `autoReservePercentage`, sem conta de destino explícita. Materializa `TransactionType.RESERVE` amarrado a um `Receivable` via `originType: RECEIVABLE`. |
| Settings | `mainAccountId`, `minimumMainBalance`, `annualRevenueLimit`, `controlStartMonth/Year`, `pjLimitControlEnabled`. `pjLimitControlEnabled` também é o gatilho de `syncNotaFiscalCategory`. |
| Faturas de cartão no fluxo | `monthInvoices`/`rangeInvoices` não filtram por conta — apareceriam em todo fluxo de conta. |
| Índices Mongo | Só `{tenantId, id}`. Nenhum índice por conta; services fazem `findAll(tenantId)` e filtram em memória. |

---

## Decisões tomadas

### D1 — `settings.mainAccountId` é removido por completo

Auditoria de todos os usos confirma que **nenhum sobrevive ao refactor**:

| Uso hoje | Destino |
|---|---|
| `cash-flow.service.ts:117` — âncora do fluxo global | Substituído pela conta ativa (E5) |
| `cash-flow.service.ts:336` — default de `sourceAccountId` ao criar transação | Substituído pela conta ativa do contexto (E5) |
| `receivables.service.ts` (4 usos) | Morre com o módulo (E3) |
| `credit-cards.service.ts:673` — 3º nível do fallback de conta pagadora | Sobra `input.paymentAccountId ?? card.defaultPaymentAccountId`, com a conta ativa como default do modal (E5) |
| `settings.service.ts:43` + `accounts.service.ts:46` — regra `account.mainReserveConflict` | Morre em E8: com destino explícito de reserva, a validação vira "origem ≠ destino" |
| `tenant-bootstrap.ensureMainAccountSetting` | Conta inicial passa a ser a última usada (localStorage) ou a primeira conta ativa (E6) |
| `onboarding` — `isMain` no draft | Vira apenas ordenação/rótulo; não grava mais em settings (E9) |
| Frontend — default de `accountId` nos modais | Passa a vir do `AccountContext` (E6) |

**Ressalva de ordem:** o campo só pode ser removido **depois** do backfill de contas em transações (E5) — ele é o único registro de qual conta era o contexto implícito dos lançamentos antigos.

### D2 — Campos de NF são descartados

Nota Fiscal deixa de ser um conceito do sistema. Isso vai além dos 8 campos do `Receivable`:

- `customerName`, `invoiceNumber`, `invoiceCode`, `invoiceLink`, `invoiceIssueDate`, `competence`, `workedHours`, `hourlyRate` **não** migram para `FinancialTransaction`.
- `syncNotaFiscalCategory` some; a categoria protegida "Nota Fiscal" vira categoria comum (`protected: false`), editável e removível pelo usuário.
- `Category.protected` fica sem nenhum uso (só existia para a NF) → remover o campo, a regra de bloqueio de exclusão em `categories.service.ts:48` e o badge `categories.protectedBadge` no front.

### D3 — Escopo do Dashboard vira parametrização

`FinancialSettings` ganha `dashboardScope: 'CONSOLIDATED' | 'ACCOUNT'`, default `CONSOLIDATED`.

- `CONSOLIDATED`: dashboard soma todas as contas (comportamento atual).
- `ACCOUNT`: dashboard reflete apenas a conta ativa do seletor.

É o único campo que sobra em Parametrizações → Geral. Após D1/D4, `FinancialSettings` fica `{ id, tenantId, dashboardScope, createdAt, updatedAt }`.

### D4 — `minimumMainBalance` removido, sem substituto por conta

Remove o campo, o alerta `AlertType.LOW_BALANCE` e a chave i18n correspondente. Não vira `Account.minimumBalance`.

### D4b — Legado de reserva: configuração some, histórico congela

Distinção necessária porque as duas coisas têm naturezas diferentes:

- **Configuração** (`autoReserveEnabled`, `autoReservePercentage`, regra `mainReserveConflict`, `reserveAllocations`): removida sem migração. Todas as contas serão reconfiguradas manualmente no novo modelo.
- **Transações `TransactionType.RESERVE` já gravadas**: **congeladas como histórico**, não são tocadas. Elas afetam saldo — o `receive()` antigo gravava a entrada já líquida (`amount: receivable.netAmount`) e creditava o valor reservado direto na conta de reserva, sem débito em lugar nenhum. Apagá-las reduziria o saldo das contas de reserva no total já reservado.

Consequência: `TransactionType.RESERVE` permanece no enum e no `TX_TYPE_LABELS` do backup, **apenas para leitura de histórico**. Nenhum service novo o gera.

### D5 — Transferência = sempre 2 transações

Uma saída na conta de origem e uma entrada na conta de destino, ligadas por `transferGroupId`. Cada perna tem status, data e descrição próprios e aparece no grid da sua conta.

### D6 — Não há transações órfãs esperadas

Nunca houve transferência, e `createTransaction` sempre fez fallback para `mainAccountId`. Ainda assim, o script de E5 conta as transações com `sourceAccountId` e `targetAccountId` nulos e faz backfill com o `mainAccountId` legado antes de o campo ser removido. Se o relatório acusar zero, o backfill é no-op.

---

## Entregas

### E1 — Entradas nativas no Fluxo de Caixa (backend)

Cria o suporte a entradas direto no fluxo, **sem ainda remover Recebimentos** (coexistência, nada quebra).

- `cash-flow.service.ts`: `createIncome`, `updateIncome`, `receiveIncome`, `revertIncome`, `deleteIncome`, `deleteFixedIncome` — espelhando os métodos de `PAYMENT`, com `targetAccountId` no lugar de `sourceAccountId`.
- `ensureFixedTransactions` passa a materializar recorrência fixa de `TransactionType.INCOME`.
- Sem novos campos em `FinancialTransaction` (D2): entrada = descrição, categoria, valor, data, conta, notas, recorrência.
- `cash-flow.schemas.ts` / `.controller.ts` / `.routes.ts`: novos endpoints.
- `docs/api.md`: seção Cash Flow atualizada.
- Testes de `createIncome` + recorrência fixa de entrada.

**Aceite:** dá para lançar, receber, estornar e excluir uma entrada pelo Fluxo de Caixa via API, com recorrência fixa funcionando. Recebimentos continua intacto.

---

### E2 — Migração de dados: Recebimentos → Entradas

Script idempotente, com dry-run, antes de qualquer remoção.

- `shared/migrations/migrate-receivables-to-income.ts`, no padrão de `migrate-legacy-account-config.ts`.
- `Receivable` `RECEIVED` **já materializou** `FinancialTransaction` (`originType: RECEIVABLE`) → não duplicar; apenas normalizar (`targetAccountId` preenchido, `originType`/`originId` limpos). A entrada permanece com o valor **líquido** que foi gravado na época — não é inflada para bruto, porque a `RESERVE` correspondente fica congelada (D4b) e somar os dois dobraria o saldo.
- `Receivable` `EXPECTED` → criar `FinancialTransaction` `INCOME` pendente, `targetAccountId ?? settings.mainAccountId` (último uso legítimo do campo).
- `Receivable` `CANCELED` → ignorado (não migra).
- Campos de NF descartados (D2). O script loga quantos registros tinham `invoiceNumber`/`customerName` preenchidos, para o usuário saber o que está perdendo antes de confirmar.
- Transações `RESERVE` existentes ficam como histórico — não são reescritas.
- Relatório: convertidos, ignorados, normalizados, dados de NF descartados.

**Aceite:** rodar duas vezes seguidas dá o mesmo resultado; `calcAccountBalance` de cada conta é idêntico antes e depois.

---

### E3 — Remoção de Recebimentos (backend + frontend)

**Backend**
- Excluir `modules/receivables/*` inteiro.
- `container.ts`: remover `receivablesRepo`, `receivablesService`, `controllers.receivables` e todas as injeções cruzadas.
- `server.ts`: remover `app.use('/receivables', …)` e a chamada a `migrateLegacyReceivableReserves()`.
- `cash-flow.service.ts`: remover `ReceivablesRepository` e `ensureFixedReceivablesForFlow`; `CashFlowResponse.entries` passa a ser `FinancialTransaction[]` (tipo `INCOME`).
- `dashboard.service.ts`: `mIncome`, `categoryBreakdown.income` e o alerta `OVERDUE_RECEIVABLE` passam a ler `FinancialTransaction` tipo `INCOME`.
- `backup`: remover `receivables` de `backup.types.ts` e do export/import/reset; `backupBundleSchema` mantém a chave **opcional e ignorada** (bundles antigos já baixados não podem ser rejeitados); subir `BACKUP_VERSION`; `exportTransactionsCsv` deixa de gerar `receivableRows`.
- `onboarding-apply.service.ts`: passo 6 chama `cashFlowService.createIncome`.
- `scripts/migrate-json-to-mongo.ts`: remover `'receivables.json'` do mapa.
- Testes a corrigir: `backup.service.test.ts`, `onboarding-apply.service.test.ts`, `onboarding.integration.test.ts`.

**Frontend**
- Excluir `pages/Receivables/`, `services/receivables.service.ts`, `locales/{pt,en,es}/receivables.json`.
- `App.tsx`: remover import e rota `receivables`.
- `Sidebar.tsx`: remover nav item; `Layout.tsx`: remover `/receivables` de `ROUTE_META`; `layout.json`: remover `nav.receivables`.
- `types/index.ts`: remover `Receivable`, `ReceivableStatus`, `ReserveAllocation`; `CashFlowResponse.entries` → `FinancialTransaction[]`.
- `pages/CashFlow`: `ReceivableModal` → `IncomeModal` (sem bloco de reserva, sem campos de NF); `EntriesGrid` tipado em `FinancialTransaction` (colunas Bruto/Reserva/Líquido saem, fica Valor); `useCashFlowMutations` troca `ReceivablesService` por `CashFlowService`; `types.ts` → `ModalKind` com `'income'`.
- `QuickAddModal`: `'receivable'` → `'income'`, sem o auto-preenchimento de `reserveAccountIds`; `common.json` → `quickAdd.types.income`.
- `cashFlow.json`: `receivableModal.*` → `incomeModal.*`; remover `entriesGrid.columns.grossAmount|reserve|netAmount`.

**Aceite:** nenhuma referência a `receivable` no código; suite verde; fluxo de caixa lista e edita entradas normalmente.

---

### E4 — Remoção de Limites, Período e Nota Fiscal

**Backend**
- `settings.types.ts` / `settings.schemas.ts`: remover `minimumMainBalance`, `annualRevenueLimit`, `controlStartMonth`, `controlStartYear`, `pjLimitControlEnabled`.
- `settings.service.ts`: remover `syncNotaFiscalCategory` inteira.
- `categories`: remover o campo `protected` do tipo, a regra de bloqueio de exclusão (`categories.service.ts:40,48`) e migrar a categoria "Nota Fiscal" existente para `protected: false` (vira comum, o usuário decide se apaga).
- `dashboard.service.ts` / `dashboard.types.ts`: remover `annualSummary`, `AlertType.ANNUAL_LIMIT_WARNING` e `AlertType.LOW_BALANCE`.
- Migração `$unset` dos campos nos documentos de `settings` e `categories`.
- `scripts/seed.ts`: remover os campos do payload de settings.
- Onboarding: `draftSettingsPayloadSchema` e `propose_settings` perdem os campos; `onboarding-prompts.ts` para de perguntar limite anual de faturamento; `onboarding-apply.service.ts` passo 4 simplificado.
- Testes a corrigir: `onboarding-tools.test.ts`, `onboarding-apply.service.test.ts`.

**Frontend**
- `Settings.tsx`: remover o `SectionCard` "Limites e Período" inteiro, o campo `minimumMainBalance`, e os campos correspondentes de `GeneralFormState`, `initForm` e `handleSave`; remover o badge de categoria protegida (`Settings.tsx:915,942,1030`).
- `Dashboard.tsx`: remover `AnnualSummaryCard` e a renderização condicional que o usa.
- `Report.tsx`: remover a `Section` de `annualSummary`.
- `types/index.ts`: limpar `FinancialSettings`, `Category.protected` e `DashboardResponse.annualSummary`; remover `'LOW_BALANCE'` do union de alertas.
- i18n (pt, en, es): remover `general.limitsAndPeriod*`, `general.managePjLimits*`, `general.annualRevenueLimitLabel`, `general.controlStart*`, `general.pjLimitsHint`, `general.minimumMainBalanceLabel`, `categories.protectedBadge`, `annualSummary.*`, alerta de saldo baixo.

**Aceite:** nenhum resquício de limite de faturamento, saldo mínimo ou Nota Fiscal na API, na UI ou no onboarding. `FinancialSettings` fica temporariamente vazio de campos de negócio até E5 introduzir `dashboardScope`.

---

### E5 — Conta como contexto financeiro (backend)

**Backfill primeiro, remoção depois** (D1/D6):
1. Script conta transações com `sourceAccountId` e `targetAccountId` nulos; preenche com o `mainAccountId` legado; emite relatório.
2. Só então `mainAccountId` sai de `settings.types.ts` / `.schemas.ts` / `DEFAULT_SETTINGS`, com `$unset` nos documentos.

**Contexto por conta**
- `cashFlowQuerySchema` ganha `accountId` obrigatório; controller repassa a todos os métodos.
- `getCashFlow` filtra tudo por conta: entradas (`targetAccountId === accountId`), pagamentos e gastos extraordinários (`sourceAccountId === accountId`).
- Saldo inicial/projetado passa a ser o da conta selecionada via `calcAccountBalance`.
- Remover de `CashFlowSummary`: `reserveProjectedInitialBalance`, `reserveInflow`, `reserveOutflow`, `reserveEndBalance` e toda a lógica de `reserveAccounts` / `reserveAccountIds` / `mainEntries` / `mainPayments` / `mainExtraExpenses`.
- Faturas de cartão: cartões seguem globais na listagem, mas a **saída** de fatura só entra no fluxo da conta pagadora (`invoice.paymentAccountId ?? card.defaultPaymentAccountId`).
- `createTransaction`: default de `sourceAccountId` = `accountId` do contexto.
- `credit-cards.service.payInvoice`: fallback reduzido a `input.paymentAccountId ?? card.defaultPaymentAccountId`.
- `tenant-bootstrap.ensureMainAccountSetting` removido.

**Escopo do dashboard (D3)**
- `FinancialSettings` ganha `dashboardScope: 'CONSOLIDATED' | 'ACCOUNT'` (default `CONSOLIDATED`).
- `getDashboard` aceita `accountId` e, quando o escopo é `ACCOUNT`, filtra `monthSummary`, `upcomingDues`, `alerts`, `monthlyEvolution` e `categoryBreakdown` pela conta. `accounts.list`/`totalBalance` continuam listando todas as contas nos dois modos.
- `dashboard.service.ts:87` — `isReserve: a.autoReserveEnabled` fica pendente de E8 (passa a significar "é destino de alguma regra de reserva").

**Infra**
- Índices em `financial_transactions`: `{tenantId, sourceAccountId}` e `{tenantId, targetAccountId}`.
- `docs/api.md` atualizado.

**Aceite:** `GET /cash-flow?accountId=X` e `?accountId=Y` retornam conjuntos disjuntos de lançamentos e saldos independentes. Alternar `dashboardScope` muda o dashboard entre consolidado e por conta.

---

### E6 — Seletor de conta ativa no menu superior (frontend)

- Novo `contexts/AccountContext.tsx` no molde de `MonthContext`: `{ accountId, setAccountId, accounts, activeAccount }`, persistido em `localStorage` por tenant; default = última usada, senão primeira conta ativa (D1).
- `App.tsx`: `AccountProvider` na árvore, junto de `MonthProvider`.
- `AuthContext`: limpar `accountId` no logout, para não vazar seleção entre tenants.
- Novo `components/layout/AccountSelector.tsx` no `<header>` do `Layout.tsx`, ao lado do `MonthNavigator`; `ROUTE_META` ganha `showAccountSelector`.
- `queryKey` viram `['cashFlow', accountId, month, year]` e `['dashboard', accountId, …]`; `CashFlowService.get` e `DashboardService.get` recebem `accountId`.
- `TransactionModal` / `IncomeModal` / `PayInvoiceAccountModal`: default de conta vem do `AccountContext`, não mais de `settings.mainAccountId`.
- `SummaryBar`: remover a seção de reserva paralela — reserva agora é só outra conta selecionável.
- `Settings.tsx` → aba Geral: sai "Contas Vinculadas", entra o toggle de `dashboardScope`.
- `Report.tsx`: propagar `accountId` na querystring do link de impressão quando o escopo for `ACCOUNT`.
- Novas chaves i18n do seletor e do escopo (pt, en, es).

**Aceite:** trocar a conta no topo troca todo o Fluxo de Caixa (entradas, saídas, saldo) sem recarregar a página; cartões de crédito continuam visíveis em qualquer conta.

---

### E7 — Transferências entre contas

**Backend**
- `FinancialTransaction` ganha `transferGroupId: string | null`; `OriginType` ganha `TRANSFER`.
- `transfers.service.ts`: `createTransfer({ sourceAccountId, targetAccountId, amount, date, description, notes })` gera **duas** transações `TransactionType.TRANSFER` com o mesmo `transferGroupId` (D5) — saída na origem, entrada no destino.
- `updateTransfer` / `deleteTransfer` / `revertTransfer` operam sobre o par inteiro via `transferGroupId`.
- Validações: contas diferentes, ambas ativas, valor > 0.
- `getCashFlow` inclui as pernas da conta selecionada nas listas de entrada e saída, com rótulo próprio.
- Rotas + schemas Zod; seção Transfers em `docs/api.md`.
- Testes: criação gera 2 transações; saldos das duas contas mudam corretamente; exclusão remove as duas pernas.

**Frontend**
- `services/transfers.service.ts` (novo).
- `TransferModal.tsx` + botão na `CashFlowFilterBar` e opção no `QuickAddModal`.
- Linha de transferência exibindo a contraparte (de/para) com badge próprio.
- Invalidação de queries **das duas contas** envolvidas.
- i18n `transferModal.*` (pt, en, es).

**Aceite:** transferir R$ 7.000 da PJ para a Principal gera saída de R$ 7.000 na PJ e entrada de R$ 7.000 na Principal, com saldos batendo nas duas.

---

### E8 — Reserva automática como transferência

- `Account` ganha `autoReserveTargetAccountId: string | null` — destino explícito da reserva. Hoje o destino é implícito (a própria conta marcada `autoReserveEnabled`).
- Nova semântica: `autoReserveEnabled` + `autoReservePercentage` + `autoReserveTargetAccountId` na conta de **origem**. Ao registrar/receber uma entrada nela, gera automaticamente uma transferência (`originType: AUTO_RESERVE`, `transferGroupId`) de `percentual × valor` para o destino.
- A perna de entrada no destino é identificada como **reserva automática** (badge na UI, rótulo próprio no CSV do backup).
- Estorno ou exclusão da entrada original reverte a transferência automática em cascata.
- Remover `calcReserveAllocations` e a materialização de `TransactionType.RESERVE`. O enum e o rótulo do CSV permanecem **só para leitura do histórico congelado** (D4b); nenhum service novo o gera.
- Remover a regra `account.mainReserveConflict` de `accounts.service.ts:46` e `settings.service.ts:43`; nova validação: origem ≠ destino.
- `dashboard.service.ts:87` — `isReserve` passa a ser "é destino de alguma regra de reserva".
- **Sem migração de configuração** (D4b): `autoReserveEnabled` e `autoReservePercentage` são zerados em todas as contas (`false` / `0`). A semântica da flag inverteu — hoje marca o destino, no novo modelo marca a origem — e não há dado de origem para inferir. Todas as regras serão configuradas manualmente a partir de agora.
- As transações `RESERVE` já gravadas não são tocadas: saldos permanecem exatamente como estão.
- Frontend: `Settings` → aba Contas com o campo de conta destino e tooltip reescrito; badge "Reserva automática" no fluxo da conta destino.

**Aceite:** entrada de R$ 10.000 na PJ com regra de 30% para Investimentos gera automaticamente saída de R$ 3.000 na PJ e entrada de R$ 3.000 em Investimentos marcada como reserva automática.

---

### E9 — Onboarding IA, backup e documentação

- `onboarding-tools.ts`: nova tool `propose_transfer`; `propose_income` reescrita para entrada de fluxo por conta (sem `reserveAccountRefs`); `propose_account` ganha `autoReserveTargetAccountRef`; `propose_settings` reduzido a `dashboardScope`.
- `onboarding.schemas.ts`: novo `draftTransferPayloadSchema`; `DRAFT_SECTIONS` ganha `transfers`; `isMain` deixa de gravar em settings.
- `onboarding-prompts.ts`: checklist reescrito — para de perguntar limite anual e NF; passa a explicar que cada conta é um contexto isolado e a propor transferências automáticas com origem e destino.
- `onboarding-apply.service.ts`: novo passo de aplicação de transferências, com a mesma idempotência (`record(draftItemId, entityId)`); remover a checagem `mainReserveConflict`.
- `onboarding-context.service.ts` / `compactDraft`: incluir a nova seção.
- `onboarding-draft.service.ts:313`: remover a validação `isMain && autoReserveEnabled`.
- `DraftReview.tsx`: campos de `minimumMainBalance` e a exclusão mútua `isMain`/`autoReserveEnabled` saem; entra o destino de reserva.
- Documentação: `docs/api.md`, `docs/domain-logic.md` (some a nota de duplicação de recorrência), `docs/architecture/onboarding-ai.md` (seções, ordem de aplicação, `controlScope`), ADR 0004 (a limitação "transferências não existem no domínio" deixa de valer), `README.md` ("contas a receber"), `CHANGELOG.md`.
- Testes de onboarding atualizados: `onboarding-tools.test.ts`, `onboarding-apply.service.test.ts`, `onboarding.integration.test.ts`, `onboarding-draft.service.test.ts`.

**Aceite:** um onboarding do zero cria contas PF e PJ com fluxos separados e uma regra de reserva automática por transferência, sem mencionar limites, NF ou recebimentos.

---

## Ordem e dependências

```
E1 ──► E2 ──► E3 ──┐
                   ├──► E5 ──► E6 ──► E7 ──► E8 ──► E9
E4 ────────────────┘
```

- **E4 é independente de E1–E3** e pode ser antecipada se a prioridade for limpar Parametrizações primeiro.
- **E5 depende de E3** (o backfill precisa das entradas já migradas) e **precisa rodar antes de qualquer remoção de `mainAccountId`**.
- **E8 depende de E7** — a reserva automática é implementada em cima do mecanismo de transferência.
