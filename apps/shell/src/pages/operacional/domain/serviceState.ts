import type { StatusTone } from '@betinhos/ui'
import type { Reserva } from './types'
import { formatDuration, minutesBetween } from './time'

export type ServiceKind = 'unknown' | 'concluded' | 'in_progress' | 'upcoming' | 'delayed'
export type ServiceState = { kind: ServiceKind; minutes: number | null; tone: StatusTone; label: string }

/** Minúsculas, sem acento e sem soft hyphen (o legado tinha um escondido em "Concluído"). */
export function normalizeStatus(status: string) {
  return status.normalize('NFD').replace(/[̀-ͯ­]/g, '').toLowerCase().trim()
}

const CONCLUDED = /conclu|cancel|finaliz/
const RUNNING = /andamento|operacao|execucao/
const SCHEDULED = /confirm|programad|reagend/
const OPEN = /abert|solicitad|pre-?\s?reserva|requer analise/

export const isOpenStatus = (status: string) => OPEN.test(normalizeStatus(status))
export const isCancelled = (status: string) => normalizeStatus(status).startsWith('cancel')

/** Estado derivado do horário e do status, na mesma ordem de decisão do legado. */
export function serviceState(reserva: Pick<Reserva, 'saida' | 'status'>, now: Date): ServiceState {
  if (!reserva.saida) return { kind: 'unknown', minutes: null, tone: 'neutral', label: 'Sem horário' }
  const status = normalizeStatus(reserva.status)
  if (CONCLUDED.test(status)) return { kind: 'concluded', minutes: null, tone: 'neutral', label: status.startsWith('cancel') ? 'Cancelado' : 'Concluído' }
  if (RUNNING.test(status)) return { kind: 'in_progress', minutes: null, tone: 'info', label: 'Em curso' }
  const delta = minutesBetween(now, reserva.saida)
  if (delta >= 0) return { kind: 'upcoming', minutes: delta, tone: delta <= 30 ? 'warning' : 'info', label: delta === 0 ? 'Saindo agora' : `Em ${formatDuration(delta)}` }
  if (SCHEDULED.test(status)) return { kind: 'in_progress', minutes: -delta, tone: 'info', label: `Saiu há ${formatDuration(delta)}, sem conclusão` }
  return { kind: 'delayed', minutes: -delta, tone: 'danger', label: `Atrasado ${formatDuration(delta)}` }
}

/** Status do Dataverse → um dos cinco tons do design system. */
export function statusTone(status: string): StatusTone {
  const value = normalizeStatus(status)
  if (/confirm|conclu|finaliz/.test(value)) return 'success'
  if (/requer analise/.test(value)) return 'warning'
  if (/cancel/.test(value)) return 'danger'
  if (/programad|reagend|andamento|operacao|execucao/.test(value)) return 'info'
  return 'neutral'
}
