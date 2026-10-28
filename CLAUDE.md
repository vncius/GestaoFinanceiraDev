# CLAUDE.md

## Planos

- **Segurança e LGPD** — [`docs/plano-seguranca.md`](docs/plano-seguranca.md) (S1–S15 concluídas; relatório de 2026-10-15 em [`docs/relatorio-seguranca-2026-10-15.md`](docs/relatorio-seguranca-2026-10-15.md); restam as **Ações de deploy**, feitas fora do código).
- **Simplificação da UX** — [`docs/plano-simplificacao-ux.md`](docs/plano-simplificacao-ux.md) (U1–U21 concluídas).

Ao pedir para "continuar o plano", "seguir para a próxima etapa" ou citar uma entrega (S1…, U1…): leia o plano inteiro e siga a seção **Como continuar**. O plano é a fonte de verdade do andamento: atualize a tabela **Status** e as **Notas de implementação** ao concluir cada entrega.

- **Imposto sobre NF ("Imposto a pagar")** — [`docs/plano-imposto-nf.md`](docs/plano-imposto-nf.md) (I0–I9; execução em chats separados, ver seção 7 do plano).
- **Relatório do extrato (Excel e PDF)** — [`docs/plano-relatorio-extrato.md`](docs/plano-relatorio-extrato.md) (R0–R5; execução em chats separados, ver seção 7 do plano).

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
- Segurança: toda requisição que altera dados precisa do cabeçalho `X-Requested-With` (já no `api.ts`); campos de texto livre novos com dado pessoal entram em `encryptedFields` do repositório **e** em `ENCRYPTED_FIELDS` (`backend/src/shared/migrations/migrate-encrypt-fields.ts`); campo criptografado nunca pode ser usado em filtro do Mongo.
