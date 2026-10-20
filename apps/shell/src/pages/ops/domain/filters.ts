import { PERIODOS, type KV, type Periodo } from '../../pagantes/domain/filters'
import { valorOp, type Op } from './types'

export { PERIODOS, periodoStart, type KV, type Periodo } from '../../pagantes/domain/filters'

/**
 * Formato antigo dos filtros das OPs: ainda chega por links com `status` na URL e pelas visões salvas no navegador
 * antes de irem para o Dataverse. A tela converte para o formato do Design System (`lista.ts`).
 */
export type Filters = { query: string; periodo: Periodo; status: number[] }

export const EMPTY_FILTERS: Filters = { query: '', periodo: '90', status: [] }

export const total = (list: Op[]) => list.reduce((sum, op) => sum + (valorOp(op) ?? 0), 0)

// ---------- Visões salvas no navegador (só para importar) ----------

export type View = { id: string; nome: string; filters: Omit<Filters, 'query'> }

export const VIEWS_KEY = 'betinhos.ops.visoes.v1'
const BUILTIN_IDS = ['todas', 'em-aberto', 'pagas', 'canceladas']
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
