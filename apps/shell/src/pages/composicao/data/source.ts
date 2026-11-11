import { cleanId, getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { mockFalhaCarga, mockProgressive } from '../../../app/mockVolume'
import { latenciaMock } from '../../../app/latenciaMock'
import { FIRST_PAGE, withFirstPage } from '../../../app/pagedLoad'
import { VALOR_KEYS, type Composicao, type Opcao, type ValorKey } from '../domain/types'

export const ENTITY = 'cr40f_composicaodeprecos'
const RESERVA_NAV = 'cr40f_ServicoRelacionadoGeral'
const FMT = '@OData.Community.Display.V1.FormattedValue'

/** Coluna do Dataverse de cada valor da composição. */
export const VALOR_COLUMNS: Record<ValorKey, string> = {
  valorTotal: 'new_valortotal', locacao: 'new_valorlocacao', desvios: 'cr40f_valordesviosentrecidades', estacionamento: 'new_valorestacionamento',
  espera: 'cr40f_valortempodeespera', adequacao: 'cr40f_valoradequacaoderota', adequacaoKm: 'cr40f_valoradequacaoderotaporkmrodado',
  arco: 'cr40f_valorarcometropolitano', ayrton: 'cr40f_valorayrtonsenna', diaria: 'cr40f_valordadiaria', horaMotorista: 'cr40f_valorhoramotorista',
  passageirosAdicionais: 'cr40f_valorpassageirosadicionais', rodoanel: 'cr40f_valorrodoanel', combustivel: 'cr40f_valorcombustivel',
  passagens: 'new_valorpassagens', pedagios: 'new_valorpedagios',
}

const SELECT = ['cr40f_composicaodeprecosid', 'cr40f_id', 'new_status', 'createdon', 'modifiedon', ...VALOR_KEYS.map((k) => VALOR_COLUMNS[k])]
const RESERVA_SELECT = [
  'cr40f_statusdefaturamento', 'cr40f_status', 'cr40f_dataehorriodesada', '_cr40f_motorista_value', 'cr40f_tipodeveiculo', 'cr40f_id',
  'cr40f_passageirosetelefonedecontato', '_cr40f_cliente_value', 'cr40f_trajeto', 'new_observacaofinal', 'cr40f_cotao',
  'cr40f_formadepagamento', 'new_datadefinalizacao', 'cr40f_cr',
]
/** Composições ativas de serviços (Categoria do Item = Serviço) cuja Reserva não está em "Requer Análise". */
const FILTER = `statecode eq 0 and ${RESERVA_NAV}/new_categoriadoitem eq 100000000 and ${RESERVA_NAV}/cr40f_status ne 100000001`

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /**
   * Todas as composições da carga base (~8 mil, ~15 s no PROD): `onFirstPage` recebe antes as mais recentes
   * (criadas por último) para a tela não esperar a carga inteira.
   */
  load: (onFirstPage?: (list: Composicao[]) => void) => Promise<Composicao[]>
  /** Abre o formulário nativo da composição. */
  open: (id: string) => void
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const opcao = (row: Row, key: string): Opcao | null => {
  const value = num(row[key])
  return value == null ? null : { value, label: str(row[`${key}${FMT}`]) || String(value) }
}

export function mapComposicao(row: Row): Composicao {
  const r = (row[RESERVA_NAV] ?? {}) as Row
  return {
    id: cleanId(str(row.cr40f_composicaodeprecosid)),
    codigo: str(row.cr40f_id),
    status: opcao(row, 'new_status'),
    valores: Object.fromEntries(VALOR_KEYS.map((k) => [k, num(row[VALOR_COLUMNS[k]])])) as Composicao['valores'],
    criadoEm: date(row.createdon),
    modificadoEm: date(row.modifiedon),
    faturamento: opcao(r, 'cr40f_statusdefaturamento'),
    statusOperacao: opcao(r, 'cr40f_status'),
    saida: date(r.cr40f_dataehorriodesada),
    motorista: str(r[`_cr40f_motorista_value${FMT}`]),
    tipoVeiculo: opcao(r, 'cr40f_tipodeveiculo'),
    servicoId: str(r.cr40f_id),
    pax: str(r.cr40f_passageirosetelefonedecontato),
    cliente: str(r[`_cr40f_cliente_value${FMT}`]),
    trajeto: str(r.cr40f_trajeto),
    observacao: str(r.new_observacaofinal),
    cotacao: num(r.cr40f_cotao),
    formaPagamento: opcao(r, 'cr40f_formadepagamento'),
    finalizacao: date(r.new_datadefinalizacao),
    cr: str(r.cr40f_cr),
  }
}

export const composicoesPath = (set: string, orderby?: string) =>
  `${set}?$select=${SELECT.join(',')}&$expand=${encodeURIComponent(`${RESERVA_NAV}($select=${RESERVA_SELECT.join(',')})`)}&$filter=${encodeURIComponent(FILTER)}${orderby ? `&$orderby=${encodeURIComponent(orderby)}` : ''}`

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

/** Abre o formulário nativo: dentro do model-driven pelo Xrm, senão em nova aba. */
export function openRecord(host: Extract<Host, { mode: 'dataverse' }>, id: string) {
  const navigation = getHostXrm()?.Navigation as { openForm?: (options: { entityName: string; entityId: string }) => unknown } | undefined
  if (host.insideModelDriven && navigation?.openForm) navigation.openForm({ entityName: ENTITY, entityId: id })
  else window.open(`${host.clientUrl}/main.aspx?pagetype=entityrecord&etn=${ENTITY}&id=${id}`, '_blank', 'noopener')
}

const op = (value: number, label: string): Opcao => ({ value, label })
const FAT = { pend: op(202410005, 'Pendente'), real: op(100000001, 'Composição Realizada'), pago: op(202410010, 'Pago'), mensal: op(202410008, 'Faturamento Mensal'), cancel: op(202410000, 'Cancelado Sem Taxa') }
const OPER = { concl: op(202410008, 'Concluído'), conf: op(202410001, 'Confirmado'), canc: op(202410002, 'Cancelado') }
const PENDENTE = op(100000000, 'Pendente')
const CONCLUIDO = op(100000001, 'Concluido')
const zero: Composicao['valores'] = Object.fromEntries(VALOR_KEYS.map((k) => [k, null])) as Composicao['valores']
const mock = (n: number, p: Partial<Composicao>): Composicao => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, codigo: `CP-${String(1000 + n)}`, status: PENDENTE, valores: zero,
  criadoEm: new Date('2026-10-01T15:00:00Z'), modificadoEm: new Date('2026-10-02T15:00:00Z'),
  faturamento: FAT.pend, statusOperacao: OPER.concl, saida: null, motorista: '', tipoVeiculo: null, servicoId: String(9000 + n), pax: '', cliente: '', trajeto: '', observacao: '',
  cotacao: null, formaPagamento: null, finalizacao: null, cr: '', ...p,
})

export const MOCK_COMPOSICOES: Composicao[] = [
  mock(1, { status: PENDENTE, cliente: 'Tenaris', motorista: 'Motorista Exemplo A', tipoVeiculo: op(202410001, 'Executivo'), saida: new Date('2026-11-05T11:30:00Z'), trajeto: 'Guarulhos (GRU) x Pindamonhangaba', pax: 'Passageiro Um (12) 90000-0001', cr: 'CR-100', valores: { ...zero, valorTotal: 1280.5, locacao: 1100, pedagios: 180.5 }, cotacao: 1300, formaPagamento: op(202410001, 'Pedido de compra'), faturamento: FAT.real, criadoEm: new Date('2026-11-01T13:00:00Z') }),
  mock(2, { status: CONCLUIDO, cliente: 'Johnson&Johnson', motorista: 'Motorista Exemplo B', tipoVeiculo: op(202410003, 'Van'), saida: new Date('2026-11-04T14:00:00Z'), trajeto: 'São José dos Campos x Campinas (VCP)', pax: 'Passageira Dois (12) 90000-0002', valores: { ...zero, valorTotal: 2100, locacao: 1800, estacionamento: 40, espera: 260 }, cotacao: 2100, formaPagamento: op(202410002, 'Pix'), faturamento: FAT.pago, finalizacao: new Date('2026-11-04T20:00:00Z') }),
  mock(3, { status: PENDENTE, cliente: 'Embraer', motorista: 'Motorista Exemplo C', tipoVeiculo: op(202410002, 'Blindado'), saida: new Date('2026-11-06T09:00:00Z'), trajeto: 'Embraer SJC x Aeroporto de Congonhas', pax: 'Passageiro Três (12) 90000-0003', valores: { ...zero, valorTotal: 3400, locacao: 3000, combustivel: 400 }, cotacao: 3400, formaPagamento: op(202410001, 'Pedido de compra'), faturamento: FAT.mensal }),
  mock(4, { status: PENDENTE, cliente: 'Embraer', motorista: '', tipoVeiculo: op(202410001, 'Executivo'), saida: new Date('2026-10-28T17:00:00Z'), trajeto: 'Embraer Gavião Peixoto x Aeroporto de Viracopos', pax: 'Passageira Quatro (16) 90000-0004', cr: '', valores: { ...zero, valorTotal: 1750 }, cotacao: 1750, faturamento: FAT.real }),
  mock(5, { status: CONCLUIDO, cliente: 'Particular', motorista: 'Motorista Exemplo A', tipoVeiculo: op(100000002, 'Minivan'), saida: new Date('2026-10-20T12:00:00Z'), trajeto: 'Taubaté x Aeroporto de Guarulhos', pax: 'Passageiro Cinco', valores: { ...zero, valorTotal: 690, locacao: 690 }, cotacao: 690, formaPagamento: op(202410000, 'Cartão de crédito'), faturamento: FAT.pago, finalizacao: new Date('2026-10-20T16:00:00Z'), observacao: 'Cliente pediu bagagem extra.' }),
  mock(6, { status: PENDENTE, cliente: 'Tenaris', motorista: 'Motorista Exemplo D', tipoVeiculo: op(202410001, 'Executivo'), saida: new Date('2026-10-15T10:00:00Z'), trajeto: 'Guaratinguetá x São Paulo (Berrini)', pax: 'Passageiro Seis (12) 90000-0006', statusOperacao: OPER.canc, faturamento: FAT.cancel, valores: { ...zero, valorTotal: 300 }, cotacao: 300 }),
]

function createMockSource(): Source {
  return {
    mock: true,
    async load(onFirstPage) { if (mockFalhaCarga()) { await wait(300); throw new Error('Falha simulada na carga.') } return mockProgressive(MOCK_COMPOSICOES.map((c) => ({ ...c })), onFirstPage) },
    open() { /* sem formulário no mock */ },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let set: Promise<string> | null = null
  const entitySet = () => (set ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { set = null; throw error }))
  return {
    mock: false,
    load: async (onFirstPage) => {
      const set = await entitySet()
      const first = () => host.client.request<{ value: Row[] }>(`${composicoesPath(set, 'createdon desc')}&$top=${FIRST_PAGE}`).then((page) => page.value.map(mapComposicao))
      return (await withFirstPage(host.client.getAll(composicoesPath(set)), first, onFirstPage)).map(mapComposicao)
    },
    open: (id) => openRecord(host, id),
  }
}
