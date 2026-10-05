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

export type Overrides = Map<string, Partial<Reserva>>

/** Depois de uma carga, só sobrevivem os overrides de reservas com mutação ainda em voo. */
export function keepPending(overrides: Overrides, pending: ReadonlyMap<string, number>) {
  const next: Overrides = new Map()
  for (const [id, patch] of overrides) if ((pending.get(id) ?? 0) > 0) next.set(id, patch)
  return next
}

/** Valores que o override tinha, só para os campos do patch (campo ausente = não existia). */
export function previousFields(overrides: Overrides, id: string, patch: Partial<Reserva>) {
  const current = (overrides.get(id) ?? {}) as Record<string, unknown>
  const before: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) if (key in current) before[key] = current[key]
  return before as Partial<Reserva>
}

/** Desfaz só os campos do patch que falhou, preservando os de outras mutações da mesma reserva. */
export function revertPatch(overrides: Overrides, id: string, patch: Partial<Reserva>, before: Partial<Reserva>) {
  const next: Overrides = new Map(overrides)
  const merged: Record<string, unknown> = { ...(next.get(id) ?? {}) }
  for (const key of Object.keys(patch)) {
    if (key in before) merged[key] = (before as Record<string, unknown>)[key]
    else delete merged[key]
  }
  if (Object.keys(merged).length) next.set(id, merged as Partial<Reserva>)
  else next.delete(id)
  return next
}

export function applyOverrides(reservas: Reserva[], overrides: Map<string, Partial<Reserva>>) {
  if (!overrides.size) return reservas
  return reservas.map((r) => (overrides.has(r.id) ? { ...r, ...overrides.get(r.id) } : r))
}
