# Plano: Endurecimento de segurança e LGPD

> Plano de execução incremental. Cada entrega (S1, S2, …) é fechada: compila, passa nos testes, mantém a aplicação funcional e pode ser commitada sozinha.
> **Este arquivo é a fonte de verdade do andamento.** Qualquer sessão (humana ou IA) deve conseguir continuar o trabalho lendo só este documento + o código.

---

## Como continuar (protocolo para cada sessão)

1. Leia este arquivo inteiro — principalmente **Decisões** e **Status**.
2. Escolha a **primeira entrega ⬜ cujas dependências estão todas ✅** (ou a que o usuário pedir).
3. Mude o status dela para 🟡 antes de começar.
4. Implemente seguindo o **Escopo** (os arquivos citados são ponto de partida, confirme no código).
5. Valide com a **Definição de pronto**.
6. Ao concluir: status → ✅ com data e commit; registre descobertas em **Notas de implementação**; entrada no `CHANGELOG.md` (`[Unreleased]`); **um commit por entrega** (`feat(security): S<n> — <título>` ou `fix(security)`/`chore(security)`). Não fazer push sem o usuário pedir.
7. Decisão de produto nova → perguntar ao usuário e registrar como `D<n>`.

### Definição de pronto

- [ ] `cd backend && npm run typecheck && npm test` verde.
- [ ] Se tocou no frontend: `cd frontend && npm run build && npm test` verde; textos nos três idiomas (`frontend/src/locales/{pt,en,es}/`).
- [ ] Variável de ambiente nova documentada em `backend/.env.example`, `README.md` e na seção **Ações de deploy** abaixo.
- [ ] Nenhum fluxo existente quebrado (login, iPhone via proxy `/api`, backup, importações, onboarding).

---

## Objetivo

Levar a aplicação de "projeto pessoal" para um patamar mínimo aceitável para uso por terceiros: sessão revogável, proteção contra CSRF, cabeçalhos de segurança, limites de requisição, IP real nos logs, validação contra injection, trilha de auditoria, LGPD (consentimento, políticas, exclusão de conta) e criptografia de campos sensíveis. Origem: avaliação de segurança de 2026-10-14 (conversa com o usuário).

---

## Decisões tomadas

### D1 — Sessão de 1 dia, revogável
JWT de sessão expira em **24h** (absoluto, sem renovação deslizante). Cada usuário tem `sessionVersion`; o token carrega a versão e o `authMiddleware` compara com a do banco (cache em memória de 60s, invalidado na hora em "sair de todos"/exclusão). "Sair" pergunta: **só deste dispositivo** ou **de todos os dispositivos** (incrementa `sessionVersion`).

### D2 — CSRF sem quebrar iPhone
Produção usa o proxy same-origin do Cloudflare Pages (`/api`), então o cookie é first-party: passa a ser `SameSite=Lax` (configurável por `COOKIE_SAME_SITE` para quem fizer deploy cross-site sem proxy). Toda requisição que altera estado exige o cabeçalho `X-Requested-With: XMLHttpRequest` — um site de terceiro não consegue enviá-lo sem passar pelo preflight CORS, que só libera `CORS_ORIGIN`. Não depende de cookie de terceiro, então funciona no Safari/iOS.

### D3 — Cabeçalhos
Backend: `helmet` (API só devolve JSON; CSP `default-src 'none'`). Frontend: `frontend/public/_headers` do Cloudflare Pages com CSP que libera apenas o próprio domínio e o Google Identity Services (`accounts.google.com/gsi/*`), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

### D4 — IP real
Cadeia: navegador → Pages Function (proxy) → load balancer do Render → Express. O proxy envia `X-Client-IP` (de `CF-Connecting-IP`) junto com `X-Proxy-Secret`; o backend só confia no `X-Client-IP` se o segredo bater (`PROXY_SHARED_SECRET`). Sem proxy, usa `req.ip` com `trust proxy` = `TRUST_PROXY_HOPS` (default 1, o LB do Render).

### D5 — Limites
Em memória (processo único). Por IP: login Google 20/min; geral 600/min. Por tenant (após auth): importações/restauração 10 a cada 10 min; reset/exclusão de conta 5/h. Corpo JSON: 1 MB por padrão; 20 MB só em restauração de backup e importações de extrato/fatura; 16 KB no chat do onboarding.

### D6 — Consentimento LGPD no primeiro acesso
Usuário guarda `consentVersion`/`consentAcceptedAt`. Sem consentimento da versão vigente, o backend devolve `403 auth.consentRequired` em qualquer rota de dados, e o frontend mostra a tela de aceite (resumo + links para Política de Privacidade e Termos de Uso). Recusar = sair. Mudar o texto das políticas exige incrementar `CONSENT_VERSION` (todos aceitam de novo).

### D7 — Exclusão completa
"Excluir minha conta" (Configurações → Seus dados) apaga todos os dados do tenant, o usuário e anonimiza o log de auditoria do usuário (fica só ação + data, sem e-mail/IP), invalida as sessões e encerra a atual.

### D8 — Criptografia de campos
AES-256-GCM na camada de persistência (`MongoStore` e repositórios de usuários/auditoria/onboarding), chave `ENCRYPTION_KEY` (32 bytes base64). Campos: descrição e observações de lançamentos e compras no cartão; mensagens e resumo da conversa do onboarding; e-mail e nome do usuário (e-mail com índice cego HMAC para o login); e-mail e IP do log de auditoria. Valores **não** são criptografados (o Atlas já criptografa em repouso; sem descrição/e-mail eles não identificam ninguém, e manter número preserva consultas futuras no banco). Migração de boot idempotente criptografa o que estiver em texto puro. Produção sem `ENCRYPTION_KEY` não sobe. **Perder a chave = perder os dados criptografados.**

### D9 — Logs de requisição
Avaliado: hoje a query string só leva mês/ano/ids (sem dado pessoal), então o ganho é preventivo. Custo é uma linha: logar `req.path` em vez de `originalUrl`. Aplicado.

---

## Status

| # | Entrega | Depende | Status | Concluída em | Commit |
|---|---|---|---|---|---|
| S1 | Dependências vulneráveis (`npm audit fix`) | — | ✅ | 2026-10-14 | 4800e26 |
| S2 | Sessão de 1 dia + sair de todos os dispositivos | — | ✅ | 2026-10-14 | ver `git log` |
| S3 | CSRF (SameSite=Lax + cabeçalho) e cabeçalhos de segurança | — | ✅ | 2026-10-14 | ver `git log` |
| S4 | IP real do cliente | — | ✅ | 2026-10-14 | ver `git log` |
| S5 | Limites de requisição e de corpo | S4 | ✅ | 2026-10-14 | ver `git log` |
| S6 | Exigir e-mail verificado no login Google | — | ✅ | 2026-10-14 | ver `git log` |
| S7 | Validação contra injection (operadores Mongo, backup estrito, CSV) | — | ✅ | 2026-10-14 | ver `git log` |
| S8 | Auditoria de ações destrutivas | S4 | ⬜ | | |
| S9 | Logs de requisição sem query string | — | ⬜ | | |
| S10 | LGPD: políticas + consentimento no primeiro acesso | S2 | ⬜ | | |
| S11 | Exclusão completa da conta | S2, S8 | ⬜ | | |
| S12 | Criptografia de campos sensíveis | S11 | ⬜ | | |
| S13 | CI, Dependabot, CodeQL e testes de segurança | S1 | ⬜ | | |

---

## Ações de deploy (fazer no painel, fora do código)

| Onde | O quê | Entrega |
|---|---|---|
| Render | `PROXY_SHARED_SECRET` = valor aleatório longo (igual ao do Cloudflare) | S4 |
| Cloudflare Pages | `PROXY_SHARED_SECRET` = o mesmo valor (Production e Preview) | S4 |
| Render | `ENCRYPTION_KEY` = `openssl rand -base64 32` — **guardar cópia em local seguro** | S12 |
| Render | Conferir `NODE_ENV=production` e `CORS_ORIGIN` = URL do Pages | S3 |
| GitHub | Ativar Dependabot alerts e Code scanning (Settings → Code security) | S13 |

---

## Notas de implementação

### S1
- `npm audit fix` do npm 10.9 falha com `Cannot read properties of null (reading 'edgesOut')`; usar `npx -y npm@11 audit fix`.
- Backend: 0 vulnerabilidades. Frontend: 0 em produção (`--omit=dev`); restam `braces` e `postcss-selector-parser` via Tailwind 3 (só build/dev — corrigir exige Tailwind 4, fora do escopo).
- `react-router-dom` 6 → 7 (open redirect com barra invertida) e `vite` 5 → 6 (esbuild do dev server). Build e testes passaram sem mudança de código.

### S2
- Token leva `sv` (versão de sessão); tokens antigos sem `sv` valem como 0 e continuam aceitos até expirar, então o deploy não desloga ninguém.
- `verifySession` agora também confere se o usuário existe — base da exclusão de conta (S11).
- `LogoutDialog` (`frontend/src/components/auth/`) é usado no menu de perfil e no botão de sair do onboarding.

### S3
- **Pré-requisito em produção:** o frontend precisa estar chamando a API por `/api` (proxy). Se ainda estiver com `VITE_API_URL` apontando direto para o Render, o cookie Lax não é enviado (cross-site) e a CSP (`connect-src 'self'`) bloqueia a chamada — nesse caso definir `COOKIE_SAME_SITE=none` e incluir a URL do backend no `connect-src` até migrar.
- Verificado com `npm run build` (`VITE_API_URL=/api`) + `vite preview` (config `frontend-preview` no `launch.json`): CSP aplicada, iframe do Google Identity Services carrega, nenhuma violação no console.
- `_headers` não se aplica às respostas das Pages Functions (`/api/*`); essas levam os cabeçalhos do `helmet`.
- Origem (`Origin`) não é conferida no backend: com o proxy o navegador não faz CORS, então um `CORS_ORIGIN` desatualizado passaria despercebido e uma checagem de `Origin` derrubaria produção. O cabeçalho customizado já cobre.

### S4
- Não dá para confiar no `CF-Connecting-IP`/`X-Forwarded-For` que chega ao Render: o backend é público e qualquer um forja esses cabeçalhos chamando-o direto. Por isso o segredo compartilhado.
- **Sem `PROXY_SHARED_SECRET` configurado nos dois lados, todo tráfego via proxy aparece com IP do Cloudflare** — e o limite por IP da S5 passa a valer para todos juntos. Configurar antes do deploy (ver Ações de deploy).
- Não verificado em produção (exige deploy). Conferir depois no `audit_log`: o `ip` do `login` deve ser o IP público de quem entrou.

### S5
- Limitadores configurados em `backend/src/shared/middlewares/rate-limits.ts`. Importações compartilham um contador por tenant (pré-visualizar + confirmar = 2 chamadas), por isso 20 e não 10 como em D5.
- `globalIpLimiter` fica depois do `cors()`: um 429 sem cabeçalhos CORS apareceria no frontend como erro de rede.
- A CSP do helmet precisa de `useDefaults: false`, senão ele mistura as diretivas padrão (que liberam `https:` em estilo/fonte) com a nossa.
- Verificado com o backend local: sem `X-Requested-With` → 403; corpo de 2 MB em `/auth/google` → 413; JSON malformado → 400; 21ª tentativa de login no mesmo minuto → 429 com `retryAfterSeconds`; `/health` com `Content-Security-Policy: default-src 'none';frame-ancestors 'none'` e `X-Frame-Options: DENY`.

### S6
- Contas Gmail sempre vêm com `email_verified: true`; o caso real bloqueado é conta Google criada com e-mail de outro provedor sem confirmação.
- E-mail **não** foi normalizado para minúsculas: usuários existentes foram gravados como o Google mandou, e mudar a busca agora poderia criar um segundo tenant para a mesma pessoa.
- Testes simulam só a verificação do ID-token (`vi.mock('jose')` com passthrough para a sessão própria).

### S7
- Levantamento: todo acesso ao Mongo filtra por `tenantId` + `id` e o resto é filtrado em memória; nenhum `$where`/`$regex` com entrada do usuário. O risco real era o backup (gravado direto com qualquer campo) e o CSV (fórmula ao abrir no Excel).
- Campos conhecidos do backup ficaram opcionais (só `id` obrigatório) para aceitar backups antigos; campos desconhecidos só aceitam string/número/booleano/null — os legados que as migrações de boot leem são todos simples.
- Formulários comuns (`*.schemas.ts`) não têm limite de tamanho em descrição/observações; o limite de 1 MB do corpo (S5) cobre o abuso. Se quiser limites por campo, é ajuste de produto (quanto texto cabe numa descrição).
- Verificado no backend local: `{"idToken":{"$ne":null}}` em `/auth/google` → 400 `validation.unsafeInput`.
