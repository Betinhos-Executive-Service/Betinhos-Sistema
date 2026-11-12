import type { CatalogField } from './views'

export const numericFieldTypes = new Set(['Money', 'Decimal', 'Double', 'Integer', 'BigInt'])

/** A mesma entrada pt-BR aceita pelo editor monetário da composição. */
export function gridNumberInput(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, '').replace(/^R\$/, '').replace(/\./g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized)) ? normalized : null
}

export function gridFieldDraft(field: CatalogField, value: unknown, behavior = 'UserLocal'): string {
  if (value === null || value === undefined) return ''
  if (numericFieldTypes.has(field.type)) return String(value).replace('.', ',')
  if (field.type !== 'DateTime') return String(value)
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  if (behavior !== 'UserLocal') return String(value).replace(/Z$/, '').slice(0, 16)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function gridFieldValue(field: CatalogField, draft: string, behavior = 'UserLocal', dateOnly = false): unknown {
  if (!draft.trim()) return null
  if (field.type === 'Uniqueidentifier') {
    const guid = draft.trim().replace(/^\{(.*)\}$/, '$1')
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(guid)) throw new Error('Informe um identificador válido.')
    return guid.toLowerCase()
  }
  if (numericFieldTypes.has(field.type)) {
    const number = gridNumberInput(draft)
    if (number === null || (['Integer', 'BigInt'].includes(field.type) && !Number.isSafeInteger(Number(number)))) throw new Error('Informe um número válido.')
    return Number(number)
  }
  if (field.type === 'DateTime') {
    if (!/^(?!0000)\d{4}-/.test(draft) || Number.isNaN(Date.parse(draft))) throw new Error('Informe uma data válida com ano de quatro dígitos.')
    return dateOnly ? `${draft.slice(0, 10)}T00:00:00Z` : behavior === 'UserLocal' ? new Date(draft).toISOString() : `${draft.slice(0, 16)}:00Z`
  }
  return draft
}
