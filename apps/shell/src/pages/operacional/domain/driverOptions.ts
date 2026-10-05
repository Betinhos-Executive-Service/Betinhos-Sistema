import type { Motorista, Reserva } from './types'
import { conflictFor } from './conflicts'
import { formatHour } from './time'

export type DriverOption = { value: string; label: string; search?: string; subtitle: string }

/** Opções do seletor de motorista, com aviso de conflito ou próxima saída. O motorista atual fora da lista entra no início. */
export function motoristaOptions(reserva: Reserva, motoristas: Motorista[], reservas: Reserva[], now: Date): DriverOption[] {
  const options = motoristas.map((m): DriverOption => {
    const conflict = conflictFor(reservas, m.id, reserva.saida, reserva.id)
    const next = reservas.find((r) => r.motoristaId === m.id && r.id !== reserva.id && r.saida && r.saida > now)
    return {
      value: m.id, label: m.nome, search: m.apelido,
      subtitle: conflict?.saida ? `Conflito: saída às ${formatHour(conflict.saida)}` : next?.saida ? `Próximo às ${formatHour(next.saida)}` : 'Livre',
    }
  })
  if (reserva.motoristaId && !motoristas.some((m) => m.id === reserva.motoristaId)) {
    options.unshift({ value: reserva.motoristaId, label: reserva.motorista || 'Motorista atual', subtitle: 'Motorista atual (fora da lista de motoristas)' })
  }
  return options
}
