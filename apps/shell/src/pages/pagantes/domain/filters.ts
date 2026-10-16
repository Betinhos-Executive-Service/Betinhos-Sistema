import type { Pagante } from './types'

export type Periodo = '30' | '90' | '365' | 'all'
export type ReciboFiltro = 'enviado' | 'nao-enviado'

export type Filters = {
  query: string
  periodo: Periodo
  status: number[]
  forma: number | null
  recibo: ReciboFiltro | null
  falhas: boolean
}

export const EMPTY_FILTERS: Filters = { query: '', periodo: '90', status: [], forma: null, recibo: null, falhas: false }

export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Últimos 12 meses' },
  { value: 'all', label: 'Todo o período' },
]

/** Início do período pela data de criação; null = sem limite. */
export function periodoStart(periodo: Periodo, now: Date): Date | null {
  if (periodo === 'all') return null
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - Number(periodo))
  return start
}

export const total = (list: Pagante[]) => list.reduce((sum, p) => sum + (p.valor ?? 0), 0)

// ---------- Visões salvas no navegador (só para importar) ----------

export type View = { id: string; nome: string; filters: Omit<Filters, 'query'> }
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const VIEWS_KEY = 'betinhos.pagantes.visoes.v1'
const BUILTIN_IDS = ['todos', 'a-receber', 'pagos-sem-recibo', 'falhas']
const PERIODO_VALUES = new Set<string>(PERIODOS.map((p) => p.value))

/** Filtros vindos do armazenamento: cada campo é validado; inválido vira null (visão descartada). */
export function parseStoredFilters(raw: unknown): Omit<Filters, 'query'> | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const periodo = f.periodo ?? EMPTY_FILTERS.periodo
  if (typeof periodo !== 'string' || !PERIODO_VALUES.has(periodo)) return null
  const status = f.status ?? []
  if (!Array.isArray(status) || !status.every((s) => typeof s === 'number' && Number.isInteger(s))) return null
  const forma = f.forma ?? null
  if (forma !== null && !(typeof forma === 'number' && Number.isInteger(forma))) return null
  const recibo = f.recibo ?? null
  if (recibo !== null && recibo !== 'enviado' && recibo !== 'nao-enviado') return null
  const falhas = f.falhas ?? false
  if (typeof falhas !== 'boolean') return null
  return { periodo: periodo as Periodo, status: [...status] as number[], forma: forma as number | null, recibo: recibo as ReciboFiltro | null, falhas }
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
