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
| Edição manual do draft | — | planejado (etapa do draft estruturado) |
| Turno de conversa com a IA | — | planejado (etapa da conversa) |
| Confirmação idempotente | — | planejado (etapa de aplicação) |

A resposta de status expõe apenas `status`, `language`, `createdAt` e
`updatedAt` — campos internos (chave de idempotência, resumo da conversa,
`appliedEntityIds`) não saem da API.

## Retomada

Estado e mensagens são persistidos por tenant; fechar o navegador não perde
nada. `GET /onboarding/conversation` + `GET /onboarding/draft` reconstroem a
tela ao voltar.

## Fluxo conversacional, draft e confirmação

Preenchidos nas etapas correspondentes (conversa, draft estruturado e
aplicação idempotente). Decisões já registradas: ADR 0003 (tools não escrevem
dados financeiros), ADR 0004 (draft + confirmação), ADR 0005 (idempotência).

## Limitações atuais

- Sem conversa com IA ainda — apenas estado, mensagens persistíveis e
  transições.
- Draft ainda é um contêiner vazio; schema completo entra na etapa do draft.
- Transferências recorrentes e objetivos financeiros estão fora da primeira
  versão (não existem no domínio atual).
