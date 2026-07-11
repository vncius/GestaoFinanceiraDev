# ADR 0005: Idempotência na confirmação do onboarding

- **Status**: Aceito
- **Data**: 2026-07-10

## Contexto

A confirmação do onboarding (`ADR 0004`) cria múltiplas entidades em sequência
(tipos de conta → contas → categorias → configurações → cartões → receitas →
despesas) reusando os services existentes. O backend hoje **não usa transações
MongoDB** (nenhum `startSession`/`withTransaction` no código; escritas
multi-documento são sequenciais) e os endpoints existentes não são
idempotentes.

## Problema

Uma falha no meio da aplicação do draft (queda do processo, erro de validação
tardio, timeout de rede com retry do cliente) pode deixar a configuração pela
metade e, pior, **duplicar entidades** se a confirmação for repetida.

## Decisão

Tornar a confirmação **idempotente e retomável**, sem depender de transação:

1. **Chave de idempotência por confirmação**: o frontend envia um
   `idempotencyKey` (UUID por tentativa de confirmação). Se o estado do
   onboarding já registra essa chave com aplicação concluída, o backend retorna
   o resultado anterior sem reexecutar.
2. **Identificador estável por item** (`draftItemId`) e **mapa
   `appliedEntityIds: { draftItemId → entityId }`** persistido no estado do
   onboarding, atualizado após cada criação bem-sucedida.
3. **Execução ordenada** (tipos de conta → contas → categorias → configurações
   → cartões → receitas → despesas), pulando itens que já constam em
   `appliedEntityIds` — repetir a confirmação após falha parcial completa
   somente o que falta, sem duplicar.
4. **Validação de estado antes de aplicar** (status precisa permitir
   confirmação) e **bloqueio de confirmação concorrente** para o mesmo tenant.
5. Ao final, status muda para `completed` e o resultado é registrado.

## Alternativas consideradas

- **Transação MongoDB (`withTransaction`)**: o Atlas suporta, mas o projeto não
  tem infraestrutura de sessões no `MongoStore` e nenhum outro fluxo usa
  transação; introduzir isso agora ampliaria o escopo e não eliminaria a
  necessidade de idempotência (o retry do cliente continua existindo). Fica
  como evolução futura — o desenho com `appliedEntityIds` continua válido com
  transação por baixo.
- **Aplicar sem controle e limpar duplicatas depois**: inaceitável em dados
  financeiros.
- **Tornar todos os endpoints de criação idempotentes individualmente**:
  mudança invasiva nos módulos existentes; o controle no orquestrador do
  onboarding é localizado e suficiente.

## Consequências

- Repetir a confirmação (mesma chave ou nova, após falha parcial) nunca
  duplica entidades.
- Falha parcial é retomável: o usuário reconfirma e a aplicação completa o
  restante.
- O estado do onboarding carrega o histórico do que foi criado
  (`appliedEntityIds`), útil para auditoria e depuração.

## Limitações

- Sem transação real, existe janela em que a configuração está parcialmente
  aplicada (invisível na prática: a retomada completa o restante na
  reconfirmação; entidades criadas são válidas individualmente, pois passam
  pelos services existentes).
- O bloqueio de concorrência é por processo (backend single-process hoje);
  deploy multi-instância exigiria lock distribuído — documentado como risco
  conhecido.
- A idempotência cobre a confirmação do onboarding; não altera os demais
  endpoints da aplicação.
