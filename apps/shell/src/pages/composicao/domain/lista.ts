import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { VALOR_KEYS, type Composicao, type Opcao, type ValorKey } from './types'

/** Composição de Preço no padrão de listas do DS (§10.9.1/§10.9.2); ~8 mil linhas filtradas e ordenadas em memória. */

export const TELA = 'composicao'
export const COMPOSICAO_SORT: ViewSort = { key: 'saida', dir: 'desc' }

const VALOR_LABELS: Record<ValorKey, string> = {
  valorTotal: 'Valor Total', locacao: 'Locação', desvios: 'Desvios entre cidades', estacionamento: 'Estacionamento', espera: 'Espera',
  adequacao: 'Adequação de rota', adequacaoKm: 'Adequação de rota por km', arco: 'Arco Metropolitano', ayrton: 'Ayrton Senna', diaria: 'Diária',
  horaMotorista: 'Hora motorista', passageirosAdicionais: 'Passageiros adicionais', rodoanel: 'Rodoanel', combustivel: 'Combustível',
  passagens: 'Passagens', pedagios: 'Pedágios',
}

const col = (key: string, label: string): ViewColumnDef => ({ key, label })

/** Colunas na ordem padrão; a primeira (ID, que abre o registro) é fixa. Valor Total vem logo após o Trajeto e Observação Final. */
export const COMPOSICAO_COLUMNS: ViewColumnDef[] = [
  col('codigo', 'ID'), col('faturamento', 'Status de Faturamento'), col('status', 'Status do CP'), col('statusOperacao', 'Status de Operação'),
  col('saida', 'Data de saída'), col('motorista', 'Motorista'), col('tipoVeiculo', 'Tipo de Veículo'), col('servicoId', 'ID do serviço'),
  col('pax', 'Pax'), col('cliente', 'Cliente'), col('trajeto', 'Trajeto'), col('valorTotal', VALOR_LABELS.valorTotal), col('observacao', 'Observação Final'),
  ...VALOR_KEYS.filter((k) => k !== 'valorTotal').map((k) => col(k, VALOR_LABELS[k])),
  col('cotacao', 'Cotação'), col('formaPagamento', 'Forma de pagamento'), col('criadoEm', 'Criado em'), col('modificadoEm', 'Modificado em'), col('finalizacao', 'Data de finalização'),
]

const opt = (value: number, label: string): FilterOption => ({ value: String(value), label })
export const STATUS_CP: FilterOption[] = [opt(100000000, 'Pendente'), opt(100000001, 'Concluído')]
export const FATURAMENTO: FilterOption[] = [
  opt(202410005, 'Pendente'), opt(100000001, 'Composição Realizada'), opt(202410007, 'Pagamento Pendente'), opt(202410012, 'Pagamento Em Atraso'), opt(202410008, 'Faturamento Mensal'),
  opt(202410006, 'Pagante em Viagem'), opt(202410010, 'Pago'), opt(202410011, 'Não Faturável'), opt(202410003, 'Cortesia'), opt(202410004, 'Permuta'),
  opt(202410000, 'Cancelado Sem Taxa'), opt(202410002, 'Cancelado Com Taxa'),
]
/** Sem "Requer Análise": a carga já tira essas reservas. */
export const STATUS_OPERACAO: FilterOption[] = [
  opt(202410000, 'Pré-reserva'), opt(202410004, 'Solicitado'), opt(202410001, 'Confirmado'), opt(202410005, 'Programado'), opt(202410006, 'Em Execução'),
  opt(202410008, 'Concluído'), opt(202410010, 'Cancelado com Ressalvas'), opt(202410002, 'Cancelado'),
]
export const TIPO_VEICULO: FilterOption[] = [
  opt(202410000, 'Básico'), opt(202410001, 'Executivo'), opt(202410002, 'Blindado'), opt(202410003, 'Van'), opt(202410004, 'Van Blindado'),
  opt(202410005, 'Spin'), opt(202410006, 'Somente Motorista'), opt(100000001, 'Micro-ônibus'), opt(100000002, 'Minivan'),
]
export const FORMA_PAGAMENTO: FilterOption[] = [opt(202410000, 'Cartão de crédito'), opt(202410001, 'Pedido de compra'), opt(202410002, 'Pix')]

export function composicaoFields(): FilterField[] {
  return [
    { key: 'codigo', label: 'ID', kind: 'text' },
    { key: 'faturamento', label: 'Status de Faturamento', kind: 'choice', options: FATURAMENTO },
    { key: 'status', label: 'Status do CP', kind: 'choice', options: STATUS_CP },
    { key: 'statusOperacao', label: 'Status de Operação', kind: 'choice', options: STATUS_OPERACAO },
    { key: 'saida', label: 'Data de saída', kind: 'date' },
    { key: 'motorista', label: 'Motorista', kind: 'text' },
    { key: 'tipoVeiculo', label: 'Tipo de Veículo', kind: 'choice', options: TIPO_VEICULO },
    { key: 'servicoId', label: 'ID do serviço', kind: 'text' },
    { key: 'pax', label: 'Pax', kind: 'text' },
    { key: 'cliente', label: 'Cliente', kind: 'text' },
    { key: 'trajeto', label: 'Trajeto', kind: 'text' },
    { key: 'observacao', label: 'Observação Final', kind: 'text' },
    ...VALOR_KEYS.map((k): FilterField => ({ key: k, label: VALOR_LABELS[k], kind: 'number', money: true })),
    { key: 'cotacao', label: 'Cotação', kind: 'number', money: true },
    { key: 'formaPagamento', label: 'Forma de pagamento', kind: 'choice', options: FORMA_PAGAMENTO },
    { key: 'criadoEm', label: 'Criado em', kind: 'date' },
    { key: 'modificadoEm', label: 'Modificado em', kind: 'date' },
    { key: 'finalizacao', label: 'Data de finalização', kind: 'date' },
    { key: 'cr', label: 'CR', kind: 'text', advancedOnly: true },
  ]
}

const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Dia `AAAA-MM-DD` no fuso de São Paulo (o filtro de data compara por dia). */
const diaSp = (d: Date | null) => (d ? dia.format(d) : null)
const choice = (o: Opcao | null) => (o ? String(o.value) : null)

/** Valor de cada campo na composição (para `filterRows`). */
export function readComposicao(c: Composicao, key: string): unknown {
  switch (key) {
    case 'codigo': return c.codigo
    case 'faturamento': return choice(c.faturamento)
    case 'status': return choice(c.status)
    case 'statusOperacao': return choice(c.statusOperacao)
    case 'saida': return diaSp(c.saida)
    case 'motorista': return c.motorista
    case 'tipoVeiculo': return choice(c.tipoVeiculo)
    case 'servicoId': return c.servicoId
    case 'pax': return c.pax
    case 'cliente': return c.cliente
    case 'trajeto': return c.trajeto
    case 'observacao': return c.observacao
    case 'cotacao': return c.cotacao
    case 'formaPagamento': return choice(c.formaPagamento)
    case 'criadoEm': return diaSp(c.criadoEm)
    case 'modificadoEm': return diaSp(c.modificadoEm)
    case 'finalizacao': return diaSp(c.finalizacao)
    case 'cr': return c.cr
    default: return (VALOR_KEYS as readonly string[]).includes(key) ? c.valores[key as ValorKey] : null
  }
}

/** Texto em que a busca procura: ID, ID do serviço, cliente, motorista, trajeto e pax. */
export const composicaoKeywordText = (c: Composicao) => [c.codigo, c.servicoId, c.cliente, c.motorista, c.trajeto, c.pax].filter(Boolean).join(' ')

/** ID numérico ordena como número ("9156" antes de "10234"); código com letras ordena como texto. */
const idValue = (s: string) => (/^\d+$/.test(s) ? Number(s) : s)

/** Ordena pela coluna da visão, inclusive as da Reserva; vazios por último nos dois sentidos. */
export function sortComposicoes(list: Composicao[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (c) => {
    switch (sort.key) {
      case 'codigo': return idValue(c.codigo)
      case 'faturamento': return c.faturamento?.label
      case 'status': return c.status?.label
      case 'statusOperacao': return c.statusOperacao?.label
      case 'saida': return c.saida?.getTime()
      case 'motorista': return c.motorista
      case 'tipoVeiculo': return c.tipoVeiculo?.label
      case 'servicoId': return idValue(c.servicoId)
      case 'pax': return c.pax
      case 'cliente': return c.cliente
      case 'trajeto': return c.trajeto
      case 'observacao': return c.observacao
      case 'cotacao': return c.cotacao
      case 'formaPagamento': return c.formaPagamento?.label
      case 'criadoEm': return c.criadoEm?.getTime()
      case 'modificadoEm': return c.modificadoEm?.getTime()
      case 'finalizacao': return c.finalizacao?.getTime()
      default: return (VALOR_KEYS as readonly string[]).includes(sort.key) ? c.valores[sort.key as ValorKey] : null
    }
  }, sort.dir)
}

// Visões prontas (espelham as views de sistema do PROD). O cliente vai pelo nome: os GUIDs diferem entre ambientes.
const quickIn = (field: string, options: FilterOption[], values: number[], op: 'in' | 'not-in' = 'in'): FilterCondition =>
  ({ type: 'condition', id: `rapido-${field}`, field, op, values: options.filter((o) => values.includes(Number(o.value))) })
const quickCliente = (nome: string): FilterCondition => ({ type: 'condition', id: 'rapido-cliente', field: 'cliente', op: 'eq', value: nome })
const semCr: FilterCondition = { type: 'condition', id: 'cr-vazio', field: 'cr', op: 'empty' }
const withQuick = (quick: FilterCondition[], advanced: FilterCondition[] = []): TableFilters =>
  ({ ...emptyFilters(), quick: Object.fromEntries(quick.map((c) => [c.field, c])), advanced: { ...emptyFilters().advanced, items: advanced } })

const CP_PENDENTE = 100000000
const CANCELADO = 202410002

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: COMPOSICAO_COLUMNS.map((c) => ({ key: c.key, visible: !c.defaultHidden })),
  sort: COMPOSICAO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  const pendenteDe = (cliente: string) => withQuick([quickIn('status', STATUS_CP, [CP_PENDENTE]), quickCliente(cliente)])
  return [
    view('todos-cps', 'Todos os CPs', 1, withQuick([quickIn('statusOperacao', STATUS_OPERACAO, [CANCELADO], 'not-in')])),
    view('tenaris', 'TenarisConfab', 2, pendenteDe('Tenaris')),
    view('jnj', 'Johnson&Johnson', 3, pendenteDe('Johnson&Johnson')),
    view('embraer', 'Embraer', 4, pendenteDe('Embraer')),
    view('sem-cr', 'Serviços sem CR', 5, withQuick([quickIn('status', STATUS_CP, [CP_PENDENTE]), quickCliente('Embraer')], [semCr])),
  ]
}
