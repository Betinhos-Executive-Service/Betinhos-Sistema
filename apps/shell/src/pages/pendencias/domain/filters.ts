import { normalizeSearch } from '@betinhos/ui'
import { PERIODOS, type KV, type Periodo } from '../../pagantes/domain/filters'
import { TIPO_LABEL, type Pendencia, type TipoPendencia } from './types'

export { PERIODOS, periodoStart, type KV, type Periodo } from '../../pagantes/domain/filters'

export type Filters = { q: string; periodo: Periodo; tipos: TipoPendencia[] }

export const EMPTY_FILTERS: Filters = { q: '', periodo: '90', tipos: [] }

export const TIPOS = Object.keys(TIPO_LABEL) as TipoPendencia[]
const TIPO_VALUES = new Set<string>(TIPOS)

export const hasFilters = (f: Filters) => Boolean(f.q.trim()) || f.periodo !== EMPTY_FILTERS.periodo || f.tipos.length > 0

const haystack = (p: Pendencia) => normalizeSearch([p.opCodigo, p.cliente, p.detalhe, TIPO_LABEL[p.tipo]].filter(Boolean).join(' '))

export function filterPendencias(list: Pendencia[], f: Filters) {
  const words = normalizeSearch(f.q).split(/\s+/).filter(Boolean)
  return list.filter((p) => {
    if (f.tipos.length && !f.tipos.includes(p.tipo)) return false
    if (words.length) {
      const text = haystack(p)
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
}

// ---------- Visões salvas ----------

export type View = { id: string; nome: string; filters: Omit<Filters, 'q'>; builtin?: boolean }
type Stored = { views: View[]; last: string | null }

const base = (): Omit<Filters, 'q'> => ({ periodo: EMPTY_FILTERS.periodo, tipos: [] })

export const BUILTIN_VIEWS: View[] = [
  { id: 'todas', nome: 'Todas', builtin: true, filters: base() },
  { id: 'corrigiveis', nome: 'Corrigíveis', builtin: true, filters: { ...base(), tipos: ['op-paga-desalinhada', 'op-sem-pagamento-reserva-paga'] } },
  { id: 'rateio', nome: 'Rateio', builtin: true, filters: { ...base(), tipos: ['rateio-nao-fecha'] } },
]

export const VIEWS_KEY = 'betinhos.pendencias.visoes.v1'
const PERIODO_VALUES = new Set<string>(PERIODOS.map((p) => p.value))

/** Filtros vindos do armazenamento: campo inválido descarta a visão. */
export function parseStoredFilters(raw: unknown): Omit<Filters, 'q'> | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const periodo = f.periodo ?? EMPTY_FILTERS.periodo
  if (typeof periodo !== 'string' || !PERIODO_VALUES.has(periodo)) return null
  const tipos = f.tipos ?? []
  if (!Array.isArray(tipos) || !tipos.every((t) => typeof t === 'string' && TIPO_VALUES.has(t))) return null
  return { periodo: periodo as Periodo, tipos: [...tipos] as TipoPendencia[] }
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

export const viewFilters = (view: View, q = ''): Filters => ({ ...view.filters, tipos: [...view.filters.tipos], q })

const viewKey = (x: Omit<Filters, 'q'>) => JSON.stringify([x.periodo, [...x.tipos].sort()])

/** Visão com os mesmos filtros (sem a busca); `preferId` desempata. null = filtros avulsos. */
export function matchView(views: View[], f: Omit<Filters, 'q'>, preferId?: string | null) {
  const current = viewKey(f)
  const preferred = preferId ? views.find((v) => v.id === preferId && viewKey(v.filters) === current) : undefined
  return preferred ?? views.find((v) => viewKey(v.filters) === current) ?? null
}

export function newView(nome: string, f: Filters, now = Date.now()): View {
  return { id: `v${now.toString(36)}`, nome: nome.trim(), filters: { periodo: f.periodo, tipos: [...f.tipos] } }
}
