# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não usa versionamento/tags de release — as entradas abaixo ficam em "Unreleased" até que isso exista.

Este arquivo começou a ser mantido nesta sessão; histórico anterior a ele só existe via `git log`.

## [Unreleased]

### Added
- **Plano de simplificação da UX** (`docs/plano-simplificacao-ux.md`, entregas U1–U21) e `CLAUDE.md` apontando para ele.
- U1: `CashFlowSummary` ganha `pendingIncome`/`pendingExpenses` (+ contagens) — o que ainda falta receber/pagar **só no mês selecionado**, sem acumular; e `frontend/src/utils/month-summary.ts` (`summarizeMonth`), regra única de leitura do resumo usada por Dashboard, Fluxo de Caixa e Relatório.
- U2: migração de boot `migrateCardPaymentAccount` (+ `npm run migrate:card-payment-account [-- --dry-run]` para execução avulsa) que define a conta pagadora de cartões sem pagadora válida (nula, inexistente ou inativa) como a primeira conta ativa do tenant em ordem alfabética.
- U3: em mês futuro, a barra de resumo expandida indica que os previstos são acumulados ("Previstos acumulados de out/26 a dez/26").
- U4: opção "Todas as contas" no seletor do Dashboard (escolha de visualização, lembrada por tenant), substituindo a configuração "Escopo do painel" das Parametrizações. O seletor some quando há uma conta só; no Fluxo de Caixa continua exigindo uma conta específica. O backend do dashboard passa a decidir o escopo só pela presença de `accountId`.
- U5: navegação reorganizada — "Backup e Exportação" saiu do menu e virou Configurações → **Seus dados** (`/backup` redireciona); Configurações ganha a aba **Preferências** (idioma e tema) e abas endereçáveis por `?tab=`; Cartões só aparece no menu quando há cartão ativo; no celular, barra de navegação inferior no lugar do menu lateral; cabeçalho só com conta, mês e menu de perfil (tema e sair).
- U6: botão "Novo" sempre visível (cabeçalho no desktop, botão flutuante no celular) abrindo o lançamento rápido; a opção "Transferência" só aparece com mais de uma conta.
- U7: vocabulário simplificado em pt/en/es — menu Início · Movimentações · Cartões · Configurações; "referência" → "mês", "efetivar/reverter" → "marcar/desmarcar como pago", "gasto extraordinário" → "gasto fora do comum"; joinha de pago virou caixa de seleção. Todos os códigos de erro do backend agora têm tradução (antes ~20 caíam em "Ocorreu um erro inesperado"), com teste que impede regressão.
- U8: novo Início — saldo em destaque (hoje / no fim do mês / previsto, conforme o mês), Entrou · Saiu · Sobrou, "Ainda neste mês" com A receber/A pagar e a lista de atrasados e próximos 15 dias (os alertas viraram itens dessa lista), "Para onde foi o dinheiro" (top 5) e "Ver análise completa" sob demanda. Próximos vencimentos agora incluem entradas a receber e tudo que está atrasado.
- U9: resumo de Movimentações sai da barra fixa do rodapé e vira um card no topo, com duas linhas — Entrou · Saiu · Saldo e Falta receber · Falta pagar · Previsto — e "Ver detalhes" para o restante.
- U10a: Movimentações vira uma lista única — entradas, pagamentos, gastos fora do comum, transferências e faturas agrupados em Atrasados → A vencer → Concluídos (recolhido), com caixa de pago, marcadores (Fixo, Fora do comum, Cartão, transferência de/para) e um único "Novo ▾" no lugar dos cinco cartões separados.
- U10b: busca de lançamentos em Movimentações (ignora acento e maiúsculas; acha também pela categoria e pela conta da transferência) e filtro "Tipo" (fixos, fora do comum, faturas de cartão, transferências).
- U11: menu "⋯" em Movimentações com Importar extrato bancário, Exportar lançamentos do mês (CSV) e Limpar mês (por último, em vermelho); a barra de filtros ficou só com busca e filtros.
- U12: formulário único de lançamento (Saída/Entrada + "Mais opções") em Movimentações e no "+ Novo", com "Já paguei/recebi" na criação; campo de valor passa a aceitar colar e teclado virtual do celular.
- U13: Cartões seguem a conta selecionada ("Todas as contas" agrupa por conta pagadora); criar e editar cartão direto na tela de Cartões; importar e limpar fatura num menu "⋯".
- U14: tipo de conta criado direto no cadastro da conta ("+ Novo tipo…"); a aba "Tipos de Conta" saiu de Configurações e o gerenciamento dos tipos ficou numa seção recolhível da aba Contas.
- U15: "+ Nova categoria…" dentro dos formulários de lançamento e de compra no cartão, criando a categoria sem sair da tela.
- U16: para quem tem uma conta só, somem a escolha de conta ao pagar fatura, a reserva automática e o campo de conta pagadora do cartão; com várias contas, o pagamento de fatura já sugere a conta certa.
- U17: Movimentações com "Todas as contas" — lista e resumo de todas as contas ativas juntas, com a conta de cada lançamento à vista; transferências entre suas próprias contas não aparecem (se anulam).
- U18: compra no cartão direto pelo "+ Novo" — em Saída, "Pagar com" (conta ou cartão) e parcelas; vai para a fatura do cartão.
- U19: preferência "Mostrar detalhes avançados" (Configurações → Preferências) para abrir já expandidos os detalhes do resumo e a análise completa.
- U20: onboarding com IA explica a "visão inicial" do seletor de conta; nome do mês segue o idioma escolhido (antes era sempre português); documentação da regra do resumo do mês.
- U21: `npm run seed:demo` (backend) popula um banco de demonstração (nome com `demo`) com três meses de dados fictícios; README reescrito para portfólio com prints em `docs/screenshots/` (desktop claro/escuro e celular).
- **Refactor de contas PF/PJ** (entregas E1–E9, ver `docs/refactor-contas-pf-pj.md`): cada conta passa a ser seu próprio contexto financeiro — fluxo de caixa, saldo e histórico isolados dos das demais, com um seletor de conta ativa no cabeçalho (`AccountContext`).
  - Transferências entre contas (`POST/PUT/DELETE /transfers`, `/transfers/:transferGroupId/revert`): sempre um par de transações ligadas por `transferGroupId`, já efetivadas na data informada, com tela própria no Fluxo de Caixa (`TransferModal`/`TransferGrid`) e opção no Lançamento Rápido.
  - Reserva automática como transferência: a regra agora fica na conta de origem (`Account.autoReserveTargetAccountId` aponta para o destino); ao receber uma entrada na origem, uma transferência automática é gerada/reconfirmada sozinha, com badge própria na UI e rótulo dedicado no CSV do backup.
  - Escopo do dashboard configurável (`Settings.dashboardScope`): consolidado (soma de todas as contas, default) ou por conta.
  - Onboarding com IA atualizado: nova tool `propose_transfer`, `propose_account` ganha a regra de reserva automática (origem→destino), `propose_settings` passa a controlar o escopo do dashboard, e o assistente explica que cada conta é um contexto isolado.
- `frontend/functions/api/[[path]].ts` — Cloudflare Pages Function que faz proxy same-origin de `/api/*` para o backend no Render, corrigindo o bloqueio do cookie de sessão em navegadores mobile (Safari/iOS trata front e back em domínios distintos como cookie de terceiro e bloqueia por padrão, independente de `SameSite=None`). Requer env var `API_ORIGIN` no projeto Cloudflare Pages e `VITE_API_URL=/api` no build de produção. Detalhes em `docs/architecture/stack-template-and-deploy.md` (seção 8).
- Preparação de multi-tenant: todas as 9 entidades, repositórios, serviços e controllers do backend agora tratam `tenantId` como parâmetro real (não hardcoded), resolvido via header `X-Tenant-Id` com fallback para um tenant default fixo (`backend/src/shared/tenant/tenant.constants.ts`). Sem autenticação/login ainda — é só a camada de dados já pronta para isso.
- Módulo de backup/export/import (`/backup/*`): backup completo em JSON (export/import, com confirmação obrigatória por ser destrutivo), exportação de lançamentos em CSV por período ou tudo, e importação de extrato bancário (CSV genérico + OFX 1.x, com pré-visualização e detecção de possíveis duplicatas antes de confirmar). Nova página `/backup` no frontend.
- Página `/report`: relatório financeiro para impressão/exportação em PDF via `window.print()` do navegador (sem depender de biblioteca de geração de PDF).
- Atalhos de teclado globais: `Alt+←`/`Alt+→` para navegar entre meses, `N` para abrir um modal de lançamento rápido (Pagamento/Gasto Extra/Recebimento), `?` para ver a lista de atalhos.
- README.md com instruções de setup, os dois servidores (backend :3100 + frontend :3101) e `npm run seed`.
- `docs/api.md` — referência dos endpoints do backend.
- `docs/domain-logic.md` — regras de fatura de cartão de crédito e lançamentos recorrentes (fixos).
- `docs/adr/0001-json-file-storage.md` — ADR sobre a escolha de JSON em arquivo em vez de banco de dados.
- Suítes de teste (Vitest) no backend e no frontend, cobrindo persistência (`JsonFileStore`), lógica de fatura/parcelamento (`CreditCardsService`), cálculo de saldo e utils de data/moeda/validação.
- Notificações toast para falhas de mutation em todo o frontend (antes, erros de API não davam nenhum feedback visual).
- Logging mínimo de requisições no backend (método, path, status, duração).
- `VITE_API_URL` (frontend) e `CORS_ORIGIN` (backend) como variáveis de ambiente configuráveis.

### Changed
- U2: conta pagadora do cartão (`defaultPaymentAccountId`) passa a ser obrigatória e validada (ativa) na criação/edição; não é mais possível desativar uma conta que paga a fatura de um cartão ativo (`account.paysCreditCard`). Onboarding usa a conta principal quando o draft não indica pagadora; restauração de backup preenche a pagadora de cartões antigos. Rótulo no formulário: "Conta que paga a fatura".
- `CashFlow.tsx` (1414 linhas, 14 mutations) dividido em componentes/hooks menores em `pages/CashFlow/`.
- Repositórios/serviços/controllers do backend agora são montados uma única vez em `src/container.ts`, em vez de reinstanciados em cada `*.routes.ts`.
- Cálculo de saldo de conta (`calcAccountBalance`), antes duplicado entre `CashFlowService` e `DashboardService`, unificado em `shared/utils/balance.utils.ts`.
- Criação de parcelas e recálculo de fatura em `CreditCardsService` agora usam inserção em lote (`createMany`) e uma única leitura por lote em vez de uma leitura/escrita completa do arquivo por parcela.
- `Modal.tsx` ganhou `role="dialog"`, `aria-modal`, foco automático ao abrir, focus trap (Tab não escapa mais do modal) e restauração de foco ao fechar.
- Cobertura de `aria-label`/`role` ampliada em botões só-ícone (Editar/Excluir/Desativar, toggles de pago/recebido) em CashFlow, Receivables, CreditCards e Settings; item de "próximos vencimentos" do Dashboard agora é focável e acionável via teclado.

### Fixed
- Cabeçalho: o seletor de conta sobrepunha a seta de mês anterior em telas de notebook/tablet desde a entrada do botão "Novo"; o título da página passa para a linha de baixo abaixo de 1280px, "Novo" vira só ícone abaixo de 1024px e o seletor não encolhe a ponto de invadir o navegador de mês.
- Barra de rolagem horizontal no celular (iPhone) em Movimentações: os balões de ajuda (?) ficavam montados invisíveis e, perto da borda direita, alargavam a página. Agora só existem quando abertos e se reposicionam para caber na tela.
- Na visão "Todas as contas" de Movimentações, editar uma transferência de outra conta usava a conta errada como origem/destino; pagar fatura sugere a conta que já paga aquela fatura.
- Migração de boot `migrateResetAutoReserve` zerava, a cada reinício do servidor (deploy ou cold start no Render), toda regra de reserva automática configurada depois da E8. O reset agora só atinge contas no formato pré-E8. **Regras configuradas antes desta correção podem ter sido apagadas em produção e precisam ser reconfiguradas.**
- U1: "Saídas" não tem mais três valores diferentes. Transferências entre contas deixaram de ser somadas em Entradas/Saídas no Fluxo de Caixa e no Relatório (o Dashboard já não somava) e passaram a aparecer à parte como "Entre contas" (saldo líquido), só quando há alguma no mês.
- U1: o saldo previsto ignorava o que já tinha sido recebido/pago no próprio mês (ex.: saldo inicial 1.000, recebido 500 e 200 a pagar → previsto 800 em vez de 1.300). A base da projeção agora é o saldo realizado; regressão introduzida em `726fe67`.
- `JsonFileStore.writeAll` agora escreve em arquivo temporário e renomeia (operação atômica), evitando corrupção do JSON em caso de crash no meio da escrita.
- Validação de `?month=`/`?year=` em `GET /credit-cards` migrada de `parseInt` manual (silenciosamente virava `NaN`) para o mesmo schema Zod já usado em `getCardFlow`.
- CORS deixou de aceitar qualquer origem (`cors()` sem opções) e passou a ser restrito a `CORS_ORIGIN`.

### Removed
- U10c: grids antigas de Movimentações (`EntriesGrid`, `TransactionGrid`, `TransferGrid`, `CreditCardsGrid`), `PageFooterContext` e 25 textos sem uso nos três idiomas.
- Módulo de Recebimentos (`/receivables`) — substituído por entradas nativas do fluxo de caixa (`FinancialTransaction` tipo `INCOME`); dados antigos migrados por script (refactor de contas PF/PJ, entrega E3).
- Limites de faturamento anual, saldo mínimo e o campo protegido de categoria (Nota Fiscal) — nenhum resquício na API, UI ou onboarding (entrega E4).
- Dependências não utilizadas `react-hook-form` e `@hookform/resolvers` do frontend (nenhum uso em `src`).
