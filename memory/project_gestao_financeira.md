---
name: project-gestao-financeira
description: Contexto do projeto de gestão financeira pessoal/PJ em desenvolvimento
metadata:
  type: project
---

Aplicação de controle financeiro pessoal/PJ sendo desenvolvida em entregas incrementais.

**Why:** Substituir planilha com melhor usabilidade, automação e visibilidade.

**Stack:** Backend Node.js+TS+Express+Zod (porta 3001), Frontend React+Vite+TS+TailwindCSS (porta 3000).

**Persistência:** Arquivos JSON em `backend/data/` (MVP), estruturado para migração futura ao MongoDB via interfaces de repositório.

**Entrega 1 concluída:** Setup inicial — backend com `/health`, JsonFileStore, utilitários; frontend com layout, menu lateral, 5 páginas stub.

**Próximas entregas:** 2 = Models/Types/Seed; 3 = CRUD Contas/Categorias/Config; 4 = Recebimentos; 5 = Fluxo de Caixa; 6 = Cartões; 7 = Dashboard endpoint; 8-13 = Frontend de cada tela.

**How to apply:** Cada entrega deve ser validada pelo usuário antes de continuar para a próxima.
