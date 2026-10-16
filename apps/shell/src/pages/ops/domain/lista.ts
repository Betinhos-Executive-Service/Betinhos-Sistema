import { CONFIG_VERSION, emptyFilters, normalizeSearch, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { label } from '../../pagantes/domain/status'
import { EM_ABERTO, OP_STATUS } from './status'
import type { Op, OpChoices } from './types'

/**
 * A lista de Ordens de Pagamento no padrão do Design System (§10.9.1 e §10.9.2): colunas da visão, campos de filtro,
 * leitura em memória e as visões prontas. O período continua fora da visão: ele decide o que carrega.
 */

export const TELA = 'ops'
export const OP_SORT: ViewSort = { key: 'criada', dir: 'desc' }

/** Colunas na ordem padrão; a primeira (OP) é fixa. */
export const OP_COLUMNS: ViewColumnDef[] = [
  { key: 'op', label: 'OP' },
  { key: 'servicos', label: 'Serviços' },
  { key: 'passageiros', label: 'Passageiros' },
  { key: 'valor', label: 'Valor' },
  { key: 'status', label: 'Status' },
  { key: 'criada', label: 'Criada em' },
]

const options = (list: { value: number; label: string }[]): FilterOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Campos filtráveis: os das colunas entram no filtro rápido; os demais só no avançado. */
export function opFields(choices: OpChoices): FilterField[] {
  return [
    { key: 'op', label: 'OP', kind: 'text' },
    { key: 'servicos', label: 'Primeiro serviço', kind: 'date' },
    { key: 'passageiros', label: 'Passageiros', kind: 'text' },
    { key: 'valor', label: 'Valor', kind: 'number', money: true },
    { key: 'status', label: 'Status', kind: 'choice', options: options(choices.status) },
    { key: 'criada', label: 'Criada em', kind: 'date' },
    { key: 'cliente', label: 'Cliente', kind: 'text', advancedOnly: true },
    { key: 'trajetos', label: 'Trajetos', kind: 'text', advancedOnly: true },
    { key: 'ultimo', label: 'Último serviço', kind: 'date', advancedOnly: true },
    { key: 'idioma', label: 'Idioma', kind: 'choice', options: options(choices.idioma), advancedOnly: true },
  ]
}

export function readOp(op: Op, key: string): unknown {
  switch (key) {
    case 'op': return [op.codigo, op.cliente].filter(Boolean).join(' ')
    case 'servicos': return op.primeiroServico
    case 'passageiros': return op.passageiros
    case 'valor': return op.valor
    case 'status': return op.status == null ? null : String(op.status)
    case 'criada': return op.criadoEm
    case 'cliente': return op.cliente
    case 'trajetos': return op.trajetos
    case 'ultimo': return op.ultimoServico
    case 'idioma': return op.idioma == null ? null : String(op.idioma)
    default: return null
  }
}

/** Busca por palavra-chave (não fica na visão): OP, cliente, passageiros e trajetos. */
export function matchesKeyword(op: Op, query: string) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = normalizeSearch([op.codigo, op.cliente, op.passageiros, op.trajetos].filter(Boolean).join(' '))
  return words.every((w) => text.includes(w))
}

/** O número da OP ordena como número (OP-9 antes de OP-10). */
const codigoNum = (codigo: string) => Number(codigo.replace(/\D/g, '')) || null

export function sortOps(list: Op[], sort: ViewSort | null, choices: OpChoices) {
  if (!sort) return list
  return sortRows(list, (op) => {
    switch (sort.key) {
      case 'op': return codigoNum(op.codigo) ?? (op.codigo || null)
      case 'servicos': return op.primeiroServico?.getTime()
      case 'passageiros': return op.passageiros
      case 'valor': return op.valor
      case 'status': return op.status == null ? null : label(choices.status, op.status, '')
      case 'criada': return op.criadoEm?.getTime()
      default: return null
    }
  }, sort.dir)
}

const statusFilter = (choices: OpChoices, values: number[]): TableFilters => {
  const condition: FilterCondition = { type: 'condition', id: 'rapido-status', field: 'status', op: 'in', values: values.map((v) => ({ value: String(v), label: label(choices.status, v, String(v)) })) }
  return { ...emptyFilters(), quick: values.length ? { status: condition } : {} }
}

/** Filtros do formato antigo (status na URL e nas visões do navegador) no formato novo; o período fica de fora. */
export const fromLegacyFilters = (f: { status: number[] }, choices: OpChoices) => statusFilter(choices, f.status)

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: OP_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: OP_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas (públicas e só leitura), as mesmas que a tela tinha antes. */
export function builtinViews(choices: OpChoices): StoredView[] {
  const view = (id: string, name: string, ordem: number, status: number[]): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(statusFilter(choices, status))) })
  return [
    view('em-aberto', 'Em aberto', 1, EM_ABERTO),
    view('pagas', 'Pagas', 2, [OP_STATUS.paga]),
    view('canceladas', 'Canceladas', 3, [OP_STATUS.cancelada]),
  ]
}

/** Configuração de uma visão salva no navegador (formato antigo), para importar para o Dataverse. */
export const legacyViewConfig = (f: { status: number[] }, choices: OpChoices) => JSON.stringify(configWith(fromLegacyFilters(f, choices)))
