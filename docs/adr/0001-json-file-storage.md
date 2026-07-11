# ADR 0001: Persistência em arquivos JSON em vez de banco de dados

- **Status**: Superado — a aplicação migrou para MongoDB Atlas (commits
  `f5b17f1`/`3d30e93`, que também adicionaram autenticação Google/Apple e
  isolamento por tenant). Este documento é mantido como registro histórico da
  decisão original; a persistência atual usa `MongoStore<T>`
  (`backend/src/shared/persistence/mongo-store.ts`), não mais
  `JsonFileStore<T>`. Ver `README.md` para a stack atual.
- **Data**: registrado retroativamente — a decisão já estava implementada quando este documento foi escrito; não havia registro formal do porquê.

## Contexto

O sistema é um controle financeiro pessoal/PJ de uso individual: um único usuário, um único processo backend, sem necessidade de acesso concorrente multi-usuário nem de rodar em múltiplas instâncias. O volume de dados é o de uma pessoa/empresa pequena controlando o próprio fluxo de caixa manualmente — não um sistema multi-tenant.

## Decisão

Cada entidade (contas, categorias, lançamentos, recebíveis, cartões, parcelas, faturas, configurações) é persistida em um arquivo JSON próprio dentro de `backend/data/`, gerenciado por `JsonFileStore<T>` (`backend/src/shared/persistence/json-file-store.ts`). Toda leitura desserializa o arquivo inteiro; toda escrita serializa a lista inteira de volta.

Não há schema de banco, não há SQL, não há ORM. Zod valida o formato dos dados na borda (request), não a persistência.

## Alternativas consideradas

- **SQLite**: teria dado transações reais, índices e queries, sem exigir um servidor de banco separado (arquivo único, como o JSON atual). É provavelmente a alternativa mais próxima em termos de simplicidade operacional.
- **Postgres/outro RDBMS gerenciado**: exigiria um processo/serviço adicional para rodar localmente, desproporcional para uso de um único usuário.

## Consequências

**A favor:**
- Zero setup: `npm install` + `npm run dev` já funciona, sem instalar/configurar um banco.
- Dado é diretamente inspecionável/editável como JSON (útil em desenvolvimento).
- Modelo mental simples: cada repositório é só um array de objetos.

**Contra (trade-offs conhecidos):**
- **Sem transações reais.** Operações que tocam múltiplas entidades (ex.: pagar uma fatura de cartão cria uma `FinancialTransaction` e depois atualiza a `CreditCardInvoice`) não são atômicas entre si — se o processo cair entre as duas escritas, o estado fica inconsistente. `JsonFileStore` só garante atomicidade *por arquivo* (escrita via arquivo temporário + rename, serializada por um lock em memória — ver `withFileLock`), não entre arquivos.
- **Sem segurança multi-processo.** O lock de escrita (`withFileLock`) só serializa chamadas dentro do mesmo processo Node. Rodar duas instâncias do backend contra a mesma pasta `data/` pode causar leitura-modificação-escrita perdida (lost update).
- **Custo de escrita cresce com o tamanho do arquivo.** Cada `create`/`update`/`delete` reescreve o array inteiro. Hoje (~150KB no maior arquivo, `financial-transactions.json`) isso é imperceptível; não escala indefinidamente.
- **Sem índices/queries.** Todo filtro (`findByMonth`, `findByOrigin`, etc.) é um `.filter()` em memória sobre o array completo, carregado do disco a cada chamada.
- **Sem backup automático.** `backend/data/` está fora do controle de versão (`.gitignore`); não existe nenhum mecanismo de export/backup hoje. Ver risco relacionado em itens de produto (fora do escopo deste ADR).

## Quando revisitar

Se o sistema deixar de ser single-user/single-process — por exemplo, virar multi-usuário, precisar rodar em mais de uma instância, ou o volume de lançamentos crescer a ponto do custo de reescrever o arquivo inteiro a cada operação se tornar perceptível — vale migrar para SQLite como primeiro passo (menor mudança operacional, ainda um arquivo único, mas com transações e índices reais).
