export const TZ = 'America/Sao_Paulo'
const DAY = 86_400_000

const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const labelFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })

export const formatHour = (date: Date) => hourFormat.format(date)
/** `YYYY-MM-DD` do dia em São Paulo. */
export const dateKey = (date: Date) => keyFormat.format(date)

/** Início (inclusive) e fim (exclusivo) do dia em São Paulo; sem horário de verão desde 2019. */
export function dayRange(key: string) {
  const start = new Date(`${key}T00:00:00-03:00`)
  return { start, end: new Date(start.getTime() + DAY) }
}

export function addDays(key: string, days: number) {
  return dateKey(new Date(dayRange(key).start.getTime() + days * DAY + DAY / 2))
}

/** "Hoje · seg 05/10", "Amanhã · ter 06/10" ou só "sex 09/10". */
export function dayLabel(key: string, today: string) {
  const base = labelFormat.format(new Date(`${key}T12:00:00-03:00`)).replace(/\./g, '').replace(',', '')
  const relative = key === today ? 'Hoje' : key === addDays(today, 1) ? 'Amanhã' : key === addDays(today, -1) ? 'Ontem' : null
  return relative ? `${relative} · ${base}` : base
}

export const minutesBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000)

export function formatDuration(minutes: number) {
  const total = Math.abs(minutes)
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`
}
