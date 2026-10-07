import type { ChoiceSet, Pagante } from './types'
import { ETAPA, GERACAO_RECIBO, RECIBO, label } from './status'

export type TimelineEvent = { key: string; at: Date | null; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; title: string; detail?: string }

/**
 * Histórico montado a partir das colunas do próprio pagante (não há auditoria aqui).
 * Eventos sem data ficam no fim, na ordem do ciclo de vida.
 */
export function buildTimeline(p: Pagante, choices: ChoiceSet): TimelineEvent[] {
  const events: TimelineEvent[] = []
  if (p.criadoEm) events.push({ key: 'criado', at: p.criadoEm, tone: 'info', title: 'Pagante gerado', detail: p.op ? `Rateio da ${p.op}` : undefined })

  if (p.link.status === ETAPA.concluido) events.push({ key: 'link', at: null, tone: 'success', title: 'Link de pagamento gerado' })
  if (p.link.status === ETAPA.erro) events.push({ key: 'link', at: null, tone: 'danger', title: 'Falha ao gerar o link de pagamento', detail: p.link.erro || undefined })

  if (p.email.status === ETAPA.concluido) events.push({ key: 'email', at: p.email.enviadoEm, tone: 'success', title: 'E-mail de cobrança enviado' })
  if (p.email.status === ETAPA.erro) events.push({ key: 'email', at: p.email.enviadoEm, tone: 'danger', title: 'Falha ao enviar o e-mail de cobrança', detail: p.email.erro || undefined })

  if (p.pagoEm) events.push({ key: 'pago', at: p.pagoEm, tone: 'success', title: 'Pagamento confirmado' })

  if (p.ultimoLembrete) events.push({ key: 'lembrete', at: p.ultimoLembrete, tone: 'warning', title: 'Último lembrete de pagamento' })

  if (p.reciboGeracao.status === GERACAO_RECIBO.erro) events.push({ key: 'recibo-erro', at: null, tone: 'danger', title: 'Falha ao gerar o recibo', detail: p.reciboGeracao.erro || undefined })
  else if (p.reciboGeracao.status === GERACAO_RECIBO.processando) events.push({ key: 'recibo-gerando', at: null, tone: 'info', title: 'Recibo sendo gerado' })

  if (p.recibo === RECIBO.enviado) events.push({ key: 'recibo', at: null, tone: 'success', title: 'Recibo enviado' })
  else if (p.recibo === RECIBO.gerado) events.push({ key: 'recibo', at: null, tone: 'info', title: 'Recibo gerado, ainda não enviado' })
  else if (p.recibo === RECIBO.pendente) events.push({ key: 'recibo', at: null, tone: 'warning', title: 'Recibo na fila de geração' })

  if (p.alteradoEm && (!p.criadoEm || p.alteradoEm.getTime() - p.criadoEm.getTime() > 60_000)) {
    events.push({ key: 'alterado', at: p.alteradoEm, tone: 'neutral', title: 'Última alteração', detail: `Pagamento: ${label(choices.status, p.status)}` })
  }

  const dated = events.filter((e) => e.at).sort((a, b) => b.at!.getTime() - a.at!.getTime())
  return [...dated, ...events.filter((e) => !e.at)]
}
