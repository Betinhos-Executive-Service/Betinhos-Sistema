import type { Column, Sort } from './types'

export const sameSort = (sort: Sort, column: Column) => sort != null && sort.attribute === column.attribute && sort.alias === column.alias

/**
 * Próximo estado ao clicar no cabeçalho. `sort` é a escolha do usuário (`null` = a ordem da própria visão, `fallback`).
 * Ciclo: primeira direção, a oposta, depois volta à ordem da visão. A primeira direção é crescente, exceto na coluna
 * que a visão já ordena de forma crescente (aí o primeiro clique inverte).
 */
export function nextSort(sort: Sort, fallback: Sort, column: Column): Sort {
  const firstDescending = sameSort(fallback, column) && fallback?.descending === false
  const to = (descending: boolean): Sort => ({ attribute: column.attribute, alias: column.alias, descending })
  if (!sameSort(sort, column)) return to(firstDescending)
  return sort?.descending === firstDescending ? to(!firstDescending) : null
}
