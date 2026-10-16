import { PERIODOS, type KV, type Periodo } from '../../pagantes/domain/filters'
import { TIPO_LABEL, type TipoPendencia } from './types'

export { PERIODOS, periodoStart, type KV, type Periodo } from '../../pagantes/domain/filters'

/** Formato antigo dos filtros: ainda chega por links com `tipos` na URL e pelas visões salvas no navegador. */
export type Filters = { q: string; periodo: Periodo; tipos: TipoPendencia[] }

export const EMPTY_FILTERS: Filters = { q: '', periodo: '90', tipos: [] }

export const TIPOS = Object.keys(TIPO_LABEL) as TipoPendencia[]
const TIPO_VALUES = new Set<string>(TIPOS)

// ---------- Visões salvas no navegador (só para importar) ----------

export type View = { id: string; nome: string; filters: Omit<Filters, 'q'> }

export const VIEWS_KEY = 'betinhos.pendencias.visoes.v1'
const BUILTIN_IDS = ['todas', 'corrigiveis', 'rateio']
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
