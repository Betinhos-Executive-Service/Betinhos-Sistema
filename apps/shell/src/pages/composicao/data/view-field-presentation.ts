import type { CatalogField } from './views'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const guidPattern = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i

export function formatViewDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : `${dateFormat.format(date)} ${timeFormat.format(date)}`
}

export function booleanPresentation(value: unknown, formatted?: unknown) {
  const active = value === true || value === 1 || value === 'true' || value === '1'
  return { active, label: typeof formatted === 'string' && formatted.trim() ? formatted : active ? 'Sim' : 'Não' }
}

/**
 * Texto puro de uma célula da visão, como a `ViewFieldCell` mostra lookups, escolhas, booleanos e datas (para o Excel):
 * o texto formatado do Dataverse primeiro; booleano sem ele vira Sim/Não e data, dd/mm/aaaa hh:mm.
 */
export function viewFieldText(field: CatalogField | undefined, value: unknown, formatted: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (field?.type === 'Boolean') return booleanPresentation(value, formatted).label
  if (typeof formatted === 'string' && formatted) return formatted
  if (field?.type === 'DateTime') return formatViewDate(String(value))
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function isPrimaryField(field: CatalogField): boolean {
  return field.attribute === field.primaryNameAttribute || field.attribute === field.primaryIdAttribute
}

export function primaryRecordId(field: CatalogField, viewFields: Record<string, unknown> | undefined, valueKey: string, baseRecordId?: string): string | null {
  if (!isPrimaryField(field)) return null
  if (!field.path.length) return typeof baseRecordId === 'string' && guidPattern.test(baseRecordId) ? baseRecordId.replace(/[{}]/g, '') : null
  const primaryId = field.primaryIdAttribute ?? field.relationships?.at(-1)?.from
  if (!primaryId || !viewFields) return null
  const prefix = valueKey.slice(0, valueKey.lastIndexOf('.') + 1)
  const value = viewFields[`${prefix}${primaryId}`]
  return typeof value === 'string' && guidPattern.test(value) ? value.replace(/[{}]/g, '') : null
}
