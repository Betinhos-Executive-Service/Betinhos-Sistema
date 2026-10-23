const TIME_ZONE = 'America/Sao_Paulo'
const isoDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

const horaFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })

/** Hora (HH:mm) de um instante no fuso de São Paulo. */
export function horaSP(iso: string) {
  return horaFormat.format(new Date(iso))
}

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function todaySP(now = new Date()) {
  return isoDayFormat.format(now)
}

/**
 * Normaliza um valor de data do Dataverse para YYYY-MM-DD conforme o comportamento da coluna.
 * DateOnly chega como "2026-03-03"; TimeZoneIndependent chega como "2024-02-01T00:00:00Z" e vale
 * o dia literal; UserLocal chega em UTC ("...T03:00:00Z") e é convertido para o dia de São Paulo.
 */
export function toDateOnly(value: unknown, behavior: 'DateOnly' | 'UserLocal' | 'TimeZoneIndependent' = 'UserLocal'): string | null {
  if (typeof value !== 'string' || !value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (behavior !== 'UserLocal' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : todaySP(date)
}

function toUtc(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function daysBetween(from: string, to: string) {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000)
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = total % 12
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, daysInMonth(year, month)))}`
}

export function formatBR(day: string | null | undefined) {
  if (!day) return ''
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

/** Valor para gravar: DateOnly aceita YYYY-MM-DD; TimeZoneIndependent grava o dia literal; UserLocal recebe meia-noite de São Paulo em UTC. */
export function toDataverseDate(day: string | null, behavior: 'DateOnly' | 'UserLocal' | 'TimeZoneIndependent' = 'DateOnly') {
  if (!day) return null
  if (behavior === 'UserLocal') return `${day}T03:00:00Z`
  return behavior === 'TimeZoneIndependent' ? `${day}T00:00:00Z` : day
}

export type DateBehavior = 'DateOnly' | 'UserLocal' | 'TimeZoneIndependent'

/** Dia (YYYY-MM-DD) em São Paulo de um DateTime ISO do Dataverse. */
export function diaSP(iso: string | null | undefined) {
  if (!iso) return null
  // Valor só de data não tem horário para converter: deslocar pelo fuso mudaria o dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : todaySP(date)
}
