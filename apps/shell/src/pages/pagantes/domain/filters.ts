import { normalizeSearch } from '@betinhos/ui'
import { A_RECEBER, STATUS, hasFalha, reciboEnviado } from './status'
import type { Contato, Pagante } from './types'

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

/** Filtros que mudam a lista além do período (o período padrão não conta). */
export function hasFilters(f: Filters) {
  return Boolean(f.query.trim()) || f.periodo !== EMPTY_FILTERS.periodo || f.status.length > 0 || f.forma != null || f.recibo != null || f.falhas
}

function haystack(p: Pagante, contato: Contato | undefined) {
  return normalizeSearch([p.pessoa, p.codigo, p.op, contato?.nome, contato?.telefone, contato?.telefone.replace(/\D/g, ''), contato?.email, contato?.cliente].filter(Boolean).join(' '))
}

export function filterPagantes(list: Pagante[], f: Filters, contatos: Map<string, Contato>) {
  const words = normalizeSearch(f.query).split(/\s+/).filter(Boolean)
  return list.filter((p) => {
    if (f.status.length && (p.status == null || !f.status.includes(p.status))) return false
    if (f.forma != null && p.forma !== f.forma) return false
    if (f.recibo === 'enviado' && !reciboEnviado(p)) return false
    if (f.recibo === 'nao-enviado' && reciboEnviado(p)) return false
    if (f.falhas && !hasFalha(p)) return false
    if (words.length) {
      const text = haystack(p, contatos.get(p.pessoaId))
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
}

export const total = (list: Pagante[]) => list.reduce((sum, p) => sum + (p.valor ?? 0), 0)

// ---------- Visões salvas ----------

export type View = { id: string; nome: string; filters: Omit<Filters, 'query'>; builtin?: boolean }
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const base = (): Omit<Filters, 'query'> => { const { query: _q, ...rest } = EMPTY_FILTERS; return rest }

export const BUILTIN_VIEWS: View[] = [
  { id: 'todos', nome: 'Todos', builtin: true, filters: base() },
  { id: 'a-receber', nome: 'A receber', builtin: true, filters: { ...base(), status: A_RECEBER } },
  { id: 'pagos-sem-recibo', nome: 'Pagos sem recibo enviado', builtin: true, filters: { ...base(), status: [STATUS.pago, STATUS.autorizado], recibo: 'nao-enviado' } },
  { id: 'falhas', nome: 'Com falha de envio', builtin: true, filters: { ...base(), falhas: true } },
]

export const VIEWS_KEY = 'betinhos.pagantes.visoes.v1'
type Stored = { views: View[]; last: string | null }

export function loadViews(kv: KV): Stored {
  try {
    const raw = kv.getItem(VIEWS_KEY)
    if (!raw) return { views: [], last: null }
    const data = JSON.parse(raw) as Partial<Stored>
    const views = Array.isArray(data.views) ? data.views.filter((v) => v && typeof v.id === 'string' && typeof v.nome === 'string' && v.filters) : []
    return { views: views.map((v) => ({ ...v, builtin: false, filters: { ...base(), ...v.filters } })), last: typeof data.last === 'string' ? data.last : null }
  } catch {
    return { views: [], last: null }
  }
}

export function saveViews(kv: KV, data: Stored) {
  try { kv.setItem(VIEWS_KEY, JSON.stringify({ views: data.views.map(({ builtin: _b, ...v }) => v), last: data.last })) } catch { /* armazenamento bloqueado: segue em memória */ }
}

export function viewFilters(view: View, query = ''): Filters {
  return { ...view.filters, status: [...view.filters.status], query }
}

/** Visão cujos filtros batem com os atuais (ignorando a busca); null = filtros avulsos. */
export function matchView(views: View[], f: Filters) {
  const key = (x: Omit<Filters, 'query'>) => JSON.stringify([x.periodo, [...x.status].sort(), x.forma, x.recibo, x.falhas])
  const current = key(f)
  return views.find((v) => key(v.filters) === current) ?? null
}

export function newView(nome: string, f: Filters, now = Date.now()): View {
  const { query: _q, ...filters } = f
  return { id: `v${now.toString(36)}`, nome: nome.trim(), filters: { ...filters, status: [...filters.status] } }
}
