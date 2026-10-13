# Plano: Simplificação da UX (interface única com complexidade progressiva)

> Plano de execução incremental. Cada entrega (U1, U2, …) é fechada: compila, passa nos testes, mantém a aplicação funcional e pode ser commitada sozinha.
> **Este arquivo é a fonte de verdade do andamento.** Qualquer sessão (humana ou IA) deve conseguir continuar o trabalho lendo só este documento + o código.

---

## Como continuar (protocolo para cada sessão)

1. Leia este arquivo inteiro — principalmente **Decisões** e **Status**.
2. Escolha a **primeira entrega ⬜ cujas dependências estão todas ✅** (ou a que o usuário pedir).
3. Mude o status dela para 🟡 neste arquivo antes de começar.
4. Implemente seguindo o **Escopo** e os **Arquivos prováveis** (são ponto de partida, não lista fechada — confirme no código).
5. Valide com a **Definição de pronto** (seção abaixo) e os **Critérios de aceite** da entrega.
6. Ao concluir:
   - status → ✅, preencha a coluna *Concluída em* (data) e *Commit* (hash curto);
   - registre em **Notas de implementação** (no fim do arquivo) qualquer descoberta, desvio do plano ou pendência;
   - adicione a entrada no `CHANGELOG.md` (seção `[Unreleased]`);
   - faça **um commit por entrega**, mensagem `feat(ux): U<n> — <título>` (ou `fix(ux)`/`refactor(ux)`). Não fazer push sem o usuário pedir.
7. Se surgir uma decisão de produto que **não** esteja em *Decisões*, pergunte ao usuário e registre a resposta como novo `D<n>` antes de seguir.
8. Se uma entrega ficar grande demais para uma sessão, divida-a (ex.: U10a/U10b) aqui no plano antes de continuar.

### Definição de pronto (vale para todas as entregas)

- [ ] `cd frontend && npm run build` sem erros (inclui `tsc`).
- [ ] `cd frontend && npm test` verde.
- [ ] Se tocou no backend: `cd backend && npm run typecheck && npm test` verde.
- [ ] Todo texto novo/alterado existe nos **três** idiomas: `frontend/src/locales/{pt,en,es}/*.json`.
- [ ] Verificado no navegador (`.claude/launch.json`: servidores `backend` :3100 e `frontend` :3101) em desktop **e** largura mobile (375px), tema claro **e** escuro.
- [ ] Nenhuma funcionalidade existente ficou inacessível (o objetivo é esconder/agrupar, nunca remover capacidade).
- [ ] Padrões do projeto mantidos: valores em centavos, `IconActionButton`/`PaidToggle` com `loading` em ações de linha, invalidação via `utils/query-invalidation.ts`, `sortByName` em combos.

---

## Objetivo

Reduzir a carga cognitiva para quem nunca usou um sistema financeiro, sem remover recursos avançados. A aplicação deve responder de imediato quatro perguntas: **quanto tenho, quanto entrou, quanto saiu, quanto ainda vou receber/pagar**. Recursos avançados aparecem quando os dados do usuário os tornam relevantes (divulgação progressiva) ou quando ele pede ("Ver detalhes", "Mais opções", menu "⋯").

Origem: análise de UX feita em 2026-10-13 (conversa com o usuário). Resumo dos achados que motivam o plano:

| Achado | Onde |
|---|---|
| "Saídas" calculado de três jeitos: Dashboard exclui transferências; Fluxo de Caixa e Relatório incluem. | `Dashboard.tsx` (`totalPaid`), `SummaryBar.tsx` (`totalPaid`), `Report.tsx` (`totalPaid`) |
| Seletor de conta aparece no Dashboard mesmo em escopo consolidado, onde não tem efeito. | `Layout.tsx` (`ROUTE_META`) + `Dashboard.tsx` (`scopedToAccount`) |
| "Previsto" de mês futuro é acumulado (mês atual → mês selecionado), mas o rótulo sugere o mês. | `cash-flow.service.ts` (`rangeEntries`/`rangeInvoices`) |
| Fatura de cartão sem `defaultPaymentAccountId` não aparece em nenhum fluxo até ser paga. | `cash-flow.service.ts` (`invoicePayerAccountId`) |
| Escopo consolidado/por conta é uma configuração escondida, não uma escolha de visualização. | `Settings.tsx` aba Geral |
| 5 seções no Fluxo de Caixa (Transferências, Entradas, Pagamentos, Extraordinários, Cartões), cada uma com seu "+". | `pages/CashFlow/CashFlow.tsx` |
| Dashboard com ~15–20 números acima da dobra; donut duplica os cards; alertas duplicam vencimentos. | `pages/Dashboard/Dashboard.tsx` |
| Backup/Exportação ocupam a navegação principal; idioma/tema/sair no cabeçalho. | `Sidebar.tsx`, `Layout.tsx` |
| "Limpar referência" (destrutivo) na mesma barra de "Nova transferência" e filtros. | `CashFlowFilterBar.tsx` |

---

## Decisões tomadas

### D1 — Uma interface só, sem "modo simplificado/completo"
Divulgação progressiva por **gatilhos de dados**. Nada de toggle de modo que esconda funcionalidade. (Uma preferência de *densidade* é aceitável — ver U19 — mas nunca esconde capacidade.)

| Gatilho | O que aparece |
|---|---|
| > 1 conta ativa | Seletor de conta, transferências, linha "Entre suas contas", coluna/indicação de conta |
| ≥ 1 cartão ativo | Item "Cartões" na navegação; opção de cartão nos formulários (U18) |
| Reserva automática configurada | Indicador de reserva nas transferências automáticas |
| Lançamento fixo | Ícone ↻ e pergunta de escopo (só este mês / este e próximos) |
| Ação do usuário | "Ver detalhes", "Mais opções", "Ver análise completa", menu "⋯" |

### D2 — Regra única de resumo mensal
Transferência **não** é ganho nem gasto.
- **Entradas** = entradas recebidas.
- **Saídas** = pagamentos + gastos extraordinários + faturas pagas.
- **Entre suas contas** = transferências recebidas − transferências enviadas (líquido; só exibido quando ≠ 0).
- **Saldo** = saldo inicial + entradas − saídas ± entre suas contas (= `realizedBalance`, que já fecha assim).
- **A receber** / **A pagar** = itens **do mês selecionado** ainda pendentes (não acumulado).
- **Previsto** = `projectedBalance`. Quando o mês selecionado é futuro, o rótulo deve dizer explicitamente o intervalo acumulado ("previsto de out/26 a dez/26").

Uma única função no frontend calcula isso e é usada por Início, Movimentações e Relatório.

### D3 — Rótulo do saldo depende do mês
Mês atual → "Saldo hoje". Mês passado → "Saldo em <último dia>". Mês futuro → "Saldo previsto em <último dia>".

### D4 — "Todas as contas" no seletor substitui a configuração `dashboardScope`
- O seletor ganha a opção **Todas as contas**. É uma escolha de visualização, não configuração.
- `Settings.dashboardScope` **não é removido do backend** (onboarding IA e seed usam): passa a ser só o **valor inicial** do seletor no primeiro acesso do tenant. A aba Geral deixa de exibi-lo.
- O backend do dashboard passa a decidir o escopo pela presença de `accountId` na query (sem `accountId` = consolidado), não mais por `settings`.
- Enquanto U17 não existir, **Movimentações exige uma conta específica**: nela o seletor não mostra "Todas" e usa a última conta específica escolhida.
- Com 1 conta ativa, o seletor fica oculto.

### D5 — Cartão sempre pertence a uma conta pagadora
`defaultPaymentAccountId` passa a ser obrigatório (default: primeira conta ativa). Migração idempotente preenche os nulos. Cartões seguem o seletor de conta.

### D6 — Tipos internos permanecem; muda só a apresentação
`INCOME`, `PAYMENT`, `EXTRA_EXPENSE`, `TRANSFER` e faturas continuam como estão no backend e nos endpoints. "Gasto extraordinário" vira, na UI, um marcador opcional de uma Saída ("Gasto fora do comum"). Nenhuma migração de dados para isso.

### D7 — Nova nomenclatura
| Antes | Depois |
|---|---|
| Dashboard | Início |
| Fluxo de Caixa | Movimentações |
| Cartões de Crédito | Cartões |
| Parametrizações | Configurações |
| Backup e Exportação | Configurações → Seus dados |
| Pagamento / Gasto extraordinário (na criação) | Saída (+ "Gasto fora do comum" em Mais opções) |
| Recebimento / Entrada | Entrada |
| Efetivar / joinha | Marcar como pago / recebido (checkbox) |
| Reverter | Desmarcar |
| Referência (mês) | Mês |
| Saldo final | Saldo (ver D3) |
| Limpar referência | Limpar mês |

Rotas **não** mudam de path nesta fase (`/dashboard`, `/cash-flow`, `/credit-cards`, `/settings`); só rótulos. `/backup` passa a redirecionar (U5).

### D8 — Movimentações agrupada por situação
Lista única agrupada em **Atrasados** (pendente com data < hoje; grupo só aparece se houver itens) → **A vencer** → **Concluídos** (recolhível). Ordenação por data dentro do grupo. Filtro rápido `Todos | Entradas | Saídas`; transferências aparecem em "Todos" e não entram nos totais de Entradas/Saídas (D2).

---

## Status

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluída · ⏸ adiada

| # | Entrega | Fase | Depende de | Status | Concluída em | Commit |
|---|---|---|---|---|---|---|
| U1 | Regra única de resumo mensal + totais pendentes | 0 | — | ✅ | 2026-10-13 | ver git log |
| U2 | Cartão com conta pagadora obrigatória | 0 | — | ✅ | 2026-10-13 | ver git log |
| U3 | Rótulo explícito do previsto acumulado | 0 | U1 | ✅ | 2026-10-13 | ver git log |
| U4 | Seletor com "Todas as contas" (substitui `dashboardScope` na UI) | 1 | — | ✅ | 2026-10-13 | ver git log |
| U5 | Navegação, cabeçalho e Configurações reorganizados | 1 | U4 | ✅ | 2026-10-13 | ver git log |
| U6 | Botão global "+ Novo" | 1 | — | ✅ | 2026-10-13 | ver git log |
| U7 | Vocabulário (D7) em toda a UI | 1 | — | ✅ | 2026-10-13 | ver git log |
| U8 | Novo Início (Dashboard) | 2 | U1, U3, U4 | ⬜ | | |
| U9 | Resumo compacto no topo de Movimentações | 3 | U1, U3 | ⬜ | | |
| U10a | Lista única — view-model + leitura + marcar pago | 3 | U9 | ⬜ | | |
| U10b | Lista única — ações, filtros e busca | 3 | U10a | ⬜ | | |
| U10c | Remoção das grids antigas e código morto | 3 | U10b | ⬜ | | |
| U11 | Menu "⋯" de Movimentações (importar, exportar, limpar) | 3 | U5, U10b | ⬜ | | |
| U12 | Formulário único de lançamento (Entrada/Saída + Mais opções) | 3 | U6 | ⬜ | | |
| U13 | Cartões seguem o seletor de conta + editar cartão na própria tela | 4 | U2, U4 | ⬜ | | |
| U14 | Tipo de conta inline no cadastro de conta | 4 | U5 | ⬜ | | |
| U15 | "+ Nova categoria" inline nos formulários | 4 | U12 | ⬜ | | |
| U16 | Auditoria de divulgação progressiva (1 conta / 0 cartões) | 4 | U8, U10c, U13 | ⬜ | | |
| U17 | Movimentações consolidada ("Todas as contas") | 5 | U10c, U12 | ⬜ | | |
| U18 | Compra no cartão pelo "+ Novo" | 5 | U12, U13 | ⬜ | | |
| U19 | Preferência "Mostrar detalhes avançados" (densidade) | 5 | U8, U9 | ⬜ | | |
| U20 | Onboarding IA, relatório e documentação alinhados | 5 | U7, U8 | ⬜ | | |

Fases 0–4 entregam a simplificação completa. Fase 5 é evolução opcional — confirmar com o usuário antes de iniciar.

---

## Entregas

### Fase 0 — Consistência (sem mudar layout)

#### U1 — Regra única de resumo mensal + totais pendentes
**Escopo**
- Backend: adicionar a `CashFlowSummary` os campos **do mês selecionado** (não acumulados): `pendingIncome` (entradas `PENDING` do mês), `pendingExpenses` (pagamentos + extras `PENDING` do mês + faturas não pagas do mês) e, se útil, `pendingIncomeCount`/`pendingExpensesCount`. Atualizar `sumSummaries`/`ZERO_SUMMARY` do dashboard para somá-los no consolidado.
- Frontend: criar `frontend/src/utils/month-summary.ts` com `summarizeMonth(summary)` → `{ initial, income, expenses, betweenAccounts, balance, pendingIncome, pendingExpenses, projected }` seguindo D2. Testes unitários (`month-summary.test.ts`), incluindo o caso "saldo fecha: initial + income − expenses + betweenAccounts === balance".
- Substituir os três cálculos de `totalPaid`/`totalReceived` (`Dashboard.tsx`, `SummaryBar.tsx`, `Report.tsx`) pelo helper. Na `SummaryBar` e no Relatório, transferências saem de Entradas/Saídas e viram a linha "Entre suas contas" (só quando ≠ 0).

**Arquivos prováveis**: `backend/src/modules/cash-flow/cash-flow.service.ts`, `cash-flow.types.ts`, `cash-flow.service.test.ts`, `backend/src/modules/dashboard/dashboard.service.ts`, `frontend/src/types/index.ts`, `frontend/src/pages/Dashboard/Dashboard.tsx`, `frontend/src/pages/CashFlow/components/SummaryBar.tsx`, `frontend/src/pages/Report/Report.tsx`, locales `cashFlow.json`/`dashboard.json`/`report.json`.

**Critérios de aceite**
- Com dashboard por conta e a mesma conta no Fluxo de Caixa, Entradas/Saídas/Saldo são idênticos nas duas telas e no Relatório.
- Conta com transferência no mês mostra "Entre suas contas"; conta sem transferência não mostra a linha.
- Teste de backend cobre `pendingIncome`/`pendingExpenses` (inclui fatura não paga) e que mês futuro não acumula esses dois campos.

#### U2 — Cartão com conta pagadora obrigatória
**Escopo**
- Backend: `defaultPaymentAccountId` obrigatório na criação (`credit-cards.schemas.ts`); na atualização não pode virar `null`. Script idempotente `backend/src/scripts/migrate-card-payment-account.ts` (+ script npm) que preenche nulos com a primeira conta ativa (ordem por nome) do tenant. Ao desativar uma conta usada como pagadora, bloquear ou exigir troca (verificar o que `accounts.service.ts` faz hoje e registrar a escolha em Notas).
- Onboarding: `propose_credit_card` — se `defaultPaymentAccountRef` vier vazio, o apply usa a primeira conta criada (`onboarding-apply.service.ts`).
- Frontend: campo "Conta que paga a fatura" obrigatório no modal de cartão (`Settings.tsx` → `CardSettingsModal`), sem opção vazia.

**Critérios de aceite**
- Não é possível salvar cartão sem conta pagadora (front e API).
- Após rodar a migração, toda fatura em aberto aparece no fluxo de alguma conta.
- Migração rodada duas vezes não altera nada na segunda.
- ⚠ Rodar a migração em produção só com autorização explícita do usuário.

#### U3 — Rótulo explícito do previsto acumulado
**Escopo**: quando o mês selecionado é futuro, os rótulos de valores previstos (barra de resumo e, depois, Início) mostram o intervalo: "Previsto de out/26 a dez/26". Mês atual/passado mantém "Previsto no fim do mês". Implementar no helper de U1 (retornar `projectedRange: { from, to } | null`).

**Critérios de aceite**: navegar para 2 meses à frente exibe o intervalo; mês atual não exibe intervalo.

### Fase 1 — Navegação e estrutura

#### U4 — Seletor com "Todas as contas"
**Escopo**
- `AccountContext`: separar `accountId` (última conta **específica**, como hoje) de `viewAll: boolean` (persistido por tenant em localStorage; valor inicial = `settings.dashboardScope === 'CONSOLIDATED'`). Expor `scopeAccountId = viewAll ? null : accountId`.
- `AccountSelector`: opção "Todas as contas" no topo, saldo de cada conta ao lado do nome (usar dados do dashboard ou endpoint de contas — verificar o mais barato), ícone de reserva para contas destino de reserva. Prop `allowAll` — `false` em Movimentações (D4).
- Oculto quando há 1 conta ativa.
- Dashboard e Relatório: usam `scopeAccountId` em vez de `settings.dashboardScope`.
- Backend dashboard: escopo decidido por presença de `accountId` (remover o `throw dashboard.accountRequired` e a leitura de `settings.dashboardScope` em `dashboard.service.ts`). Atualizar `dashboard.schemas.ts`.
- Remover o bloco "Escopo do dashboard" da aba Geral (`Settings.tsx`). Não remover o campo do backend (D4).

**Critérios de aceite**
- Trocar entre "Todas" e uma conta no Início altera os números.
- Em Movimentações o seletor não oferece "Todas" e mostra a última conta específica.
- Usuário com 1 conta não vê seletor em nenhuma tela.

#### U5 — Navegação, cabeçalho e Configurações reorganizados
**Escopo**
- `Sidebar.tsx`: itens Início, Movimentações, Cartões (oculto se 0 cartões ativos) e, separado no rodapé, Configurações. Remover "Backup e Exportação" do menu.
- Mobile: barra inferior com os mesmos itens (substitui o drawer) — se ficar grande, dividir em U5b.
- `Settings.tsx`: abas via query string (`/settings?tab=accounts`) — **Contas**, **Cartões**, **Categorias**, **Preferências** (idioma, tema), **Seus dados** (conteúdo atual de `Backup.tsx`: backup completo, restaurar, exportar CSV, importar extrato + "Zona de perigo" com reiniciar conta, recolhida). Aba "Tipos de contas" permanece até U14. Aba "Geral" deixa de existir.
- Rota `/backup` → `<Navigate to="/settings?tab=data" replace />`. Extrair as seções de `Backup.tsx` para componentes reutilizáveis (U11 vai reaproveitar importação/exportação).
- `Layout.tsx`: remover seletor de idioma e botão de tema do cabeçalho (vão para Preferências); "Sair" vai para um menu de perfil (ícone/avatar) que também tem o atalho de tema.
- Considerar dividir `Settings.tsx` (1321 linhas) em arquivos por aba em `pages/Settings/` como parte desta entrega.

**Critérios de aceite**: todas as funções antigas de Backup e Parametrizações acessíveis pelos novos caminhos; links antigos `/backup` funcionam; cabeçalho só com conta, mês e perfil (+ "Novo" após U6).

#### U6 — Botão global "+ Novo"
**Escopo**: botão primário "+ Novo" no cabeçalho (desktop) e botão flutuante (mobile) que abre o `QuickAddModal` existente (mesmo do atalho `N`). Sem mudar o formulário ainda (U12 faz isso). Esconder a opção "Transferência" quando há 1 conta.

**Critérios de aceite**: visível em todas as telas do `Layout`; atalho `N` continua funcionando; lançamento criado aparece no Início e em Movimentações.

#### U7 — Vocabulário (D7)
**Escopo**: aplicar a tabela D7 em `frontend/src/locales/{pt,en,es}/*.json`. Trocar o visual do `PaidToggle` (joinha) por checkbox com rótulo acessível "Marcar como pago/recebido", mantendo a prop `loading`. Revisar tooltips (`HelpTip`) para linguagem leiga.

- **Códigos de erro sem tradução:** o frontend traduz erros pelo `code` (`services/api.ts`) e, sem chave em `locales/*/errors.json`, mostra "Ocorreu um erro inesperado". Em 2026-10-13 havia ~20 códigos do backend sem chave (ex.: `transfer.*`, `creditCardEntry.*`, `creditCardImport.*`, `transaction.updateScopeRequired`, `onboarding.draft.autoReserve*`). Traduzir todos nos 3 idiomas; para listar os faltantes, varrer `AppError(..., '<code>')` em `backend/src` e comparar com `frontend/src/locales/pt/errors.json`.

**Critérios de aceite**: busca por "Parametriza", "Efetivar", "Referência", "Fluxo de Caixa" nos locales pt não encontra textos de UI remanescentes (exceto onde intencional — registrar em Notas); nenhum código de erro do backend fica sem tradução.

### Fase 2 — Início

#### U8 — Novo Início (Dashboard)
**Escopo** (estrutura de cima para baixo)
1. **Destaque**: saldo (rótulo D3) + previsto (rótulo U3).
2. **Mês**: Entrou · Saiu · Sobrou (resultado colorido pelo sinal) — via `summarizeMonth`.
3. **Ainda neste mês**: totais A receber / A pagar (U1) + lista dos próximos itens, atrasados primeiro em vermelho; "ver todos →" leva a Movimentações. Os **alertas** (`AlertsBar`) deixam de ser banners e viram itens atrasados desta lista. Backend: incluir entradas pendentes em `upcomingDues` (novo `DueType` `INCOME`) e itens vencidos não pagos do mês.
4. **Para onde foi o dinheiro**: top 5 categorias de despesa (resto agregado em "Outros").
5. **Ver análise completa** (recolhido; estado lembrado em localStorage): evolução mensal, receitas por categoria, divisão fixos/extraordinários/cartões, saldo inicial, saldos por conta (quando "Todas"), link "Imprimir relatório".
- Remover: donut `OverviewDonutCard`, card "Saldo inicial" do topo, grid de cards por conta no topo.
- `OnboardingBanner` permanece.

**Critérios de aceite**: no primeiro viewport (desktop 1366×768) aparecem só os blocos 1–3; nenhuma informação anterior ficou inacessível (está em "análise completa"); mobile sem rolagem horizontal.

### Fase 3 — Movimentações

#### U9 — Resumo compacto no topo
**Escopo**: substituir a `SummaryBar` do rodapé (`PageFooter`) por um bloco no topo: linha 1 Entrou · Saiu · Saldo; linha 2 Falta receber · Falta pagar · Previsto; "Ver detalhes ▾" revela saldo inicial, entre suas contas e o detalhamento previsto (U3). Estado expandido sobrevive à troca de mês (como hoje). Avaliar se `PageFooterContext` fica sem uso — se sim, remover em U10c.

#### U10a — Lista única: view-model, leitura e marcar pago
**Escopo**
- `pages/CashFlow/movements.ts`: tipo `MovementItem` normalizado (`id`, `kind: 'income' | 'payment' | 'extra' | 'transfer' | 'invoice'`, `direction: 'in' | 'out' | 'neutral'`, `description`, `amount`, `date`, `status`, `categoryId`, `isFixed`, `badges`, referência ao item original) + `toMovements(cashFlowResponse)` + `groupBySituation(items, today)` (D8). Testes unitários.
- Componente `MovementsList` (agrupado, Concluídos recolhível reutilizando `useCollapsibleSections`), linha com ícone de direção, descrição, categoria, badges (↻ fixo, Extra, 💳 Cartão, ⇄ conta contraparte, reserva automática), data, valor com sinal, checkbox de pago/recebido (despacha para a mutation correta já existente em `useCashFlowMutations`).
- Renderizar a lista **no lugar** das 5 grids, mantendo as grids no código (ainda não apagar).

#### U10b — Lista única: ações, filtros e busca
**Escopo**: clique na linha abre o modal existente do tipo correspondente (`IncomeModal`, `TransactionModal`, `TransferModal`); fatura navega para Cartões (como `handleOpenInvoice`). Excluir mantém todo o protocolo atual (reverter antes, escopo de fixos via `ScopedDeleteModal`). Filtros: chips `Todos | Entradas | Saídas`, campo de busca por descrição, popover "Filtros" com categorias (reaproveitar `CategoryFilterPopover`) e tipo (fixo, extraordinário, cartão, transferência).

**Critérios de aceite (U10a+b)**: toda ação possível nas grids antigas é possível na lista; contagem e soma dos itens batem com as grids antigas para o mesmo mês/conta.

#### U10c — Remoção das grids antigas
**Escopo**: apagar `EntriesGrid`, `TransactionGrid`, `TransferGrid`, `CreditCardsGrid` (e o que ficar sem uso: chaves i18n, `PageFooterContext`, partes de `shared.tsx`). `CashFlow.tsx` deve encolher de forma visível.

#### U11 — Menu "⋯" de Movimentações
**Escopo**: menu no canto da barra de filtros com **Importar extrato** (modal reaproveitando a seção extraída em U5), **Exportar mês em CSV** (período = mês selecionado, reaproveitando a exportação) e **Limpar mês** (por último, em vermelho, mesma lógica atual de `handleClearAll`). Remover os botões "Nova transferência" e "Limpar" soltos da `CashFlowFilterBar`.

#### U12 — Formulário único de lançamento
**Escopo**
- Componente `MovementForm` (em `components/movement/`) usado pelo `QuickAddModal` e pelos modais de criação/edição de Entrada e Saída.
- Campos visíveis: **Entrada | Saída** (toggle grande), Descrição, Valor, Data, Categoria, "Já foi pago/recebido?".
- **Mais opções** (recolhido): Repete todo mês (fixo), Gasto fora do comum (só Saída → `EXTRA_EXPENSE`), Conta (só se > 1), Observações.
- Link secundário "Transferência entre contas" (só se > 1 conta) abre o `TransferModal`.
- Edição: tipo Entrada/Saída e "gasto fora do comum" **desabilitados** (trocar exigiria excluir+criar; registrar como possível evolução).
- Marcar "Já foi pago" na criação = criar + efetivar (verificar se a API aceita criar já efetivado; se não, encadear as duas mutations).

**Critérios de aceite**: criar entrada, saída comum, saída extraordinária e fixa pelo "+ Novo" e pelo modal de edição; escopo de edição de fixos continua funcionando.

### Fase 4 — Cartões e contas

#### U13 — Cartões seguem o seletor de conta
**Escopo**: `CreditCards.tsx` filtra por `defaultPaymentAccountId === scopeAccountId`; em "Todas", lista agrupada por conta. `Layout` passa a mostrar o seletor (com "Todas") em `/credit-cards`. Extrair `CardSettingsModal` de `Settings.tsx` para componente compartilhado e oferecer "⋯ Editar cartão / Novo cartão" na própria tela. Parcelas futuras, importação OFX e limpar fatura ficam sob o "⋯" do detalhe do cartão.

#### U14 — Tipo de conta inline
**Escopo**: remover a aba "Tipos de contas"; no `AccountModal`, o select de tipo ganha "+ Novo tipo…" (cria inline) e o gerenciamento (renomear/remover) vira um pequeno gerenciador acessível a partir desse campo. Backend inalterado.

#### U15 — "+ Nova categoria" inline
**Escopo**: no select de categoria do `MovementForm` (e do lançamento de cartão), opção "+ Nova categoria…" que cria com o tipo correto (INCOME/EXPENSE) e já seleciona. A aba Categorias em Configurações permanece para gestão.

#### U16 — Auditoria de divulgação progressiva
**Escopo**: verificar todo o app com dois perfis — (a) tenant novo com 1 conta, 0 cartões; (b) tenant com várias contas, reserva e cartões — e corrigir onde aparecer conceito que o perfil (a) não usa (seletor, transferências, "Entre suas contas", coluna de conta, item Cartões, reserva). Registrar o checklist executado em Notas.

### Fase 5 — Evoluções (confirmar com o usuário antes)

#### U17 — Movimentações consolidada
**Escopo**: endpoint (ou modo do `GET /cash-flow` sem `accountId`) que usa `getCashFlowMany` e une as listas, **descartando os pares de transferência interna** entre contas ativas; resumo consolidado igual ao do dashboard. Frontend: Movimentações aceita "Todas"; cada linha mostra a conta; no formulário, "Conta" sai de Mais opções e fica obrigatória.

#### U18 — Compra no cartão pelo "+ Novo"
**Escopo**: em Saída, campo "Pagar com" (Conta X / Cartão Y; só se houver cartão). Escolhendo cartão, o formulário mostra parcelas e cria `CreditCardEntry` em vez de transação. Um único lugar para registrar qualquer gasto.

#### U19 — Preferência de densidade
**Escopo**: em Preferências, "Mostrar detalhes avançados" (default desligado) — quando ligado, "Ver detalhes" do resumo e "análise completa" do Início já abrem expandidos. Não esconde nada quando desligado.

#### U20 — Onboarding IA, relatório e documentação
**Escopo**: alinhar `onboarding-prompts.ts`/`onboarding-tools.ts` ao novo vocabulário (D7) e ao significado de `dashboardScope` (D4: valor inicial do seletor); conferir `Report.tsx` com D2/D3; atualizar `README.md`, `docs/domain-logic.md` e este plano (marcar como concluído no cabeçalho).

---

## Notas de implementação

> Registrar aqui, por entrega, descobertas, desvios do plano, decisões menores e pendências. Mais recente no topo.

### U7 — 2026-10-13
- Menu: Início · Movimentações · Cartões · Configurações (en: Home · Transactions · Cards · Settings; es: Inicio · Movimientos · Tarjetas · Configuración). "Referência" virou "mês" nos textos de escopo de fixos; "efetivar/reverter" viraram "marcar/desmarcar como pago/recebido/feita"; "Gasto extraordinário" virou "Gasto fora do comum"; "Saldo Final" da barra virou "Saldo" e a base da previsão, "Saldo Atual".
- `PaidToggle`: joinha → caixa (`Square`/`CheckSquare`, `role="checkbox"` + `aria-checked`), mesma API e `loading`.
- 20 códigos de erro do backend sem tradução foram traduzidos nos 3 idiomas (`transfer.*`, `creditCardImport.*`, `creditCardEntry.*`, `transaction.updateScopeRequired`, `onboarding.draft.autoReserve*`). Novo teste `backend/src/shared/errors/error-codes.i18n.test.ts` falha se algum `new AppError(..., '<code>')` ficar sem chave em pt/en/es **e** se en/es divergirem das chaves de pt em qualquer arquivo de locale. Códigos `validation.*` do Zod não entram (só vão em `details`; o toast usa `validation.generic`).
- **Mantidos de propósito:** tipos do lançamento rápido ("Pagamento", "Gasto Extra") — o formulário é refeito na U12 (Entrada/Saída); "Saldo final" no Relatório impresso (é sempre um mês fechado); "Referência" em textos técnicos do onboarding e da importação OFX.
- `formatMonthYear` continua só em português (nomes fixos) — fora do escopo do vocabulário; registrar se incomodar.

### U6 — 2026-10-13
- `NewEntryButton` em `Layout.tsx`: botão "Novo" no cabeçalho (desktop) e botão flutuante `fixed right-4 bottom-20` (celular, acima da `BottomNav`). Ambos chamam `openQuickAdd` do `QuickAddContext`, o mesmo do atalho N.
- `QuickAddModal` esconde "Transferência" com uma conta só. O lançamento vai para a última conta específica do seletor (`accountId`), mesmo com "Todas as contas" ativo no Dashboard — a escolha de conta no formulário entra em U12 ("Mais opções → Conta").
- Atenção para U9/U16: o botão flutuante pode cobrir o canto direito da barra de resumo do Fluxo de Caixa no celular quando expandida; conferir na verificação visual.

### U5 — 2026-10-13
- `Sidebar.tsx` exporta `Sidebar` (só desktop) e `BottomNav` (só celular, último filho da coluna do `Layout`, depois do slot do `PageFooter` — não usa `position: fixed`, então não cobre a barra de resumo). O drawer/hambúrguer saiu. Cartões aparece quando há cartão ativo (query `['creditCards']`, a mesma do Fluxo de Caixa).
- Cabeçalho: idioma e tema saíram; menu de perfil (`ProfileMenu` em `Layout.tsx`) com alternar tema e sair. Idioma e tema completos em Configurações → Preferências.
- Configurações: aba via `?tab=` (default `accounts`), ordem Contas · Cartões · Categorias · Tipos de Conta · Preferências · Seus dados. "Seus dados" = seções de `Backup.tsx` (default export agora é `BackupSections`) + zona de perigo. `/backup` redireciona para `/settings?tab=data`.
- Rótulos de menu **não** mudaram (ainda "Dashboard", "Fluxo de Caixa", "Parametrizações") — renomear é a U7.
- **Não feito:** dividir `Settings.tsx` por aba (o plano dizia "considerar"). Fica para quando U13/U14 mexerem nas abas de Cartões e Tipos de conta.
- Chaves i18n removidas: `layout.nav.backup`, `layout.header.{openMenu,closeMenu,language}`, `settings.tabs.general`.
- Verificado por teste (`Sidebar.test.tsx`); verificação visual pendente (nota da Fase 0) — conferir especialmente a barra inferior no celular com a barra de resumo do Fluxo de Caixa aberta.

### U4 — 2026-10-13
- `AccountContext` ganhou `viewAll`/`setViewAll` (localStorage `viewAllAccounts:<tenant>`; sem valor salvo, vale `settings.dashboardScope !== 'ACCOUNT'`) e `scopeAccountId` (null = todas; com 1 conta, sempre a própria conta). `accountId` continua sendo a última conta específica, usada pelo Fluxo de Caixa.
- Backend: `DashboardService` não lê mais settings; escopo = presença de `accountId` (removidos o erro `dashboard.accountRequired` e a dependência de `SettingsRepository`).
- Relatório: escopo vem só da URL (`accountId` presente = por conta), igual ao link do Dashboard.
- Aba Geral ficou só com a zona de perigo (sai em U5). Chaves i18n `general.dashboardScope*`/`saveButton`/`savedMessage` removidas.
- **Desvio:** o seletor ainda não mostra saldo nem ícone de reserva ao lado de cada conta — é um `<select>` nativo, que não comporta ícone, e o saldo exigiria buscar o dashboard consolidado só para isso. Avaliar num seletor customizado (U5 ou U16).
- Verificado por teste de componente (`AccountSelector.test.tsx`); verificação visual segue pendente (ver nota da Fase 0).

### Fase 0 — verificação visual pendente
- O backend local não sobe: o Atlas recusa a conexão desta máquina (TLS alert 80, IP fora do Network Access) e o login é Google. Por isso U1–U3 foram verificadas só por testes (backend + teste de componente `SummaryBar.test.tsx`). **Ao retomar com o app rodando (local com IP liberado, ou em produção após deploy), conferir:** barra do Fluxo de Caixa com/sem transferência, expandida em mês atual e futuro; Dashboard por conta vs. Fluxo de Caixa da mesma conta (Entradas/Saídas/Saldo iguais); Relatório; cadastro/edição de cartão; tentativa de desativar conta pagadora.

### U3 — 2026-10-13
- `projectionRange(month, year)` em `utils/month-summary.ts` + `formatMonthYearShort` em `utils/date.ts` ("out/26", no idioma ativo). Na barra expandida, mês futuro mostra "Previstos acumulados de out/26 a dez/26" acima da linha de previstos. O Início (U8) deve reaproveitar o mesmo helper.
- Observação: `formatMonthYear` ainda é só em português (nomes fixos) — pré-existente; considerar em U7.

### U2 — 2026-10-13
- Implementado como **migração de boot** (`shared/migrations/migrate-card-payment-account.ts`, chamada em `server.ts`, padrão das migrações E*) + script avulso `npm run migrate:card-payment-account [-- --dry-run]`. Além de nulos, também corrige pagadora apontando para conta inexistente ou **inativa** (fatura de conta inativa não aparece em fluxo nenhum).
- Regra compartilhada em `credit-cards/card-payment-account.utils.ts` (fallback = primeira conta ativa em ordem alfabética, a mesma que o formulário já sugeria), reaproveitada pela restauração de backup.
- Desativar conta que paga cartão ativo → 409 `account.paysCreditCard` (com `params.cards`). `AccountsService` e `CreditCardsService` recebem os repositórios extras como parâmetro **opcional** para não quebrar os testes existentes.
- Onboarding: cartão sem `defaultPaymentAccountRef` fica com a conta principal do draft.
- **Produção verificada em 2026-10-13** (IP liberado no Atlas): dry-run em `gestao_financeira` → 0 de 5 cartões precisavam de ajuste, então a execução real seria no-op e não foi necessária. Consulta só-leitura: 8 contas, nenhuma com regra de reserva ativa e nenhuma transferência automática já gerada — não há indício de regra apagada pelo bug do `migrateResetAutoReserve`.
- ~~Migração em produção pendente de execução:~~ o Atlas recusa conexão desta máquina (TLS alert 80 → IP fora do Network Access). Roda sozinha no próximo boot do Render após o deploy, ou manualmente com o IP liberado: `MONGODB_DB_NAME=gestao_financeira npm run migrate:card-payment-account -- --dry-run` e depois sem `--dry-run`.
- Achados fora do escopo, tratados à parte: (1) `migrateResetAutoReserve` zerava regras de reserva automática novas a cada boot — corrigido em commit próprio (`fix:`); regras configuradas em produção antes do deploy dessa correção podem ter sido apagadas. (2) ~20 códigos de erro sem tradução — traduzidos só os de `account.*` e `creditCard.*` desta entrega; o resto foi para o escopo da U7.

### U1 — 2026-10-13
- **Bug corrigido além do escopo previsto:** `projectedBalance` partia do saldo do *início* do mês (`calcAccountBalance(..., monthStart)`) somado só aos itens *pendentes* do intervalo, então tudo que já tinha sido pago/recebido no mês sumia da previsão. Regressão de `726fe67` (que passou a excluir efetivados do intervalo sem mover a base). Agora `projectedInitialBalance = realizedBalance` — o campo mudou de significado: é a **base da projeção** (saldo já realizado até o fim do mês selecionado), não mais um "saldo inicial previsto". Na barra de resumo o rótulo virou "Saldo Realizado".
- `expected*` continuam significando "pendente no intervalo mês atual → mês selecionado" (acumulado em mês futuro). Os novos `pending*` são só do mês selecionado.
- Itens pendentes de meses **anteriores** (atrasados) não entram em `pending*` nem na projeção — comportamento já existente; avaliar em U8/U10 se "Atrasados" deve trazer itens de meses passados.
- `sumSummaries` do dashboard agora soma por chave de `ZERO_SUMMARY` (não dá mais para esquecer campo novo no consolidado).
- No Dashboard, "Entre suas contas" entrou como 4º box no detalhamento de saídas (só quando ≠ 0). No consolidado, transferências entre contas ativas se anulam e o box não aparece.
- Verificação visual no navegador ficou para o fim da Fase 0 (login Google precisa ser feito pelo usuário no painel).
