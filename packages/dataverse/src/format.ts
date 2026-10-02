import type { Row } from './client'

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

/** Valor formatado (choice, lookup, data, moeda) devolvido pelo Dataverse; cai no valor cru. */
export function formatted(row: Row, field: string): string {
  const value = row[`${field}${FORMATTED}`] ?? row[field]
  return value == null ? '' : String(value)
}

/** Divide IDs em blocos para não estourar o limite de URL do OData. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('size deve ser >= 1')
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

export function odataString(value: string) {
  return value.replace(/'/g, "''")
}
