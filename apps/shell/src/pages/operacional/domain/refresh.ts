import type { Reserva } from './types'

export function freshnessLabel(last: Date | null, now: Date) {
  if (!last) return 'Carregando…'
  const minutes = Math.floor((now.getTime() - last.getTime()) / 60_000)
  return minutes < 1 ? 'Atualizado agora' : `Atualizado há ${minutes} min`
}

const signature = (r: Reserva) => `${r.statusValue}|${r.status}|${r.motoristaId}|${r.saida?.getTime() ?? ''}`

/** Linhas que mudaram desde a carga anterior (para o realce); vazio na primeira carga. */
export function changedIds(previous: Reserva[], next: Reserva[]) {
  if (!previous.length) return new Set<string>()
  const before = new Map(previous.map((r) => [r.id, signature(r)]))
  return new Set(next.filter((r) => before.get(r.id) !== signature(r)).map((r) => r.id))
}

export function applyOverrides(reservas: Reserva[], overrides: Map<string, Partial<Reserva>>) {
  if (!overrides.size) return reservas
  return reservas.map((r) => (overrides.has(r.id) ? { ...r, ...overrides.get(r.id) } : r))
}
