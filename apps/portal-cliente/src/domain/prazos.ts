import type { PrazosSessao as Prazos, StatusPedido } from './types'

/** Prazos do cliente (colunas `cr40f_portalantecedenciapedido`, `cr40f_portalprazocancelar` e `cr40f_portalcontato`). 0 = sem limite; coluna vazia = padrão. */
export type { Prazos }

export const PADRAO_ANTECEDENCIA_H = 4
export const PADRAO_CANCELAR_H = 2
export const MAX_PRAZO_H = 720
export const MAX_CONTATO = 100
const HORA_MS = 3_600_000

export const PRAZOS_PADRAO: Prazos = { antecedenciaPedidoH: PADRAO_ANTECEDENCIA_H, prazoCancelarH: PADRAO_CANCELAR_H, contato: '' }

/** Situações em que o cliente cancela sozinho, dentro do prazo. Em execução, concluído e cancelado: nunca. */
export const STATUS_CANCELAVEIS: readonly StatusPedido[] = ['solicitado', 'confirmado', 'programado']

const horas = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_PRAZO_H ? v : padrao)

/** Valores crus da coluna (null/vazio/inválido) → prazos com o padrão aplicado. */
export function resolverPrazos(cru: { antecedenciaPedido?: unknown; prazoCancelar?: unknown; contato?: unknown } | null | undefined): Prazos {
  return {
    antecedenciaPedidoH: horas(cru?.antecedenciaPedido, PADRAO_ANTECEDENCIA_H),
    prazoCancelarH: horas(cru?.prazoCancelar, PADRAO_CANCELAR_H),
    contato: typeof cru?.contato === 'string' ? cru.contato.trim().slice(0, MAX_CONTATO) : '',
  }
}

/** Sessão sem prazos (Worker antigo, protótipo) vale o padrão. */
export const prazosOuPadrao = (p: Prazos | null | undefined): Prazos => p ?? PRAZOS_PADRAO

/** "Fale com a Betinhos." ou "Fale com a Betinhos: (12) 99999-0000." */
export const faleComBetinhos = (contato: string) => (contato.trim() ? `Fale com a Betinhos: ${contato.trim().replace(/[.\s]+$/, '')}.` : 'Fale com a Betinhos.')

/** Aviso fixo do Pedir; null quando não há limite. */
export const textoAntecedencia = (p: Prazos) => (p.antecedenciaPedidoH > 0 ? `Pedidos com pelo menos ${p.antecedenciaPedidoH} h de antecedência.` : null)

/** Regra de cancelamento em uma frase, para o painel do pedido e a prévia do shell. */
export const textoPrazoCancelar = (p: Prazos) => (p.prazoCancelarH > 0 ? `Você cancela até ${p.prazoCancelarH} h antes da saída.` : 'Você cancela até a hora da saída.')

/** Erro de antecedência (a saída já é futura); null quando dentro da regra. */
export function erroAntecedencia(saidaMs: number, agoraMs: number, p: Prazos): string | null {
  if (p.antecedenciaPedidoH <= 0 || saidaMs - agoraMs >= p.antecedenciaPedidoH * HORA_MS) return null
  return `Esta saída é daqui a menos de ${p.antecedenciaPedidoH} h, prazo mínimo para pedir pelo portal. ${faleComBetinhos(p.contato)}`
}

const MSG_NAO_CANCELA = 'Este pedido não pode mais ser cancelado pelo portal.'

/** Por que o cliente não cancela sozinho; null = pode cancelar. */
export function motivoNaoCancela(pedido: { status: StatusPedido; saida: string }, agoraMs: number, p: Prazos): string | null {
  const fale = faleComBetinhos(p.contato)
  if (!STATUS_CANCELAVEIS.includes(pedido.status)) return `${MSG_NAO_CANCELA} ${fale}`
  const saida = Date.parse(pedido.saida)
  if (!Number.isFinite(saida)) return null
  if (p.prazoCancelarH > 0 && saida - agoraMs < p.prazoCancelarH * HORA_MS) {
    return `O prazo para cancelar pelo portal é de ${p.prazoCancelarH} h antes da saída e já passou. ${fale}`
  }
  if (saida <= agoraMs) return `A saída já passou e o pedido não pode mais ser cancelado pelo portal. ${fale}`
  return null
}
