import type { Column } from './types'

export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ColumnPrefs = { hidden: string[]; order: string[]; widths?: Record<string, number> }
export const MIN_WIDTH = 90
export const MAX_WIDTH = 1200
export const STORAGE_KEY = 'betinhos.geral.colunas.v1'

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Só larguras numéricas entre 90 e 1200; o resto é descartado. */
function cleanWidths(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out = Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] >= MIN_WIDTH && e[1] <= MAX_WIDTH).map(([k, w]) => [k, Math.round(w)]))
  return Object.keys(out).length ? out : undefined
}

function readAll(kv: KV): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(kv.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch { return {} }
}

export function loadColumnPrefs(kv: KV, viewId: string): ColumnPrefs | null {
  const raw = readAll(kv)[viewId]
  if (!raw || typeof raw !== 'object') return null
  const { hidden, order, widths } = raw as Record<string, unknown>
  if (!strings(hidden) || !strings(order)) return null
  const clean = cleanWidths(widths)
  return clean ? { hidden, order, widths: clean } : { hidden, order }
}

export function saveColumnPrefs(kv: KV, viewId: string, prefs: ColumnPrefs | null) {
  const all = readAll(kv)
  if (prefs) {
    const { widths, ...rest } = prefs
    const clean = cleanWidths(widths)
    all[viewId] = clean ? { ...rest, widths: clean } : rest
  }
  else delete all[viewId]
  try { kv.setItem(STORAGE_KEY, JSON.stringify(all)) } catch { /* sem armazenamento: fica só em memória */ }
}

/** Ordem salva primeiro, depois colunas novas da visão; ocultas saem, mas nunca todas (a primeira fica). */
export function applyColumnPrefs(columns: Column[], prefs: ColumnPrefs | null): Column[] {
  if (!prefs) return columns
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const ordered = [...prefs.order.flatMap((k) => (byKey.get(k) ? [byKey.get(k) as Column] : [])), ...columns.filter((c) => !prefs.order.includes(c.key))]
  const sized = ordered.map((c) => (prefs.widths?.[c.key] ? { ...c, width: prefs.widths[c.key] } : c))
  const visible = sized.filter((c) => !prefs.hidden.includes(c.key))
  return visible.length ? visible : sized.slice(0, 1)
}
