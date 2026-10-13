# Plano: Simplificação da UX e ciclo planejar → executar → comparar → ajustar

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

Reduzir a carga cognitiva para quem nunca usou um sistema financeiro, sem remover recursos avançados, e — a partir da revisão de 2026-10-13 — fazer o produto **ajudar a decidir como usar o dinheiro que já existe**, e não só registrar o passado.

O ciclo do produto é **planejar → executar → comparar → ajustar**:

| Etapa | Pergunta do usuário | Onde |
|---|---|---|
| Planejar | "Quanto posso usar e para quê?" | Início (**Livre para usar**) + tela **Plano** |
| Executar | "Registrei o gasto — ainda cabe?" | "+ Novo" e Movimentações, com "restam R$ X" na hora |
| Comparar | "Saiu como planejei?" | Plano (planejado × gasto, por categoria) |
| Ajustar | "O que mudo daqui pra frente?" | Cobrir estouro, replanejar "a partir de", **Revisão do mês** |

Princípios: decisões usam **dinheiro que já está nas contas** (renda prevista e cartão não aumentam o que é "livre"); o plano é **opcional** — o app funciona sem ele e o convida quando faz sentido; replanejar **nunca apaga** o que foi planejado originalmente. Recursos avançados continuam aparecendo por gatilho de dados ou a pedido ("Ver detalhes", "Mais opções", menu "⋯").

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
| Sem plano no mês | Convite "Planeje seu mês" no Início; Plano abre o assistente |
| Categoria com plano | "Restam R$ X" no formulário e no Plano; destaque quando passa |
| Mês anterior não revisado | Cartão "Revisão do mês" no Início |
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

### D9 — "Livre para usar" é o número principal do produto
Responde "quanto posso usar sem depender de dinheiro que ainda não tenho". Calculado no backend, sempre sobre as **contas do planejamento** (D13), independente do seletor de conta:

```
Livre para usar = saldo hoje das contas do planejamento
                − a pagar até o fim do mês corrente (pendentes, inclusive atrasados)
                − dívida de cartão ainda não paga (todas as parcelas em aberto, inclusive futuras)
                − restante dos planos de categoria do mês (max(0, planejado − consumido))
```
- **Entradas previstas nunca aumentam o Livre** — só contam quando recebidas. Aparecem como informação ("A receber R$ X"). Ao receber uma entrada, o app oferece "Você recebeu R$ X — quer distribuir no plano?".
- Sem plano, o último termo é zero: o Livre ainda faz sentido (saldo − contas − cartão).
- Pode ficar negativo; nesse caso o texto muda para "Faltam R$ X para cobrir o que já está comprometido" e mostra o detalhamento.
- O "Previsto no fim do mês" (D2, que soma renda prevista) deixa de ser destaque: fica em Movimentações → "Ver detalhes" e na análise completa do Início.

### D10 — Plano por categoria de despesa, mês a mês, opcional
- O usuário define quanto pretende gastar por **categoria de despesa** no mês. Não precisa planejar todas: o que não tem plano cai em "Outros gastos" (só aparece como realizado).
- **Consumido** de uma categoria no mês = saídas pagas + saídas pendentes (agendadas) + compras no cartão (D12) daquela categoria no mês. Contas fixas já agendadas consomem o plano desde o início do mês ("já separado").
- Sugestão automática ao criar o plano: valores do mês anterior (plano atual, ou realizado se não havia plano) + soma das contas fixas da categoria. O usuário só confirma/ajusta.

### D11 — Replanejar sem perder o histórico
- Cada categoria-mês guarda **planejado original**, **planejado atual** e a **lista de ajustes** (`de`, `para`, `quando`, `motivo` opcional, `origem`: edição · cobertura de estouro · revisão do mês).
- O **original congela** quando o mês começa (primeira leitura do plano com o mês já em curso) ou quando o usuário confirma a Revisão do mês (D14). Antes disso, editar é só rascunho.
- Mudar "a partir de" um mês cria **nova versão do modelo** (`effectiveFrom`), sem reescrever meses passados. Meses encerrados são somente leitura.
- Exemplo do usuário: planejou R$ 1.500 em Mercado, gastou R$ 1.800 → o Plano mostra "Passou R$ 300" com três ações: **Cobrir com outra categoria** (move plano de quem tem sobra; os dois lados registram ajuste), **Cobrir com o Livre** (aumenta o plano usando dinheiro sem destino) ou **Ajustar os próximos meses** ("a partir de novembro, R$ 1.800"). Em todos os casos o original (R$ 1.500) continua visível no histórico e na comparação.
- No nível do lançamento: pagar com valor diferente do previsto **não sobrescreve** o previsto (`plannedAmount`, U23) — hoje `amountPaid` sobrescreve `amount` e o planejado se perde.

### D12 — Cartão é dinheiro gasto na hora da compra
- Para o plano, compra no cartão consome a categoria no **mês da compra** (à vista) ou **uma parcela por mês a partir do mês da compra** (parcelado) — não no mês em que a fatura é paga. Pagar a fatura **não** consome categoria (evita contar duas vezes).
- Para o Livre, toda dívida de cartão em aberto (parcelas atuais e futuras) sai na hora da compra (D9). Parcelas futuras aparecem no Plano dos meses seguintes como "já comprometido".
- O breakdown de categorias do Início (hoje: só faturas pagas, pelo mês da fatura — `dashboard.service.ts`) passa a seguir esta mesma regra, para que "comparar" use um único critério.

### D13 — Contas do planejamento
Conta ganha `includeInPlan` (default `true`; `false` para contas destino de reserva automática — dinheiro guardado não é livre). Editável em Contas ("Entra no Livre para usar"). Permite deixar PJ, investimentos etc. de fora. O plano é **um por tenant**, sobre essas contas.

### D14 — Revisão do mês é o ritual de "comparar → ajustar"
Na virada do mês, o Início mostra um cartão "Outubro fechou — revise em 2 minutos". A revisão lista, por categoria: planejado original, ajustado, gasto e diferença; para cada uma, o próximo mês recebe **Manter** / **Usar o gasto real** / **Outro valor**. A sobra do mês pode ir para a reserva ou continuar livre. Confirmar cria o plano do mês seguinte (e congela o original dele).

### D15 — Linguagem do planejamento
Usar: **Plano**, **Livre para usar**, **Separado**, **Gasto**, **Restam**, **Passou**, **Cobrir**, **Revisão do mês**. Evitar: orçamento, envelope, alocar, provisão, competência.

### D16 — Navegação com o ciclo
Menu: **Início · Plano · Movimentações · Cartões** (+ Configurações no rodapé). "Plano" concentra planejar, comparar e ajustar; Movimentações é a execução. Antes do primeiro plano, "Plano" abre o assistente (U24); nada é escondido.

---

## Status

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluída · ⏸ adiada

| # | Entrega | Fase | Depende de | Status | Concluída em | Commit |
|---|---|---|---|---|---|---|
| U1 | Regra única de resumo mensal + totais pendentes | 0 | — | ✅ | 2026-10-13 | bfcc174 |
| U2 | Cartão com conta pagadora obrigatória | 0 | — | ✅ | 2026-10-13 | a42a8e6 |
| U3 | Rótulo explícito do previsto acumulado | 0 | U1 | ✅ | 2026-10-13 | 3ac0663 |
| U4 | Seletor com "Todas as contas" (substitui `dashboardScope` na UI) | 1 | — | ⬜ | | |
| U5 | Navegação, cabeçalho e Configurações reorganizados | 1 | U4 | ⬜ | | |
| U6 | Botão global "+ Novo" | 1 | — | ⬜ | | |
| U7 | Vocabulário (D7 + D15) e erros sem tradução | 1 | — | ⬜ | | |
| U23 | Valor planejado preservado no lançamento (`plannedAmount`) | 2 | — | ⬜ | | |
| U21 | "Livre para usar" (backend) + contas do planejamento | 2 | U2 | ⬜ | | |
| U22 | Modelo de plano versionado + consumo por categoria (backend) | 2 | U21 | ⬜ | | |
| U24 | Tela Plano + assistente do primeiro plano | 3 | U5, U22 | ⬜ | | |
| U25 | Estouro: cobrir e ajustar "a partir de" (com histórico) | 3 | U24 | ⬜ | | |
| U8 | Novo Início orientado a decisão | 4 | U4, U21, U22 | ⬜ | | |
| U27 | Revisão do mês | 4 | U25, U8 | ⬜ | | |
| U9 | Resumo compacto no topo de Movimentações | 5 | U1, U3 | ⬜ | | |
| U10a | Lista única — view-model + leitura + marcar pago | 5 | U9 | ⬜ | | |
| U10b | Lista única — ações, filtros e busca | 5 | U10a | ⬜ | | |
| U10c | Remoção das grids antigas e código morto | 5 | U10b | ⬜ | | |
| U11 | Menu "⋯" de Movimentações (importar, exportar, limpar) | 5 | U5, U10b | ⬜ | | |
| U12 | Formulário único de lançamento (Entrada/Saída + Mais opções) | 5 | U6 | ⬜ | | |
| U26 | Feedback do plano na execução ("restam R$ X") | 5 | U12, U22 | ⬜ | | |
| U13 | Cartões seguem o seletor de conta + editar cartão na própria tela | 6 | U2, U4 | ⬜ | | |
| U18 | Compra no cartão pelo "+ Novo" | 6 | U12, U13 | ⬜ | | |
| U28 | Cartão no plano: comprometido futuro e alertas | 6 | U22, U13 | ⬜ | | |
| U14 | Tipo de conta inline no cadastro de conta | 6 | U5 | ⬜ | | |
| U15 | "+ Nova categoria" inline nos formulários | 6 | U12 | ⬜ | | |
| U16 | Auditoria de divulgação progressiva (1 conta / 0 cartões / sem plano) | 6 | U8, U10c, U13, U24 | ⬜ | | |
| U17 | Movimentações consolidada ("Todas as contas") | 7 | U10c, U12 | ⬜ | | |
| U29 | "Posso gastar R$ X?" (simulação) | 7 | U21, U26 | ⬜ | | |
| U19 | Preferência "Mostrar detalhes avançados" (densidade) | 7 | U8, U9 | ⬜ | | |
| U20 | Onboarding IA, relatório e documentação alinhados | 7 | U7, U8, U24 | ⬜ | | |

A tabela está **na ordem de execução** (não numérica). A revisão de 2026-10-13 adicionou U21–U29 e reordenou as fases: os fundamentos do plano (Fase 2) vêm antes do novo Início, porque o Início passa a ser construído em torno do Livre para usar e do plano. Fase 7 é evolução opcional — confirmar com o usuário antes de iniciar.

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
- `Sidebar.tsx`: itens Início, Movimentações, Cartões (oculto se 0 cartões ativos) — "Plano" entra entre Início e Movimentações em U24 (D16) e, separado no rodapé, Configurações. Remover "Backup e Exportação" do menu.
- Mobile: barra inferior com os mesmos itens (substitui o drawer) — se ficar grande, dividir em U5b.
- `Settings.tsx`: abas via query string (`/settings?tab=accounts`) — **Contas**, **Cartões**, **Categorias**, **Preferências** (idioma, tema), **Seus dados** (conteúdo atual de `Backup.tsx`: backup completo, restaurar, exportar CSV, importar extrato + "Zona de perigo" com reiniciar conta, recolhida). Aba "Tipos de contas" permanece até U14. Aba "Geral" deixa de existir.
- Rota `/backup` → `<Navigate to="/settings?tab=data" replace />`. Extrair as seções de `Backup.tsx` para componentes reutilizáveis (U11 vai reaproveitar importação/exportação).
- `Layout.tsx`: remover seletor de idioma e botão de tema do cabeçalho (vão para Preferências); "Sair" vai para um menu de perfil (ícone/avatar) que também tem o atalho de tema.
- Considerar dividir `Settings.tsx` (1321 linhas) em arquivos por aba em `pages/Settings/` como parte desta entrega.

**Critérios de aceite**: todas as funções antigas de Backup e Parametrizações acessíveis pelos novos caminhos; links antigos `/backup` funcionam; cabeçalho só com conta, mês e perfil (+ "Novo" após U6).

#### U6 — Botão global "+ Novo"
**Escopo**: botão primário "+ Novo" no cabeçalho (desktop) e botão flutuante (mobile) que abre o `QuickAddModal` existente (mesmo do atalho `N`). Sem mudar o formulário ainda (U12 faz isso). Esconder a opção "Transferência" quando há 1 conta.

**Critérios de aceite**: visível em todas as telas do `Layout`; atalho `N` continua funcionando; lançamento criado aparece no Início e em Movimentações.

#### U7 — Vocabulário (D7 + D15)
**Escopo**: aplicar as tabelas D7 e D15 em `frontend/src/locales/{pt,en,es}/*.json`. Trocar o visual do `PaidToggle` (joinha) por checkbox com rótulo acessível "Marcar como pago/recebido", mantendo a prop `loading`. Revisar tooltips (`HelpTip`) para linguagem leiga.

- **Códigos de erro sem tradução:** o frontend traduz erros pelo `code` (`services/api.ts`) e, sem chave em `locales/*/errors.json`, mostra "Ocorreu um erro inesperado". Em 2026-10-13 havia ~20 códigos do backend sem chave (ex.: `transfer.*`, `creditCardEntry.*`, `creditCardImport.*`, `transaction.updateScopeRequired`, `onboarding.draft.autoReserve*`). Traduzir todos nos 3 idiomas; para listar os faltantes, varrer `AppError(..., '<code>')` em `backend/src` e comparar com `frontend/src/locales/pt/errors.json`.

**Critérios de aceite**: busca por "Parametriza", "Efetivar", "Referência", "Fluxo de Caixa" nos locales pt não encontra textos de UI remanescentes (exceto onde intencional — registrar em Notas); nenhum código de erro do backend fica sem tradução.

### Fase 2 — Fundamentos do plano (backend)

#### U23 — Valor planejado preservado no lançamento
**Escopo**: `FinancialTransaction.plannedAmount` (centavos). Na criação = `amount`; editar o lançamento pendente atualiza os dois; pagar/receber com `amountPaid`/`amountReceived` diferente altera só `amount` (realizado) e mantém `plannedAmount`. A recorrência fixa deve gerar o próximo mês a partir do previsto (verificar `ensureFixedTransactions`, que hoje copia `latest.amount` — um mês pago a mais "contaminaria" a série). Migração de boot: `plannedAmount = amount` onde ausente. UI mínima: na linha/modal, quando difere, "previsto R$ X" em texto secundário.

**Critérios de aceite**: pagar R$ 1.800 uma conta prevista em R$ 1.500 mantém "previsto R$ 1.500" visível; o mês seguinte da série fixa nasce com R$ 1.500.

#### U21 — "Livre para usar" (backend) + contas do planejamento
**Escopo**
- `Account.includeInPlan` (D13) com migração de boot (default `true`; `false` para contas que são destino de reserva automática). Campo no `AccountModal` ("Entra no Livre para usar", com HelpTip).
- Novo módulo `backend/src/modules/plan/` com `GET /plan/free` (ou campo no dashboard — decidir na implementação e registrar) devolvendo `{ free, breakdown: { balance, pendingThisMonth, cardDebt, cardDebtFuture, plannedRemaining }, pendingIncome }` segundo D9. Até U22 existir, `plannedRemaining = 0`.
- Dívida de cartão = parcelas não canceladas de faturas não pagas, de cartões ativos cuja conta pagadora está no planejamento.
- Testes: entrada prevista não aumenta o Livre; parcela futura reduz o Livre; conta com `includeInPlan=false` fica de fora; resultado negativo.

#### U22 — Modelo de plano versionado + consumo por categoria
**Escopo**
- Coleções: `plan_templates` (`categoryId`, `amount`, `effectiveFrom` YYYY-MM; nunca editadas, só nova versão) e `plan_months` (`month`, `year`, `categoryId`, `original`, `current`, `frozenAt`, `adjustments[]` com `{ from, to, at, reason, origin }`).
- `GET /plan/:year/:month`: materializa `plan_months` a partir do modelo vigente; congela `original` conforme D11; devolve por categoria `{ original, current, consumed, consumedBreakdown: { paid, scheduled, card }, remaining, overspent, adjustments }` + totais + "Outros gastos" (consumo sem plano).
- Consumo (D10/D12) em um único serviço reutilizado pelo plano, pelo Livre (U21 passa a usar `plannedRemaining` real) e pelo breakdown de categorias do Início.
- Mutations: `PUT /plan/:y/:m/:categoryId` (novo `current`; registra ajuste se congelado), `POST /plan/:y/:m/cover` (`{ toCategoryId, amount, from: categoryId | 'FREE' }`), `POST /plan/templates` (`{ categoryId, amount, effectiveFrom }`), `GET /plan/:y/:m/suggestion` (sugestão D10, não grava).
- Backup/restore e reset de tenant incluem as duas coleções. Onboarding IA não muda nesta entrega (U20).
- Testes: original congela; ajuste preserva original; "a partir de" não altera meses passados; cobrir move entre categorias registrando os dois lados; compra parcelada consome uma parcela por mês a partir do mês da compra.

### Fase 3 — Planejar e ajustar

#### U24 — Tela Plano + assistente do primeiro plano
**Escopo**
- Rota `/plan`, item "Plano" no menu (D16). O mês segue o `MonthNavigator`.
- Topo: **Livre para usar** (U21) com detalhamento recolhível; "Planejado R$ X de R$ Y disponíveis" — se planejou mais do que tem, aviso ("Você planejou R$ 300 a mais do que tem").
- Lista por categoria planejada: nome, barra planejado × consumido (separando "já separado" de contas agendadas), "Restam R$ X" ou "Passou R$ X". "Outros gastos" no fim. Meses passados: somente leitura, com coluna "planejado original".
- Assistente (sem plano no mês): 3 passos — (1) quanto você tem hoje e o que já está comprometido; (2) categorias sugeridas com valores do mês anterior (D10), marcar/desmarcar e ajustar; (3) confirmar, mostrando quanto fica livre. "Copiar do mês anterior" como atalho quando já houve plano.

**Critérios de aceite**: usuário sem plano cria o primeiro em até 3 telas; editar valor antes do mês começar não gera ajuste; depois, gera.

#### U25 — Estouro: cobrir e ajustar "a partir de"
**Escopo**: clicar numa categoria abre painel lateral com histórico (original, ajustes com data/motivo) e ações: **Cobrir com outra categoria** (lista as que têm sobra), **Cobrir com o Livre**, **Ajustar os próximos meses** (novo valor + mês inicial → `POST /plan/templates`), **Editar este mês**. Motivo opcional em todas. Categoria que passou ganha destaque e aparece primeiro.

**Critérios de aceite**: cenário 1.500 → gasto 1.800: cobrir R$ 300 de Lazer deixa Mercado com atual 1.800/original 1.500 e Lazer com ajuste −300; "a partir de novembro, R$ 1.800" não altera outubro.

### Fase 4 — Início e revisão

#### U8 — Novo Início orientado a decisão
**Escopo** (de cima para baixo; substitui o escopo anterior desta entrega)
1. **Livre para usar** (U21) em destaque, com uma linha de contexto ("já descontadas as contas do mês, o cartão e o que está separado no plano") e "ver detalhes".
2. **Seu plano** (se houver): até 4 categorias — as que passaram primeiro, depois as mais próximas do limite — com barra; "ver plano →". Sem plano: convite "Planeje seu mês em 2 minutos" (abre o assistente U24).
3. **Ainda neste mês**: A pagar (próximos itens, atrasados primeiro; os **alertas** viram itens desta lista) e **A receber** como informação ("não entra no Livre até chegar"). Backend: entradas pendentes em `upcomingDues` (`DueType` `INCOME`).
4. **Mês até agora**: Entrou · Saiu · Sobrou (`summarizeMonth`).
5. **Ver análise completa** (recolhido): evolução mensal, gastos e receitas por categoria (regra D12), saldos por conta, previsto do fim do mês (D2/U3), imprimir relatório.
- Remover: donut, card "Saldo inicial", grid de cards por conta no topo. `OnboardingBanner` permanece.
- O cartão "Revisão do mês" (U27) aparece aqui quando houver mês anterior não revisado.

**Critérios de aceite**: o primeiro viewport (1366×768) mostra só os blocos 1–3; usuário sem plano vê o Livre e o convite, sem jargão; nenhuma informação anterior ficou inacessível.

#### U27 — Revisão do mês
**Escopo**: fluxo de D14 em `/plan/review/:year/:month`. Por categoria: original, ajustado, gasto, diferença e escolha para o próximo mês (Manter / Usar o gasto real / Outro). Resumo: "Gastou R$ X a menos/mais do que planejou". Sobra: "Guardar na reserva" (cria transferência para a conta de reserva, só se existir) ou "Deixar livre". Confirmar cria `plan_months` do mês seguinte com o `original` congelado. Mês revisado fica marcado (o convite não se repete).

### Fase 5 — Executar (Movimentações)

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

#### U26 — Feedback do plano na execução
**Escopo**: no `MovementForm`, ao escolher categoria de despesa com plano, mostrar abaixo do campo "Mercado: restam R$ 300 de R$ 1.200" e, se o valor digitado passar, "Isso passa o plano em R$ 80" (informa, não bloqueia). Após salvar, toast com o novo restante. Na lista de Movimentações, agrupamento opcional por categoria com o restante no cabeçalho. Ao **receber** uma entrada, toast "Você recebeu R$ X — distribuir no plano?" (abre o Plano).

### Fase 6 — Cartões e contas

#### U13 — Cartões seguem o seletor de conta
**Escopo**: `CreditCards.tsx` filtra por `defaultPaymentAccountId === scopeAccountId`; em "Todas", lista agrupada por conta. `Layout` passa a mostrar o seletor (com "Todas") em `/credit-cards`. Extrair `CardSettingsModal` de `Settings.tsx` para componente compartilhado e oferecer "⋯ Editar cartão / Novo cartão" na própria tela. Parcelas futuras, importação OFX e limpar fatura ficam sob o "⋯" do detalhe do cartão.

#### U18 — Compra no cartão pelo "+ Novo"
**Escopo**: em Saída, campo "Pagar com" (Conta X / Cartão Y; só se houver cartão). Escolhendo cartão, o formulário mostra parcelas e cria `CreditCardEntry` em vez de transação. Um único lugar para registrar qualquer gasto.

#### U28 — Cartão no plano: comprometido futuro e alertas
**Escopo**: na tela Plano, linha "Cartão — já comprometido nos próximos meses: nov R$ X · dez R$ Y" (parcelas futuras, D12). Ao lançar compra parcelada (U18), mostrar antes de salvar quanto cada mês futuro fica comprometido. Alerta no Início quando a próxima fatura for maior que o saldo das contas do planejamento. Em Cartões, o resumo do cartão mostra "já gasto, a pagar" em vez de só "fatura do mês".

#### U14 — Tipo de conta inline
**Escopo**: remover a aba "Tipos de contas"; no `AccountModal`, o select de tipo ganha "+ Novo tipo…" (cria inline) e o gerenciamento (renomear/remover) vira um pequeno gerenciador acessível a partir desse campo. Backend inalterado.

#### U15 — "+ Nova categoria" inline
**Escopo**: no select de categoria do `MovementForm` (e do lançamento de cartão), opção "+ Nova categoria…" que cria com o tipo correto (INCOME/EXPENSE) e já seleciona. A aba Categorias em Configurações permanece para gestão.

#### U16 — Auditoria de divulgação progressiva
**Escopo**: verificar todo o app com dois perfis — (a) tenant novo com 1 conta, 0 cartões, sem plano; (b) tenant com várias contas, reserva e cartões — e corrigir onde aparecer conceito que o perfil (a) não usa (seletor, transferências, "Entre suas contas", coluna de conta, item Cartões, reserva). Registrar o checklist executado em Notas.

### Fase 7 — Evoluções (confirmar com o usuário antes)

#### U17 — Movimentações consolidada
**Escopo**: endpoint (ou modo do `GET /cash-flow` sem `accountId`) que usa `getCashFlowMany` e une as listas, **descartando os pares de transferência interna** entre contas ativas; resumo consolidado igual ao do dashboard. Frontend: Movimentações aceita "Todas"; cada linha mostra a conta; no formulário, "Conta" sai de Mais opções e fica obrigatória.

#### U29 — "Posso gastar R$ X?"
**Escopo**: ação no Início (e atalho no "+ Novo"): o usuário digita valor, categoria e forma (conta/cartão/parcelado) e vê o efeito no Livre e no plano da categoria — sem gravar nada. "Registrar agora" leva ao formulário preenchido.

#### U19 — Preferência de densidade
**Escopo**: em Preferências, "Mostrar detalhes avançados" (default desligado) — quando ligado, "Ver detalhes" do resumo e "análise completa" do Início já abrem expandidos. Não esconde nada quando desligado.

#### U20 — Onboarding IA, relatório e documentação
**Escopo**: alinhar `onboarding-prompts.ts`/`onboarding-tools.ts` ao novo vocabulário (D7/D15), ao significado de `dashboardScope` (D4: valor inicial do seletor) e ao planejamento (o assistente pode propor o primeiro plano por categoria e o `includeInPlan` das contas); conferir `Report.tsx` com D2/D3; atualizar `README.md`, `docs/domain-logic.md` e este plano (marcar como concluído no cabeçalho).

---

## Notas de implementação

> Registrar aqui, por entrega, descobertas, desvios do plano, decisões menores e pendências. Mais recente no topo.

### Revisão do plano — 2026-10-13 (planejar → executar → comparar → ajustar)
- Pedido do usuário: o app deve ajudar a decidir como usar o dinheiro que já existe, sem depender de renda futura ou de cartão, com replanejamento que preserve o planejado original. Entraram D9–D16 e U21–U29; a U8 foi reescopada; as fases foram reordenadas (fundamentos do plano antes do novo Início).
- Achados no código que embasam as decisões: (1) já existe "plano por item" (lançamentos pendentes + recorrência fixa), mas não por categoria; (2) `settleTransactionChecked` grava `amountPaid` em `amount`, então o previsto do item se perde (U23); (3) o breakdown por categoria do dashboard só conta cartão quando a fatura é paga, pelo mês da fatura (D12 muda para o mês da compra).
- **Pontos a confirmar com o usuário antes de U21/U22** (os defaults já estão escritos nas decisões): (a) parcelas futuras do cartão saem do Livre já na compra (D9/D12) ou só a fatura do mês?; (b) contas PJ/investimento ficam fora do Livre por padrão, ou só as de reserva (D13)?; (c) o original do plano congela no início do mês ou só quando o usuário confirma (D11)?

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
- **Migração em produção pendente de execução:** o Atlas recusa conexão desta máquina (TLS alert 80 → IP fora do Network Access). Roda sozinha no próximo boot do Render após o deploy, ou manualmente com o IP liberado: `MONGODB_DB_NAME=gestao_financeira npm run migrate:card-payment-account -- --dry-run` e depois sem `--dry-run`.
- Achados fora do escopo, tratados à parte: (1) `migrateResetAutoReserve` zerava regras de reserva automática novas a cada boot — corrigido em commit próprio (`fix:`); regras configuradas em produção antes do deploy dessa correção podem ter sido apagadas. (2) ~20 códigos de erro sem tradução — traduzidos só os de `account.*` e `creditCard.*` desta entrega; o resto foi para o escopo da U7.

### U1 — 2026-10-13
- **Bug corrigido além do escopo previsto:** `projectedBalance` partia do saldo do *início* do mês (`calcAccountBalance(..., monthStart)`) somado só aos itens *pendentes* do intervalo, então tudo que já tinha sido pago/recebido no mês sumia da previsão. Regressão de `726fe67` (que passou a excluir efetivados do intervalo sem mover a base). Agora `projectedInitialBalance = realizedBalance` — o campo mudou de significado: é a **base da projeção** (saldo já realizado até o fim do mês selecionado), não mais um "saldo inicial previsto". Na barra de resumo o rótulo virou "Saldo Realizado".
- `expected*` continuam significando "pendente no intervalo mês atual → mês selecionado" (acumulado em mês futuro). Os novos `pending*` são só do mês selecionado.
- Itens pendentes de meses **anteriores** (atrasados) não entram em `pending*` nem na projeção — comportamento já existente; avaliar em U8/U10 se "Atrasados" deve trazer itens de meses passados.
- `sumSummaries` do dashboard agora soma por chave de `ZERO_SUMMARY` (não dá mais para esquecer campo novo no consolidado).
- No Dashboard, "Entre suas contas" entrou como 4º box no detalhamento de saídas (só quando ≠ 0). No consolidado, transferências entre contas ativas se anulam e o box não aparece.
- Verificação visual no navegador ficou para o fim da Fase 0 (login Google precisa ser feito pelo usuário no painel).
