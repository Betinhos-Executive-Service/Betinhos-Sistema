import { normalizeSearch } from '@betinhos/ui'
import { CLASSIFICACAO, STATUS } from './choices'
import type { Pessoa } from './types'

export type Filters = {
  query: string
  clienteId: string | null
  classificacao: number[]
  idioma: number | null
  status: number | null
  duplicados: boolean
}

export const EMPTY_FILTERS: Filters = { query: '', clienteId: null, classificacao: [], idioma: null, status: null, duplicados: false }

export function hasFilters(f: Filters) {
  return Boolean(f.query.trim()) || f.clienteId != null || f.classificacao.length > 0 || f.idioma != null || f.status != null || f.duplicados
}

function haystack(p: Pessoa, cargo: string) {
  return normalizeSearch([p.nome, p.cliente, p.telefone, p.telefone.replace(/\D/g, ''), p.email, p.departamento, cargo].filter(Boolean).join(' '))
}

export function filterPessoas(list: Pessoa[], f: Filters, dupIds: Set<string>, cargoLabel: (p: Pessoa) => string) {
  const words = normalizeSearch(f.query).split(/\s+/).filter(Boolean)
  return list.filter((p) => {
    if (f.clienteId != null && p.clienteId !== f.clienteId) return false
    if (f.classificacao.length && (p.classificacao == null || !f.classificacao.includes(p.classificacao))) return false
    if (f.idioma != null && p.idioma !== f.idioma) return false
    if (f.status != null && p.status !== f.status) return false
    if (f.duplicados && !dupIds.has(p.id)) return false
    if (words.length) {
      const text = haystack(p, cargoLabel(p))
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
}

/** Clientes presentes na lista, em ordem alfabética, para o filtro. */
export function clienteOptions(list: Pessoa[]) {
  const map = new Map<string, string>()
  for (const p of list) if (p.clienteId && p.cliente) map.set(p.clienteId, p.cliente)
  return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

// ---------- Visões salvas ----------

export type ViewFilters = Omit<Filters, 'query'>
export type View = { id: string; nome: string; filters: ViewFilters; builtin?: boolean }
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const base = (): ViewFilters => ({ clienteId: null, classificacao: [], idioma: null, status: null, duplicados: false })

export const BUILTIN_VIEWS: View[] = [
  { id: 'todos', nome: 'Todos', builtin: true, filters: base() },
  { id: 'ativos', nome: 'Ativos', builtin: true, filters: { ...base(), status: STATUS.ativo } },
  { id: 'frequentes', nome: 'Passageiros frequentes', builtin: true, filters: { ...base(), classificacao: [CLASSIFICACAO.frequente] } },
  { id: 'solicitantes', nome: 'Solicitantes', builtin: true, filters: { ...base(), classificacao: [CLASSIFICACAO.solicitante] } },
  { id: 'duplicados', nome: 'Possíveis duplicados', builtin: true, filters: { ...base(), duplicados: true } },
]

export const VIEWS_KEY = 'betinhos.pessoas.visoes.v1'
type Stored = { views: View[]; last: string | null }

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
  try { kv.setItem(VIEWS_KEY, JSON.stringify({ views: data.views.map(({ builtin: _b, ...v }) => v), last: data.last })) } catch { /* armazenamento bloqueado */ }
}

export const viewFilters = (view: View, query = ''): Filters => ({ ...view.filters, classificacao: [...view.filters.classificacao], query })

const viewKey = (x: ViewFilters) => JSON.stringify([x.clienteId, [...x.classificacao].sort((a, b) => a - b), x.idioma, x.status, x.duplicados])

/** Visão cujos filtros batem com os atuais; a preferida (escolhida) desempata. */
export function matchView(views: View[], f: ViewFilters, preferId?: string | null) {
  const current = viewKey(f)
  const preferred = preferId ? views.find((v) => v.id === preferId && viewKey(v.filters) === current) : undefined
  return preferred ?? views.find((v) => viewKey(v.filters) === current) ?? null
}

export function newView(nome: string, f: Filters, now = Date.now()): View {
  const { query: _q, ...filters } = f
  return { id: `v${now.toString(36)}`, nome: nome.trim().slice(0, 40), filters: { ...filters, classificacao: [...filters.classificacao] } }
}
