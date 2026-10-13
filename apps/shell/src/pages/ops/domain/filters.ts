import { normalizeSearch } from '@betinhos/ui'
import { PERIODOS, type KV, type Periodo } from '../../pagantes/domain/filters'
import { EM_ABERTO, OP_STATUS } from './status'
import type { Op } from './types'

export { PERIODOS, periodoStart, type KV, type Periodo } from '../../pagantes/domain/filters'

export type Filters = { query: string; periodo: Periodo; status: number[] }

export const EMPTY_FILTERS: Filters = { query: '', periodo: '90', status: [] }

export const hasFilters = (f: Filters) => Boolean(f.query.trim()) || f.periodo !== EMPTY_FILTERS.periodo || f.status.length > 0

const haystack = (op: Op) => normalizeSearch([op.codigo, op.cliente, op.passageiros, op.trajetos].filter(Boolean).join(' '))

export function filterOps(list: Op[], f: Filters) {
  const words = normalizeSearch(f.query).split(/\s+/).filter(Boolean)
  return list.filter((op) => {
    if (f.status.length && (op.status == null || !f.status.includes(op.status))) return false
    if (words.length) {
      const text = haystack(op)
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
}

export const total = (list: Op[]) => list.reduce((sum, op) => sum + (op.valor ?? 0), 0)

// ---------- Visões salvas ----------

export type View = { id: string; nome: string; filters: Omit<Filters, 'query'>; builtin?: boolean }
type Stored = { views: View[]; last: string | null }

const base = (): Omit<Filters, 'query'> => ({ periodo: EMPTY_FILTERS.periodo, status: [] })

export const BUILTIN_VIEWS: View[] = [
  { id: 'todas', nome: 'Todas', builtin: true, filters: base() },
  { id: 'em-aberto', nome: 'Em aberto', builtin: true, filters: { ...base(), status: EM_ABERTO } },
  { id: 'pagas', nome: 'Pagas', builtin: true, filters: { ...base(), status: [OP_STATUS.paga] } },
  { id: 'canceladas', nome: 'Canceladas', builtin: true, filters: { ...base(), status: [OP_STATUS.cancelada] } },
]

export const VIEWS_KEY = 'betinhos.ops.visoes.v1'
const PERIODO_VALUES = new Set<string>(PERIODOS.map((p) => p.value))

/** Filtros vindos do armazenamento: campo inválido descarta a visão. */
export function parseStoredFilters(raw: unknown): Omit<Filters, 'query'> | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const periodo = f.periodo ?? EMPTY_FILTERS.periodo
  if (typeof periodo !== 'string' || !PERIODO_VALUES.has(periodo)) return null
  const status = f.status ?? []
  if (!Array.isArray(status) || !status.every((s) => typeof s === 'number' && Number.isInteger(s))) return null
  return { periodo: periodo as Periodo, status: [...status] as number[] }
}

export function loadViews(kv: KV): Stored {
  try {
    const raw = kv.getItem(VIEWS_KEY)
    if (!raw) return { views: [], last: null }
    const data = JSON.parse(raw) as { views?: unknown; last?: unknown } | null
    const views: View[] = []
    for (const item of data && Array.isArray(data.views) ? data.views : []) {
      const v = item as Partial<View> | null
      if (!v || typeof v.id !== 'string' || !v.id || typeof v.nome !== 'string' || !v.nome.trim()) continue
      if (BUILTIN_VIEWS.some((b) => b.id === v.id) || views.some((x) => x.id === v.id)) continue
      const filters = parseStoredFilters(v.filters)
      if (filters) views.push({ id: v.id, nome: v.nome.trim().slice(0, 40), filters })
    }
    return { views, last: data && typeof data.last === 'string' ? data.last : null }
  } catch {
    return { views: [], last: null }
  }
}

export function saveViews(kv: KV, data: Stored) {
  try { kv.setItem(VIEWS_KEY, JSON.stringify({ views: data.views.map(({ builtin: _b, ...v }) => v), last: data.last })) } catch { /* armazenamento bloqueado: segue em memória */ }
}

export const viewFilters = (view: View, query = ''): Filters => ({ ...view.filters, status: [...view.filters.status], query })

const viewKey = (x: Omit<Filters, 'query'>) => JSON.stringify([x.periodo, [...x.status].sort((a, b) => a - b)])

/** Visão com os mesmos filtros (sem a busca); `preferId` desempata. null = filtros avulsos. */
export function matchView(views: View[], f: Omit<Filters, 'query'>, preferId?: string | null) {
  const current = viewKey(f)
  const preferred = preferId ? views.find((v) => v.id === preferId && viewKey(v.filters) === current) : undefined
  return preferred ?? views.find((v) => viewKey(v.filters) === current) ?? null
}

export function newView(nome: string, f: Filters, now = Date.now()): View {
  return { id: `v${now.toString(36)}`, nome: nome.trim(), filters: { periodo: f.periodo, status: [...f.status] } }
}
