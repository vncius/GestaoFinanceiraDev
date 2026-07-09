# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não usa versionamento/tags de release — as entradas abaixo ficam em "Unreleased" até que isso exista.

Este arquivo começou a ser mantido nesta sessão; histórico anterior a ele só existe via `git log`.

## [Unreleased]

### Added
- README.md com instruções de setup, os dois servidores (backend :3100 + frontend :3101) e `npm run seed`.
- `docs/api.md` — referência dos endpoints do backend.
- `docs/domain-logic.md` — regras de fatura de cartão de crédito e lançamentos recorrentes (fixos).
- `docs/adr/0001-json-file-storage.md` — ADR sobre a escolha de JSON em arquivo em vez de banco de dados.
- Suítes de teste (Vitest) no backend e no frontend, cobrindo persistência (`JsonFileStore`), lógica de fatura/parcelamento (`CreditCardsService`), cálculo de saldo e utils de data/moeda/validação.
- Notificações toast para falhas de mutation em todo o frontend (antes, erros de API não davam nenhum feedback visual).
- Logging mínimo de requisições no backend (método, path, status, duração).
- `VITE_API_URL` (frontend) e `CORS_ORIGIN` (backend) como variáveis de ambiente configuráveis.

### Changed
- `CashFlow.tsx` (1414 linhas, 14 mutations) dividido em componentes/hooks menores em `pages/CashFlow/`.
- Repositórios/serviços/controllers do backend agora são montados uma única vez em `src/container.ts`, em vez de reinstanciados em cada `*.routes.ts`.
- Cálculo de saldo de conta (`calcAccountBalance`), antes duplicado entre `CashFlowService` e `DashboardService`, unificado em `shared/utils/balance.utils.ts`.
- Criação de parcelas e recálculo de fatura em `CreditCardsService` agora usam inserção em lote (`createMany`) e uma única leitura por lote em vez de uma leitura/escrita completa do arquivo por parcela.
- `Modal.tsx` ganhou `role="dialog"`, `aria-modal`, foco automático ao abrir, focus trap (Tab não escapa mais do modal) e restauração de foco ao fechar.
- Cobertura de `aria-label`/`role` ampliada em botões só-ícone (Editar/Excluir/Desativar, toggles de pago/recebido) em CashFlow, Receivables, CreditCards e Settings; item de "próximos vencimentos" do Dashboard agora é focável e acionável via teclado.

### Fixed
- `JsonFileStore.writeAll` agora escreve em arquivo temporário e renomeia (operação atômica), evitando corrupção do JSON em caso de crash no meio da escrita.
- Validação de `?month=`/`?year=` em `GET /credit-cards` migrada de `parseInt` manual (silenciosamente virava `NaN`) para o mesmo schema Zod já usado em `getCardFlow`.
- CORS deixou de aceitar qualquer origem (`cors()` sem opções) e passou a ser restrito a `CORS_ORIGIN`.

### Removed
- Dependências não utilizadas `react-hook-form` e `@hookform/resolvers` do frontend (nenhum uso em `src`).
