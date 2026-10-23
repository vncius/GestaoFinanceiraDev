# Plano — Imposto sobre nota fiscal ("Imposto a pagar")

> Plano de execução incremental, aprovado em 2026-10-23 (decisões 1–12 na seção 6). Cada entrega (I0, I1, …) é fechada: compila, passa nos testes e pode ser commitada sozinha.
> **Este arquivo é a fonte de verdade do andamento.** Qualquer sessão deve conseguir continuar lendo só este documento + o código.
> Revisa a decisão D2 de `docs/refactor-contas-pf-pj.md` (NF volta ao sistema, em versão mínima). Regra de domínio em `docs/domain-logic.md` §4.

## Como continuar (protocolo para cada sessão)

1. Leia este arquivo inteiro — principalmente a seção 6 (**Decisões**) e o **Status**.
2. Escolha a **primeira entrega ⬜ cujas dependências estão todas ✅** (ou a que o usuário pedir). As entregas são sequenciais: I0 → I1 → … → I9.
3. Mude o status dela para 🟡 antes de começar.
4. Implemente seguindo o escopo da seção 5 e os pontos de atenção da 4.4 (são ponto de partida; confirme no código).
5. Valide com a **Definição de pronto**.
6. Ao concluir: status → ✅ com data e hash do commit; registre descobertas e desvios em **Notas de implementação**; entrada em `CHANGELOG.md` (`[Unreleased]`) quando houver mudança visível; **um commit por entrega** (`feat(imposto): I<n> — <título>`, ou `docs(imposto)`). Sem push sem o usuário pedir.
7. Decisão de produto que não esteja na seção 6: pergunte ao usuário e registre como nova linha antes de seguir.
8. Entrega grande demais para uma sessão: divida (I3a/I3b) aqui antes de continuar.
9. **Troca de chat** (seção 7): com o contexto alto, pare no fim da entrega ou num ponto estável, atualize Status e Notas e entregue o prompt do próximo chat com modelo e esforço.

### Definição de pronto

- [ ] `cd backend && npm run typecheck && npm test` verde (se tocou no backend).
- [ ] `cd frontend && npm run build && npm test` verde (se tocou no frontend).
- [ ] Textos novos nos três idiomas (`frontend/src/locales/{pt,en,es}/`).
- [ ] Valores em centavos; requisições que alteram dados com `X-Requested-With`; nenhum campo criptografado em filtro do Mongo.
- [ ] Telas (I6–I9): verificadas no navegador em desktop e 375px, tema claro e escuro.

## Status

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluída · ⏸ adiada

| # | Entrega | Depende de | Status | Concluída em | Commit |
|---|---|---|---|---|---|
| I0 | Decisão registrada (plano, link, domain-logic, revisão da D2) | — | ✅ | 2026-10-23 | ver git log |
| I1 | Modelo, sem comportamento | I0 | ✅ | 2026-10-23 | ver git log |
| I2 | Funções puras `invoice-tax.utils.ts` | I1 | ✅ | 2026-10-23 | ver git log |
| I3 | `syncInvoiceTax` e ganchos | I2 | ✅ | 2026-10-23 | ver git log |
| I4 | Bloqueios e valor real na baixa | I3 | ⬜ | | |
| I5 | Índice único, endpoint de leitura, `docs/api.md` | I4 | ⬜ | | |
| I6 | Tela: configuração na conta | I5 | ⬜ | | |
| I7 | Tela: NF e alíquota na nova entrada | I6 | ⬜ | | |
| I8 | Tela: marcadores, modal, bloqueios, Limpar mês | I7 | ⬜ | | |
| I9 | Acabamento | I8 | ⬜ | | |

## Notas de implementação

### I0 — 2026-10-23
- A proposta virou este plano; `docs/proposta-imposto-nf.md` foi apagada. Padrões 8–12 confirmados pelo usuário.
- D2 revisada em `docs/refactor-contas-pf-pj.md`; regra de domínio em `docs/domain-logic.md` §4.

### I1 — 2026-10-23
- Campos todos **opcionais** nos tipos (`taxRateBps?`, `issueDate?`, `invoiceTax*?`): registros antigos não os têm e não há migração. `OriginType.INVOICE_TAX` só no backend (no frontend `originType` é `string`).
- Zod: contas ganham `invoiceTaxEnabled`, `invoiceTaxDefaultRateBps` (0–10000), `invoiceTaxDueDay` (1–28, padrão 20 aplicado em `AccountsService.create`). Backup declara os campos novos (conta e transação). **Ainda não** aceitos nos schemas de criação/edição de transação: entram na I3.

### I2 — 2026-10-23
- `cash-flow/invoice-tax.utils.ts`: `competenceOf`, `calcInvoiceTax`, `invoiceTaxOriginId`/`parseInvoiceTaxOriginId`, `invoiceTaxDueDate` (ISO à meia-noite UTC, clamp em meses curtos), `DEFAULT_INVOICE_TAX_DUE_DAY`. Testes em `invoice-tax.utils.test.ts`.
- O total da despesa é a **soma dos impostos por NF** (arredondados individualmente), não o imposto da soma; há teste cobrindo a diferença de 1 centavo. O `syncInvoiceTax` (I3) deve somar com `calcInvoiceTax` por NF.

### I3 — 2026-10-23
- `CashFlowService` ganhou `categoriesRepo` (6º parâmetro, opcional; passado no `container.ts` e no `seed-demo.ts`). Sem ele, a despesa sai sem categoria.
- `syncInvoiceTax(originId)` recalcula do zero; `syncInvoiceTaxFor(txs)` deriva as chaves (`invoiceTaxKeyOf`: NF → chave da competência; despesa de imposto → o próprio `originId`) e sincroniza cada uma uma vez. Ganchos em criar, editar (único e fixo, chave antiga e nova), excluir (único e fixo), receber/pagar, reverter e `ensureFixedTransactions`. Cada mutação roda em `runInTransaction`.
- **Despesa paga não é recalculada** (guarda o valor real do DAS). Reverter o pagamento dispara o recálculo e volta ao valor calculado. Total 0 cancela a despesa (inclui NF com alíquota 0).
- Despesa: `PAYMENT` "Imposto a pagar", categoria "Impostos" (criada se faltar), `sourceAccountId` = conta da NF, vencimento `invoiceTaxDueDay` da conta (padrão 20). Reativação mantém o vencimento.
- Alíquota e emissão andam juntas (`invoiceFields`): sem alíquota, `issueDate` vira null; com alíquota e sem emissão → 400 `invoiceTax.issueDateRequired`. Zod: `taxRateBps` 0–10000, `issueDate` começa por `AAAA-MM-DD` (`validation.issueDate.invalid`). Só os schemas de **entrada** aceitam os campos.
- NF fixa: `ensureFixedTransactions` desloca `issueDate` (`shiftedIssueDate`: mesma distância em meses até o recebimento, dia da emissão da âncora com clamp). "Esta e as futuras" não propaga `issueDate`; propaga `taxRateBps`, e a futura que vira NF ganha emissão deslocada.
- Testes no fim de `cash-flow.service.test.ts` (describe "Imposto a pagar (I3)").

---

## 1. Pedido

- Quando a entrada for uma nota fiscal, a tela pede a alíquota do imposto, e ela é obrigatória.
- No mês seguinte gera **uma única** despesa, "Imposto a pagar", ligada a todas as NFs do mês. Exemplo: 10 NFs viram 1 despesa.
- A despesa não pode ser excluída enquanto houver NFs ligadas a ela.
- Na despesa, só a data de pagamento pode ser alterada.

## 2. Veredito

O pedido é viável e faz sentido. O código já tem dois padrões parecidos que servem de modelo:

| Padrão existente | O que ele faz | O que aproveitamos |
|---|---|---|
| **Fatura de cartão** (`docs/domain-logic.md` §1.3) | Um registro por mês, criado sob demanda e recalculado pela soma dos lançamentos. | O cálculo da despesa de imposto. |
| **Reserva automática** (`transfers.service.ts:37-55`) | Um lançamento derivado, ligado à entrada por `originType`/`originId`, que acompanha exclusões e reversões. | A ligação entre a despesa de imposto e as NFs. |

**Revisão da D2 (aprovada):** a NF foi retirada de propósito do sistema no refactor PF/PJ (decisão D2 em `docs/refactor-contas-pf-pj.md`, migração `migrate-remove-limits-and-nf.ts`). Este plano traz a NF de volta em versão mínima: só a alíquota e a data de emissão, sem número da NF e sem cliente.

## 3. Ajustes recomendados ao pedido

| # | Você pediu | Recomendo | Por quê |
|---|---|---|---|
| A1 | Imposto no mês seguinte ao **recebimento** | Mês seguinte à **emissão** (aceito) | O Simples e o Presumido apuram por competência (por exemplo, o DAS vence no dia 20 do mês seguinte ao faturamento). E aqui a data de recebimento muda quando você dá baixa com outra data, o que faria o imposto trocar de mês. |
| A2 | Digitar a alíquota em toda NF | A alíquota continua obrigatória, mas vem **preenchida com o padrão da conta** e pode ser editada | Evita redigitar. No Simples a alíquota efetiva muda com a faixa de faturamento: você ajusta o padrão quando a faixa mudar. |
| A3 | "Só exclui se todas as NFs forem excluídas" | A despesa **some sozinha** quando a última NF sai, e volta se entrar uma NF nova | O resultado é o mesmo, sem nenhum passo manual. |
| A4 | (não foi tratado) | Se o imposto do mês **já foi pago**, a NF fica travada (valor, alíquota, data e exclusão) até você desmarcar o pagamento | Mexer numa despesa já paga falsificaria o saldo. É o mesmo "reverta primeiro" que o sistema já usa. |
| A5 | Só a data é editável | O valor continua calculado, mas, **na hora de pagar**, você pode informar o valor real do DAS | O valor real do DAS quase sempre difere da estimativa. |

## 4. Como funcionaria

### 4.1 Na tela

**Configurações → Contas**
- Opção "Esta conta emite nota fiscal".
- Alíquota padrão (ex.: 6,00 %).
- Dia de vencimento (padrão: 20).

**Nova entrada**
- Numa conta que emite NF, a opção "Nota fiscal" já vem marcada, com a alíquota preenchida e obrigatória.
- Nas outras contas, a opção fica em "Mais opções".
- Com "Nota fiscal" marcada, o formulário mostra **duas datas lado a lado**, ambas obrigatórias:
  - **Data de emissão**, que define o mês do imposto. É um campo novo, preenchido inicialmente com a data de recebimento; depois que você a edita, ela para de acompanhar.
  - **Data de recebimento**, que é a data que você já cadastra hoje (`expectedDate`) e continua definindo em que mês a entrada aparece no fluxo de caixa. Só o rótulo muda.
  - Se a emissão for depois do recebimento, a tela mostra um aviso, mas aceita: pagamento adiantado existe.
- Sem "Nota fiscal", a entrada continua com uma data só, como hoje.
- Prévia ao vivo: *Imposto R$ 600,00 → "Imposto a pagar" de nov/26, vence 20/11*.

**Lista de movimentos**
- A entrada mostra o marcador `NF 6%`.
- A despesa mostra `Imposto · 10 NFs`, com cadeado e sem botão de excluir.

**Despesa de imposto** (ao abrir)
- Valor só de leitura.
- Lista das NFs, com o imposto de cada uma.
- Vencimento editável.
- Botão "Marcar como pago", onde você pode informar o valor real.

**Limpar mês** pula a despesa de imposto e avisa disso na confirmação.

Todos os textos nos três idiomas (`locales/{pt,en,es}`).

### 4.2 Regras

**Agrupamento.** Uma despesa por **conta da NF + mês de competência**. Duas contas PJ geram duas despesas.

**Cálculo**
- Imposto por NF: `round(valor × alíquota)`, em centavos.
- A despesa é a soma dos impostos das NFs, então cada NF mostra o seu e o total sempre bate.
- O total é recalculado do zero sempre que uma NF é criada, editada, excluída, recebida ou revertida.
- Quando a NF muda de mês ou de conta, recalcula o mês antigo e o mês novo.

**NFs consideradas.** Entram as pendentes e as recebidas. As canceladas e as revertidas ficam de fora.

**O que é editável na despesa**
- Pode mudar: vencimento e marcar/desmarcar pago (talvez também conta e observações, ver a pergunta 5).
- Não pode: valor, exclusão.

**O que é editável na NF com imposto pago**
- Descrição, categoria e observações continuam livres.
- Todo o resto fica travado até desmarcar o pagamento do imposto.

**Recálculo e vencimento.** O recálculo nunca altera o vencimento que você escolheu.

### 4.3 Modelo de dados

| Onde | Campo | Para que serve |
|---|---|---|
| `FinancialTransaction` (só entradas) | `taxRateBps: number \| null` | Alíquota em centésimos de ponto percentual (600 = 6,00%), em inteiro, como os centavos. Se não é `null`, a entrada é NF. |
| `FinancialTransaction` (só entradas) | `issueDate: string \| null` | Data de emissão. É obrigatória quando a entrada é NF e define o mês do imposto. A data de recebimento continua sendo `expectedDate`. |
| `OriginType` | valor novo `INVOICE_TAX` | Marca a despesa derivada (`PAYMENT`, `originId = "<accountId>:<AAAA-MM>"`). |
| `Account` | `invoiceTaxEnabled` | Liga a NF na conta. |
| `Account` | `invoiceTaxDefaultRateBps` | Alíquota padrão. |
| `Account` | `invoiceTaxDueDay` | Dia de vencimento (padrão 20). |

Notas sobre o modelo:
- **Ligação entre despesa e NFs:** é calculada (mesma conta + mesmo mês de competência). Não há lista de ids na despesa, o que mantém o backup compatível e evita manter dois lados em sincronia.
- **Despesa duplicada:** um índice único parcial `{tenantId, originType, originId}` impede. O `MongoStore` precisa passar a aceitar opções de índice.
- **Criptografia:** nenhum campo novo é texto livre com dado pessoal, então nada entra em `encryptedFields`/`ENCRYPTED_FIELDS`.
- **Migração:** não há. Os campos novos são opcionais; o backup (`backup.schemas.ts`) só precisa declará-los.

### 4.4 Pontos de atenção no código

- **`ensureFixedTransactions`** (`cash-flow.service.ts:788-842`): copia `...latest`. Precisa recalcular `issueDate` para cada mês novo, senão todas as NFs fixas caem no mesmo mês.
- **`updateFixedTransaction`** com "esta e as futuras": não pode propagar `issueDate`.
- **Baixa com outra data** (`cash-flow.service.ts:876`): move `expectedDate`. Como o imposto usa `issueDate`, o mês do imposto não muda; só é preciso garantir que a baixa nunca sobrescreva `issueDate`.
- **Fluxos do `CashFlow.tsx`** que excluem em lote (Limpar mês, `:329-364`) ou que revertem e depois excluem (`:253-274`): precisam tratar a despesa travada.

## 5. Entregas

| Entrega | Escopo |
|---|---|
| **I0** | Decisão registrada: o plano `docs/plano-imposto-nf.md` (revisão da D2), link no `CLAUDE.md` e uma seção nova em `docs/domain-logic.md`. |
| **I1** | Modelo, sem comportamento: campos novos, `OriginType.INVOICE_TAX`, zod, backup e tipos do frontend. |
| **I2** | Funções puras em `invoice-tax.utils.ts` (mês de competência, imposto por NF, vencimento), com testes. |
| **I3** | `syncInvoiceTax` e os ganchos em criar, editar, excluir, receber, reverter e nos fixos, com testes. |
| **I4** | Bloqueios (despesa de imposto; NF com imposto pago) e valor real na baixa. Códigos de erro com `errors.json` nos 3 idiomas. Testes. |
| **I5** | Índice único parcial, com nova tentativa quando der duplicidade; `GET /cash-flow/invoice-tax/:id`; `docs/api.md`. |
| **I6** | Tela: configuração na conta. |
| **I7** | Tela: opção NF e alíquota na nova entrada, com prévia. |
| **I8** | Tela: marcadores, modal da despesa de imposto, bloqueios, Limpar mês e fluxos de exclusão. |
| **I9** | Acabamento: rótulo no CSV, seed-demo, verificação visual (desktop e 375px, claro e escuro), `CHANGELOG.md`. |

**Testes principais**
- 10 NFs geram 1 despesa com o total certo.
- Mudar o mês ou a conta de uma NF recalcula os dois lados.
- Excluir a última NF cancela a despesa, e uma NF nova reativa a mesma.
- Imposto pago trava a NF.
- Na despesa, o `PUT` só aceita a data e o `DELETE` é recusado.
- NF fixa gera os meses seguintes com a data de emissão correta.
- Recalcular duas vezes dá o mesmo resultado.

## 6. Decisões (2026-10-23)

| # | Tema | Decisão |
|---|---|---|
| 1 | Competência | **Mês de emissão.** O imposto vence no mês seguinte ao da emissão da NF. Não haverá opção "por recebimento". |
| 2 | Alíquota | **Padrão cadastrado na conta**, pré-preenchido e editável em cada NF, sempre obrigatório. Só a porcentagem, sem regime nem anexo (ex.: ME, Simples, anexo III → 6%). |
| 3 | Imposto já pago | **NF travada até desmarcar o pagamento**, com o valor real do DAS informado na baixa. |
| 4 | Aviso | Com o imposto pago, a NF mostra um aviso explicando que **não pode ser editada porque o imposto do mês já foi pago**, e qual mês é. |
| 5 | Vencimento | **Dia 20 do mês seguinte** por padrão. Na despesa são editáveis a data, a conta pagadora e as observações. |
| 6 | Retenções | **Não há.** O valor recebido é o valor da NF, então não precisa do campo "valor bruto". |
| 7 | Datas da NF | **Dois campos na tela:** data de emissão (nova, define o imposto) e data de recebimento (a de hoje, define o fluxo de caixa). |

### Padrões 8–12 (confirmados pelo usuário em 2026-10-23)

| # | Tema | Proposta |
|---|---|---|
| 8 | Conta pagadora e reserva automática | O imposto sai da **própria conta da NF**. Você pode trocar para outra conta na despesa. A reserva automática continua independente (ver nota abaixo). |
| 9 | NF fixa (contrato mensal) | **Permitida.** Cada mês gerado entra no imposto do mês seguinte. |
| 10 | Mais de uma conta PJ | **Uma despesa por conta.** |
| 11 | Nome e categoria | **"Imposto a pagar"**, na categoria "Impostos" (criada se não existir). |
| 12 | Entradas antigas | **Só daqui para frente.** Marcar entradas antigas como NF fica no backlog. |

**Sobre a reserva automática.** Ela já existe e fica em Configurações → Contas, desligada por padrão. Quando está ligada numa conta, toda entrada recebida gera uma **transferência** de X% para outra conta, por exemplo uma conta "Reserva de impostos" (`cash-flow.service.ts:494-518`). Ela só separa o dinheiro: não cria despesa nem vencimento. As duas funções convivem:

- **Reserva automática:** guarda o dinheiro na outra conta ao receber.
- **Imposto a pagar:** registra quanto você deve e quando vence.

Para usar as duas juntas, troque a conta pagadora da despesa de imposto para a conta de reserva.

## 7. Execução em chats separados

Para gastar menos tokens, cada chat cobre um bloco de entregas. O modelo e o nível de esforço indicados para cada bloco são uma estimativa da dificuldade.

| Chat | Entregas | Modelo / esforço | Por quê |
|---|---|---|---|
| 1 | I0, I1, I2 | Sonnet · medium | Documentação, campos novos e funções puras: trabalho mecânico, bem especificado e com testes simples. |
| 2 | I3, I4 | Opus · high | Recálculo com chave antiga e nova, NFs fixas e bloqueios: é o núcleo das regras e onde há mais casos de borda. |
| 3 | I5, I6 | Sonnet · medium | Índice com opções, um endpoint de leitura e o formulário da conta. |
| 4 | I7, I8 | Opus · medium | Formulário com as duas datas, prévia, modal da despesa e bloqueios em vários fluxos do `CashFlow.tsx`. |
| 5 | I9 | Sonnet · low | Acabamento, CHANGELOG e verificação visual. |

**Regra de troca de chat.** Quando o contexto ficar alto, o chat para no fim da entrega em andamento, ou num ponto estável se ela ainda não terminou. Antes de parar, ele atualiza a tabela Status e as Notas do plano e entrega o prompt de continuação, com o modelo e o esforço recomendados para o próximo chat.
