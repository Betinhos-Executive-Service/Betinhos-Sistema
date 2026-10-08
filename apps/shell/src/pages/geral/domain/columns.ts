import type { Column } from './types'

export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ColumnPrefs = { hidden: string[]; order: string[] }
export const STORAGE_KEY = 'betinhos.geral.colunas.v1'

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

function readAll(kv: KV): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(kv.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch { return {} }
}

export function loadColumnPrefs(kv: KV, viewId: string): ColumnPrefs | null {
  const raw = readAll(kv)[viewId]
  if (!raw || typeof raw !== 'object') return null
  const { hidden, order } = raw as Record<string, unknown>
  return strings(hidden) && strings(order) ? { hidden, order } : null
}

export function saveColumnPrefs(kv: KV, viewId: string, prefs: ColumnPrefs | null) {
  const all = readAll(kv)
  if (prefs) all[viewId] = prefs
  else delete all[viewId]
  try { kv.setItem(STORAGE_KEY, JSON.stringify(all)) } catch { /* sem armazenamento: fica só em memória */ }
}

/** Ordem salva primeiro, depois colunas novas da visão; ocultas saem, mas nunca todas (a primeira fica). */
export function applyColumnPrefs(columns: Column[], prefs: ColumnPrefs | null): Column[] {
  if (!prefs) return columns
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const ordered = [...prefs.order.flatMap((k) => (byKey.get(k) ? [byKey.get(k) as Column] : [])), ...columns.filter((c) => !prefs.order.includes(c.key))]
  const visible = ordered.filter((c) => !prefs.hidden.includes(c.key))
  return visible.length ? visible : ordered.slice(0, 1)
}
