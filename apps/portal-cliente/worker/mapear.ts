// Registro do Dataverse (validação + reserva + composição + mensagens) → Servico do portal.
import type { Mensagem, Modulo, Motivo, Pedido, Servico, Status, StatusPedido } from '../src/domain/types'
import { COMPOSICAO_LINHAS, LADO_DV, MODULO_DV, MOTIVO_DV, NAV, PEDIDO_STATUS, STATUS_DV } from './schema'

export type Registro = Record<string, unknown>

const FV = '@OData.Community.Display.V1.FormattedValue'
const str = (r: Registro | undefined, campo: string) => (typeof r?.[campo] === 'string' ? (r[campo] as string) : '')
const num = (r: Registro | undefined, campo: string) => (typeof r?.[campo] === 'number' ? (r[campo] as number) : undefined)
const rotulo = (r: Registro | undefined, lookup: string) => str(r, `${lookup}${FV}`)
const veiculoDe = (r: Registro | undefined) => rotulo(r, 'new_categoriadoveiculo') || str(r, 'new_categoriadoveiculo')

const inverter = <K extends string>(mapa: Record<K, number>) =>
  new Map(Object.entries(mapa).map(([k, v]) => [v as number, k as K]))
const STATUS_POR_VALOR = inverter(STATUS_DV)
const MOTIVO_POR_VALOR = inverter(MOTIVO_DV)

export function mapearMensagem(m: Registro): Mensagem {
  const motivo = MOTIVO_POR_VALOR.get(num(m, 'cr40f_motivo') ?? -1) as Motivo | undefined
  return {
    id: str(m, 'cr40f_mensagemvalidacaoid'),
    lado: num(m, 'cr40f_lado') === LADO_DV.betinhos ? 'betinhos' : 'cliente',
    autor: str(m, 'cr40f_autor'),
    texto: str(m, 'cr40f_texto'),
    ...(motivo ? { motivo } : {}),
    criadaEm: str(m, 'createdon'),
  }
}

/** `null` para status fora do portal (Retirado ou desconhecido): nunca vaza para a tela. */
export function mapearServico(v: Registro, mensagens: Mensagem[] = []): Servico | null {
  const status = STATUS_POR_VALOR.get(num(v, 'cr40f_status') ?? -1)
  if (!status || status === 'retirado') return null
  const reserva = (v[NAV.reserva] ?? undefined) as Registro | undefined
  const comp = (reserva?.[NAV.composicao] ?? undefined) as Registro | undefined
  const passageiros = [1, 2, 3, 4].map((i) => rotulo(reserva, `_cr40f_passageiro${i}_value`)).filter(Boolean)
  const valorAnterior = num(v, 'cr40f_valoranterior')
  return {
    id: str(v, 'cr40f_validacaoservicoid'),
    numero: str(reserva, 'cr40f_id'),
    pedidoCliente: str(reserva, 'cr40f_idtenaris'),
    cr: str(reserva, 'cr40f_cr'),
    saida: str(reserva, 'cr40f_dataehorriodesada'),
    origem: str(reserva, 'cr40f_endereodesada'),
    destino: str(reserva, 'cr40f_destino'),
    passageiros,
    solicitante: rotulo(reserva, '_cr40f_solicitante_value'),
    veiculo: veiculoDe(reserva),
    status: status as Status,
    liberadoEm: str(v, 'cr40f_liberadoem'),
    prazoTacito: str(v, 'cr40f_prazotacita').slice(0, 10),
    valorTotal: num(comp, 'new_valortotal') ?? num(v, 'cr40f_valorliberado') ?? 0,
    ...(valorAnterior !== undefined ? { valorAnterior } : {}),
    composicao: COMPOSICAO_LINHAS.flatMap(([campo, r]) => {
      const valor = num(comp, campo)
      return valor ? [{ rotulo: r, valor }] : []
    }),
    ...(str(v, 'cr40f_observacao') ? { observacao: str(v, 'cr40f_observacao') } : {}),
    ...(str(reserva, 'new_linkdovoucher') ? { voucherUrl: str(reserva, 'new_linkdovoucher') } : {}),
    mensagens,
    ...(str(v, 'cr40f_aprovadopor') ? { aprovadoPor: str(v, 'cr40f_aprovadopor') } : {}),
    ...(str(v, 'cr40f_aprovadoem') ? { aprovadoEm: str(v, 'cr40f_aprovadoem') } : {}),
  }
}

const MODULO_POR_VALOR = inverter(MODULO_DV)

/** Choice múltipla vem como "100000000,100000001"; valores desconhecidos são ignorados. */
export function mapearModulos(valor: unknown): Modulo[] {
  return String(valor ?? '').split(',').flatMap((v) => {
    const m = MODULO_POR_VALOR.get(Number(v))
    return m ? [m] : []
  })
}

/** Módulos do cliente de um validador lido com `$expand=cr40f_Cliente($select=cr40f_portalmodulos)`. */
export const modulosDe = (v: Registro): Modulo[] => mapearModulos((v[NAV.cliente] as Registro | undefined)?.cr40f_portalmodulos)

/** O que o cliente digitou, guardado em `cr40f_portalpedido` como JSON. */
export type PedidoPortal = { passageiros: string[]; observacao?: string }

const PROGRAMADO = new Set<StatusPedido>(['programado', 'em_execucao', 'concluido'])

/** Reserva → pedido do solicitante. Voucher e veículo só depois de programado. */
export function mapearPedido(r: Registro): Pedido {
  const status = PEDIDO_STATUS[num(r, 'cr40f_status') ?? -1] ?? 'em_analise'
  let portal: PedidoPortal = { passageiros: [] }
  try {
    portal = { ...portal, ...(JSON.parse(str(r, 'cr40f_portalpedido') || '{}') as PedidoPortal) }
  } catch { /* coluna editada à mão: mostra sem passageiros */ }
  const veiculo = veiculoDe(r)
  return {
    id: str(r, 'cr40f_reservadeveculosid'),
    numero: str(r, 'cr40f_id'),
    status,
    saida: str(r, 'cr40f_dataehorriodesada'),
    origem: str(r, 'cr40f_endereodesada'),
    destino: str(r, 'cr40f_destino'),
    passageiros: portal.passageiros,
    criadoEm: str(r, 'createdon'),
    ...(portal.observacao ? { observacao: portal.observacao } : {}),
    ...(PROGRAMADO.has(status) && veiculo ? { veiculo } : {}),
    ...(PROGRAMADO.has(status) && str(r, 'new_linkdovoucher') ? { voucherUrl: str(r, 'new_linkdovoucher') } : {}),
  }
}
