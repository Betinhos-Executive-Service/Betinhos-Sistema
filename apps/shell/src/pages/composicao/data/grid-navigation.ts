import { isWritableMoneyField, moneyFields, type MoneyField } from './compositions'
import type { ViewColumn } from './views'

export function nextEditableCell<T extends { id: string }>(rows: T[], columns: ViewColumn[], rowId: string, field: MoneyField, reverse = false): { row: T; field: MoneyField } | null {
  const fields = columns.flatMap(({ id }) => {
    const candidate = moneyFields.find(({ key }) => key === id)?.key
    return candidate && isWritableMoneyField(candidate) ? [candidate] : []
  })
  const rowIndex = rows.findIndex((row) => row.id === rowId)
  const fieldIndex = fields.indexOf(field)
  if (rowIndex < 0 || fieldIndex < 0 || !fields.length) return null
  const total = rows.length * fields.length
  const next = (rowIndex * fields.length + fieldIndex + (reverse ? -1 : 1) + total) % total
  return { row: rows[Math.floor(next / fields.length)], field: fields[next % fields.length] }
}
