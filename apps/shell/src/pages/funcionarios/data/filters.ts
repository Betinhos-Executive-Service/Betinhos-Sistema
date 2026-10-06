import { computeAlertas, type AlertKind } from './alerts'
import { digitsOnly, normalizeSearch } from './format'
import type { Funcionario, FuncionarioView } from './types'

export type SortKey = 'nome' | 'funcao' | 'status' | 'cnh' | 'aso' | 'admissao'

export type Filters = {
  search: string
  status: number[]
  funcao: number | null
  empresa: number | null
  vinculo: number | null
  alerta: AlertKind | null
  sort: SortKey
  desc: boolean
}

export const DEFAULT_FILTERS: Filters = { search: '', status: [0, 2], funcao: null, empresa: null, vinculo: null, alerta: null, sort: 'nome', desc: false }

const STORAGE_KEY = 'tela-funcionarios:filtros:v1'

export function loadFilters(): Filters {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return saved ? { ...DEFAULT_FILTERS, ...saved, search: '', alerta: null } : DEFAULT_FILTERS
  } catch {
    return DEFAULT_FILTERS
  }
}

export function saveFilters(filters: Filters) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)) } catch { /* armazenamento bloqueado */ }
}

export function withAlertas(rows: Funcionario[], today: string): FuncionarioView[] {
  return rows.map((row) => ({
    ...row,
    alertas: computeAlertas({
      status: row.values.cr40f_status as number | null,
      validadeCnh: row.values.cr40f_validadedacnh as string | null,
      dataAso: row.values.cr40f_datadoaso as string | null,
      aniversario: row.values.cr40f_datadeaniversario as string | null,
    }, today),
  }))
}

function searchable(row: Funcionario) {
  const v = row.values
  const text = [v.cr40f_nomecompleto, v.new_apelido, v.cr40f_numerodocpf, v.cr40f_telefonecorporativo, v.cr40f_telefonepessoal, row.veiculo?.label].filter(Boolean).join(' ')
  return { text: normalizeSearch(text), digits: digitsOnly(text) }
}

function sortValue(row: FuncionarioView, key: SortKey): string {
  const v = row.values
  switch (key) {
    case 'nome': return normalizeSearch(String(v.cr40f_nomecompleto ?? ''))
    case 'funcao': return String(v.cr40f_funcao ?? '')
    case 'status': return String(v.cr40f_status ?? '')
    case 'cnh': return String(v.cr40f_validadedacnh ?? '9999')
    case 'aso': return String(v.cr40f_datadoaso ?? '9999')
    case 'admissao': return String(v.cr40f_datadeadmissao ?? '9999')
  }
}

/** Filtro sem os chips de alerta (usado para contar os chips). */
export function applyBaseFilters(rows: FuncionarioView[], filters: Filters) {
  const term = normalizeSearch(filters.search.trim())
  const termDigits = digitsOnly(filters.search)
  return rows.filter((row) => {
    const v = row.values
    if (filters.status.length && !filters.status.includes(v.cr40f_status as number)) return false
    if (filters.funcao !== null && v.cr40f_funcao !== filters.funcao) return false
    if (filters.empresa !== null && v.cr40f_nomedaempresa !== filters.empresa) return false
    if (filters.vinculo !== null && v.cr40f_tipodevinculo !== filters.vinculo) return false
    if (!term) return true
    const { text, digits } = searchable(row)
    return text.includes(term) || (termDigits.length >= 3 && digits.includes(termDigits))
  })
}

export function applyFilters(rows: FuncionarioView[], filters: Filters) {
  const base = applyBaseFilters(rows, filters)
  const filtered = filters.alerta ? base.filter((row) => row.alertas.some((alerta) => alerta.kind === filters.alerta)) : base
  const direction = filters.desc ? -1 : 1
  return [...filtered].sort((a, b) => sortValue(a, filters.sort).localeCompare(sortValue(b, filters.sort)) * direction)
}

export function countAlertas(rows: FuncionarioView[]) {
  const count = { cnh: 0, aso: 0, aniversario: 0 } as Record<AlertKind, number>
  for (const row of rows) for (const kind of new Set(row.alertas.map((alerta) => alerta.kind))) count[kind]++
  return count
}
