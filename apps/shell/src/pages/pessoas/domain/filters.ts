import type { Pessoa } from './types'

/**
 * Formato antigo dos filtros de Pessoas: ainda chega por links com `cliente`, `classificacao`… na URL e pelas visões
 * salvas no navegador antes de irem para o Dataverse. A tela converte para o formato do Design System (`lista.ts`).
 */
export type Filters = {
  query: string
  clienteId: string | null
  classificacao: number[]
  idioma: number | null
  status: number | null
  duplicados: boolean
}

export const EMPTY_FILTERS: Filters = { query: '', clienteId: null, classificacao: [], idioma: null, status: null, duplicados: false }

/** Clientes presentes na lista, em ordem alfabética, para o filtro. */
export function clienteOptions(list: Pessoa[]) {
  const map = new Map<string, string>()
  for (const p of list) if (p.clienteId && p.cliente) map.set(p.clienteId, p.cliente)
  return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

// ---------- Visões salvas no navegador (só para importar) ----------

export type ViewFilters = Omit<Filters, 'query'>
export type View = { id: string; nome: string; filters: ViewFilters }
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const VIEWS_KEY = 'betinhos.pessoas.visoes.v1'
const BUILTIN_IDS = ['todos', 'ativos', 'frequentes', 'solicitantes', 'duplicados']

const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v)

/** Filtros vindos do armazenamento, validados campo a campo; inválido descarta a visão. */
export function parseStoredFilters(raw: unknown): ViewFilters | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const clienteId = f.clienteId ?? null
  if (clienteId !== null && (typeof clienteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clienteId))) return null
  const classificacao = f.classificacao ?? []
  if (!Array.isArray(classificacao) || !classificacao.every(isInt)) return null
  const idioma = f.idioma ?? null
  if (idioma !== null && !isInt(idioma)) return null
  const status = f.status ?? null
  if (status !== null && !isInt(status)) return null
  const duplicados = f.duplicados ?? false
  if (typeof duplicados !== 'boolean') return null
  return { clienteId: clienteId as string | null, classificacao: [...classificacao] as number[], idioma: idioma as number | null, status: status as number | null, duplicados }
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
