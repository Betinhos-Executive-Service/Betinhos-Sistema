import { isPaid, label } from '../../pagantes/domain/status'
import type { Pagante } from '../../pagantes/domain/types'
import { OP_STATUS } from './status'
import type { Op, OpChoices } from './types'

export type Evento = { key: string; title: string; at: Date | null; detail?: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; dateOnly?: boolean }

const byDate = (a: Evento, b: Evento) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity)

/** Criação, serviços, pagamentos confirmados e o estado atual, em ordem cronológica. */
export function buildTimeline(op: Op, choices: OpChoices, rateio: Pagante[] | null): Evento[] {
  const events: Evento[] = [
    { key: 'criada', title: 'OP criada', at: op.criadoEm, detail: op.criadoPor ? `Por ${op.criadoPor}` : undefined, tone: 'info' },
  ]
  if (op.primeiroServico) events.push({ key: 'primeiro', title: 'Primeiro serviço', at: op.primeiroServico, tone: 'neutral', dateOnly: true })
  if (op.ultimoServico && op.ultimoServico.getTime() !== op.primeiroServico?.getTime()) {
    events.push({ key: 'ultimo', title: 'Último serviço', at: op.ultimoServico, tone: 'neutral', dateOnly: true })
  }
  for (const p of rateio ?? []) {
    if (!isPaid(p)) continue
    events.push({ key: `pago-${p.id}`, title: `Pagamento de ${p.pessoa || p.codigo}`, at: p.pagoEm ?? p.alteradoEm, tone: 'success' })
  }
  events.sort(byDate)
  const atual = label(choices.status, op.status, 'Sem status')
  const tone = op.status === OP_STATUS.paga ? 'success' : op.status === OP_STATUS.cancelada ? 'danger' : 'warning'
  events.push({ key: 'status', title: `Status atual: ${atual}`, at: op.alteradoEm, detail: 'Data da última alteração da OP.', tone })
  return events
}
