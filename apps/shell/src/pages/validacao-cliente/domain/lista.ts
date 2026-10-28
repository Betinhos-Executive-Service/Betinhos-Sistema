import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { normalize } from '../../infracoes/domain/filters'
import { SITUACOES, entraNoFechamento, mesDe, mesLabel, situacaoLabel } from './regras'
import type { Cliente, Linha, Situacao } from './types'

/** Validação do cliente no padrão de listas do DS (§10.9.1/§10.9.2). A Visão padrão esconde os retirados. */

export const TELA = 'validacao-cliente'
export const VALIDACAO_SORT: ViewSort = { key: 'data', dir: 'desc' }

export const VALIDACAO_COLUMNS: ViewColumnDef[] = [
  { key: 'servico', label: 'Serviço' },
  { key: 'data', label: 'Data' },
  { key: 'situacao', label: 'Situação' },
  { key: 'trajeto', label: 'Trajeto' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'valor', label: 'Valor liberado' },
  { key: 'prazo', label: 'Prazo da tácita' },
  { key: 'ultimaMensagem', label: 'Última mensagem' },
  { key: 'fechamento', label: 'Fechamento' },
  { key: 'cr', label: 'CR', defaultHidden: true },
]

const SITUACAO_OPTIONS: FilterOption[] = SITUACOES.map((s) => ({ value: s, label: situacaoLabel(s) }))
const FECHAMENTO_OPTIONS: FilterOption[] = [{ value: 'sim', label: 'Entra' }, { value: 'nao', label: 'Próximo mês' }, { value: 'pendente', label: 'A decidir' }]

/** Rótulo da coluna Fechamento: "Entra" vale para o marcado e para o sugerido (aprovado ainda sem decisão). */
export const fechamentoChave = (l: Linha) => (entraNoFechamento(l) ? 'sim' : l.fechamento === 'nao' ? 'nao' : 'pendente')

/** Campos de filtro; cliente, mês e CR saem das linhas carregadas. */
export function validacaoFields(linhas: Linha[], clientes: Cliente[]): FilterField[] {
  const meses = [...new Set(linhas.map(mesDe).filter((m): m is string => !!m))].sort().reverse()
  const crs = [...new Set(linhas.map((l) => l.cr).filter(Boolean))].sort()
  return [
    { key: 'servico', label: 'Serviço', kind: 'text' },
    { key: 'data', label: 'Data', kind: 'date' },
    { key: 'situacao', label: 'Situação', kind: 'choice', options: SITUACAO_OPTIONS },
    { key: 'trajeto', label: 'Trajeto', kind: 'text' },
    { key: 'cliente', label: 'Cliente', kind: 'choice', options: clientes.map((c) => ({ value: c.id, label: c.nome })) },
    { key: 'valor', label: 'Valor liberado', kind: 'number', money: true },
    { key: 'prazo', label: 'Prazo da tácita', kind: 'date' },
    { key: 'fechamento', label: 'Fechamento', kind: 'choice', options: FECHAMENTO_OPTIONS },
    { key: 'cr', label: 'CR', kind: 'choice', options: crs.map((c) => ({ value: c, label: c })) },
    { key: 'mes', label: 'Mês', kind: 'choice', options: meses.map((m) => ({ value: m, label: mesLabel(m) })), advancedOnly: true },
  ]
}

export function readLinha(l: Linha, key: string): unknown {
  switch (key) {
    case 'servico': return l.codigo
    case 'data': return l.data
    case 'situacao': return l.situacao
    case 'trajeto': return l.trajeto
    case 'cliente': return l.cliente.id
    case 'valor': return l.valorLiberado
    case 'prazo': return l.prazoTacita
    case 'fechamento': return fechamentoChave(l)
    case 'cr': return l.cr || null
    case 'mes': return mesDe(l)
    case 'ultimaMensagem': return l.ultimaMensagem?.texto ?? null
    default: return null
  }
}

/** Busca (fora da visão): código, pedido, trajeto, cliente, CR e última mensagem. */
export function matchesKeyword(l: Linha, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = normalize([l.codigo, l.pedido, l.trajeto, l.cliente.nome, l.cr, l.ultimaMensagem?.texto ?? ''].join(' '))
  return terms.every((t) => hay.includes(t))
}

export function sortLinhas(list: Linha[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (l) => {
    switch (sort.key) {
      case 'servico': return l.codigo
      case 'data': return l.data
      case 'situacao': return situacaoLabel(l.situacao)
      case 'trajeto': return l.trajeto || null
      case 'cliente': return l.cliente.nome
      case 'valor': return l.valorLiberado
      case 'prazo': return l.prazoTacita
      case 'ultimaMensagem': return l.ultimaMensagem?.criadaEm ?? null
      case 'fechamento': return fechamentoChave(l)
      case 'cr': return l.cr || null
      default: return null
    }
  }, sort.dir)
}

/** Filtro rápido de Situação no formato que o menu da coluna gera (`rapido-situacao`, `in`). */
const quickSituacao = (values: Situacao[]): FilterCondition =>
  ({ type: 'condition', id: 'rapido-situacao', field: 'situacao', op: 'in', values: SITUACAO_OPTIONS.filter((o) => values.includes(o.value as Situacao)) })
const withQuick = (values: Situacao[]): TableFilters => ({ ...emptyFilters(), quick: { situacao: quickSituacao(values) } })

/** Visão padrão: tudo menos os retirados. */
export const VALIDACAO_DEFAULT_FILTERS = withQuick(SITUACOES.filter((s) => s !== 'retirado'))

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: VALIDACAO_COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
  sort: VALIDACAO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

/** Visões prontas: A liberar, Liberados (esperando o cliente), Em dúvida, Aprovados e Retirados. */
export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, values: Situacao[]): StoredView =>
    ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(withQuick(values))) })
  return [
    view('a-liberar', 'A liberar', 1, ['a_liberar']),
    view('liberados', 'Liberados', 2, ['liberado', 'respondido']),
    view('em-duvida', 'Em dúvida', 3, ['em_duvida']),
    view('aprovados', 'Aprovados', 4, ['aprovado', 'aprovado_tacito']),
    view('retirados', 'Retirados', 5, ['retirado']),
  ]
}
