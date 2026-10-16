import { CONFIG_VERSION, emptyFilters, normalizeSearch, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { TIPOS } from './filters'
import { TIPO_LABEL, type Pendencia, type TipoPendencia } from './types'

/**
 * A lista de Pendências no padrão do Design System (§10.9.1 e §10.9.2): colunas da visão, campos de filtro, leitura em
 * memória e as visões prontas. O período continua fora da visão: ele decide o que carrega.
 */

export const TELA = 'pendencias'
export const PENDENCIA_SORT: ViewSort = { key: 'data', dir: 'desc' }

/** Colunas na ordem padrão; a primeira (Tipo) é fixa. */
export const PENDENCIA_COLUMNS: ViewColumnDef[] = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'op', label: 'OP' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'servicos', label: 'Serviços' },
  { key: 'data', label: 'Data' },
  { key: 'valor', label: 'Valor' },
  { key: 'acao', label: 'Ação' },
]

const TIPO_OPTIONS: FilterOption[] = TIPOS.map((t) => ({ value: t, label: TIPO_LABEL[t] }))
const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

/** Campos filtráveis: os das colunas entram no filtro rápido; os demais só no avançado. */
export const PENDENCIA_FIELDS: FilterField[] = [
  { key: 'tipo', label: 'Tipo', kind: 'choice', options: TIPO_OPTIONS },
  { key: 'op', label: 'OP', kind: 'text' },
  { key: 'cliente', label: 'Cliente', kind: 'text' },
  { key: 'servicos', label: 'Serviços', kind: 'number' },
  { key: 'data', label: 'Data', kind: 'date' },
  { key: 'valor', label: 'Valor', kind: 'number', money: true },
  { key: 'corrigivel', label: 'Corrigível', kind: 'bool', options: SIM_NAO, advancedOnly: true },
]

export function readPendencia(p: Pendencia, key: string): unknown {
  switch (key) {
    case 'tipo': return p.tipo
    case 'op': return [p.opCodigo, ...p.reservaCodigos, p.detalhe].filter(Boolean).join(' ')
    case 'cliente': return p.cliente
    case 'servicos': return p.reservaIds.length
    case 'data': return p.data
    case 'valor': return p.valor
    case 'corrigivel': return p.corrigivel
    default: return null
  }
}

/** Busca por palavra-chave (não fica na visão): OP, OS, cliente, detalhe e tipo. */
export function matchesKeyword(p: Pendencia, query: string) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = normalizeSearch([p.opCodigo, ...p.reservaCodigos, p.cliente, p.detalhe, TIPO_LABEL[p.tipo]].filter(Boolean).join(' '))
  return words.every((w) => text.includes(w))
}

export function sortPendencias(list: Pendencia[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (p) => {
    switch (sort.key) {
      case 'tipo': return TIPO_LABEL[p.tipo]
      case 'op': return p.opCodigo || p.reservaCodigos[0]
      case 'cliente': return p.cliente
      case 'servicos': return p.reservaIds.length
      case 'data': return p.data?.getTime()
      case 'valor': return p.valor
      default: return null
    }
  }, sort.dir)
}

const tipoFilter = (tipos: TipoPendencia[]): TableFilters => ({
  ...emptyFilters(),
  quick: tipos.length ? { tipo: { type: 'condition', id: 'rapido-tipo', field: 'tipo', op: 'in', values: tipos.map((t) => ({ value: t, label: TIPO_LABEL[t] })) } } : {},
})

/** Filtros do formato antigo (tipos na URL e nas visões do navegador) no formato novo; o período fica de fora. */
export const fromLegacyFilters = (f: { tipos: TipoPendencia[] }) => tipoFilter(f.tipos)

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: PENDENCIA_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: PENDENCIA_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas (públicas e só leitura), as mesmas que a tela tinha antes. */
export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, tipos: TipoPendencia[]): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(tipoFilter(tipos))) })
  return [
    view('corrigiveis', 'Corrigíveis', 1, ['op-paga-desalinhada', 'op-sem-pagamento-reserva-paga']),
    view('rateio', 'Rateio', 2, ['rateio-nao-fecha']),
  ]
}

/** Configuração de uma visão salva no navegador (formato antigo), para importar para o Dataverse. */
export const legacyViewConfig = (f: { tipos: TipoPendencia[] }) => JSON.stringify(configWith(fromLegacyFilters(f)))
