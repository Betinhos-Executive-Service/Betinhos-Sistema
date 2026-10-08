import { formatted, type Row } from '@betinhos/dataverse'
import type { CellKind } from './types'

export const TZ = 'America/Sao_Paulo'
const OFFSET = '-03:00'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

// Intl usa U+00A0 entre "R$" e o número; normalizado para espaço comum (contrato do teste).
export const formatMoney = (value: number | null) => (value == null ? '—' : money.format(value).replace(/ /g, ' '))

export function parseMoney(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, '')
  if (!clean) return null
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const parseIso = (iso: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d }

export function formatDateTime(iso: string | null) {
  const d = parseIso(iso)
  return d ? dateTime.format(d).replace(',', '') : '—'
}

/** `YYYY-MM-DDTHH:mm` no horário de São Paulo, para `input type="datetime-local"`. */
export function toDateTimeLocal(iso: string | null) {
  const d = parseIso(iso)
  if (!d) return ''
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}

export function fromDateTimeLocal(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  const d = new Date(`${local}:00${OFFSET}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function formatCell(kind: CellKind, row: Row, key: string) {
  const raw = row[key]
  if (raw == null || raw === '') return '—'
  if (kind === 'datetime') return formatDateTime(String(raw))
  if (kind === 'money') return typeof raw === 'number' ? formatMoney(raw) : formatted(row, key)
  return formatted(row, key) || '—'
}
