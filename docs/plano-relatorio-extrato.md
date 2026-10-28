# Plano — Relatório do extrato (Excel e PDF)

> Plano de execução incremental, aprovado em 2026-10-28 (decisões na seção 6). Cada entrega (R0, R1, …) é fechada: compila, passa nos testes e pode ser commitada sozinha.
> **Este arquivo é a fonte de verdade do andamento.** Qualquer sessão deve conseguir continuar lendo só este documento + o código.
> Substitui o item "Exportar lançamentos do mês (CSV)" do fluxo de caixa. O CSV continua existindo, só na tela de Backup.

## Como continuar (protocolo para cada sessão)

1. Leia este arquivo inteiro — principalmente a seção 6 (**Decisões**) e o **Status**.
2. Escolha a **primeira entrega ⬜ cujas dependências estão todas ✅** (ou a que o usuário pedir).
3. Mude o status dela para 🟡 antes de começar.
4. Implemente seguindo o escopo da seção 5 e os pontos de atenção da 4.5 (são ponto de partida; confirme no código).
5. Valide com a **Definição de pronto**.
6. Ao concluir: status → ✅ com data e hash do commit; registre descobertas e desvios em **Notas de implementação**; entrada em `CHANGELOG.md` (`[Unreleased]`) quando houver mudança visível; **um commit por entrega** (`feat(relatorio): R<n> — <título>`, ou `docs(relatorio)`). Sem push sem o usuário pedir.
7. Decisão de produto que não esteja na seção 6: pergunte ao usuário e registre como nova linha antes de seguir.
8. Entrega grande demais para uma sessão: divida (R2a/R2b) aqui antes de continuar.
9. **Troca de chat** (seção 7): com o contexto alto, pare no fim da entrega ou num ponto estável, atualize Status e Notas e entregue o prompt do próximo chat com modelo e esforço.

### Definição de pronto

- [ ] `cd backend && npm run typecheck && npm test` verde (se tocou no backend).
- [ ] `cd frontend && npm run build && npm test` verde (se tocou no frontend).
- [ ] Textos novos nos três idiomas (`frontend/src/locales/{pt,en,es}/`); rótulos do XLSX gerados no backend também nos três (seção 4.4).
- [ ] Valores em centavos até o último passo; no XLSX viram número (reais) só na célula.
- [ ] Os totais do relatório batem com o resumo da tela do fluxo de caixa e com o Dashboard, na mesma conta e no mesmo mês.
- [ ] XLSX (R2, R3): abre sem aviso de reparo no Excel, no LibreOffice e no Google Sheets.
- [ ] Telas (R4, R5): verificadas no navegador em desktop e 375px, tema claro e escuro; PDF conferido na prévia de impressão (A4).

## Status

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluída · ⏸ adiada

| # | Entrega | Depende de | Status | Concluída em | Commit |
|---|---|---|---|---|---|
| R0 | Plano registrado (este arquivo, link no `CLAUDE.md`) | — | ✅ | 2026-10-28 | ver git log |
| R1 | Conjunto de dados do relatório (`GET /reports/statement`) | R0 | ✅ | 2026-10-28 | ver git log |
| R2 | XLSX com abas e formatação | R1 | ✅ | 2026-10-28 | ver git log |
| R3 | Gráficos nativos no XLSX | R2 | ✅ | 2026-10-28 | ver git log |
| R4 | PDF pela página de relatório, com gráficos em SVG | R1 | ✅ | 2026-10-28 | ver git log |
| R5 | Menu "Exportar", escopo, CSV só no Backup, acabamento | R2, R4 | ✅ | 2026-10-28 | ver git log |

R2 e R4 dependem só de R1 e podem andar em paralelo. R3 é opcional: se travar, o XLSX sai com as barras de dados de R2 e R3 fica ⏸.

## Notas de implementação

### R0 — 2026-10-28
- Avaliação feita sobre `backup.service.ts:155` (CSV atual). Recomendação aceita pelo usuário: XLSX primeiro, PDF pela página `/report`, mesma base de dados.

### R1 — 2026-10-28
- Módulo `backend/src/modules/reports/` (types, schemas, service, controller, routes), montado em `/reports` no `app.ts`; `docs/api.md` com a seção Reports. Tipos finais em `reports.types.ts` (fonte de verdade para R2 e R4).
- Um só `loadDataset` por requisição: `DashboardService.getDashboard` ganhou um 3º parâmetro opcional `dataset` (mesmo padrão do `getCashFlow`). Categorias, compras e parcelas são lidas de novo pelo relatório (só leitura, sem efeito colateral).
- Desvios/acréscimos ao formato da 4.1: `id` em `StatementLine`, `StatementInvoice` e `StatementTransfer`; `accounts` traz `initialBalance` e `balance` = **saldo realizado no fim do mês** (não o saldo atual do Dashboard), para somar `summary.initialBalance`/`realizedBalance`; com conta, `accounts` tem só ela. `StatementTransfer` = `{ id, date, description, direction: 'in'|'out', fromAccountName, toAccountName, amount, settled, autoReserve }`.
- Compras: `amount` **com sinal** (estorno negativo, como na fatura), então a soma das compras = `total`. Fatura sem compra e com total 0 sai da lista.
- `date` das linhas: `actualDate` quando realizada, senão `expectedDate` (pode cair fora do mês quando a baixa foi em outro mês — o agrupamento por mês continua o da tela, pela prevista).
- `categoryName: null` = sem categoria (R2/R4 traduzem). `categories` vem do Dashboard e ainda traz o rótulo "Sem categoria" em PT com `categoryId: null` — traduzir pelo `categoryId`.
- Auditoria: `createAuditAction(action, extraDetails?)` aceita detalhes extras; `GET /reports/statement` grava `statement_exported` com `{ format: 'json', month, year, scope: 'account'|'all' }`. R2 usa o mesmo com `format: 'xlsx'`.
- Sem CHANGELOG nesta entrega (nada visível ainda; entra na R5).

### R2 — 2026-10-28
- `exceljs@4.4` no backend. Arquivos: `reports.labels.ts` (rótulos pt/en/es), `reports.xlsx.ts` (`buildStatementXlsx(report, lang)`), rota `GET /reports/statement/xlsx?…&lang=` (controller gera o slug ASCII do nome do arquivo; auditoria `statement_exported` com `format: 'xlsx'`).
- Abas conforme a 4.2. Entradas e Saídas são tabelas do Excel (filtro, total por `totalsRowFunction: 'sum'` = SUBTOTAL); Saídas traz as faturas como uma linha cada (vencimento, tipo "Fatura do cartão", situação Paga/A pagar). Cartões: bloco por fatura, subtotal por cartão e total geral. Transferências: valor com sinal pela `direction`. Categorias com barra de dados (conditional formatting). Evolução em texto "MM/AAAA".
- Valor em reais com formato `"R$" #,##0.00` fixo (sem moeda configurável). Aba sem dados mostra "Sem lançamentos no período" em vez de tabela vazia.
- `npm audit`: exceljs traz `uuid` antigo como dependência transitiva (+2 moderadas, sem uso de `v4(buffer)` pelo nosso código).
- **Pendente:** abrir o arquivo no Excel, LibreOffice e Google Sheets (conferência manual, não feita aqui) — testes só leem de volta com ExcelJS. Gráficos ficam para R3 (a aba Resumo deixa espaço abaixo da tabela de contas).

### R3 — 2026-10-28
- `reports.xlsx-charts.ts` (`addSummaryCharts`) abre o buffer com `jszip` (agora dependência direta, 3.10.2, a mesma do ExcelJS) e acrescenta `xl/charts/chart1.xml` (colunas: entradas × saídas dos 12 meses, aba Evolução) e `chart2.xml` (rosca: saídas por categoria), `xl/drawings/drawing1.xml` + `_rels`, `xl/worksheets/_rels/sheet1.xml.rels`, a tag `<drawing r:id>` no fim de `sheet1.xml` (antes de `legacyDrawing`/`tableParts` se existirem) e os `Override` do `[Content_Types].xml`. Os gráficos ficam à direita das tabelas da aba Resumo (colunas E–L), com caches (`strCache`/`numCache`) para leitores que não recalculam.
- Rosca: top 8 + "Outras" (rótulo novo `others` nos 3 idiomas) gravado na aba Categorias, colunas E:F; o gráfico aponta para esse intervalo. Sem despesas por categoria ou sem evolução, o gráfico correspondente não é criado (nenhum gráfico = buffer intocado).
- Todo texto entra escapado para XML. Testes: partes e content types presentes, XML bem formado (`saxes`, devDependency), intervalos corretos, escape, top 8 + Outras, arquivo reabre no ExcelJS.
- **Pendente:** conferência manual no Excel, LibreOffice e Google Sheets (nenhum instalado aqui). Se algum rejeitar/reparar o arquivo, plano B da seção 4.2: remover `addSummaryCharts` do `buildStatementXlsx` e marcar R3 como ⏸ (barras de dados da R2 ficam).
- **Revisão da R3 (2026-10-28, Opus):** XML conferido elemento a elemento contra o schema (CT_ChartSpace, CT_BarSer, CT_PieSer, CT_DLbls, eixos, CT_TwoCellAnchor) e o arquivo validado com o **Open XML SDK 3.3** (`OpenXmlValidator`, Office 2010 e Microsoft 365): gráficos, desenho, tabelas e abas sem erro. O único erro que sobra é a ordem de `<sz>` dentro de `<font>` no `styles.xml`, que o próprio ExcelJS grava em qualquer planilha (até vazia) e que o Excel aceita. Correções: (1) `<drawing>` era inserido antes de `</worksheet>`, o que fica inválido se a aba tiver `<extLst>` de nível 1 (o ExcelJS grava um quando a aba tem barra de dados); agora `drawingInsertIndex` percorre só os filhos diretos de `<worksheet>` e insere antes de `legacyDrawing…tableParts/extLst`. A primeira tentativa de correção casava o `<extLst>` aninhado em `<cfRule>`, e o teste pegou. O validador confirmou que a versão antiga falhava nesse caso. Na saída real a aba Resumo não tem barra de dados, então o defeito era latente. (2) As duas barras de dados da aba Categorias tinham `priority="1"`; agora 1 e 2. Testes novos para os dois casos.

### R4 — 2026-10-28
- `Report.tsx` lê `GET /reports/statement` (`ReportsService.getStatement`, novo `services/reports.service.ts`; tipos `Statement*` em `types/index.ts`). Ordem: cabeçalho (mês · escopo), indicadores previsto × realizado + pendentes do mês (via `summarizeMonth`, mesmos números da tela), saldo por conta (inicial/final), gráficos; nova página: Entradas, Saídas, Cartões (por fatura, com compras e total), Transferências, Categorias, Evolução.
- Gráficos em `components/charts/` (`BarChart` com valor compacto sobre cada barra; `DonutChart` com legenda trazendo valor e %, top 8 + "Outras"), SVG puro sem biblioteca.
- Saídas na página **não** repetem as faturas como linhas (ficam só em Cartões, com total); no XLSX elas aparecem nas duas abas. Desvio consciente: na tela a seção Cartões vem logo abaixo.
- Impressão: `@page { size: A4 }`, `print-color-adjust: exact`, `thead` como `table-header-group`, linhas `break-inside-avoid`, `break-before-page` antes de Entradas. Barra de ações (Voltar, Baixar Excel, Imprimir/Salvar PDF) com `no-print`. "Baixar Excel" chama `/reports/statement/xlsx` com `lang` de `i18n.language`; `triggerDownload`/`extractFilename` agora exportados de `backup.service.ts`.
- Textos novos em `report.json` (pt/en/es); título passou a "Relatório do extrato". Teste `Report.test.tsx` (seções, 2 SVGs, download com escopo e idioma).
- **Pendente:** verificação visual (desktop/375px/claro-escuro) e prévia de impressão A4 — o app exige login com Google, que não dá para fazer daqui. Fazer junto com a R5.

### R5 — 2026-10-28
- Fluxo de caixa: no menu "Ações do mês", "Exportar lançamentos do mês (CSV)" virou "Exportar relatório (Excel)" (`ReportsService.downloadXlsx` com `scopeAccountId` e `lang`) e "Exportar relatório (PDF)" (navega para `/report?month&year[&accountId]`). Props `onExportExcel`/`onExportPdf` no `CashFlowFilterBar`; teste `CashFlowFilterBar.test.tsx`.
- Backup: o CSV continua lá, renomeado "Exportar dados brutos (CSV)", com descrição apontando para o relatório. Backend do CSV intocado.
- Página do relatório: "Voltar" volta para a tela de origem (`navigate(-1)` quando há histórico; aberta direto, vai ao Dashboard). Link do Dashboard sem mudança.
- `CHANGELOG.md` com a entrada do relatório (Added) e a mudança do CSV (Changed). Seed-demo já tinha NF, imposto, transferência, reserva automática e fatura com parcelas/estorno (I9), sem mudança.
- **Verificação manual que ficou pendente** (o app só entra com login Google, que não dá para fazer daqui): (1) abrir o XLSX, com gráficos, no Excel, no LibreOffice e no Google Sheets, sem aviso de reparo; (2) `/report` em desktop e 375px, tema claro e escuro, e prévia de impressão A4; (3) os totais conferidos contra a tela, num mês do seed-demo. Se o XLSX pedir reparo, seguir o plano B da R3.
- **2026-10-28:** item (1) feito — o usuário abriu os XLSX de exemplo (pt e en, com os dois gráficos, gerados após a revisão da R3) sem aviso de reparo. Seguem pendentes os itens (2) e (3).

## 1. Pedido

- Melhorar a exportação do extrato da referência (mês). O CSV de hoje é confuso.
- Um relatório **XLSX** estruturado em abas, com boa apresentação e gráficos, e/ou um **PDF** com gráficos.
- Conteúdo: entradas, saídas e a parte detalhada, incluindo lançamentos e cartões.
- Gerar conforme o contexto: **todas as contas** ou **a conta selecionada**.

## 2. Diagnóstico do CSV atual

Arquivo: `backend/src/modules/backup/backup.service.ts:155` (`exportTransactionsCsv`), chamado por `CashFlow.tsx:388`.

| Problema | Onde |
|---|---|
| Ignora a conta selecionada: sempre exporta todas as contas | `exportCsvQuerySchema` não tem `accountId`; `CashFlow.tsx:391` não manda o escopo |
| Lista única e plana, com todos os tipos misturados numa coluna "Tipo" | `rows` em `backup.service.ts:205` |
| As duas pernas de cada transferência entre contas próprias aparecem no consolidado | Lê `transactionsRepo.findAll` cru, sem a regra de `getConsolidatedCashFlow` |
| Cartão sem detalhe: as faturas e as compras não entram | Só lê `financialTransactions` |
| Sem resumo, totais nem categorias | — |
| Status cru (`PAID`/`PENDING`), rótulos só em PT, valor e data como texto | `backup.service.ts:229`, `:234`, `:243` |

## 3. Veredito

Fazer **os dois formatos sobre a mesma base de dados**:

| | XLSX | PDF |
|---|---|---|
| Para que serve | Analisar, filtrar, somar, mandar para o contador | Ler, imprimir, arquivar o fechamento |
| Onde é gerado | Backend, com **ExcelJS** | Frontend: a página `/report` que já existe, impressa com `window.print()` → "Salvar como PDF" |
| Gráficos | Nativos, por um pós-processador (R3); barras de dados como plano B | SVG próprio, sem biblioteca nova |

Uma só fonte (`GET /reports/statement`) garante que XLSX, PDF, Dashboard e fluxo de caixa mostrem os mesmos números.

## 4. Como funcionaria

### 4.1 Conjunto de dados (R1)

`GET /reports/statement?month=10&year=2026[&accountId=…]`. Sem `accountId` = todas as contas (mesma regra do Dashboard e do fluxo de caixa, D4/U17).

```ts
interface StatementReport {
  month: number; year: number;
  scope: { accountId: string | null; accountName: string | null };   // null = todas as contas
  generatedAt: string;
  summary: CashFlowSummary;                       // o mesmo da tela
  accounts: { id: string; name: string; balance: number }[];        // saldo por conta (consolidado: todas as ativas)
  categories: { income: CategoryBreakdownItem[]; expenses: CategoryBreakdownItem[] };  // do Dashboard
  evolution: MonthlyEvolutionItem[];              // 12 meses até a referência, do Dashboard
  incomes: StatementLine[];                       // entradas
  expenses: StatementLine[];                      // pagamentos, gastos extras, imposto a pagar
  invoices: StatementInvoice[];                   // faturas da referência, com as compras
  transfers: StatementTransfer[];
}

interface StatementLine {
  date: string;              // expectedDate (data da baixa quando realizada)
  kind: 'income' | 'payment' | 'extra' | 'invoiceTax';
  description: string; categoryName: string | null; accountName: string;
  invoiceRatePct: number | null;   // NF (I*)
  amount: number;                  // centavos, sempre positivo; o sinal vem da aba
  settled: boolean; fixed: boolean;
}

interface StatementInvoice {
  cardName: string; dueDate: string; status: InvoiceStatus; paymentAccountName: string | null;
  total: number;
  purchases: { purchaseDate: string; description: string; categoryName: string | null;
               installment: string | null /* "3/10" */; amount: number; refund: boolean }[];
}
```

Montagem (sem regra nova de negócio):
- Com conta: `cashFlowService.getCashFlow`; sem conta: `cashFlowService.getConsolidatedCashFlow`. Um único `loadDataset` reaproveitado.
- `categories` e `evolution`: `dashboardService.getDashboard({ month, year, accountId, evolutionMonths: 12 })`. O Dashboard **já** distribui as compras de cartão pelas categorias delas (`dashboard.service.ts:305-330`), sem contar a fatura de novo.
- Compras da fatura: parcelas (`CreditCardInstallment`) com `creditCardInvoiceId` da fatura, ligadas ao `CreditCardEntry`. Excluir `entryType === PAYMENT` e parcelas `CANCELED`; `REFUND` entra com `refund: true`.

### 4.2 XLSX (R2, R3)

Nome do arquivo: `extrato-2026-10-todas-as-contas.xlsx` ou `extrato-2026-10-<conta-em-slug-ascii>.xlsx`.

| Aba | Conteúdo |
|---|---|
| **Resumo** | Cabeçalho (período, escopo, gerado em). Indicadores: saldo inicial, entradas, saídas, entre contas, saldo final, cada um previsto × realizado; pendentes do mês. Saldo por conta (consolidado). Gráficos (R3). |
| **Entradas** | Data, descrição, categoria, conta, NF %, valor, situação (Recebido/A receber), fixo. Tabela do Excel com filtro e linha de total. |
| **Saídas** | Data, tipo (Pagamento, Gasto extra, Imposto a pagar), descrição, categoria, conta, valor, situação. As faturas aparecem como uma linha por fatura (tipo "Fatura do cartão"), com o detalhe na aba Cartões. |
| **Cartões** | Por fatura: bloco com cartão, vencimento, status, conta pagadora e total; abaixo, as compras (data, descrição, categoria, parcela, valor); subtotal por cartão e total geral. |
| **Transferências** | Data, descrição, de, para, valor, situação, reserva automática (sim/não). |
| **Categorias** | Entradas e saídas por categoria, com valor, % e barra de dados. |
| **Evolução** | 12 meses: entradas, saídas, resultado (realizado). |

Formatação:
- Valor como número com formato `"R$" #,##0.00` (ou o da moeda das configurações, se houver); data como data (`dd/mm/aaaa`).
- Cabeçalho congelado, larguras ajustadas, saídas e negativos em vermelho, linhas alternadas suaves, títulos de aba e de bloco destacados.
- Tabelas do Excel (`worksheet.addTable`) com linha de total por fórmula `SUBTOTAL`, para continuar certo quando o usuário filtrar.
- Células de texto gravadas como texto (`cell.value = string`): o Excel não as avalia, então o risco de injeção de fórmula do CSV não existe aqui. Nunca montar fórmula com texto do usuário.

Gráficos (R3), na aba Resumo:
1. **Colunas**: entradas × saídas dos 12 meses (aba Evolução).
2. **Rosca**: saídas por categoria (aba Categorias, top 8 + "Outras").

O ExcelJS não escreve gráficos. R3 faz um pós-processamento do buffer com JSZip (dependência que o ExcelJS já traz): acrescenta `xl/charts/chartN.xml`, `xl/drawings/drawing1.xml`, os `_rels` e os `Override` do `[Content_Types].xml`, apontando para os intervalos das abas. O XML é um modelo fixo, preenchido só com os intervalos e os títulos. Plano B, se algum leitor rejeitar o arquivo: ficar com as barras de dados de R2 e marcar R3 como ⏸.

### 4.3 PDF (R4)

A página `frontend/src/pages/Report/Report.tsx` passa a ler `GET /reports/statement` (hoje lê o Dashboard) e vira o "Relatório do mês":
- Página 1: cabeçalho, indicadores, saldo por conta, gráfico de colunas (evolução) e rosca (saídas por categoria).
- Depois: Entradas, Saídas, Cartões (com compras), Transferências, Categorias. Quebra de página entre seções grandes, cabeçalho da tabela repetido (`thead { display: table-header-group }`).
- Gráficos como componentes SVG próprios em `frontend/src/components/charts/` (barras e rosca), sem biblioteca. Cores com contraste suficiente em impressão P&B (rótulo de valor em cada barra/fatia).
- Continua sempre clara (é para impressão); a barra de ações (Voltar, Imprimir/Salvar PDF, Baixar Excel) some na impressão.
- Lê `month`, `year` e `accountId` da URL, como hoje.

### 4.4 Idioma

O backend não sabe o idioma do usuário. O frontend manda `lang=pt|en|es` (de `i18n.language`) no download do XLSX; o backend tem um dicionário pequeno `reports.labels.ts` com os rótulos das abas, colunas e situações nos três idiomas (padrão `pt`). Nomes de categoria e de conta saem como o usuário cadastrou.

### 4.5 Pontos de atenção no código

- **Escopo dos cartões numa conta:** fatura pertence à conta `inv.paymentAccountId ?? card.defaultPaymentAccountId` (mesma regra de `dashboard.service.ts:73` e `movements.ts:117`). `getCashFlow` já filtra assim; confirmar.
- **Transferências no consolidado:** `getConsolidatedCashFlow` (`cash-flow.service.ts:164`) tira as transferências entre contas ativas. Ver decisão 4.
- **`loadDataset` materializa fixos** (`ensureFixedTransactions`): é uma leitura com efeito colateral, igual ao Dashboard. Chamar uma vez só por requisição.
- **Campos criptografados** (descrição, observações): os repositórios já devolvem decifrados; nada de filtrar por eles.
- **Auditoria:** registrar `statement_exported` em `audit-log.types.ts` e na rota (como `csv_exported` em `backup.routes.ts:14`), com formato (`xlsx`), mês e escopo, sem dados pessoais.
- **`Content-Disposition`:** nome de conta vira slug ASCII (`[a-z0-9-]`), para não injetar nada no cabeçalho.
- **ExcelJS:** conferir `npm audit` ao instalar (algumas dependências transitivas são antigas). O SheetJS não está mais no npm, por isso ExcelJS.
- **Seed-demo:** usar para conferir um mês com NF, imposto, transferência, reserva automática e fatura com parcelas e estorno.

## 5. Entregas

| Entrega | Escopo |
|---|---|
| **R0** | Este plano e o link no `CLAUDE.md`. |
| **R1** | Módulo `backend/src/modules/reports/` (types, schemas zod, service, controller, routes); `GET /reports/statement` (JSON); auditoria; `docs/api.md`. Testes: escopo por conta × consolidado, totais iguais ao `summary` do fluxo de caixa, compras da fatura sem `PAYMENT`/`CANCELED`, estorno, transferência interna fora do consolidado. |
| **R2** | `exceljs` no backend; `reports.xlsx.ts` (gera o buffer a partir de `StatementReport`) e `reports.labels.ts`; `GET /reports/statement/xlsx?…&lang=`. Abas da 4.2 com formatação e barras de dados. Testes: abre com ExcelJS de volta, nomes das abas, totais, tipos das células (número/data), texto que começa com `=` fica texto. |
| **R3** | Pós-processador de gráficos (`reports.xlsx-charts.ts`): colunas e rosca na aba Resumo. Teste do zip (partes e content types presentes). Conferência manual no Excel, LibreOffice e Google Sheets, anotada nas Notas. |
| **R4** | `Report.tsx` sobre `GET /reports/statement`; componentes SVG de barras e rosca; seções detalhadas; CSS de impressão A4; botão "Baixar Excel" na página; textos nos 3 idiomas (`report.json`). |
| **R5** | Fluxo de caixa: o item do menu vira "Exportar relatório" com Excel e PDF, mandando conta e mês selecionados (`scopeAccountId`); Dashboard: o link do relatório continua. CSV sai do fluxo de caixa e fica só no Backup (rótulo "dados brutos"). Seed-demo, verificação visual, `CHANGELOG.md`, `docs/backlog.md` se sobrar algo. |

## 6. Decisões (2026-10-28)

| # | Tema | Decisão |
|---|---|---|
| 1 | Formatos | **XLSX e PDF**, XLSX primeiro. Mesma base (`GET /reports/statement`). |
| 2 | Escopo | **Conta e mês selecionados** na tela (`scopeAccountId`; null = todas as contas). |
| 3 | Filtros da tela (tipo, categoria, busca, marcadores) | **Ignorados.** O relatório sai completo para a conta e o mês. |
| 4 | Transferências no consolidado | **Mesma regra da tela:** as entre contas ativas não aparecem (se anulam); as com conta inativa ou externa aparecem. Com uma conta selecionada, todas as pernas dela aparecem. |
| 5 | Saídas por categoria | **Compras do cartão pelas categorias delas**, sem fatia "Cartão" e sem contar a fatura duas vezes (regra que o Dashboard já usa). |
| 6 | Previsto × realizado | Listas com **tudo da referência** (realizado e pendente, com a coluna situação); indicadores mostram os dois; categorias e evolução mostram só o **realizado** (como o Dashboard). |
| 7 | CSV atual | **Sai do fluxo de caixa e fica só no Backup**, como "dados brutos". |
| 8 | PDF | **Impressão do navegador** sobre a página `/report`, sem biblioteca de PDF no servidor. |

## 7. Execução em chats separados

| Chat | Entregas | Modelo / esforço | Por quê |
|---|---|---|---|
| 1 | R1 | Opus · medium | Junta fluxo de caixa, Dashboard e cartões sem duplicar regra; o teste de "totais iguais à tela" é o que segura o resto. |
| 2 | R2 | Sonnet · medium | Geração de planilha bem especificada; muito código de formatação, pouca regra. |
| 3 | R3 | Opus · high | XML de gráfico (DrawingML) escrito à mão; erro aqui faz o Excel "reparar" o arquivo. |
| 4 | R4 | Sonnet · medium | Página de impressão e dois gráficos SVG simples. |
| 5 | R5 | Sonnet · low | Menu, textos, CHANGELOG e verificação visual. |

**Regra de troca de chat.** Quando o contexto ficar alto, o chat para no fim da entrega em andamento, ou num ponto estável se ela ainda não terminou. Antes de parar, ele atualiza a tabela Status e as Notas do plano e entrega o prompt de continuação, com o modelo e o esforço recomendados para o próximo chat.
