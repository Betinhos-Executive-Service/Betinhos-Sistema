import { CONFIG_VERSION, emptyFilters, normalizeSearch, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { digitsOnly } from '../../../app/format'
import { sortRows } from '../../../app/listSort'
import { searchWords } from '../../../app/search'
import { COMPROVANTES_COLUMN, COMPROVANTES_FIELD } from '../../recebimentos/colunaOp'
import type { Filters } from './filters'
import { formatDate, formatMoney } from './messages'
import { A_RECEBER, STATUS, hasFalha, label, reciboEnviado } from './status'
import type { ChoiceSet, Contato, Pagante } from './types'

/**
 * A lista de Pagantes no padrão do Design System (§10.9.1 e §10.9.2): colunas da visão, campos de filtro, leitura em
 * memória e as visões prontas.
 */

export const TELA = 'pagantes'
export const PAGANTE_SORT: ViewSort = { key: 'criado', dir: 'desc' }

/** Colunas na ordem padrão; a primeira (Pagante) é fixa. */
export const PAGANTE_COLUMNS: ViewColumnDef[] = [
  { key: 'pessoa', label: 'Pagante' },
  COMPROVANTES_COLUMN,
  { key: 'codigo', label: 'Código' },
  { key: 'op', label: 'OP' },
  { key: 'valor', label: 'Valor' },
  { key: 'forma', label: 'Forma' },
  { key: 'status', label: 'Pagamento' },
  { key: 'recibo', label: 'Recibo' },
  { key: 'criado', label: 'Criado em' },
  { key: 'acoes', label: 'Ações rápidas' },
]

const options = (list: { value: number; label: string }[]): FilterOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))
const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

/** Campos filtráveis: os das colunas entram no filtro rápido; os demais só no avançado. */
export function paganteFields(choices: ChoiceSet): FilterField[] {
  return [
    { key: 'pessoa', label: 'Pagante', kind: 'text' },
    COMPROVANTES_FIELD,
    { key: 'codigo', label: 'Código', kind: 'text' },
    { key: 'op', label: 'OP', kind: 'text' },
    { key: 'valor', label: 'Valor', kind: 'number', money: true },
    { key: 'forma', label: 'Forma', kind: 'choice', options: options(choices.forma) },
    { key: 'status', label: 'Pagamento', kind: 'choice', options: options(choices.status) },
    { key: 'recibo', label: 'Recibo', kind: 'choice', options: options(choices.recibo) },
    { key: 'criado', label: 'Criado em', kind: 'date' },
    { key: 'enviado', label: 'Recibo enviado', kind: 'bool', options: SIM_NAO, advancedOnly: true },
    { key: 'falha', label: 'Falha de envio', kind: 'bool', options: SIM_NAO, advancedOnly: true },
    { key: 'pagoEm', label: 'Pago em', kind: 'date', advancedOnly: true },
  ]
}

const asText = (v: number | null) => (v == null ? null : String(v))

export function readPagante(p: Pagante, key: string): unknown {
  switch (key) {
    case 'pessoa': return p.pessoa
    case 'codigo': return p.codigo
    case 'op': return p.op
    case 'valor': return p.valor
    case 'forma': return asText(p.forma)
    case 'status': return asText(p.status)
    case 'recibo': return asText(p.recibo)
    case 'criado': return p.criadoEm
    case 'enviado': return reciboEnviado(p)
    case 'falha': return hasFalha(p)
    case 'pagoEm': return p.pagoEm
    default: return null
  }
}

/**
 * Texto em que a busca procura (não fica na visão): tudo que a lista mostra na forma exibida (valor e data
 * formatados, forma, pagamento, recibo, falha de envio) e o contato da pessoa (nome, telefone também só com dígitos,
 * e-mail, cliente). Sem as opções de escolha (modo mock do servidor) os rótulos ficam de fora.
 */
export const paganteKeywordText = (p: Pagante, contato: Contato | undefined, choices?: ChoiceSet) => [
  p.pessoa, p.codigo, p.op, contato?.nome, contato?.telefone, contato && digitsOnly(contato.telefone), contato?.email, contato?.cliente,
  p.valor == null ? '' : formatMoney(p.valor), p.criadoEm ? formatDate(p.criadoEm) : '',
  choices && p.forma != null ? label(choices.forma, p.forma, '') : '',
  choices && p.status != null ? label(choices.status, p.status, '') : '',
  choices && p.recibo != null ? label(choices.recibo, p.recibo, '') : '',
  hasFalha(p) ? 'Falha de envio' : '',
].filter(Boolean).join(' ')

export function matchesKeyword(p: Pagante, query: string, contato: Contato | undefined, choices?: ChoiceSet) {
  const text = normalizeSearch(paganteKeywordText(p, contato, choices))
  return searchWords(query).every((w) => text.includes(w))
}

export function sortPagantes(list: Pagante[], sort: ViewSort | null, choices: ChoiceSet) {
  if (!sort) return list
  return sortRows(list, (p) => {
    switch (sort.key) {
      case 'pessoa': return p.pessoa
      case 'codigo': return Number(digitsOnly(p.codigo)) || p.codigo || null
      case 'op': return Number(digitsOnly(p.op)) || p.op || null
      case 'valor': return p.valor
      case 'forma': return p.forma == null ? null : label(choices.forma, p.forma, '')
      case 'status': return p.status == null ? null : label(choices.status, p.status, '')
      case 'recibo': return p.recibo == null ? null : label(choices.recibo, p.recibo, '')
      case 'criado': return p.criadoEm?.getTime()
      default: return null
    }
  }, sort.dir)
}

const pick = (list: { value: number; label: string }[], values: number[]): FilterOption[] => values.map((v) => ({ value: String(v), label: label(list, v, String(v)) }))
const quick = (field: string, values: FilterOption[]): FilterCondition => ({ type: 'condition', id: `rapido-${field}`, field, op: 'in', values })
const flag = (field: string, yes: boolean): FilterCondition => ({ type: 'condition', id: `${field}-${yes ? 'yes' : 'no'}`, field, op: yes ? 'yes' : 'no' })

/** Filtros do formato antigo (URL e visões do navegador) no formato novo; o período fica de fora. */
export function fromLegacyFilters(f: Omit<Filters, 'query' | 'periodo'>, choices: ChoiceSet): TableFilters {
  const filters = emptyFilters()
  if (f.status.length) filters.quick.status = quick('status', pick(choices.status, f.status))
  if (f.forma != null) filters.quick.forma = quick('forma', pick(choices.forma, [f.forma]))
  if (f.recibo) filters.advanced.items.push(flag('enviado', f.recibo === 'enviado'))
  if (f.falhas) filters.advanced.items.push(flag('falha', true))
  return filters
}

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: PAGANTE_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: PAGANTE_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas (públicas e só leitura), as mesmas que a tela tinha antes. */
export function builtinViews(choices: ChoiceSet): StoredView[] {
  const view = (id: string, name: string, ordem: number, f: Partial<Omit<Filters, 'query' | 'periodo'>>): StoredView =>
    ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(fromLegacyFilters({ status: [], forma: null, recibo: null, falhas: false, ...f }, choices))) })
  return [
    view('a-receber', 'A receber', 1, { status: A_RECEBER }),
    view('pagos-sem-recibo', 'Pagos sem recibo enviado', 2, { status: [STATUS.pago, STATUS.autorizado], recibo: 'nao-enviado' }),
    view('falhas', 'Com falha de envio', 3, { falhas: true }),
  ]
}

/** Configuração de uma visão salva no navegador (formato antigo), para importar para o Dataverse. */
export const legacyViewConfig = (f: Omit<Filters, 'query' | 'periodo'>, choices: ChoiceSet) => JSON.stringify(configWith(fromLegacyFilters(f, choices)))
