import { booleanPresentation, formatViewDate, isPrimaryField, primaryRecordId } from '../data/view-field-presentation'
import { openGridRecord } from '../data/record-navigation'
import { readLookupTarget } from '../data/view-field-read'
import type { CatalogField } from '../data/views'
import type { ReactNode } from 'react'
import { SearchHighlight } from '../../../app/SearchHighlight'
import { cardEventGuard, CopyText } from './CopyText'

export { EditableViewFieldCell } from './EditableViewFieldCell'
export type ViewFieldCellProps = { field: CatalogField; value: unknown; formatted?: unknown; viewFields?: Record<string, unknown>; valueKey: string; baseRecordId: string; display?: ReactNode }
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 20 })

export function ViewFieldCell({ field, value, formatted, viewFields, valueKey, baseRecordId }: ViewFieldCellProps) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (field.type === 'Money') return <SearchHighlight text={currency.format(Number(value))} />
  if (['Decimal', 'Double', 'Integer', 'BigInt'].includes(field.type)) return <SearchHighlight text={number.format(Number(value))} />
  if (field.type === 'Lookup' && typeof formatted === 'string' && formatted) {
    const target = readLookupTarget(viewFields, valueKey, value)
    if (!target) return <SearchHighlight text={formatted} />
    return <button type="button" className="lookup-link grid-lookup-link" title={formatted} aria-label={`Abrir ${field.label}: ${formatted}`} onClick={() => { void openGridRecord(target.table, target.id) }}><SearchHighlight text={formatted} /></button>
  }
  if (field.type === 'Boolean') {
    const presentation = booleanPresentation(value, formatted)
    return <span className={`grid-boolean-badge${presentation.active ? ' grid-boolean-badge--true' : ''}`} title={presentation.label}>{presentation.label}</span>
  }
  if (field.type === 'DateTime') return <span className="grid-date-value" title={String(value)}>{typeof formatted === 'string' && formatted ? formatted : formatViewDate(String(value))}</span>
  if (isPrimaryField(field)) {
    const recordId = primaryRecordId(field, viewFields, valueKey, baseRecordId)
    if (recordId) return <span className="lookup-preview grid-related-preview">
      <button type="button" className="lookup-link grid-related-link" aria-label={`Abrir ${field.tableLabel ?? field.table}: ${value}`} onClick={() => { void openGridRecord(field.table, recordId) }}><SearchHighlight text={String(value)} /></button>
      <span className="lookup-preview__card" role="tooltip" {...cardEventGuard}><strong><CopyText text={String(value)} /></strong><span className="lookup-preview__detail"><span>Tabela</span><span>{field.tableLabel ?? field.table}</span></span></span>
    </span>
  }
  if (['Picklist', 'Status', 'State'].includes(field.type) && typeof formatted === 'string') return <SearchHighlight text={formatted} />
  if (typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim())) return <a className="lookup-link grid-related-link" href={value.trim()} target="_blank" rel="noopener noreferrer" title={value}><SearchHighlight text={value} /></a>
  return <SearchHighlight text={String(value)} />
}
