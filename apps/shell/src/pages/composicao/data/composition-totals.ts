import type { CompositionTotalRow } from './dataverse'
import { moneyFields, type MoneyField } from './compositions'
import { decimal, decimalString } from '../formula'

export function matchesCompositionFilters(row: CompositionTotalRow, searchTerm: string, columnFilters: Record<string, string>) {
  if (searchTerm && !`${row.client} ${row.route}`.toLocaleLowerCase('pt-BR').includes(searchTerm)) return false
  return Object.entries(columnFilters).every(([id, value]) => String(
    id === 'client' ? row.client : id === 'route' ? row.route : id === 'date' ? row.departureAt : row.values[id as MoneyField],
  ) === value)
}

export function sumSelectedCompositions(rows: Pick<CompositionTotalRow, 'values'>[]) {
  return Object.fromEntries(moneyFields.map(({ key }) => [
    key,
    decimalString(rows.reduce((total, row) => total.plus(row.values[key]), decimal('0'))),
  ])) as Record<MoneyField, string>
}
