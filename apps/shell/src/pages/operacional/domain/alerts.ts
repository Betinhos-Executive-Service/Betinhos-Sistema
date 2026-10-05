import type { Reserva } from './types'
import { findConflicts } from './conflicts'
import { isOpenStatus, serviceState } from './serviceState'

export type AttentionAction = 'atribuir' | 'ligar' | 'ver'
export type AttentionItem = { reservaId: string; priority: 1 | 2 | 3; reason: string; action: AttentionAction }

/** P1 sem motorista em até 30 min; P2 atrasado ou ainda aberto em até 30 min; P3 conflito. Um item por serviço. */
export function buildAttention(reservas: Reserva[], now: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  const seen = new Set<string>()
  const add = (item: AttentionItem) => { if (!seen.has(item.reservaId)) { seen.add(item.reservaId); items.push(item) } }

  for (const r of reservas) {
    const state = serviceState(r, now)
    const soon = state.kind === 'upcoming' && state.minutes! <= 30
    if (!r.motoristaId && soon) add({ reservaId: r.id, priority: 1, reason: 'Sem motorista', action: 'atribuir' })
    else if (state.kind === 'delayed' || (soon && isOpenStatus(r.status))) {
      add({ reservaId: r.id, priority: 2, reason: state.kind === 'delayed' ? state.label : 'Ainda não confirmado', action: r.motoristaId ? 'ligar' : 'atribuir' })
    }
  }
  for (const conflict of findConflicts(reservas)) {
    add({ reservaId: conflict.secondId, priority: 3, reason: `Saídas com ${conflict.gap} min de intervalo`, action: 'ver' })
  }

  const saida = new Map(reservas.map((r) => [r.id, r.saida?.getTime() ?? Infinity]))
  return items.sort((a, b) => a.priority - b.priority || saida.get(a.reservaId)! - saida.get(b.reservaId)!)
}
