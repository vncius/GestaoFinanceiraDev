# Gestão Financeira PJ/Pessoal

Sistema de controle financeiro para pessoa física e jurídica: fluxo de caixa mensal, contas a receber, cartões de crédito (com fatura e parcelamento), dashboard com indicadores e um assistente de IA que conduz o onboarding de novos usuários.

## Stack

- **Backend**: Node.js + TypeScript + Express + Zod, persistência em MongoDB Atlas (driver nativo `mongodb`, sem ORM). Valores monetários guardados em centavos (inteiros). Autenticação via Google ID-token (JWT em cookie httpOnly), com isolamento de dados por tenant.
- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS + React Router + TanStack Query + Axios. i18n em pt/en/es (i18next).
- **IA**: integração com Anthropic (`@anthropic-ai/sdk`) ou OpenAI (`openai`) por trás de uma abstração de provedor própria (`AI_PROVIDER=anthropic|openai`) — ver [`docs/architecture/ai-platform.md`](docs/architecture/ai-platform.md).

> [`docs/adr/0001-json-file-storage.md`](docs/adr/0001-json-file-storage.md) registra a decisão original de persistir em arquivos JSON; está **superado** — a aplicação migrou para MongoDB Atlas (ver o próprio ADR para a nota de atualização e o histórico de commits).

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

| Variável           | Default            | Descrição                                                        |
|--------------------|---------------------|--------------------------------------------------------------------|
| `PORT`              | `3100`              | Porta do servidor Express                                          |
| `CORS_ORIGIN`       | `http://localhost:3101` | Origem permitida para requisições CORS                        |
| `MONGODB_URI`       | —                    | String de conexão do MongoDB Atlas                                 |
| `MONGODB_DB_NAME`   | `gestao_financeira` | Nome do banco                                                       |
| `JWT_SECRET`        | —                    | Segredo para assinar o cookie de sessão                            |
| `GOOGLE_CLIENT_ID`  | —                    | OAuth Client ID do Google                                           |
| `AI_PROVIDER`       | `fake`               | `fake` (determinístico, sem rede), `anthropic` ou `openai`           |
| `AI_API_KEY`        | —                    | Chave do provedor ativo — obrigatória com `AI_PROVIDER=anthropic\|openai`, nunca exposta ao frontend |
| `AI_MODEL`          | —                    | Modelo do provedor ativo — obrigatório junto com `AI_API_KEY` (ex.: `claude-opus-4-8` ou `gpt-4o-mini`) |

Veja `backend/.env.example` para os limites opcionais da plataforma de IA
(timeout, tokens, tool rounds).

**`frontend/.env`** (veja `frontend/.env.example`):

| Variável        | Default                  | Descrição                    |
|-----------------|---------------------------|-------------------------------|
| `VITE_API_URL`  | `http://localhost:3100`   | URL base da API consumida pelo frontend. Em produção (Cloudflare Pages) usar `/api` — ver abaixo |

**Deploy no Cloudflare Pages** — variável de ambiente do *projeto* (não do build Vite,
configurada no dashboard do Cloudflare em Settings → Environment variables), consumida
por `frontend/functions/api/[[path]].ts`:

| Variável      | Descrição                                                                 |
|---------------|-----------------------------------------------------------------------------|
| `API_ORIGIN`  | URL pública do backend no Render (ex.: `https://gestao-financeira-backend.onrender.com`) |

Essa Function faz proxy same-origin de `/api/*` para o backend, para que o cookie de
sessão deixe de ser tratado como cookie de terceiro em navegadores mobile (Safari/iOS
bloqueia isso por padrão). Com o proxy ativo, o build de produção deve usar
`VITE_API_URL=/api` (relativo) em vez da URL direta do Render. Detalhes e alternativas
em [`docs/architecture/stack-template-and-deploy.md`](docs/architecture/stack-template-and-deploy.md#8-problema-conhecido-cookie-de-sessão-bloqueado-em-navegadores-mobile).

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

## Onboarding conversacional com IA

Novos usuários (tenants sem dados) podem configurar a aplicação conversando
com um assistente em vez de preencher telas manualmente. A IA só conversa,
lê contexto autorizado do próprio tenant e propõe alterações num **draft**;
a criação real dos dados só acontece depois que o usuário revisa e confirma
explicitamente. Veja a documentação completa em `docs/architecture/`:

- [`ai-platform.md`](docs/architecture/ai-platform.md) — arquitetura da plataforma de IA (componentes, abstração de provedor, fluxo de requisição)
- [`onboarding-ai.md`](docs/architecture/onboarding-ai.md) — jornada do usuário, estados, draft, confirmação, diagrama do fluxo
- [`tool-calling.md`](docs/architecture/tool-calling.md) — como as tools funcionam e como adicionar uma nova
- [`ai-context.md`](docs/architecture/ai-context.md) — o que é (e o que nunca é) enviado ao modelo
- [`ai-security.md`](docs/architecture/ai-security.md) — isolamento por tenant, limites, idempotência, logs
- [`docs/adr/0002` a `0005`](docs/adr/) — decisões arquiteturais da plataforma de IA

## Documentação adicional

- [`docs/api.md`](docs/api.md) — referência dos endpoints do backend
- [`docs/domain-logic.md`](docs/domain-logic.md) — regras de fatura de cartão de crédito e lançamentos recorrentes (fixos)
- [`docs/adr/`](docs/adr/) — Architecture Decision Records
- [`CHANGELOG.md`](CHANGELOG.md) — histórico de mudanças relevantes

## Estrutura do repositório

```
backend/
  src/
    modules/         # um módulo por domínio (accounts, cash-flow, credit-cards, ai, onboarding, ...)
    shared/          # persistência (MongoStore), erros, middlewares, utils
    container.ts     # wiring central de repositórios/serviços/controllers
frontend/
  src/
    pages/           # uma pasta por página (Dashboard, CashFlow, CreditCards, Onboarding, ...)
    components/ui/   # componentes de UI reutilizáveis
    contexts/         # Auth, Theme, Month, Dialog, Toast, Language
    services/         # clientes HTTP por módulo do backend
docs/                # documentação (API, lógica de domínio, ADRs, arquitetura da IA)
```
