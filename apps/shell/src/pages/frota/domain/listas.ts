import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { CATEGORIA, COLISAO, MANUT, MULTA, STATUS_OPTIONS, VEICULO, VEICULO_STATUS, label, type Option } from '../data/schema'
import type { Kind, Veiculo } from '../data/types'
import type { custoVeiculo } from './indicadores'
import type { Linha } from './linhas'
import { CATEGORIAS_MANUT } from './manutencaoCatalogo'

/**
 * Listas da Frota no padrão do Design System (§10.9.1 e §10.9.2): Veículos e os registros de cada tipo (manutenções,
 * multas e colisões), cada um com suas colunas, campos de filtro, leitura em memória e visões prontas.
 */

const options = (list: Option[]): FilterOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))
const pick = (list: Option[], values: number[]): FilterOption[] => values.map((v) => ({ value: String(v), label: label(list, v, String(v)) }))
const quick = (field: string, op: FilterCondition['op'], values?: FilterOption[], extra?: Partial<FilterCondition>): FilterCondition =>
  ({ type: 'condition', id: `rapido-${field}`, field, op, ...(values ? { values } : {}), ...extra })
const withQuick = (conditions: FilterCondition[]): TableFilters => ({ ...emptyFilters(), quick: Object.fromEntries(conditions.map((c) => [c.field, c])) })

const configWith = (columns: ViewColumnDef[], sort: ViewSort, filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: columns.map((c) => ({ key: c.key, visible: true })),
  sort,
  filters: filters as unknown as Record<string, unknown>,
})
const builtin = (columns: ViewColumnDef[], sort: ViewSort) => (id: string, name: string, ordem: number, filters: TableFilters): StoredView =>
  ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(columns, sort, filters)) })

// ---------- Veículos ----------

export const TELA_VEICULOS = 'frota.veiculos'
export type LinhaVeiculo = { veiculo: Veiculo; motorista: string | null; pendencias: number; custo: ReturnType<typeof custoVeiculo> }

/** Colunas na ordem padrão; a primeira (Foto) é fixa. */
export const VEICULO_COLUMNS: ViewColumnDef[] = [
  { key: 'foto', label: 'Foto' },
  { key: 'placa', label: 'Placa' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'status', label: 'Status' },
  { key: 'motorista', label: 'Motorista atual' },
  { key: 'pendencias', label: 'Pendências' },
  { key: 'custo', label: 'Manutenção (12 meses)' },
]
export const VEICULO_SORT: ViewSort = { key: 'placa', dir: 'asc' }

export const VEICULO_FIELDS: FilterField[] = [
  { key: 'placa', label: 'Placa', kind: 'text' },
  { key: 'categoria', label: 'Categoria', kind: 'choice', options: options(CATEGORIA) },
  { key: 'status', label: 'Status', kind: 'choice', options: options(VEICULO_STATUS) },
  { key: 'motorista', label: 'Motorista atual', kind: 'text' },
  { key: 'pendencias', label: 'Pendências', kind: 'number' },
  { key: 'custo', label: 'Manutenção (12 meses)', kind: 'number', money: true },
  { key: 'marca', label: 'Marca', kind: 'text', advancedOnly: true },
  { key: 'modelo', label: 'Modelo', kind: 'text', advancedOnly: true },
]

const ativos = () => withQuick([quick('status', 'in', pick(VEICULO_STATUS, [VEICULO.ATIVO]))])
/** A Visão padrão mostra só os ativos, como antes. */
export const VEICULO_DEFAULT_FILTERS = ativos()

export function readVeiculo(l: LinhaVeiculo, key: string): unknown {
  const v = l.veiculo
  switch (key) {
    case 'placa': return [v.placa, v.marca, v.modelo].filter(Boolean).join(' ')
    case 'categoria': return v.categoria == null ? null : String(v.categoria)
    case 'status': return v.status == null ? null : String(v.status)
    case 'motorista': return l.motorista
    case 'pendencias': return l.pendencias
    case 'custo': return l.custo.qtd > l.custo.semValor ? l.custo.total : null
    case 'marca': return v.marca
    case 'modelo': return v.modelo
    default: return null
  }
}

export const matchesVeiculoKeyword = (l: LinhaVeiculo, query: string) => {
  const termo = query.trim().toLowerCase()
  return !termo || [l.veiculo.placa, l.veiculo.marca, l.veiculo.modelo, l.motorista].some((valor) => valor?.toLowerCase().includes(termo))
}

export function sortVeiculos(list: LinhaVeiculo[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (l) => {
    switch (sort.key) {
      case 'placa': return l.veiculo.placa
      case 'categoria': return l.veiculo.categoria == null ? null : label(CATEGORIA, l.veiculo.categoria)
      case 'status': return l.veiculo.status == null ? null : label(VEICULO_STATUS, l.veiculo.status)
      case 'motorista': return l.motorista
      case 'pendencias': return l.pendencias
      case 'custo': return readVeiculo(l, 'custo') as number | null
      default: return null
    }
  }, sort.dir)
}

/** `status` antigo na URL: vazio = todos, `sem` = sem status, número = aquele status. */
export function veiculoLegacy(q: URLSearchParams): TableFilters {
  const status = q.get('status') ?? ''
  if (!status) return emptyFilters()
  if (status === 'sem') return withQuick([quick('status', 'empty')])
  return withQuick([quick('status', 'in', pick(VEICULO_STATUS, [Number(status)]))])
}

export function veiculoBuiltins(): StoredView[] {
  const view = builtin(VEICULO_COLUMNS, VEICULO_SORT)
  return [
    view('todos', 'Todos os veículos', 1, emptyFilters()),
    view('pendencias', 'Com pendências', 2, withQuick([...Object.values(ativos().quick), quick('pendencias', 'gt', undefined, { value: 0 })])),
  ]
}

// ---------- Registros (manutenções, multas e colisões) ----------

export const telaRegistros = (kind: Kind) => `frota.${kind}`
export const PESSOA: Record<Kind, string> = { manutencao: 'Solicitante', multa: 'Motorista', colisao: 'Motorista' }
export const EXTRA: Record<Kind, string> = { manutencao: 'Valor / grau', multa: 'Valor', colisao: 'Terceiro' }
export const REGISTRO_SORT: ViewSort = { key: 'data', dir: 'desc' }

/** Colunas na ordem padrão; a primeira (Descrição) é fixa. */
export const registroColumns = (kind: Kind): ViewColumnDef[] => [
  { key: 'descricao', label: 'Descrição' },
  { key: 'data', label: 'Data' },
  { key: 'veiculo', label: 'Veículo' },
  { key: 'pessoa', label: PESSOA[kind] },
  { key: 'extra', label: EXTRA[kind] },
  { key: 'status', label: 'Status' },
]

export function registroFields(kind: Kind, opcoes: { veiculos: FilterOption[]; pessoas: FilterOption[] }): FilterField[] {
  return [
    { key: 'descricao', label: 'Descrição', kind: 'text' },
    { key: 'data', label: 'Data', kind: 'date' },
    { key: 'veiculo', label: 'Veículo', kind: 'choice', options: opcoes.veiculos },
    { key: 'pessoa', label: PESSOA[kind], kind: 'choice', options: opcoes.pessoas },
    { key: 'extra', label: EXTRA[kind], kind: 'text' },
    { key: 'status', label: 'Status', kind: 'choice', options: options(STATUS_OPTIONS[kind]) },
    ...(kind === 'manutencao' ? [{ key: 'categoria', label: 'Categoria', kind: 'choice' as const, options: options(CATEGORIAS_MANUT), advancedOnly: true }] : []),
  ]
}

export function readRegistro(l: Linha, key: string): unknown {
  switch (key) {
    case 'descricao': return l.titulo
    case 'data': return l.dia
    case 'veiculo': return l.veiculo?.id ?? null
    case 'pessoa': return l.pessoa?.id ?? null
    case 'extra': return l.extra
    case 'status': return l.status == null ? null : String(l.status)
    case 'categoria': return l.categorias.map(String)
    default: return null
  }
}

export const matchesRegistroKeyword = (l: Linha, query: string) => {
  const termo = query.trim().toLowerCase()
  return !termo || [l.titulo, l.veiculo?.label, l.pessoa?.label].some((valor) => valor?.toLowerCase().includes(termo))
}

export function sortRegistros(list: Linha[], kind: Kind, sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (l) => {
    switch (sort.key) {
      case 'descricao': return l.titulo
      case 'data': return l.dia
      case 'veiculo': return l.veiculo?.label
      case 'pessoa': return l.pessoa?.label
      case 'status': return l.status == null ? null : label(STATUS_OPTIONS[kind], l.status)
      default: return null
    }
  }, sort.dir)
}

const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Filtros antigos na URL (`status`, `veiculo`, `pessoa`, `categoria`, `de`, `ate`) no formato novo. */
export function registroLegacy(q: URLSearchParams, kind: Kind, opcoes: { veiculos: FilterOption[]; pessoas: FilterOption[] }): TableFilters {
  const conds: FilterCondition[] = []
  const status = q.get('status')
  if (status) conds.push(quick('status', 'in', pick(STATUS_OPTIONS[kind], [Number(status)])))
  const ref = (key: 'veiculo' | 'pessoa', opts: FilterOption[]) => {
    const id = q.get(key)
    const opt = id ? opts.find((o) => o.value === id) : undefined
    if (opt) conds.push(quick(key, 'in', [opt]))
  }
  ref('veiculo', opcoes.veiculos)
  ref('pessoa', opcoes.pessoas)
  const de = q.get('de') ?? ''
  const ate = q.get('ate') ?? ''
  if (isDay(de) && isDay(ate)) conds.push(quick('data', 'between', undefined, { value: de, to: ate }))
  else if (isDay(de)) conds.push(quick('data', 'after', undefined, { value: addDays(de, -1) }))
  else if (isDay(ate)) conds.push(quick('data', 'before', undefined, { value: addDays(ate, 1) }))
  const filters = withQuick(conds)
  const categoria = q.get('categoria')
  if (kind === 'manutencao' && categoria) filters.advanced.items.push({ type: 'condition', id: 'categoria-in', field: 'categoria', op: 'in', values: pick(CATEGORIAS_MANUT, [Number(categoria)]) })
  return filters
}

/** Visões prontas por tipo: o que ainda pede ação. */
export function registroBuiltins(kind: Kind): StoredView[] {
  const view = builtin(registroColumns(kind), REGISTRO_SORT)
  const status = (values: number[]) => withQuick([quick('status', 'in', pick(STATUS_OPTIONS[kind], values))])
  if (kind === 'manutencao') return [view('abertas', 'Em aberto', 1, status([MANUT.SOLICITADO, MANUT.APROVADO, MANUT.PROGRAMADO]))]
  if (kind === 'multa') return [view('notificar', 'A notificar', 1, status([MULTA.NOTIFICAR]))]
  return [view('andamento', 'Em andamento', 1, status([COLISAO.ENVIADO, COLISAO.ANALISE]))]
}
