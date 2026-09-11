// O backend devolve contas, categorias, tipos e cartões na ordem de inserção
// (Mongo sem sort). Toda combo/lista de escolha da aplicação ordena aqui, no
// front, para o usuário encontrar o item pelo nome sem depender da ordem em
// que cadastrou.
//
// `sensitivity: 'base'` ignora acento e caixa ("Água" fica junto de "Aluguel");
// `numeric` mantém "Cartão 2" antes de "Cartão 10".
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareNames(a.name, b.name));
}
