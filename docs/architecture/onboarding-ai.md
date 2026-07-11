# Onboarding conversacional — Arquitetura

> Documento vivo. Criado na etapa de estado/persistência; seções de conversa,
> draft e confirmação são preenchidas nas etapas que as implementam.

## Jornada do usuário

1. Novo usuário faz login (Google/Apple). O `OnboardingGate`
   (`frontend/src/components/onboarding/OnboardingGate.tsx`, montado dentro do
   `ProtectedRoute`) consulta `GET /onboarding/status` e redireciona para
   `/onboarding` (rota fora do Layout, sem sidebar) enquanto o status estiver
   em aberto (`PENDING`/`IN_PROGRESS`/`AWAITING_CONFIRMATION`). Tenants
   pré-existentes recebem `COMPLETED_MANUAL` retroativo no backend e nunca são
   redirecionados.
2. A página de entrada (`pages/Onboarding/Onboarding.tsx`) oferece três
   caminhos, com aviso explícito de que a IA pode cometer erros:
   - **Configurar com assistente** — chat com a IA
     (`pages/Onboarding/components/OnboardingChat.tsx`): histórico persistido
     (retomada automática), mensagem otimista + indicador de digitação, falha
     mantém a mensagem com botão de reenviar (o backend só persiste turnos
     concluídos, então o reenvio é seguro), textarea com limite de 2000
     caracteres e contador, Enter envia/Shift+Enter quebra linha, `role="log"`
     + `aria-live` para leitores de tela, conteúdo da IA renderizado sempre
     como texto puro (nunca HTML — coberto por teste de XSS), aviso permanente
     de que a IA pode errar e CTA de configuração manual no cabeçalho. Quando o
     status vira `AWAITING_CONFIRMATION`, um cartão sinaliza que a proposta
     está pronta para revisão;
   - **Configurar manualmente** — `POST /onboarding/skip` e segue para as telas
     de configuração existentes;
   - **Responder depois** — flag em `sessionStorage` suprime o gate na sessão;
     um banner no dashboard (`OnboardingBanner`) lembra o usuário de concluir.
3. A conversa produz um draft estruturado (ADR 0004), revisável e editável.
4. A confirmação explícita aplica o draft via services existentes, de forma
   idempotente (ADR 0005), e o status vira `COMPLETED`.
5. Quem concluiu a configuração por fora marca `POST /onboarding/complete-manual`.

**Usuários/tenants pré-existentes**: na primeira consulta de status, um tenant
que já possui contas recebe `COMPLETED_MANUAL` retroativo — o onboarding é
exclusivo para tenants vazios (decisão conservadora da primeira versão).

## Estados do onboarding

Enum `OnboardingStatus`
(`backend/src/modules/onboarding/onboarding.types.ts`):

| Status | Significado |
|---|---|
| `PENDING` | Tenant novo; ainda não escolheu como configurar |
| `IN_PROGRESS` | Conversa com o assistente iniciada |
| `AWAITING_CONFIRMATION` | Draft apresentado; aguardando revisão/confirmação |
| `COMPLETED` | Draft confirmado e aplicado pelo backend |
| `SKIPPED` | Assistente dispensado; configuração manual em andamento |
| `COMPLETED_MANUAL` | Configuração concluída fora do assistente (inclui tenants pré-existentes) |

Transições válidas (tudo fora disso responde `409` com código i18n
`onboarding.invalidTransition`):

```
PENDING ──────────────► IN_PROGRESS ─────► AWAITING_CONFIRMATION ──► COMPLETED
   │                        │   ▲                   │
   │                        │   └───────────────────┘  (voltar ao chat)
   ├──► SKIPPED ◄───────────┤◄──────────────────────┘
   │       │
   └──────►└──► COMPLETED_MANUAL
(COMPLETED e COMPLETED_MANUAL são finais)
```

## Modelo de dados

Coleções novas, ambas via `MongoStore` (isolamento por `tenantId` garantido na
camada de persistência):

- **`onboarding_states`** — singleton por tenant (`OnboardingState`): status,
  `draft` (contêiner por seção: tipos de conta, contas, categorias, receitas,
  despesas, cartões, settings), `conversationSummary`, `language`,
  `appliedEntityIds` (draftItemId → id real, ADR 0005),
  `confirmIdempotencyKey`, `appliedAt`.
- **`onboarding_messages`** — mensagens exibíveis da conversa
  (`OnboardingMessage`): `role` USER/ASSISTANT, `content`, `turn`, `status`
  OK/FAILED/CANCELED. Tool calls/results **não** são persistidos: o que importa
  deles fica refletido no draft.

## Endpoints

Montados em `/onboarding` **após** o `authMiddleware`
(`backend/src/modules/onboarding/onboarding.routes.ts`):

| Endpoint | Função | Status |
|---|---|---|
| `GET /onboarding/status` | Status atual (cria estado sob demanda; aplica a heurística de tenant pré-existente) | implementado |
| `POST /onboarding/skip` | Dispensa o assistente (→ `SKIPPED`) | implementado |
| `POST /onboarding/complete-manual` | Marca configuração manual concluída (→ `COMPLETED_MANUAL`) | implementado |
| `GET /onboarding/conversation` | Mensagens da conversa (retomada) | implementado |
| `GET /onboarding/draft` | Draft atual | implementado |
| `POST /onboarding/draft/items` | Adiciona item ao draft (`{ section, payload }`) | implementado |
| `PUT /onboarding/draft/items/:draftItemId` | Edita item (patch mesclado + revalidação completa) | implementado |
| `DELETE /onboarding/draft/items/:draftItemId` | Remove item (bloqueado se referenciado) | implementado |
| `POST /onboarding/messages` | Turno de conversa com a IA (`{ message, language? }`; retorna mensagem do assistente, status, draft e `summaryPresented`) | implementado |
| `POST /onboarding/confirm` | Aplica o draft (`{ idempotencyKey }`, UUID por tentativa) e conclui (→ `COMPLETED`) | implementado |

A resposta de status expõe apenas `status`, `language`, `createdAt` e
`updatedAt` — campos internos (chave de idempotência, resumo da conversa,
`appliedEntityIds`) não saem da API.

## Retomada

Estado e mensagens são persistidos por tenant; fechar o navegador não perde
nada. `GET /onboarding/conversation` + `GET /onboarding/draft` reconstroem a
tela ao voltar.

## Draft estruturado

Implementado em `onboarding.schemas.ts` (payloads Zod) e
`onboarding-draft.service.ts` (mutações + validações cruzadas).

**Seções**: `accountTypes`, `accounts`, `categories`, `incomes`, `expenses`,
`creditCards`, `settings` (singleton — nova proposta substitui a anterior).

**Identificadores e refs simbólicas**: cada item recebe `draftItemId` legível e
sequencial por seção (`atype_1`, `acc_1`, `cat_2`, `inc_1`, `exp_1`, `card_1`,
`settings`). Esse id é ao mesmo tempo a **ref simbólica** usada entre itens
(ex.: `income.incomeCategoryRef = 'cat_1'`) e o **identificador estável da
idempotência** (ADR 0005). Números não são reutilizados após remoção. Refs são
resolvidas para UUIDs reais somente na aplicação do draft.

**Payloads** espelham os schemas de criação dos módulos financeiros: valores
monetários em centavos inteiros (`initialBalance`, `grossAmount`, `amount`,
`limit`, `minimumMainBalance`, `annualRevenueLimit`), dias recorrentes 1–28
(`dayOfMonth`, `closingDay`, `dueDay`), `recurrence` UNIQUE/FIXED (default
FIXED no onboarding), percentual de reserva 0–100. `account.isMain` vira
`settings.mainAccountId` na aplicação. `settings.controlScope`
(PERSONAL/BUSINESS/BOTH) orienta o assistente e a derivação de
`pjLimitControlEnabled`.

**Validações cruzadas** (rodam em toda mutação, sobre o draft inteiro):
- refs existem e apontam para a seção correta; refs de categoria checam o tipo
  (receita → INCOME, despesa → EXPENSE);
- no máximo uma conta `isMain`;
- nomes únicos (case-insensitive) em `accountTypes`, `accounts`, `categories`
  e `creditCards`;
- remoção bloqueada enquanto houver referências ao item
  (`onboarding.draft.refInUse`).

**Estados editáveis**: `PENDING`, `IN_PROGRESS`, `AWAITING_CONFIRMATION` —
fora disso, `409 onboarding.draft.locked`. Itens carregam `source: 'ai' | 'user'`;
a UI de revisão edita como `user`, as tools da IA proporão como `ai`.

**Códigos de erro**: `onboarding.draft.itemNotFound` (404),
`onboarding.draft.invalidRef` (400), `onboarding.draft.duplicateName`,
`onboarding.draft.mainAccountDuplicate`, `onboarding.draft.refInUse`,
`onboarding.draft.locked` (409); payloads inválidos caem no `validation.generic`
do errorHandler (ZodError).

## Tools do onboarding

Conjunto fechado registrado em `onboarding-tools.ts` — detalhado em
[tool-calling.md](tool-calling.md). Todas operam apenas sobre contexto de
leitura e draft; `present_setup_summary` é o gatilho da transição
`IN_PROGRESS → AWAITING_CONFIRMATION`.

## Fluxo conversacional

Implementado em `onboarding-conversation.service.ts` (montagem do contexto em
[ai-context.md](ai-context.md)):

1. `POST /onboarding/messages` valida a mensagem (≤ 2000 chars) e o idioma.
2. Primeiro turno transiciona `PENDING → IN_PROGRESS` e persiste o idioma;
   vindo da revisão, `AWAITING_CONFIRMATION → IN_PROGRESS`. Status finais
   respondem `409 onboarding.conversation.closed`.
3. O serviço monta system prompt + contexto + janela de histórico e roda o
   loop de tool calls (orçamento `AI_MAX_TOOL_ROUNDS`); erros de tool voltam ao
   modelo para autocorreção.
4. `present_setup_summary` transiciona para `AWAITING_CONFIRMATION` e a
   resposta marca `summaryPresented: true` — gatilho da tela de revisão.
5. Mensagens (usuário + assistente, mesmo `turn`) são persistidas **somente ao
   fim do turno bem-sucedido**: falha do provedor não corrompe a conversa e o
   frontend pode reenviar a mesma mensagem.

**Limites**: 60 turnos por conversa (`429 onboarding.conversation.turnLimit`),
timeout `AI_REQUEST_TIMEOUT_MS` por chamada ao provedor.

**Limitação conhecida**: se o provedor falhar no meio de um turno com várias
rodadas de tools, propostas das rodadas anteriores permanecem no draft (sem
mensagens correspondentes). Inócuo por design — o draft é visível e editável
na revisão.

## Confirmação e aplicação (ADR 0004 + ADR 0005)

Implementado em `onboarding-apply.service.ts` (`POST /onboarding/confirm`):

1. **Pré-condições**: status `AWAITING_CONFIRMATION`; lock em memória bloqueia
   confirmação concorrente do mesmo tenant (`onboarding.confirm.inProgress`).
2. **Validação final**: draft com ≥ 1 conta (`emptyDraft`), exatamente uma
   conta principal (`mainAccountRequired`), todas as refs resolvíveis — antes
   de qualquer escrita.
3. **Execução ordenada** reusando exclusivamente os services existentes:
   tipos de conta → contas → categorias → settings (recebe `mainAccountId`) →
   cartões → receitas (refs de reserva/categoria/destino resolvidas para UUIDs
   reais) → despesas. Datas-âncora de recorrência = dia informado no mês
   corrente (`ensureFixedOccurrences` materializa o restante).
4. **Idempotência**: `appliedEntityIds` (draftItemId → id real) persistido
   **após cada criação**; itens já aplicados são pulados na retomada. Entidade
   existente com o mesmo nome é **reusada**, nunca duplicada (cobre a categoria
   protegida "Nota Fiscal" criada pelo `SettingsService`).
5. **Chaves**: mesma `idempotencyKey` após conclusão → replay do resultado
   (`alreadyApplied: true`); chave nova após conclusão → `409
   onboarding.confirm.alreadyCompleted`. Após falha parcial, qualquer chave
   nova retoma do ponto em que parou.
6. Ao final: status `COMPLETED`, `appliedAt` registrado.

## Limitações atuais
- Sem streaming — resposta única por turno.
- Transferências recorrentes e objetivos financeiros estão fora da primeira
  versão (não existem no domínio atual).
