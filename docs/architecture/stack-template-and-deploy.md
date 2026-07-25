# Stack e Deploy — Template para Replicação

Referência técnica completa do stack e da infraestrutura desta aplicação, para uso como
template ao padronizar um novo projeto similar. Cobre também o problema conhecido de
cookies cross-domain em mobile (ver seção final).

## 1. Topologia atual

```
Cloudflare Pages (frontend, estático)  ──HTTPS──►  Render (backend, Node)
   *.pages.dev ou domínio custom             *.onrender.com
                                                    │
                                                    └─► MongoDB Atlas
```

Dois domínios registráveis (eTLD+1) distintos — isso é a causa do problema de cookies
em mobile (seção 8).

## 2. Backend

- **Runtime**: Node.js 18+, TypeScript, Express 4.
- **Validação**: Zod em todos os schemas de entrada (`*.schemas.ts` por módulo).
- **Persistência**: MongoDB Atlas via driver nativo `mongodb` (sem ORM). Valores
  monetários sempre inteiros (centavos). Soft delete via `active=false`/`status`.
- **Auth**: Google ID-token (OAuth) verificado com `jose` (`createRemoteJWKSet` contra
  `https://www.googleapis.com/oauth2/v3/certs`), sessão própria emitida como JWT HS256
  (`jose SignJWT`), guardado em cookie `httpOnly`. Ver `backend/src/modules/auth/`.
- **Multi-tenant**: `tenantId` embutido no JWT da sessão, nunca em header de cliente.
  Cada novo usuário recebe um tenant novo e vazio; dados padrão (conta, tipos de conta
  e categorias) só são criados automaticamente se o usuário optar por "Configuração
  Manual" no onboarding em vez do assistente de IA — ver
  `backend/src/modules/tenant-bootstrap/` e `OnboardingService.skip()`.
- **IA**: abstração de provedor própria (`AI_PROVIDER=fake|anthropic|openai`) — ver
  `docs/architecture/ai-platform.md`.
- **Padrões de arquitetura**:
  - Um módulo por domínio em `src/modules/<nome>/`: `*.routes.ts` → `*.controller.ts` →
    `*.service.ts` → `*.mongo-repository.ts` (+ `*.schemas.ts`, `*.types.ts`).
  - Wiring central em `src/container.ts` (repositórios/serviços/controllers
    instanciados uma única vez, sem DI framework).
  - `CRUD` genérico compartilhado em `shared/persistence/mongo-store.ts`.
  - Middlewares em `shared/middlewares/`: `auth.middleware.ts` (gate global pós-login),
    `error-handler.ts` (converte `AppError`/Zod em resposta JSON padronizada),
    `request-logger.ts`, `rate-limit.middleware.ts` (usado nas rotas de IA).
  - Erros de negócio via classe `AppError(message, statusCode, code, params?)` —
    `code` é usado pelo frontend para tradução i18n do erro.
- **Testes**: Vitest (`npm test`), incluindo testes de integração de módulos (ex.:
  `onboarding.integration.test.ts`).

### Ordem de montagem em `server.ts` (importante)

```
cors() → body-parsers → cookieParser() → requestLogger
  → /health (público)
  → /auth/*  (público — único jeito de conseguir cookie de sessão)
  → authMiddleware  (gate: tudo abaixo exige cookie válido)
  → demais rotas de domínio
  → errorHandler (sempre por último)
```

## 3. Frontend

- **Stack**: React 18 + Vite + TypeScript + TailwindCSS v3 (`darkMode: 'class'`) +
  React Router v6 + TanStack Query v5 + Axios + lucide-react + i18next (pt/en/es).
- **Estrutura**:
  - `pages/<Nome>/` — uma pasta por página, com subcomponentes/hooks locais quando a
    página cresce (ex.: `pages/CashFlow/components/`, `useCashFlowMutations.ts`).
  - `components/ui/` — componentes reutilizáveis (Modal com focus trap, CurrencyInput
    com máscara BRL, Tooltip, StatCard, etc.).
  - `contexts/` — Auth, Theme, Month (navegação mês/ano global), Dialog, Toast, Language.
  - `services/` — um client HTTP por módulo do backend, todos sobre a instância única
    `api` (`services/api.ts`).
- **Cliente HTTP** (`services/api.ts`): instância Axios única,
  `withCredentials: true` (obrigatório para cookie cross-site), interceptor de resposta
  que redireciona para `/login` em `401` e traduz `error.response.data.code` via i18n.
- **Padrões**:
  - Query keys por domínio: `['cashFlow', month, year]`, `['dashboard', month, year]`,
    etc. Toda mutation chama `queryClient.invalidateQueries()` no sucesso.
  - `AuthContext`: busca `AuthService.me()` no mount; `loginWithGoogle`/`logout` sempre
    chamam `queryClient.clear()` antes de trocar o usuário (evita vazar cache de
    tenant anterior).
  - `ProtectedRoute` + gate de onboarding para tenants sem dados ainda.

## 4. Variáveis de ambiente

**`backend/.env`**

| Variável | Default | Obrigatória em prod |
|---|---|---|
| `PORT` | `3100` | não |
| `CORS_ORIGIN` | `http://localhost:3101` | **sim** — precisa ser a URL exata do frontend publicado |
| `MONGODB_URI` | — | sim |
| `MONGODB_DB_NAME` | `gestao_financeira` | não |
| `JWT_SECRET` | — | sim (segredo longo e aleatório) |
| `GOOGLE_CLIENT_ID` | — | sim |
| `AI_PROVIDER` | `fake` | não (`anthropic`\|`openai` em prod) |
| `AI_API_KEY` | — | sim se `AI_PROVIDER≠fake` |
| `AI_MODEL` | — | sim se `AI_PROVIDER≠fake` |
| `NODE_ENV` | — | **sim, `production`** — controla `secure`/`sameSite` do cookie (ver seção 8) |

**`frontend/.env`** (build-time, Vite)

| Variável | Default |
|---|---|
| `VITE_API_URL` | `http://localhost:3100` |
| `VITE_GOOGLE_CLIENT_ID` | — |

## 5. Build & deploy — Cloudflare Pages (frontend)

- Build command: `npm run build` (⇒ `tsc && vite build`)
- Output directory: `dist`
- Variáveis de ambiente do projeto: `VITE_API_URL` (URL pública do backend no Render),
  `VITE_GOOGLE_CLIENT_ID`.
- SPA routing: como é client-side (`react-router-dom`), precisa de regra de fallback
  para servir `index.html` em qualquer rota não encontrada — Cloudflare Pages faz isso
  automaticamente para SPAs quando não há `_redirects`/`functions` customizados; **hoje
  este projeto não tem `_redirects` nem `functions/` configurados** (verificado — pasta
  ausente). Se rotas profundas (`/cash-flow`, `/settings`, etc.) derem 404 ao recarregar,
  adicionar `frontend/public/_redirects` com `/* /index.html 200`.

## 6. Build & deploy — Render (backend)

- Build command: `npm install && npm run build` (⇒ `tsc -p tsconfig.build.json`)
- Start command: `npm start` (⇒ `node dist/server.js`)
- Health check path: `/health`
- Variáveis de ambiente: todas da tabela da seção 4, com `NODE_ENV=production` e
  `CORS_ORIGIN` = URL pública do Cloudflare Pages.
- Porta: Render injeta `PORT`; o código já usa `process.env.PORT` com fallback (`server.ts:26`).

## 7. Checklist final — o que a nova aplicação precisa ter para rodar

### 7.1 Arquitetura (backend)

- [ ] Módulo por domínio em `src/modules/<nome>/`: `*.routes.ts` → `*.controller.ts` →
      `*.service.ts` → `*.mongo-repository.ts` (+ `*.schemas.ts` Zod, `*.types.ts`).
- [ ] `src/container.ts` com wiring central (instância única de cada repo/service/controller,
      sem DI framework).
- [ ] `shared/persistence/mongo-store.ts` genérico + `mongo-client.ts` (conexão única,
      reaproveitada por todos os repositórios).
- [ ] `shared/middlewares/`: `auth.middleware.ts` (gate pós-login), `error-handler.ts`
      (`AppError` + erros Zod → JSON padronizado), `request-logger.ts`, rate-limit onde
      houver rota cara (ex.: chamadas a LLM).
- [ ] Ordem de montagem em `server.ts`: `cors()` → parsers JSON (com limites por rota
      quando necessário) → `cookieParser()` → `requestLogger` → rotas públicas (`/health`,
      `/auth/*`) → `authMiddleware` → rotas protegidas → `errorHandler` por último.
- [ ] Padrão de erro de negócio: classe `AppError(message, statusCode, code, params?)`,
      com `code` pensado para tradução no frontend (i18n), nunca mensagem final hardcoded.
- [ ] Isolamento multi-tenant via `tenantId` embutido no JWT da sessão (nunca em header
      de cliente) — se o novo projeto não for multi-tenant, pode omitir, mas decidir
      isso conscientemente no início, não depois.

### 7.2 Arquitetura (frontend)

- [ ] Vite + React + TS + Tailwind (`darkMode: 'class'`) + React Router + TanStack Query
      + Axios.
- [ ] `services/api.ts`: instância Axios única, `withCredentials: true`, interceptor de
      `401` → redirect `/login`, tradução de erro por `error.response.data.code` via i18n.
- [ ] Um `service` por módulo do backend, todos sobre a instância única do Axios.
- [ ] `pages/<Nome>/` por página, com `components/` e hooks locais quando a página cresce.
- [ ] Contexts: `AuthContext` (busca `/auth/me` no mount, `queryClient.clear()` em
      login/logout para não vazar cache entre usuários/tenants), `ThemeContext`, e demais
      conforme necessidade (Month/Dialog/Toast/Language neste projeto).
- [ ] Query keys por domínio (`['recurso', ...params]`) e toda mutation chamando
      `invalidateQueries()` no sucesso.

### 7.3 Autenticação e sessão

- [ ] Login via provedor OAuth (Google ou outro) → verificação do ID-token → sessão
      própria como JWT assinado (HS256, `jose` ou equivalente) em cookie `httpOnly`.
- [ ] Cookie: `httpOnly: true`, `secure: NODE_ENV==='production'`,
      `sameSite: NODE_ENV==='production' ? 'none' : 'lax'`. Isso é necessário mas **não
      suficiente** para mobile — ver 7.5.
- [ ] `GOOGLE_CLIENT_ID`/`JWT_SECRET` (ou equivalentes) como env vars obrigatórias,
      nunca hardcoded, nunca commitadas.

### 7.4 Variáveis de ambiente e segredos

- [ ] `.env.example` commitado nos dois pacotes (backend e frontend), com todas as
      chaves documentadas e valores fake/placeholder — nunca segredo real.
- [ ] `.env` real em `.gitignore` (backend e frontend) — **confirmar que nenhum `.env`
      real foi commitado por engano** antes do primeiro push.
- [ ] Segredos (JWT_SECRET, AI_API_KEY, MONGODB_URI) só existem como env var no serviço
      de hosting (Render/equivalente) — nunca no repositório, nunca logados.
- [ ] Variável de deploy que não é do bundle do frontend (ex.: `API_ORIGIN` do proxy)
      configurada direto no dashboard do host estático, não em `.env` do Vite (evita
      vazar a URL do backend no bundle público sem necessidade, e principalmente evita
      confundir env var de build-time do Vite com env var de runtime da Function).

### 7.5 Topologia de domínio e cookies (o ponto que gerou o bug neste projeto)

- [ ] **Decidir isso antes de configurar cookies**, não depois: se frontend e backend
      vão ficar em domínios registráveis diferentes (ex.: `*.pages.dev` +
      `*.onrender.com`), o cookie de sessão será tratado como cookie de terceiro por
      Safari/iOS (bloqueado incondicionalmente, independente de `SameSite=None`) — o
      app vai "funcionar" em desktop e falhar silenciosamente em mobile.
- [ ] Se optar por hosts com domínios diferentes (mais comum em MVP/protótipo sem
      domínio próprio ainda): implementar de saída um reverse proxy same-origin — no
      Cloudflare Pages, uma Pages Function catch-all (`functions/api/[[path]].ts`) que
      repassa `/api/*` para o backend, com repasse manual de `Set-Cookie` via
      `headers.getSetCookie()` (a API padrão `Headers` colapsa múltiplos `Set-Cookie`
      numa string só, o que corrompe os cookies). Isso é o que foi implementado aqui —
      ver seção 8, opção B — e pode ser copiado quase 1:1 para o novo projeto trocando
      só o `API_ORIGIN`.
- [ ] Se o novo projeto já nasce com domínio próprio, preferir de saída a opção A da
      seção 8 (subdomínios do mesmo root domain, cookie `Domain=.dominio.com`) — mais
      simples que manter um proxy.

### 7.6 Coisas de repositório/tooling que este projeto já resolveu (copiar, não redescobrir)

- [ ] **`package-lock.json` commitado nos dois pacotes** (backend e frontend) — não é
      ignorado no `.gitignore`. Isso é o que garante que `npm install` no CI/host de
      deploy instale exatamente as mesmas versões testadas localmente. Ao adicionar
      qualquer dependência nova (ex.: `@cloudflare/workers-types` para a Function
      acima), sempre rodar `npm install` (não editar o `package.json` e deixar o lock
      dessincronizado) e commitar os dois arquivos juntos.
- [ ] Dois pacotes independentes (`backend/`, `frontend/`), cada um com seu próprio
      `package.json`/`package-lock.json`/`node_modules` — **sem workspace/monorepo
      raiz**. Simples de entender e de configurar build isolado por serviço de hosting,
      desde que documentado no README (este projeto documenta isso explicitamente).
- [ ] `node_modules/`, `dist/`, `.env`, `*.tsbuildinfo` no `.gitignore` de cada pacote
      (backend também ignora `data/` — resquício da era JSON file storage, remover se
      não fizer sentido no novo projeto).
- [ ] `tsconfig.json` do frontend com `include: ["src"]` explícito — é o que garante que
      pastas especiais fora de `src/` (como `functions/` do Cloudflare) não entrem no
      `tsc` do `npm run build` e não precisem dos tipos de Function instalados só para o
      build principal passar. Pasta `functions/` com seu próprio `tsconfig.json` isolado
      (tipo-checado à parte, via `npx tsc --noEmit` dentro dela) para não acoplar o
      typecheck do app ao runtime do Cloudflare.
- [ ] Testes com Vitest nos dois pacotes (`npm test`), incluindo testes de integração
      de módulo no backend, não só unitários.
- [ ] `README.md` documentando: pré-requisitos, setup dos dois pacotes, como rodar os
      dois servidores em dev, tabela de env vars completa (com o que é obrigatório em
      produção vs. tem default), comandos de build/start de produção.
- [ ] `CHANGELOG.md` (formato Keep a Changelog, seção `[Unreleased]`) registrando
      mudanças relevantes — inclusive infra/deploy, não só features de produto.
- [ ] ADRs (`docs/adr/`) para decisões arquiteturais não óbvias a partir do código (ex.:
      por que multi-tenant, por que abstração de provedor de IA) — evita que a decisão
      se perca e alguém reverta sem saber o motivo original.

## 8. Problema conhecido: cookie de sessão bloqueado em navegadores mobile

### O que já está certo no código

`backend/src/modules/auth/auth.controller.ts:21-30` já configura o cookie corretamente
para cross-site em produção:

```ts
res.cookie(COOKIE_NAME, token, {
  httpOnly: true,
  secure: isProduction,              // true em prod (exige HTTPS)
  sameSite: isProduction ? 'none' : 'lax',  // 'none' é o correto p/ cross-site
  maxAge: THIRTY_DAYS_MS,
});
```

Isso é exatamente o que a spec exige para um cookie funcionar entre dois domínios
diferentes (`SameSite=None; Secure`). O problema **não é um bug de configuração** —
é uma política de privacidade do navegador que fica fora do controle do `Set-Cookie`.

### Causa raiz

Frontend (`*.pages.dev`, Cloudflare) e backend (`*.onrender.com`, Render) são dois
domínios registráveis (eTLD+1) diferentes. Do ponto de vista do navegador, o cookie
emitido pelo backend em resposta a uma chamada `fetch`/`XHR` feita pelo frontend é um
**cookie de terceiro** (third-party cookie) — mesmo com `SameSite=None; Secure` correto.

- **Safari/WebKit (todo navegador em iOS, incluindo Chrome/Firefox para iOS, que são
  WebKit por baixo)** bloqueia cookies de terceiros **por padrão e incondicionalmente**
  desde a Safari 13.1 (ITP — Intelligent Tracking Prevention, "Full Third-Party Cookie
  Blocking"). `SameSite=None` não isenta desse bloqueio — ele só evita o bloqueio
  *anterior* (SameSite=Lax default), mas o ITP do Safari bloqueia terceiros
  independente do atributo.
- **Chrome/Android** historicamente ainda permite cookies de terceiros por padrão, mas
  cada vez mais usuários/organizações ativam "Bloquear cookies de terceiros" nas
  configurações de privacidade — e é a direção que o Chrome vem tomando.
- **Navegadores in-app (webview do Instagram/Facebook/TikTok)** costumam ser ainda mais
  restritivos.

Isso explica o padrão observado: funciona no desktop (Chrome/Firefox desktop ainda
toleram bem), falha no mobile (Safari iOS bloqueia sempre; Android varia).

Isso **não tem relação com "não ter domínio próprio" per se** — o problema é os dois
serviços estarem em dois *registrable domains* diferentes, o que continua sendo
verdade mesmo com domínio próprio, **a menos que** front e back fiquem em subdomínios
do mesmo domínio raiz (ver opção A abaixo).

### Opções de correção

**A. Domínio próprio com subdomínios do mesmo root domain (correção definitiva)**
Quando o domínio existir: `app.seudominio.com` (frontend) + `api.seudominio.com`
(backend), ambos sob `seudominio.com`. Cookie passa a poder usar
`Domain=.seudominio.com`, e o navegador trata como **first-party** (mesmo site) —
o bloqueio de terceiros do Safari deixa de se aplicar. Exige apenas trocar
`Domain` no `res.cookie(...)` e apontar os DNS/CNAMEs do domínio para Cloudflare
Pages e Render respectivamente. Nenhuma mudança de arquitetura.

**B. Reverse proxy same-origin via Cloudflare Pages Functions (sem precisar de domínio novo) — ✅ implementado**
`frontend/functions/api/[[path]].ts` repassa qualquer requisição `/api/*` para o
backend no Render (`fetch` servidor-a-servidor dentro da Function), incluindo repasse
manual de `Set-Cookie` na resposta (a API padrão `Headers` colapsaria múltiplos
`Set-Cookie` numa string só — o runtime do Cloudflare expõe `getSetCookie()` para ler
cada um e o `Response` de saída aceita múltiplos `append`). O browser passa a enxergar
só o domínio do Cloudflare Pages — a chamada deixa de ser cross-site, então o cookie
vira first-party e CORS deixa de ser necessário nessa rota.

Para ativar:
1. No Cloudflare Pages (dashboard do projeto) → Settings → Environment variables:
   adicionar `API_ORIGIN` = URL pública do backend no Render (Production **e** Preview).
2. Trocar `VITE_API_URL` do build de produção para `/api` (relativo) — a chamada do
   Axios (`frontend/src/services/api.ts`) já usa `import.meta.env.VITE_API_URL` como
   `baseURL`, nenhuma mudança de código necessária.
3. Redeploy do Cloudflare Pages (a Function é detectada automaticamente por estar em
   `frontend/functions/`, já que o root directory do projeto no Cloudflare é `frontend/`).

Nenhuma mudança foi necessária no backend — `secure`/`sameSite` do cookie
(`auth.controller.ts`) seguem valendo e continuam corretos mesmo em contexto
same-origin. Type-check isolado da Function: `cd frontend/functions && npx tsc --noEmit`
(usa `@cloudflare/workers-types`, adicionado como devDependency do frontend).

> **Limitação conhecida**: a Function só roda no runtime do Cloudflare Pages (build/
> preview do Cloudflare ou `wrangler pages dev`) — o `npm run dev` local (Vite) não a
> executa. Em dev, o frontend continua chamando o backend local diretamente
> (`http://localhost:3100`), sem passar pelo proxy — isso é esperado, pois em
> `localhost` o problema de cookie de terceiro não se manifesta.

**C. Trocar cookie por token em header (fallback, não recomendado como padrão)**
Guardar o JWT de sessão em memória/`localStorage` no frontend e enviar como
`Authorization: Bearer <token>` em vez de cookie. Contorna a política de cookie de
terceiros por completo (não é mais cookie), mas perde a proteção `httpOnly` — o token
fica acessível a qualquer script rodando na página, aumentando a superfície de XSS.
Só considerar se A/B não forem viáveis.

### Recomendação

Registrar como **débito técnico** com prioridade alta (bloqueia uso mobile hoje) e
tratar com a **opção B (reverse proxy via Cloudflare Pages Functions)** como correção
de curto prazo — não depende de comprar domínio e resolve o bloqueio do Safari
imediatamente. Migrar para a **opção A** quando o domínio próprio existir, como
correção definitiva (a B pode continuar existindo como proxy mesmo depois, ou ser
removida em favor de subdomínios diretos).
