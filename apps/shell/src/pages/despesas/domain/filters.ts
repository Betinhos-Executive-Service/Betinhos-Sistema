import { PERIODOS, type KV, type Periodo } from '../../pagantes/domain/filters'
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

/** Opções de categoria e motorista a partir do que carregou (ids sem rótulo ficam de fora). */
export function opcoes(list: Despesa[]) {
  const collect = (pick: (d: Despesa) => [string, string]) => {
    const map = new Map<string, string>()
    for (const d of list) { const [id, nome] = pick(d); if (id && nome && !map.has(id)) map.set(id, nome) }
    return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }
  return { categorias: collect((d) => [d.categoriaId, d.categoria]), motoristas: collect((d) => [d.motoristaId, d.motorista]) }
}

// ---------- Visões salvas no navegador (só para importar) ----------

type Saved = Omit<Filters, 'query'>
export type View = { id: string; nome: string; filters: Saved }

export const VIEWS_KEY = 'betinhos.despesas.visoes.v1'
const BUILTIN_IDS = ['todas', 'aguardando', 'corrigir', 'sem-comprovante', 'duplicidade', 'ia-suspeita']
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

/** Visões salvas neste navegador pela barra antiga; as adulteradas e as que repetem uma pronta ficam de fora. */
export function loadViews(kv: KV): { views: View[] } {
  try {
    const raw = kv.getItem(VIEWS_KEY)
    if (!raw) return { views: [] }
    const data = JSON.parse(raw) as { views?: unknown } | null
    const views: View[] = []
    for (const item of data && Array.isArray(data.views) ? data.views : []) {
      const v = item as Partial<View> | null
      if (!v || typeof v.id !== 'string' || !v.id || typeof v.nome !== 'string' || !v.nome.trim()) continue
      if (BUILTIN_IDS.includes(v.id) || views.some((x) => x.id === v.id)) continue
      const filters = parseStoredFilters(v.filters)
      if (filters) views.push({ id: v.id, nome: v.nome.trim().slice(0, 40), filters })
    }
    return { views }
  } catch {
    return { views: [] }
  }
}
