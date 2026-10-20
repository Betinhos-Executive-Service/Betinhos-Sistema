import { matchesFilters, todaySaoPaulo, type FilterField, type TableFilters } from '@betinhos/ui'

/**
 * Linhas que passam nos filtros da visão, na ordem em que vieram. Sem filtro nenhum devolve a própria lista; com
 * filtro, calcula "hoje" uma vez (o `matchesFilters` criaria um formatador de data por linha: ~200 ms em 5.000 linhas).
 */
export function filterRows<Row>(rows: Row[], filters: TableFilters, fields: FilterField[], read: (row: Row, key: string) => unknown): Row[] {
  if (!Object.keys(filters.quick).length && !filters.advanced.items.length) return rows
  const today = todaySaoPaulo()
  return rows.filter((row) => matchesFilters(row, filters, fields, read, today))
}
