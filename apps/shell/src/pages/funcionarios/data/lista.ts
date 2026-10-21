import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { ASO_VALIDADE_MESES, type AlertKind } from './alerts'
import { addMonths } from './dates'
import { searchable, type Filters } from './filters'
import { digitsOnly, normalizeSearch } from './format'
import { EMPRESA, FUNCAO, STATUS, VINCULO, optionLabel, type Option } from './schema'
import type { FuncionarioView } from './types'

/**
 * A lista de Funcionários (desktop) no padrão do Design System (§10.9.1 e §10.9.2): colunas da visão, campos de
 * filtro, leitura em memória e visões prontas. A Visão padrão esconde os desligados, como antes. Os chips de alerta
 * (CNH, ASO, aniversários) ficam fora da visão, como a busca.
 */

export const TELA = 'funcionarios'
export const FUNCIONARIO_SORT: ViewSort = { key: 'nome', dir: 'asc' }

/** Colunas na ordem padrão; a primeira (Colaborador) é fixa. */
export const FUNCIONARIO_COLUMNS: ViewColumnDef[] = [
  { key: 'nome', label: 'Colaborador' },
  { key: 'funcao', label: 'Função' },
  { key: 'status', label: 'Status' },
  { key: 'contato', label: 'Contato' },
  { key: 'veiculo', label: 'Veículo atual' },
  { key: 'cnh', label: 'CNH' },
  { key: 'aso', label: 'ASO vence' },
  { key: 'admissao', label: 'Admissão' },
]

const options = (list: Option[]): FilterOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))
const EMPRESA_CURTA: Option[] = EMPRESA.map((option) => ({ ...option, label: option.value === 202410000 ? 'Betinhos' : 'DePaula' }))

/** Campos filtráveis: os das colunas entram no filtro rápido; os demais só no avançado. */
export const FUNCIONARIO_FIELDS: FilterField[] = [
  { key: 'nome', label: 'Colaborador', kind: 'text' },
  { key: 'funcao', label: 'Função', kind: 'choice', options: options(FUNCAO) },
  { key: 'status', label: 'Status', kind: 'choice', options: options(STATUS) },
  { key: 'contato', label: 'Contato', kind: 'text' },
  { key: 'veiculo', label: 'Veículo atual', kind: 'text' },
  { key: 'cnh', label: 'Validade da CNH', kind: 'date' },
  { key: 'aso', label: 'ASO vence', kind: 'date' },
  { key: 'admissao', label: 'Admissão', kind: 'date' },
  { key: 'empresa', label: 'Empresa', kind: 'choice', options: options(EMPRESA_CURTA), advancedOnly: true },
  { key: 'vinculo', label: 'Vínculo', kind: 'choice', options: options(VINCULO), advancedOnly: true },
]

const asText = (v: unknown) => (typeof v === 'number' ? String(v) : null)
const day = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null)
const asoVence = (row: FuncionarioView) => { const d = day(row.values.cr40f_datadoaso); return d ? addMonths(d, ASO_VALIDADE_MESES) : null }
export const contato = (row: FuncionarioView) => String(row.values.cr40f_telefonecorporativo ?? row.values.cr40f_telefonepessoal ?? '')

export function readFuncionario(row: FuncionarioView, key: string): unknown {
  const v = row.values
  switch (key) {
    case 'nome': return [v.cr40f_nomecompleto, v.new_apelido].filter(Boolean).join(' ')
    case 'funcao': return asText(v.cr40f_funcao)
    case 'status': return asText(v.cr40f_status)
    case 'contato': return [v.cr40f_telefonecorporativo, v.cr40f_telefonepessoal].filter(Boolean).join(' ')
    case 'veiculo': return row.veiculo?.label ?? null
    case 'cnh': return day(v.cr40f_validadedacnh)
    case 'aso': return asoVence(row)
    case 'admissao': return day(v.cr40f_datadeadmissao)
    case 'empresa': return asText(v.cr40f_nomedaempresa)
    case 'vinculo': return asText(v.cr40f_tipodevinculo)
    default: return null
  }
}

/** Busca (não fica na visão): nome, apelido, CPF, telefones e placa; com 3+ dígitos também compara só os números. */
export function matchesKeyword(row: FuncionarioView, search: string) {
  const term = normalizeSearch(search.trim())
  if (!term) return true
  const { text, digits } = searchable(row)
  const termDigits = digitsOnly(search)
  return text.includes(term) || (termDigits.length >= 3 && digits.includes(termDigits))
}

export const matchesAlerta = (row: FuncionarioView, alerta: AlertKind | null) => !alerta || row.alertas.some((a) => a.kind === alerta)

export function sortFuncionarios(list: FuncionarioView[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (row) => {
    const v = row.values
    switch (sort.key) {
      case 'nome': return normalizeSearch(String(v.cr40f_nomecompleto ?? '')) || null
      case 'funcao': return optionLabel(FUNCAO, v.cr40f_funcao) || null
      case 'status': return optionLabel(STATUS, v.cr40f_status) || null
      case 'contato': return contato(row) || null
      case 'veiculo': return row.veiculo?.label
      case 'cnh': return day(v.cr40f_validadedacnh)
      case 'aso': return asoVence(row)
      case 'admissao': return day(v.cr40f_datadeadmissao)
      default: return null
    }
  }, sort.dir)
}

const quick = (field: string, list: Option[], values: number[]): FilterCondition =>
  ({ type: 'condition', id: `rapido-${field}`, field, op: 'in', values: values.map((v) => ({ value: String(v), label: optionLabel(list, v) || String(v) })) })
const withQuick = (conds: FilterCondition[], advanced: FilterCondition[] = []): TableFilters =>
  ({ ...emptyFilters(), quick: Object.fromEntries(conds.map((c) => [c.field, c])), advanced: { ...emptyFilters().advanced, items: advanced } })

/** A Visão padrão: ativos e afastados (desligados escondidos). */
export const FUNCIONARIO_DEFAULT_FILTERS = withQuick([quick('status', STATUS, [0, 2])])

/** Filtros antigos na URL (`status`, `funcao`, `empresa`, `vinculo`) no formato novo. */
export function fromLegacyFilters(f: Pick<Filters, 'status' | 'funcao' | 'empresa' | 'vinculo'>): TableFilters {
  const conds: FilterCondition[] = []
  if (f.status.length) conds.push(quick('status', STATUS, f.status))
  if (f.funcao != null) conds.push(quick('funcao', FUNCAO, [f.funcao]))
  const advanced: FilterCondition[] = []
  if (f.empresa != null) advanced.push({ ...quick('empresa', EMPRESA_CURTA, [f.empresa]), id: 'empresa-in' })
  if (f.vinculo != null) advanced.push({ ...quick('vinculo', VINCULO, [f.vinculo]), id: 'vinculo-in' })
  return withQuick(conds, advanced)
}

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: FUNCIONARIO_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: FUNCIONARIO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas: todos (com desligados), motoristas e desligados. */
export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('todos', 'Todos (com desligados)', 1, emptyFilters()),
    view('motoristas', 'Motoristas ativos', 2, withQuick([quick('status', STATUS, [0, 2]), quick('funcao', FUNCAO, [202410000])])),
    view('desligados', 'Desligados', 3, withQuick([quick('status', STATUS, [1])])),
  ]
}
