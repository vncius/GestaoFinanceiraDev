# Gestão Financeira PJ/Pessoal

Sistema de controle financeiro para pessoa física e jurídica: fluxo de caixa mensal, contas a receber, cartões de crédito (com fatura e parcelamento) e dashboard com indicadores.

## Stack

- **Backend**: Node.js + TypeScript + Express + Zod, persistência em arquivos JSON (`backend/data/`). Valores monetários guardados em centavos (inteiros).
- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS + React Router + TanStack Query + Axios.

Veja [`docs/adr/0001-json-file-storage.md`](docs/adr/0001-json-file-storage.md) para o porquê da persistência em arquivo em vez de banco de dados.

## Pré-requisitos

- Node.js 18+
- npm

## Setup

O projeto tem dois pacotes independentes — **não há workspace/monorepo raiz** — cada um com seu próprio `package.json` e `node_modules`.

```bash
# Backend
cd backend
npm install
cp .env.example .env   # opcional, os defaults já funcionam em dev

# Frontend
cd frontend
npm install
cp .env.example .env   # opcional, os defaults já funcionam em dev
```

## Rodando em desenvolvimento

A aplicação precisa de **dois servidores rodando ao mesmo tempo**, em dois terminais separados:

```bash
# Terminal 1 — backend (API na porta 3100)
cd backend
npm run dev

# Terminal 2 — frontend (Vite na porta 3101)
cd frontend
npm run dev
```

Acesse `http://localhost:3101`. O frontend chama a API em `http://localhost:3100` por padrão (configurável via `VITE_API_URL` no `.env` do frontend).

### Populando dados iniciais

O backend não vem com nenhum dado. Para criar contas e categorias padrão (idempotente — não duplica se já existirem):

```bash
cd backend
npm run seed
```

## Variáveis de ambiente

**`backend/.env`** (veja `backend/.env.example`):

| Variável      | Default                  | Descrição                                   |
|---------------|---------------------------|----------------------------------------------|
| `PORT`        | `3100`                    | Porta do servidor Express                     |
| `CORS_ORIGIN` | `http://localhost:3101`   | Origem permitida para requisições CORS        |

**`frontend/.env`** (veja `frontend/.env.example`):

| Variável        | Default                  | Descrição                    |
|-----------------|---------------------------|-------------------------------|
| `VITE_API_URL`  | `http://localhost:3100`   | URL base da API consumida pelo frontend |

## Testes

```bash
cd backend && npm test
cd frontend && npm test
```

Ambos usam [Vitest](https://vitest.dev). O frontend também usa Testing Library para os testes que renderizam componentes.

## Build de produção

```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm run preview
```

## Documentação adicional

- [`docs/api.md`](docs/api.md) — referência dos endpoints do backend
- [`docs/domain-logic.md`](docs/domain-logic.md) — regras de fatura de cartão de crédito e lançamentos recorrentes (fixos)
- [`docs/adr/`](docs/adr/) — Architecture Decision Records
- [`CHANGELOG.md`](CHANGELOG.md) — histórico de mudanças relevantes

## Estrutura do repositório

```
backend/
  src/
    modules/        # um módulo por domínio (accounts, cash-flow, credit-cards, ...)
    shared/          # persistência (JsonFileStore), erros, middlewares, utils
    container.ts     # wiring central de repositórios/serviços/controllers
  data/              # arquivos JSON de dados (gitignored)
frontend/
  src/
    pages/           # uma pasta por página (Dashboard, CashFlow, CreditCards, ...)
    components/ui/   # componentes de UI reutilizáveis
    contexts/         # Theme, Month, Dialog, Toast
    services/         # clientes HTTP por módulo do backend
docs/                # documentação (API, lógica de domínio, ADRs)
```
