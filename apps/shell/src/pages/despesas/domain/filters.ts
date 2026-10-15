import { normalizeSearch } from '@betinhos/ui'
import { PERIODOS, type KV, type Periodo } from '../../pagantes/domain/filters'
import { suspeitaIA } from './ia'
import { FINANCEIRO, OPERACIONAL, semComprovante } from './status'
import type { Despesa } from './types'

export { PERIODOS, periodoStart, type KV, type Periodo } from '../../pagantes/domain/filters'

export type Alerta = 'sem-comprovante' | 'duplicidade' | 'ia-suspeita'
export const ALERTAS: { value: Alerta; label: string }[] = [
  { value: 'sem-comprovante', label: 'Sem comprovante' },
  { value: 'duplicidade', label: 'Possível duplicidade' },
  { value: 'ia-suspeita', label: 'Suspeita da IA' },
]

export type Filters = {
  query: string
  periodo: Periodo
  operacional: number[]
  financeiro: number[]
  categoria: string[]
  motorista: string[]
  /** Todos os alertas marcados precisam valer. */
  alertas: Alerta[]
}

export const EMPTY_FILTERS: Filters = { query: '', periodo: '90', operacional: [], financeiro: [], categoria: [], motorista: [], alertas: [] }

export const hasFilters = (f: Filters) =>
  Boolean(f.query.trim()) || f.periodo !== EMPTY_FILTERS.periodo || f.operacional.length > 0 || f.financeiro.length > 0
  || f.categoria.length > 0 || f.motorista.length > 0 || f.alertas.length > 0

const haystack = (d: Despesa) => normalizeSearch([d.nome, d.estabelecimento, d.motorista, d.categoria, d.forma, d.reserva, d.veiculo, d.protocolo, d.cidade].filter(Boolean).join(' '))

export function filterDespesas(list: Despesa[], f: Filters) {
  const words = normalizeSearch(f.query).split(/\s+/).filter(Boolean)
  return list.filter((d) => {
    if (f.operacional.length && (d.statusOperacional == null || !f.operacional.includes(d.statusOperacional))) return false
    if (f.financeiro.length && (d.statusFinanceiro == null || !f.financeiro.includes(d.statusFinanceiro))) return false
    if (f.categoria.length && !f.categoria.includes(d.categoriaId)) return false
    if (f.motorista.length && !f.motorista.includes(d.motoristaId)) return false
    if (f.alertas.includes('sem-comprovante') && !semComprovante(d)) return false
    if (f.alertas.includes('duplicidade') && !d.possivelDuplicidade) return false
    if (f.alertas.includes('ia-suspeita') && !suspeitaIA(d)) return false
    if (words.length) {
      const text = haystack(d)
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
}

/** Opções de categoria e motorista a partir do que carregou (ids sem rótulo ficam de fora). */
export function opcoes(list: Despesa[]) {
  const collect = (pick: (d: Despesa) => [string, string]) => {
    const map = new Map<string, string>()
    for (const d of list) { const [id, nome] = pick(d); if (id && nome && !map.has(id)) map.set(id, nome) }
    return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }
  return { categorias: collect((d) => [d.categoriaId, d.categoria]), motoristas: collect((d) => [d.motoristaId, d.motorista]) }
}

// ---------- Visões salvas ----------

type Saved = Omit<Filters, 'query'>
export type View = { id: string; nome: string; filters: Saved; builtin?: boolean }
type Stored = { views: View[]; last: string | null }

const base = (): Saved => ({ periodo: EMPTY_FILTERS.periodo, operacional: [], financeiro: [], categoria: [], motorista: [], alertas: [] })

export const BUILTIN_VIEWS: View[] = [
  { id: 'todas', nome: 'Todas', builtin: true, filters: base() },
  { id: 'aguardando', nome: 'Aguardando pagamento', builtin: true, filters: { ...base(), financeiro: [FINANCEIRO.aguardando] } },
  { id: 'corrigir', nome: 'Precisa corrigir', builtin: true, filters: { ...base(), operacional: [OPERACIONAL.corrigir] } },
  { id: 'sem-comprovante', nome: 'Sem comprovante', builtin: true, filters: { ...base(), alertas: ['sem-comprovante'] } },
  { id: 'duplicidade', nome: 'Possível duplicidade', builtin: true, filters: { ...base(), alertas: ['duplicidade'] } },
  { id: 'ia-suspeita', nome: 'Suspeitas da IA', builtin: true, filters: { ...base(), alertas: ['ia-suspeita'] } },
]

export const VIEWS_KEY = 'betinhos.despesas.visoes.v1'
const PERIODO_VALUES = new Set<string>(PERIODOS.map((p) => p.value))
const ALERTA_VALUES = new Set<string>(ALERTAS.map((a) => a.value))

const ints = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x)) ? [...v] as number[] : null)
const strings = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...v] as string[] : null)

/** Filtros vindos do armazenamento: campo inválido descarta a visão. */
export function parseStoredFilters(raw: unknown): Saved | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const periodo = f.periodo ?? EMPTY_FILTERS.periodo
  if (typeof periodo !== 'string' || !PERIODO_VALUES.has(periodo)) return null
  const operacional = ints(f.operacional ?? [])
  const financeiro = ints(f.financeiro ?? [])
  const categoria = strings(f.categoria ?? [])
  const motorista = strings(f.motorista ?? [])
  const alertas = strings(f.alertas ?? [])
  if (!operacional || !financeiro || !categoria || !motorista || !alertas || !alertas.every((a) => ALERTA_VALUES.has(a))) return null
  return { periodo: periodo as Periodo, operacional, financeiro, categoria, motorista, alertas: alertas as Alerta[] }
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

const saved = (f: Saved): Saved => ({
  periodo: f.periodo, operacional: [...f.operacional], financeiro: [...f.financeiro],
  categoria: [...f.categoria], motorista: [...f.motorista], alertas: [...f.alertas],
})

export const viewFilters = (view: View, query = ''): Filters => ({ ...saved(view.filters), query })

const sorted = <T extends string | number>(list: T[]) => [...list].sort()
const viewKey = (x: Saved) => JSON.stringify([x.periodo, sorted(x.operacional), sorted(x.financeiro), sorted(x.categoria), sorted(x.motorista), sorted(x.alertas)])

/** Visão com os mesmos filtros (sem a busca); `preferId` desempata. null = filtros avulsos. */
export function matchView(views: View[], f: Saved, preferId?: string | null) {
  const current = viewKey(f)
  const preferred = preferId ? views.find((v) => v.id === preferId && viewKey(v.filters) === current) : undefined
  return preferred ?? views.find((v) => viewKey(v.filters) === current) ?? null
}

export function newView(nome: string, f: Filters, now = Date.now()): View {
  return { id: `v${now.toString(36)}`, nome: nome.trim(), filters: saved(f) }
}
