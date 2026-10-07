import type { Row } from '@betinhos/dataverse'
import type { StatusTone } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import type { Pagante } from './types'

/** `cr40f_statuspagante` (choice global). */
export const STATUS = {
  pendente: 202410001,
  pago: 202410002,
  negado: 202410003,
  expirado: 202410004,
  cancelado: 202410005,
  naoFinalizado: 202410006,
  autorizado: 202410007,
  aguardandoFacial: 202410010,
} as const

/** `cr40f_statusdorecibo`: Pendente dispara o recibo automático. */
export const RECIBO = { pendente: 202410000, enviado: 202410001, gerado: 202410002 } as const

/** `cr40f_statusgeracaolink` e `cr40f_statusenvioemail`. */
export const ETAPA = { naoAplicavel: 202410000, pendente: 202410001, concluido: 202410002, erro: 202410003 } as const

/** `new_statusgeracaorecibo` (choice local, outra faixa de valores). */
export const GERACAO_RECIBO = { naoAplicavel: 100000000, processando: 100000001, concluido: 100000002, erro: 100000003 } as const

export const A_RECEBER: number[] = [STATUS.pendente, STATUS.negado, STATUS.expirado, STATUS.naoFinalizado, STATUS.aguardandoFacial]

/** Pago e Autorizado ficam travados pelo plugin do Gerar Pagantes. */
export const isPaid = (p: Pick<Pagante, 'status'>) => p.status === STATUS.pago || p.status === STATUS.autorizado
const isClosed = (p: Pick<Pagante, 'status'>) => isPaid(p) || p.status === STATUS.cancelado
export const canMarkPaid = (p: Pick<Pagante, 'status'>) => !isClosed(p)
export const canCancel = (p: Pick<Pagante, 'status'>) => !isClosed(p)
export const hasFalha = (p: Pick<Pagante, 'link' | 'email' | 'reciboGeracao'>) =>
  p.link.status === ETAPA.erro || p.email.status === ETAPA.erro || p.reciboGeracao.status === GERACAO_RECIBO.erro
/** O gerador de recibo do model-driven aceita qualquer status; só o cancelado não faz sentido. */
export const canGerarRecibo = (p: Pick<Pagante, 'status'>) => p.status !== STATUS.cancelado
export const reciboEnviado = (p: Pick<Pagante, 'recibo'>) => p.recibo === RECIBO.enviado

export function statusTone(status: number | null): StatusTone {
  if (status === STATUS.pago || status === STATUS.autorizado) return 'success'
  if (status === STATUS.negado || status === STATUS.expirado) return 'danger'
  if (status === STATUS.cancelado || status == null) return 'neutral'
  return 'warning'
}

export function reciboTone(recibo: number | null): StatusTone {
  if (recibo === RECIBO.enviado) return 'success'
  if (recibo === RECIBO.gerado) return 'info'
  return 'neutral'
}

export function label(options: ChoiceOption[], value: number | null, fallback = '—') {
  if (value == null) return fallback
  return options.find((o) => o.value === value)?.label ?? String(value)
}

/** Payload da mudança manual de status; "pago" pode pedir o recibo automático, como o webhook da Cielo. */
export function statusPatch(kind: 'pago' | 'cancelado', p: Pick<Pagante, 'recibo'>, enviarRecibo: boolean): Row {
  if (kind === 'cancelado') return { cr40f_status: STATUS.cancelado }
  const payload: Row = { cr40f_status: STATUS.pago }
  if (enviarRecibo && !reciboEnviado(p)) payload.cr40f_statusdorecibo = RECIBO.pendente
  return payload
}

/** Mesmo patch aplicado ao objeto local, para a UI otimista. */
export function applyPatch(payload: Row): Partial<Pagante> {
  const next: Partial<Pagante> = { status: payload.cr40f_status as number, alteradoEm: new Date() }
  if (payload.cr40f_statusdorecibo != null) next.recibo = payload.cr40f_statusdorecibo as number
  return next
}
