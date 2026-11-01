import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { normalize } from '../../infracoes/domain/filters'
import { ESTADO, PUBLICO, type Treinamento } from './treinamentos'

/** Treinamentos no padrão de listas do DS (§10.9.1/§10.9.2). A Visão padrão mostra rascunhos e publicados. */

export const TELA = 'treinamentos'
export const TREINAMENTO_SORT: ViewSort = { key: 'criado', dir: 'desc' }

export const TREINAMENTO_COLUMNS: ViewColumnDef[] = [
  { key: 'titulo', label: 'Treinamento' },
  { key: 'estado', label: 'Situação' },
  { key: 'publico', label: 'Público-alvo' },
  { key: 'exigencias', label: 'Exige' },
  { key: 'validade', label: 'Validade' },
  { key: 'publicadoEm', label: 'Publicado em' },
  { key: 'criado', label: 'Criado em', defaultHidden: true },
]

const ESTADO_FILTER: FilterOption[] = [{ value: String(ESTADO.rascunho), label: 'Rascunho' }, { value: String(ESTADO.publicado), label: 'Publicado' }]
const PUBLICO_FILTER: FilterOption[] = [{ value: String(PUBLICO.motoristas), label: 'Todos os motoristas' }, { value: String(PUBLICO.funcao), label: 'Por função' }, { value: String(PUBLICO.selecionados), label: 'Selecionados' }]
const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

export const TREINAMENTO_FIELDS: FilterField[] = [
  { key: 'titulo', label: 'Treinamento', kind: 'text' },
  { key: 'estado', label: 'Situação', kind: 'choice', options: ESTADO_FILTER },
  { key: 'publico', label: 'Público-alvo', kind: 'choice', options: PUBLICO_FILTER },
  { key: 'validade', label: 'Validade', kind: 'date' },
  { key: 'publicadoEm', label: 'Publicado em', kind: 'date' },
  { key: 'exigeAssinatura', label: 'Exige assinatura', kind: 'bool', options: SIM_NAO, advancedOnly: true },
  { key: 'exigeQuiz', label: 'Exige quiz', kind: 'bool', options: SIM_NAO, advancedOnly: true },
]

/** Linha da lista: o treinamento mais a data de criação (ordenação padrão). */
export type Linha = Treinamento & { criadoEm: string }

export function readTreinamento(t: Linha, key: string): unknown {
  switch (key) {
    case 'titulo': return t.titulo
    case 'estado': return String(t.estado)
    case 'publico': return String(t.publicoTipo)
    case 'validade': return t.validade || null
    case 'publicadoEm': return t.publicadoEm ? t.publicadoEm.slice(0, 10) : null
    case 'exigeAssinatura': return t.exigeAssinatura
    case 'exigeQuiz': return t.exigeQuiz
    default: return null
  }
}

export function matchesKeyword(t: Treinamento, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = normalize(`${t.titulo} ${t.descricao}`)
  return terms.every((term) => hay.includes(term))
}

export function sortTreinamentos(list: Linha[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (t) => {
    switch (sort.key) {
      case 'titulo': return t.titulo || null
      case 'estado': return t.estado
      case 'publico': return t.publicoTipo
      case 'exigencias': return Number(t.exigeAssinatura) + Number(t.exigeQuiz)
      case 'validade': return t.validade || null
      case 'publicadoEm': return t.publicadoEm
      case 'criado': return t.criadoEm
      default: return null
    }
  }, sort.dir)
}

const quickEstado = (values: number[]): FilterCondition =>
  ({ type: 'condition', id: 'rapido-estado', field: 'estado', op: 'in', values: ESTADO_FILTER.filter((o) => values.includes(Number(o.value))) })
const withQuick = (quick: FilterCondition[]): TableFilters => ({ ...emptyFilters(), quick: Object.fromEntries(quick.map((c) => [c.field, c])) })

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: TREINAMENTO_COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
  sort: TREINAMENTO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('rascunhos', 'Rascunhos', 1, withQuick([quickEstado([ESTADO.rascunho])])),
    view('publicados', 'Publicados', 2, withQuick([quickEstado([ESTADO.publicado])])),
  ]
}
