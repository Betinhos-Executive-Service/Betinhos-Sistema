import type { Reserva } from './types'
import { serviceState } from './serviceState'
import { formatHour } from './time'

export type HourGroup = { key: string; label: string; items: Reserva[] }

/** Agenda por hora cheia, em ordem de saída; concluídos/cancelados à parte; sem horário no fim. */
export function groupByHour(reservas: Reserva[], now: Date) {
  const sorted = [...reservas].sort((a, b) => (a.saida?.getTime() ?? Infinity) - (b.saida?.getTime() ?? Infinity))
  const groups: HourGroup[] = []
  const concluded: Reserva[] = []
  for (const r of sorted) {
    if (serviceState(r, now).kind === 'concluded') { concluded.push(r); continue }
    const label = r.saida ? `${formatHour(r.saida).slice(0, 2)}:00` : 'Sem horário'
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(r)
    else groups.push({ key: label, label, items: [r] })
  }
  return { groups, concluded }
}
