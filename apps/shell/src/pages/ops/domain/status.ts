import type { StatusTone } from '@betinhos/ui'
import { STATUS as PAGANTE, isPaid } from '../../pagantes/domain/status'
import type { Pagante, ServicoOp } from '../../pagantes/domain/types'
import { totalOp } from '../../pagantes/data/queries'
import { formatMoney } from '../../pagantes/domain/messages'
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

/** Composição de preço dos serviços diferente do valor gravado na OP (centavo a centavo). */
export const servicosDivergem = (op: Pick<Op, 'valor'>, r: Pick<Resumo, 'servicos'>) =>
  op.valor != null && r.servicos != null && Math.round((op.valor - r.servicos) * 100) !== 0

export const ETAPAS = [['criada', 'Criada'], ['pagantes', 'Pagantes'], ['recebida', 'Recebida']] as const
export type Etapa = (typeof ETAPAS)[number][0]

export type ProximoPasso = {
  /** Etapas concluídas; a primeira de ETAPAS fora daqui é a atual. */
  feitas: Etapa[]
  tone: 'info' | 'warning' | 'success'
  titulo: string
  detalhe: string
  acao: 'gerar' | 'refazer' | null
}

/** Onde a OP está e o que fazer agora. Divergência com os serviços vem antes do rateio: cobrar valor errado é o pior caso. */
export function proximoPasso(op: Pick<Op, 'valor' | 'status'>, r: Resumo): ProximoPasso {
  const recebida = op.status === OP_STATUS.paga || (r.parcelas > 0 && r.referencia != null && r.recebido >= r.referencia)
  const rateada = recebida || (r.parcelas > 0 && r.diferenca === 0)
  const feitas: Etapa[] = ['criada', ...(rateada ? ['pagantes' as const] : []), ...(recebida ? ['recebida' as const] : [])]
  const acao = rateada ? null : r.parcelas ? 'refazer' : 'gerar'
  if (recebida) return { feitas, tone: 'success', titulo: 'OP quitada', detalhe: r.recebido ? `Recebido ${formatMoney(r.recebido)}.` : 'Pagamento registrado na OP.', acao }
  if (servicosDivergem(op, r)) {
    return { feitas, tone: 'warning', titulo: 'Confira o valor antes de cobrar', detalhe: `Os serviços somam ${formatMoney(r.servicos)} e a OP vale ${formatMoney(op.valor)}. Ajuste a composição de preço.`, acao }
  }
  if (!r.parcelas) return { feitas, tone: 'info', titulo: 'Próximo passo: gerar pagantes', detalhe: `Divida a cobrança de ${formatMoney(r.referencia)} entre quem vai pagar.`, acao }
  if (!rateada) return { feitas, tone: 'warning', titulo: 'Próximo passo: refazer o rateio', detalhe: `As parcelas ativas somam ${formatMoney(r.soma)} e a OP vale ${formatMoney(r.referencia)}.`, acao }
  return { feitas, tone: 'info', titulo: 'Aguardando pagamento', detalhe: `Recebido ${formatMoney(r.recebido)} de ${formatMoney(r.referencia)}. Acompanhe as parcelas no Rateio.`, acao }
}
