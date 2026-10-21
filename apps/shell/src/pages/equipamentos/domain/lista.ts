import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { normalize } from '../../infracoes/domain/filters'
import { byNome } from './cadastros'
import { STATUS, STATUS_OPTIONS } from './choices'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'

/** Equipamentos no padrão de listas do DS (§10.9.1/§10.9.2). A Visão padrão esconde os baixados. */

export const TELA = 'equipamentos'
export const EQUIPAMENTO_SORT: ViewSort = { key: 'equipamento', dir: 'asc' }

/** Colunas na ordem padrão; a primeira (Equipamento) é fixa. */
export const EQUIPAMENTO_COLUMNS: ViewColumnDef[] = [
  { key: 'equipamento', label: 'Equipamento' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'marcaModelo', label: 'Marca/modelo' },
  { key: 'serie', label: 'Nº de série' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'status', label: 'Status' },
  { key: 'compra', label: 'Compra' },
]

const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

/** Campos de filtro; tipo e responsável vêm dos cadastros carregados. */
export function equipamentoFields(tipos: TipoEquipamento[], pessoas: Pessoa[]): FilterField[] {
  return [
    { key: 'equipamento', label: 'Equipamento', kind: 'text' },
    { key: 'tipo', label: 'Tipo', kind: 'choice', options: [...tipos].sort(byNome).map((t) => ({ value: t.id, label: t.nome })) },
    { key: 'marcaModelo', label: 'Marca/modelo', kind: 'text' },
    { key: 'serie', label: 'Nº de série', kind: 'text' },
    { key: 'responsavel', label: 'Responsável', kind: 'choice', options: [...pessoas].sort(byNome).map((p) => ({ value: p.id, label: p.nome })) },
    { key: 'status', label: 'Status', kind: 'choice', options: STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })) },
    { key: 'compra', label: 'Valor de compra', kind: 'number', money: true },
    { key: 'comResponsavel', label: 'Com responsável', kind: 'bool', options: SIM_NAO, advancedOnly: true },
    { key: 'baixado', label: 'Baixado', kind: 'bool', options: SIM_NAO, advancedOnly: true },
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
    case 'compra': return e.valorCompra
    case 'comResponsavel': return Boolean(e.responsavelId)
    case 'baixado': return e.status === STATUS.baixado
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

const flag = (field: string, yes: boolean): FilterCondition => ({ type: 'condition', id: `${field}-${yes ? 'yes' : 'no'}`, field, op: yes ? 'yes' : 'no' })
const advanced = (items: FilterCondition[]): TableFilters => ({ ...emptyFilters(), advanced: { ...emptyFilters().advanced, items } })

/** A Visão padrão: tudo menos os baixados. */
export const EQUIPAMENTO_DEFAULT_FILTERS = advanced([flag('baixado', false)])

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: EQUIPAMENTO_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: EQUIPAMENTO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas: todos (inclusive baixados), sem responsável (fora os baixados) e só os baixados. */
export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('todos', 'Todos, inclusive baixados', 1, emptyFilters()),
    view('sem-responsavel', 'Sem responsável', 2, advanced([flag('baixado', false), flag('comResponsavel', false)])),
    view('baixados', 'Baixados', 3, advanced([flag('baixado', true)])),
  ]
}
