import type { CompositionTotalRow } from './dataverse'
import { moneyFields, type Composition, type MoneyField } from './compositions'
import { matchesKeywords, moneyToken } from '../../../app/keywordSearch'
import { decimal, decimalString } from '../formula'

type SearchableRow = CompositionTotalRow & Partial<Pick<Composition, 'departureAddress' | 'destination' | 'status'>>

/** Busca do modo local: os mesmos tokens do servidor sobre os campos que o mock tem (texto, status e dinheiro por valor exato). */
function matchesSearch(row: SearchableRow, tokens: string[]) {
  const money = Object.values(row.values)
  return tokens.every((token) => {
    const amount = moneyToken(token)
    return matchesKeywords([token], [row.client, row.route, row.departureAddress ?? '', row.destination ?? '', row.status ?? '']) || amount !== null && money.some((value) => Number(value) === Number(amount))
  })
}

export function matchesCompositionFilters(row: SearchableRow, searchTokens: string[], columnFilters: Record<string, string>) {
  if (searchTokens.length && !matchesSearch(row, searchTokens)) return false
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
