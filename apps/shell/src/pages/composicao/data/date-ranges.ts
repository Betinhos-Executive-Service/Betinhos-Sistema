import { todaySaoPaulo } from '@betinhos/ui'

/** Dias `AAAA-MM-DD` dos filtros de data (contas em UTC: só o calendário importa, não o fuso). */
export const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export function shiftDay(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Intervalo de dias de um operador de data do FetchXML (`today`, `this-week`, `next-x-days` com N dias…), com a regra do
 * filtro do DS (semana de domingo a sábado). Usado para filtrar no modo local, onde não há Dataverse.
 */
export function fetchDateRange(operator: string, days: number, today = todaySaoPaulo()): [string, string] | undefined {
  const first = `${today.slice(0, 7)}-01`
  const sunday = shiftDay(today, -new Date(`${today}T00:00:00Z`).getUTCDay())
  switch (operator) {
    case 'today': return [today, today]
    case 'tomorrow': return [shiftDay(today, 1), shiftDay(today, 1)]
    case 'yesterday': return [shiftDay(today, -1), shiftDay(today, -1)]
    case 'this-week': return [sunday, shiftDay(sunday, 6)]
    case 'this-month': return [first, shiftDay(`${shiftDay(first, 31).slice(0, 7)}-01`, -1)]
    case 'last-month': return [`${shiftDay(first, -1).slice(0, 7)}-01`, shiftDay(first, -1)]
    case 'next-x-days': return [today, shiftDay(today, days)]
    case 'last-x-days': return [shiftDay(today, -days), today]
    default: return undefined
  }
}
