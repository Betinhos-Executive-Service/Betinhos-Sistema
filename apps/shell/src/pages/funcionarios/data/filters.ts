import { ASO_VALIDADE_MESES, computeAlertas, type AlertKind } from './alerts'
import { digitQuery, keywordIndex, searchWords } from '../../../app/search'
import { addMonths, formatBR } from './dates'
import { digitsOnly, normalizeSearch } from './format'
import { EMPRESA, FUNCAO, STATUS, VINCULO, optionLabel } from './schema'
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

const day = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null)

/** Data de vencimento do ASO (a coluna "ASO vence"): data do ASO + validade. */
export function asoVence(row: Funcionario) {
  const d = day(row.values.cr40f_datadoaso)
  return d ? addMonths(d, ASO_VALIDADE_MESES) : null
}

/**
 * Texto da busca por colaborador: tudo o que a lista mostra (nome, apelido, função, status, contatos, veículo, CNH, ASO
 * vence, admissão em dd/mm/aaaa) mais CPF, RG, e-mails, empresa, vínculo, relação trabalhista, categoria da CNH,
 * filiação e endereço. CPF, RG e telefones entram também só com números, para achar sem pontuação.
 */
export function searchText(row: Funcionario) {
  const v = row.values
  const identificadores = [v.cr40f_numerodocpf, v.cr40f_numerodorg, v.cr40f_telefonecorporativo, v.cr40f_telefonepessoal, v.cr40f_telefonedeemergencia].filter(Boolean).map(String)
  const datas = [day(v.cr40f_validadedacnh), asoVence(row), day(v.cr40f_datadeadmissao)].map((d) => formatBR(d))
  return [
    v.cr40f_nomecompleto, v.new_apelido, optionLabel(FUNCAO, v.cr40f_funcao), optionLabel(STATUS, v.cr40f_status), ...identificadores, ...identificadores.map(digitsOnly), v.cr40f_emailbetinhos, v.cr40f_emailmicrosoft,
    row.veiculo?.label, ...datas, optionLabel(EMPRESA, v.cr40f_nomedaempresa), optionLabel(VINCULO, v.cr40f_tipodevinculo), v.cr40f_relacaotrabalhista, v.cr40f_cnhtexto, v.cr40f_filiacao, v.cr40f_enderecocompleto,
  ].filter(Boolean).join(' ')
}

// Texto normalizado calculado uma vez por registro (não a cada tecla); registro salvo chega como objeto novo.
const searchIndex = keywordIndex<Funcionario>(searchText)

/** Cada palavra tem de aparecer em algum campo (E entre palavras, OU entre campos); CPF ou telefone com máscara compara só os números. */
export function matchesWords(row: Funcionario, words: string[]) {
  if (searchIndex.matches(row, words)) return true
  const digits = digitQuery(words)
  return !!digits && searchIndex.matches(row, [digits])
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
  const words = searchWords(filters.search)
  return rows.filter((row) => {
    const v = row.values
    if (filters.status.length && !filters.status.includes(v.cr40f_status as number)) return false
    if (filters.funcao !== null && v.cr40f_funcao !== filters.funcao) return false
    if (filters.empresa !== null && v.cr40f_nomedaempresa !== filters.empresa) return false
    if (filters.vinculo !== null && v.cr40f_tipodevinculo !== filters.vinculo) return false
    return matchesWords(row, words)
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
