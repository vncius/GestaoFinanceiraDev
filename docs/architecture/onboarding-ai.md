# Onboarding conversacional — Arquitetura

> Documento vivo. Criado na etapa de estado/persistência; seções de conversa,
> draft e confirmação são preenchidas nas etapas que as implementam.

## Jornada do usuário

1. Novo usuário faz login (Google/Apple) e a aplicação consulta
   `GET /onboarding/status`.
2. Com status `PENDING`, o frontend oferece três caminhos:
   - **Configurar com assistente** — conversa com a IA (etapas futuras);
   - **Configurar manualmente** — `POST /onboarding/skip` e segue para as telas
     de configuração existentes;
   - **Responder depois** — permanece `PENDING`; a aplicação segue utilizável e
     lembra o usuário depois.
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
| Turno de conversa com a IA | — | planejado (etapa da conversa) |
| Confirmação idempotente | — | planejado (etapa de aplicação) |

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

## Fluxo conversacional e confirmação

Preenchidos nas etapas correspondentes (conversa e aplicação idempotente).
Decisões já registradas: ADR 0003 (tools não escrevem dados financeiros),
ADR 0004 (draft + confirmação), ADR 0005 (idempotência).

## Limitações atuais

- Sem conversa com IA ainda — estado, draft editável e transições.
- Transferências recorrentes e objetivos financeiros estão fora da primeira
  versão (não existem no domínio atual).
