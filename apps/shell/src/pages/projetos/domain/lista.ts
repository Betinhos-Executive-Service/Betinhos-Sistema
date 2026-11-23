import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { formatDay } from '../../../app/format'
import { sortRows } from '../../../app/listSort'
import { STATUS, STATUS_OPTIONS, statusLabel } from './choices'
import type { ProjetoLinha } from './types'

/** Projetos no padrão de listas do DS (§10.9.1/§10.9.2). A Visão padrão mostra todos. */
export const TELA = 'projetos'
export const PROJETO_SORT: ViewSort = { key: 'projeto', dir: 'asc' }

export const PROJETO_COLUMNS: ViewColumnDef[] = [
  { key: 'projeto', label: 'Projeto' },
  { key: 'status', label: 'Status' },
  { key: 'andamento', label: 'Andamento' },
  { key: 'prazo', label: 'Prazo' },
  { key: 'area', label: 'Área' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'ultima', label: 'Última atualização' },
]

const STATUS_FILTER: FilterOption[] = STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))

export const projetoFields = (): FilterField[] => [
  { key: 'projeto', label: 'Projeto', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'choice', options: STATUS_FILTER },
  { key: 'andamento', label: 'Andamento (%)', kind: 'number' },
  { key: 'prazo', label: 'Prazo', kind: 'date' },
  { key: 'area', label: 'Área', kind: 'text' },
  { key: 'responsavel', label: 'Responsável', kind: 'text' },
  { key: 'ultima', label: 'Última atualização', kind: 'date' },
]

export function readProjeto(p: ProjetoLinha, key: string): unknown {
  switch (key) {
    case 'projeto': return p.nome
    case 'status': return p.status == null ? null : String(p.status)
    case 'andamento': return p.andamento
    case 'prazo': return p.prazo
    case 'area': return p.area
    case 'responsavel': return p.responsavel
    case 'ultima': return p.ultimaEm?.slice(0, 10) ?? null
    default: return null
  }
}

/** Texto em que a busca procura: tudo o que a lista mostra mais o link do PR e as instruções. */
export const projetoKeywordText = (p: ProjetoLinha) => [
  p.nome, p.area, statusLabel(p.status), p.responsavel, formatDay(p.prazo), formatDay(p.ultimaEm), p.linkPr, p.instrucoes,
].filter(Boolean).join(' ')

export function sortProjetos(list: ProjetoLinha[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (p) => {
    switch (sort.key) {
      case 'projeto': return p.nome || null
      case 'status': return p.status
      case 'andamento': return p.andamento
      case 'prazo': return p.prazo
      case 'area': return p.area || null
      case 'responsavel': return p.responsavel || null
      case 'ultima': return p.ultimaEm
      default: return null
    }
  }, sort.dir)
}

/** Filtro rápido de Status no mesmo formato que o seletor da barra gera (`rapido-status`, `in`). */
const quickStatus = (values: number[]): FilterCondition =>
  ({ type: 'condition', id: 'rapido-status', field: 'status', op: 'in', values: STATUS_FILTER.filter((o) => values.includes(Number(o.value))) })
const withQuick = (quick: FilterCondition[]): TableFilters =>
  ({ ...emptyFilters(), quick: Object.fromEntries(quick.map((c) => [c.field, c])) })

export const PROJETO_DEFAULT_FILTERS = emptyFilters()

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: PROJETO_COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
  sort: PROJETO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas: em curso (ideia, andamento, validação), aguardando minha validação e concluídos. */
export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('em-curso', 'Em curso', 1, withQuick([quickStatus([STATUS.ideia, STATUS.andamento, STATUS.validacao])])),
    view('em-validacao', 'Em validação', 2, withQuick([quickStatus([STATUS.validacao])])),
    view('concluidos', 'Concluídos', 3, withQuick([quickStatus([STATUS.concluido])])),
  ]
}
