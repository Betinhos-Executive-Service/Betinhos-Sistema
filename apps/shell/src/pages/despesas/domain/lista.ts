import { CONFIG_VERSION, emptyFilters, normalizeSearch, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig } from '@betinhos/ui'
import { label } from '../../pagantes/domain/status'
import { ALERTAS, type Alerta, type Filters } from './filters'
import { suspeitaIA } from './ia'
import { FINANCEIRO, OPERACIONAL, semComprovante } from './status'
import type { Despesa, DespesaChoices } from './types'

/**
 * A lista de Despesas no padrão do Design System (§10.9.1 e §10.9.2): colunas da visão, campos de filtro, leitura de
 * cada campo para filtrar em memória e as visões prontas. O período continua fora da visão: ele decide o que carrega.
 */

export const TELA = 'despesas'

/** Colunas na ordem padrão; a primeira (Despesa) é fixa. */
export const DESPESA_COLUMNS: ViewColumnDef[] = [
  { key: 'despesa', label: 'Despesa' },
  { key: 'data', label: 'Data' },
  { key: 'motorista', label: 'Motorista' },
  { key: 'valor', label: 'Valor' },
  { key: 'operacional', label: 'Operacional' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'alertas', label: 'Alertas' },
]

const options = (list: { value: number; label: string }[]): FilterOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Campos filtráveis: os das colunas entram no filtro rápido; os demais só no avançado. */
export function despesaFields(choices: DespesaChoices, opcoes: { categorias: FilterOption[]; motoristas: FilterOption[] }): FilterField[] {
  return [
    { key: 'despesa', label: 'Despesa', kind: 'text' },
    { key: 'data', label: 'Data', kind: 'date' },
    { key: 'motorista', label: 'Motorista', kind: 'choice', options: opcoes.motoristas },
    { key: 'valor', label: 'Valor', kind: 'number', money: true },
    { key: 'operacional', label: 'Operacional', kind: 'choice', options: options(choices.operacional) },
    { key: 'financeiro', label: 'Financeiro', kind: 'choice', options: options(choices.financeiro) },
    { key: 'alertas', label: 'Alertas', kind: 'choice', options: ALERTAS },
    { key: 'categoria', label: 'Categoria', kind: 'choice', options: opcoes.categorias, advancedOnly: true },
    { key: 'forma', label: 'Forma de pagamento', kind: 'text', advancedOnly: true },
    { key: 'reserva', label: 'Reserva', kind: 'text', advancedOnly: true },
    { key: 'veiculo', label: 'Veículo', kind: 'text', advancedOnly: true },
    { key: 'cidade', label: 'Cidade', kind: 'text', advancedOnly: true },
    { key: 'protocolo', label: 'Protocolo', kind: 'text', advancedOnly: true },
  ]
}

const asText = (v: number | null) => (v == null ? null : String(v))

/** Alertas que valem para a despesa (a coluna mostra os dois primeiros; a IA fica na ficha). */
export const alertasDe = (d: Despesa): Alerta[] => [
  ...(semComprovante(d) ? ['sem-comprovante' as const] : []),
  ...(d.possivelDuplicidade ? ['duplicidade' as const] : []),
  ...(suspeitaIA(d) ? ['ia-suspeita' as const] : []),
]

/** Valor de cada campo na despesa (para `matchesFilters`). */
export function readDespesa(d: Despesa, key: string): unknown {
  switch (key) {
    case 'despesa': return [d.estabelecimento, d.nome].filter(Boolean).join(' ')
    case 'data': return d.data
    case 'motorista': return d.motoristaId || null
    case 'valor': return d.valor
    case 'operacional': return asText(d.statusOperacional)
    case 'financeiro': return asText(d.statusFinanceiro)
    case 'alertas': return alertasDe(d)
    case 'categoria': return d.categoriaId || null
    case 'forma': return d.forma
    case 'reserva': return d.reserva
    case 'veiculo': return d.veiculo
    case 'cidade': return d.cidade
    case 'protocolo': return d.protocolo
    default: return null
  }
}

/** Busca por palavra-chave (não fica na visão). */
export function matchesKeyword(d: Despesa, query: string) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = normalizeSearch([d.nome, d.estabelecimento, d.motorista, d.categoria, d.forma, d.reserva, d.veiculo, d.protocolo, d.cidade].filter(Boolean).join(' '))
  return words.every((w) => text.includes(w))
}

/** Ordena pela coluna da visão; vazios por último. */
export function sortDespesas(list: Despesa[], key: string, dir: 'asc' | 'desc', choices: DespesaChoices) {
  const value = (d: Despesa): string | number | null => {
    switch (key) {
      case 'despesa': return d.estabelecimento || d.nome || null
      case 'data': return d.data ? d.data.getTime() : null
      case 'motorista': return d.motorista || null
      case 'valor': return d.valor
      case 'operacional': return d.statusOperacional == null ? null : label(choices.operacional, d.statusOperacional, '')
      case 'financeiro': return d.statusFinanceiro == null ? null : label(choices.financeiro, d.statusFinanceiro, '')
      default: return null
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (x == null || x === '' || y == null || y === '') return (x == null || x === '') === (y == null || y === '') ? 0 : x == null || x === '' ? 1 : -1
    const diff = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
    return diff * sign
  })
}

const cond = (field: string, op: FilterCondition['op'], values?: FilterOption[]): FilterCondition => ({ type: 'condition', id: `${field}-${op}${values?.length === 1 ? `-${values[0].value}` : ''}`, field, op, ...(values ? { values } : {}) })
const quick = (field: string, values: FilterOption[]) => ({ ...cond(field, 'in', values), id: `rapido-${field}` })
const pick = (list: { value: number; label: string }[], values: number[]): FilterOption[] => values.map((v) => ({ value: String(v), label: label(list, v, String(v)) }))
const byId = (opts: FilterOption[], ids: string[]): FilterOption[] => ids.map((id) => opts.find((o) => o.value === id) ?? { value: id, label: id })
const alerta = (a: Alerta): FilterOption => ALERTAS.find((x) => x.value === a)!

/** Filtros do formato antigo (barra de Despesas e visões do navegador) no formato novo; o período fica de fora. */
export function fromLegacyFilters(f: Omit<Filters, 'query' | 'periodo'>, choices: DespesaChoices, opcoes: { categorias: FilterOption[]; motoristas: FilterOption[] }): TableFilters {
  const filters = emptyFilters()
  if (f.operacional.length) filters.quick.operacional = quick('operacional', pick(choices.operacional, f.operacional))
  if (f.financeiro.length) filters.quick.financeiro = quick('financeiro', pick(choices.financeiro, f.financeiro))
  if (f.motorista.length) filters.quick.motorista = quick('motorista', byId(opcoes.motoristas, f.motorista))
  if (f.categoria.length) filters.advanced.items.push(cond('categoria', 'in', byId(opcoes.categorias, f.categoria)))
  // Na barra antiga todos os alertas marcados precisavam valer: uma condição por alerta, no grupo E.
  for (const a of f.alertas) filters.advanced.items.push(cond('alertas', 'in', [alerta(a)]))
  return filters
}

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: DESPESA_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: { key: 'data', dir: 'desc' },
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas (públicas e só leitura), as mesmas que a tela tinha antes. */
export function builtinViews(choices: DespesaChoices): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  const one = (field: 'operacional' | 'financeiro', value: number) => ({ ...emptyFilters(), quick: { [field]: quick(field, pick(choices[field], [value])) } })
  const comAlerta = (a: Alerta) => ({ ...emptyFilters(), quick: { alertas: quick('alertas', [alerta(a)]) } })
  return [
    view('aguardando', 'Aguardando pagamento', 1, one('financeiro', FINANCEIRO.aguardando)),
    view('corrigir', 'Precisa corrigir', 2, one('operacional', OPERACIONAL.corrigir)),
    view('sem-comprovante', 'Sem comprovante', 3, comAlerta('sem-comprovante')),
    view('duplicidade', 'Possível duplicidade', 4, comAlerta('duplicidade')),
    view('ia-suspeita', 'Suspeitas da IA', 5, comAlerta('ia-suspeita')),
  ]
}

/** Configuração de uma visão salva no navegador (formato antigo), para importar para o Dataverse. */
export const legacyViewConfig = (f: Omit<Filters, 'query' | 'periodo'>, choices: DespesaChoices, opcoes: { categorias: FilterOption[]; motoristas: FilterOption[] }) =>
  JSON.stringify(configWith(fromLegacyFilters(f, choices, opcoes)))
