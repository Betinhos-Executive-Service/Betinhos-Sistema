import type { Reserva } from './types'
import { isCancelled } from './serviceState'
import { minutesBetween } from './time'

export type Conflict = { motoristaId: string; firstId: string; secondId: string; gap: number }

const LIMIT = 30
const comparable = (r: Reserva) => Boolean(r.motoristaId && r.saida && !isCancelled(r.status))
const bySaida = (a: Reserva, b: Reserva) => a.saida!.getTime() - b.saida!.getTime()

/** Pares de saídas consecutivas do mesmo motorista com intervalo >= 0 e < 30 min (saída com saída, como no legado). */
export function findConflicts(reservas: Reserva[]): Conflict[] {
  const byDriver = new Map<string, Reserva[]>()
  for (const r of reservas.filter(comparable)) byDriver.set(r.motoristaId!, [...(byDriver.get(r.motoristaId!) ?? []), r])
  const conflicts: Conflict[] = []
  for (const [motoristaId, list] of byDriver) {
    const sorted = [...list].sort(bySaida)
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = minutesBetween(sorted[i - 1].saida!, sorted[i].saida!)
      if (gap >= 0 && gap < LIMIT) conflicts.push({ motoristaId, firstId: sorted[i - 1].id, secondId: sorted[i].id, gap })
    }
  }
  return conflicts
}

/** Serviço do motorista com saída a menos de 30 min de `saida`; usado para avisar na troca de motorista. */
export function conflictFor(reservas: Reserva[], motoristaId: string, saida: Date | null, ignoreId: string): Reserva | null {
  if (!saida) return null
  return reservas.find((r) => r.id !== ignoreId && r.motoristaId === motoristaId && comparable(r) && Math.abs(minutesBetween(saida, r.saida!)) < LIMIT) ?? null
}
