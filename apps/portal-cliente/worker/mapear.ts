// Registro do Dataverse (validação + reserva + composição + mensagens) → Servico do portal.
import type { Mensagem, Modulo, Motivo, PassageiroPedido, Pedido, Servico, Status, StatusPedido } from '../src/domain/types'
import { COMPOSICAO_LINHAS, LADO_DV, MODULO_DV, MOTIVO_DV, NAV, PEDIDO_STATUS, STATUS_DV } from './schema'

export type Registro = Record<string, unknown>

const FV = '@OData.Community.Display.V1.FormattedValue'
const str = (r: Registro | undefined, campo: string) => (typeof r?.[campo] === 'string' ? (r[campo] as string) : '')
const num = (r: Registro | undefined, campo: string) => (typeof r?.[campo] === 'number' ? (r[campo] as number) : undefined)
const rotulo = (r: Registro | undefined, lookup: string) => str(r, `${lookup}${FV}`)
const veiculoDe = (r: Registro | undefined) => rotulo(r, 'cr40f_tipodeveiculo')

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
  // O Dataverse recusa $orderby no 1:N aninhado; a ordem sai daqui.
  const filhos = ((reserva?.[NAV.passageiros] ?? []) as Registro[]).slice().sort((a, b) => (num(a, 'cr40f_ordemdeselecao') ?? 1e9) - (num(b, 'cr40f_ordemdeselecao') ?? 1e9))
  const passageiros = filhos.map((f) => rotulo(f, '_cr40f_bancodedados_value')).filter(Boolean)
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
export type PedidoPortal = { passageiros: string[]; observacao?: string; tipoVeiculo?: number }

const PROGRAMADO = new Set<StatusPedido>(['programado', 'em_execucao', 'concluido'])

/** Passageiros do pedido pelos vínculos (Serviços por Passageiro) expandidos, na ordem de seleção; vazio se a reserva não os trouxe. */
export function pessoasDoPedido(r: Registro): PassageiroPedido[] {
  const filhos = ((r[NAV.passageiros] ?? []) as Registro[]).slice().sort((a, b) => (num(a, 'cr40f_ordemdeselecao') ?? 1e9) - (num(b, 'cr40f_ordemdeselecao') ?? 1e9))
  return filhos.flatMap((f) => {
    const p = (f[NAV.vinculoPessoa] ?? undefined) as Registro | undefined
    const id = str(f, '_cr40f_bancodedados_value')
    const nome = str(p, 'cr40f_nomedopassageiro') || rotulo(f, '_cr40f_bancodedados_value')
    if (!id || !nome) return []
    return [{ id, nome, ...(str(p, 'cr40f_telefone') ? { telefone: str(p, 'cr40f_telefone') } : {}), ...(str(p, 'cr40f_email') ? { email: str(p, 'cr40f_email') } : {}) }]
  })
}

/** Reserva → pedido visto por `usuarioId`. Voucher, veículo, motorista e placa só depois de programado. */
export function mapearPedido(r: Registro, usuarioId: string): Pedido {
  const status = PEDIDO_STATUS[num(r, 'cr40f_status') ?? -1] ?? 'em_analise'
  let portal: PedidoPortal = { passageiros: [] }
  try {
    portal = { ...portal, ...(JSON.parse(str(r, 'cr40f_portalpedido') || '{}') as PedidoPortal) }
  } catch { /* coluna editada à mão: mostra sem passageiros */ }
  const veiculo = veiculoDe(r)
  const pessoas = pessoasDoPedido(r)
  const tipoVeiculo = num(r, 'cr40f_tipodeveiculo')
  const programado = PROGRAMADO.has(status)
  const motorista = rotulo(r, '_cr40f_motorista_value')
  const placa = rotulo(r, '_cr40f_veiculo_value')
  return {
    id: str(r, 'cr40f_reservadeveculosid'),
    numero: str(r, 'cr40f_id'),
    status,
    saida: str(r, 'cr40f_dataehorriodesada'),
    origem: str(r, 'cr40f_endereodesada'),
    destino: str(r, 'cr40f_destino'),
    // Nome e contato vêm do vínculo; pedido antigo (sem vínculo) cai nos nomes guardados em `cr40f_portalpedido`.
    passageiros: pessoas.length ? pessoas.map((p) => p.nome) : portal.passageiros,
    pessoas: pessoas.length ? pessoas : portal.passageiros.map((nome) => ({ nome })),
    criadoEm: str(r, 'createdon'),
    ...(str(r, '_cr40f_portalusuario_value').toLowerCase() !== usuarioId.toLowerCase() ? { comoPassageiro: true } : {}),
    ...(tipoVeiculo !== undefined ? { tipoVeiculo } : {}),
    ...(portal.observacao ? { observacao: portal.observacao } : {}),
    ...(programado && veiculo ? { veiculo } : {}),
    ...(programado && motorista ? { motorista } : {}),
    ...(programado && placa ? { placa } : {}),
    ...(programado && str(r, 'new_linkdovoucher') ? { voucherUrl: str(r, 'new_linkdovoucher') } : {}),
  }
}
