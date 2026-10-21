import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { normalize } from '../../infracoes/domain/filters'
import { byNome } from './cadastros'
import { STATUS, STATUS_OPTIONS } from './choices'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'

/** Equipamentos no padrão de listas do DS (§10.9.1/§10.9.2). A Visão padrão esconde os baixados. */

export const TELA = 'equipamentos'
export const EQUIPAMENTO_SORT: ViewSort = { key: 'equipamento', dir: 'asc' }

/**
 * Colunas na ordem padrão; a primeira (Equipamento) é fixa. Responsável e Status vêm antes de Nº de série e
 * Compra para continuarem à vista em 1366 px (a tabela rola só no fim).
 */
export const EQUIPAMENTO_COLUMNS: ViewColumnDef[] = [
  { key: 'equipamento', label: 'Equipamento' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'marcaModelo', label: 'Marca/modelo' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'status', label: 'Status' },
  { key: 'serie', label: 'Nº de série' },
  { key: 'compra', label: 'Compra' },
]

const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

const STATUS_FILTER: FilterOption[] = STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))

/** Opções de filtro de um cadastro: todos (itens antigos podem apontar para inativos), inativos marcados. */
const cadastroOptions = (list: { id: string; nome: string; ativo: boolean }[]): FilterOption[] =>
  [...list].sort(byNome).map((x) => ({ value: x.id, label: x.ativo ? x.nome : `${x.nome} (inativo)` }))

/**
 * Pessoas para o filtro de Responsável: só quem tem algum item (o cadastro de funcionários tem centenas).
 * Responsável fora do cadastro carregado entra pelo nome gravado no item.
 */
export function pessoasResponsaveis(equipamentos: Equipamento[], pessoas: Pessoa[]): Pessoa[] {
  const porId = new Map(pessoas.map((p) => [p.id, p]))
  const out = new Map<string, Pessoa>()
  for (const e of equipamentos) {
    if (!e.responsavelId || out.has(e.responsavelId)) continue
    out.set(e.responsavelId, porId.get(e.responsavelId) ?? { id: e.responsavelId, nome: e.responsavelNome || 'Funcionário', ativo: true })
  }
  return [...out.values()].sort(byNome)
}

/** Campos de filtro; tipo e responsável vêm dos cadastros carregados. A coluna Compra filtra pela data. */
export function equipamentoFields(tipos: TipoEquipamento[], pessoas: Pessoa[]): FilterField[] {
  return [
    { key: 'equipamento', label: 'Equipamento', kind: 'text' },
    { key: 'tipo', label: 'Tipo', kind: 'choice', options: cadastroOptions(tipos) },
    { key: 'marcaModelo', label: 'Marca/modelo', kind: 'text' },
    { key: 'serie', label: 'Nº de série', kind: 'text' },
    { key: 'responsavel', label: 'Responsável', kind: 'choice', options: cadastroOptions(pessoas) },
    { key: 'status', label: 'Status', kind: 'choice', options: STATUS_FILTER },
    { key: 'compra', label: 'Data de compra', kind: 'date' },
    { key: 'valorCompra', label: 'Valor de compra', kind: 'number', money: true, advancedOnly: true },
    { key: 'comResponsavel', label: 'Com responsável', kind: 'bool', options: SIM_NAO, advancedOnly: true },
  ]
}

export function readEquipamento(e: Equipamento, key: string): unknown {
  switch (key) {
    case 'equipamento': return e.descricao
    case 'tipo': return e.tipoId
    case 'marcaModelo': return e.marcaModelo
    case 'serie': return e.numeroSerie
    case 'responsavel': return e.responsavelId
    case 'status': return e.status == null ? null : String(e.status)
    case 'compra': return e.dataCompra
    case 'valorCompra': return e.valorCompra
    case 'comResponsavel': return Boolean(e.responsavelId)
    default: return null
  }
}

/** Busca (fora da visão): descrição, tipo, marca/modelo, série e responsável. */
export function matchesKeyword(e: Equipamento, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = normalize([e.descricao, e.tipoNome, e.marcaModelo, e.numeroSerie, e.responsavelNome].join(' '))
  return terms.every((t) => hay.includes(t))
}

export function sortEquipamentos(list: Equipamento[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (e) => {
    switch (sort.key) {
      case 'equipamento': return e.descricao || null
      case 'tipo': return e.tipoNome || null
      case 'marcaModelo': return e.marcaModelo || null
      case 'serie': return e.numeroSerie || null
      case 'responsavel': return e.responsavelNome || null
      case 'status': return e.status
      case 'compra': return e.dataCompra
      default: return null
    }
  }, sort.dir)
}

/** Filtro rápido de Status no mesmo formato que o seletor da barra gera (`rapido-status`, `in`). */
const quickStatus = (values: number[]): FilterCondition =>
  ({ type: 'condition', id: 'rapido-status', field: 'status', op: 'in', values: STATUS_FILTER.filter((o) => values.includes(Number(o.value))) })
const NAO_BAIXADOS = STATUS_OPTIONS.map((o) => o.value).filter((v) => v !== STATUS.baixado)
const semResponsavel: FilterCondition = { type: 'condition', id: 'comResponsavel-no', field: 'comResponsavel', op: 'no' }
const withQuick = (quick: FilterCondition[], advanced: FilterCondition[] = []): TableFilters =>
  ({ ...emptyFilters(), quick: Object.fromEntries(quick.map((c) => [c.field, c])), advanced: { ...emptyFilters().advanced, items: advanced } })

/** A Visão padrão: Status rápido com tudo menos Baixado; mudar o Status na barra traz os baixados de volta. */
export const EQUIPAMENTO_DEFAULT_FILTERS = withQuick([quickStatus(NAO_BAIXADOS)])

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: EQUIPAMENTO_COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
  sort: EQUIPAMENTO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas: todos (inclusive baixados), sem responsável (fora os baixados) e só os baixados. */
export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('todos', 'Todos, inclusive baixados', 1, emptyFilters()),
    view('sem-responsavel', 'Sem responsável', 2, withQuick([quickStatus(NAO_BAIXADOS)], [semResponsavel])),
    view('baixados', 'Baixados', 3, withQuick([quickStatus([STATUS.baixado])])),
  ]
}
