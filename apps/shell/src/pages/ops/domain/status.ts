import type { StatusTone } from '@betinhos/ui'
import { STATUS as PAGANTE, isPaid } from '../../pagantes/domain/status'
import type { Pagante, ServicoOp } from '../../pagantes/domain/types'
import { totalOp } from '../../pagantes/data/queries'
import type { Op, OpChoices } from './types'

/** `cr40f_status` da OP. Pendente usa outra faixa (100000001) porque veio de uma versão antiga do choice. */
export const OP_STATUS = { aberta: 202410000, pendente: 100000001, parcial: 202410006, paga: 202410003, cancelada: 202410004 } as const

export const EM_ABERTO: number[] = [OP_STATUS.aberta, OP_STATUS.pendente, OP_STATUS.parcial]

/** Rótulos de DEV em 08/10/2026; só entram se a metadata não responder. */
export const FALLBACK_OP_CHOICES: OpChoices = {
  status: [
    { value: OP_STATUS.aberta, label: 'Aberta' }, { value: OP_STATUS.pendente, label: 'Pagamento Pendente' },
    { value: OP_STATUS.parcial, label: 'Pagamento Parcial' }, { value: OP_STATUS.paga, label: 'Paga' }, { value: OP_STATUS.cancelada, label: 'Cancelada' },
  ],
  idioma: [{ value: 202410000, label: 'Português' }, { value: 202410001, label: 'Inglês' }, { value: 202410002, label: 'Espanhol' }],
}

export function withOpFallback(choices: Partial<OpChoices>): OpChoices {
  return {
    status: choices.status?.length ? choices.status : FALLBACK_OP_CHOICES.status,
    idioma: choices.idioma?.length ? choices.idioma : FALLBACK_OP_CHOICES.idioma,
  }
}

export function opTone(status: number | null): StatusTone {
  if (status === OP_STATUS.paga) return 'success'
  if (status === OP_STATUS.pendente || status === OP_STATUS.parcial) return 'warning'
  if (status === OP_STATUS.aberta) return 'info'
  return 'neutral'
}

export const ativos = (rateio: Pagante[]) => rateio.filter((p) => p.status !== PAGANTE.cancelado)

/**
 * Motivo para não cancelar; null libera. Pagante ativo bloqueia porque, ao ser cancelado depois,
 * o flow "Pagantes → OP" recalcula o status da OP e desfaria o cancelamento.
 */
export function cancelBlock(op: Pick<Op, 'status'>, rateio: Pagante[] | null) {
  if (op.status === OP_STATUS.cancelada) return 'A OP já está cancelada.'
  if (op.status === OP_STATUS.paga) return 'OP paga não pode ser cancelada.'
  if (rateio == null) return 'Aguarde o rateio carregar.'
  const vivos = ativos(rateio)
  if (vivos.some(isPaid)) return 'Há pagamento confirmado nesta OP.'
  if (vivos.length) return `Cancele antes ${vivos.length === 1 ? 'o pagante ativo' : `os ${vivos.length} pagantes ativos`} em Pagantes ou refaça o rateio no Gerar Pagantes.`
  return null
}

export type Resumo = {
  parcelas: number
  soma: number
  recebido: number
  /** Soma da composição de preços dos serviços; null se algum serviço não tem valor. */
  servicos: number | null
  /** Diferença do rateio ativo em relação ao valor de referência (OP ou serviços); 0 = fecha. */
  diferenca: number
  referencia: number | null
}

const cents = (n: number) => Math.round(n * 100) / 100

/** Soma do rateio ativo comparada ao valor da OP (ou, sem ele, à soma dos serviços). */
export function resumoRateio(op: Pick<Op, 'valor'>, rateio: Pagante[], servicos: ServicoOp[]): Resumo {
  const vivos = ativos(rateio)
  const soma = cents(vivos.reduce((sum, p) => sum + (p.valor ?? 0), 0))
  const recebido = cents(vivos.filter(isPaid).reduce((sum, p) => sum + (p.valor ?? 0), 0))
  const totalServicos = totalOp(servicos)
  const referencia = op.valor ?? totalServicos
  // Sem parcela nenhuma não há rateio para comparar: a ficha mostra "sem pagantes", não uma diferença.
  const diferenca = referencia == null || !vivos.length ? 0 : cents(soma - referencia)
  return { parcelas: vivos.length, soma, recebido, servicos: totalServicos, diferenca, referencia }
}
