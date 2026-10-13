# CLAUDE.md

## Plano em andamento

**Simplificação da UX** — [`docs/plano-simplificacao-ux.md`](docs/plano-simplificacao-ux.md).

Ao pedir para "continuar o plano", "seguir para a próxima etapa" ou citar uma entrega (U1, U2, …): leia o plano inteiro e siga a seção **Como continuar**. O plano é a fonte de verdade do andamento: atualize a tabela **Status** e as **Notas de implementação** ao concluir cada entrega.

## Backlog

Ideias para depois (fora do plano atual): [`docs/backlog.md`](docs/backlog.md).

## Comandos

- Frontend: `cd frontend && npm run build` (inclui `tsc`) · `npm test`
- Backend: `cd backend && npm run typecheck` · `npm test`
- Dev servers: `.claude/launch.json` (`backend` :3100, `frontend` :3101)

## Convenções

- Textos de UI sempre nos três idiomas: `frontend/src/locales/{pt,en,es}/`.
- Valores monetários em centavos (inteiros).
- Registrar mudanças em `CHANGELOG.md` (`[Unreleased]`).
