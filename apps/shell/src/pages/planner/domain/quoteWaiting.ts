// Cotações V2.1: "Aguardar informação" grava o que falta, de quem e a data de retorno na própria cotação.
import { addBusinessDays } from './quoteTaskFlow'
import type { WaitingContextInput } from './types'

export const QUOTE_WAITING_STATUS = 'Aguardando informação'
export const QUOTE_WAITING_RETURN_BUSINESS_DAYS = 2
export const QUOTE_WAITING_LIMITS = { waitingFor: 500, waitingFrom: 200 } as const
/** Ao sair de Aguardando (por qualquer caminho, inclusive a tarefa legada) os três campos são limpos. */
export const QUOTE_WAITING_CLEARED = Object.freeze({ waitingFor: '', waitingFrom: '', waitingReturnDate: '' })

export interface QuoteWaitingFields { waitingFor?: string; waitingFrom?: string; waitingReturnDate?: string }
type WaitingPatch = QuoteWaitingFields & { status?: unknown; waitingContext?: WaitingContextInput } & Record<string, unknown>

export function defaultWaitingReturnDate(today: string): string {
  return addBusinessDays(today, QUOTE_WAITING_RETURN_BUSINESS_DAYS)
}

/** "" quando válido; senão a mensagem para o usuário. */
export function validateQuoteWaiting(fields: QuoteWaitingFields): string {
  const what = String(fields.waitingFor || '').trim()
  const who = String(fields.waitingFrom || '').trim()
  if (!what) return 'Informe o que falta.'
  if (what.length > QUOTE_WAITING_LIMITS.waitingFor) return `O que falta: no máximo ${QUOTE_WAITING_LIMITS.waitingFor} caracteres.`
  if (!who) return 'Informe de quem é o retorno.'
  if (who.length > QUOTE_WAITING_LIMITS.waitingFrom) return `De quem: no máximo ${QUOTE_WAITING_LIMITS.waitingFrom} caracteres.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fields.waitingReturnDate || ''))) return 'Informe a data de retorno.'
  return ''
}

/**
 * Regra de transição aplicada pelos stores: ao entrar em Aguardando valida os campos (e gera o contexto
 * de espera para a tarefa legada, se houver); ao sair limpa os três campos.
 */
export function applyQuoteWaiting<T extends WaitingPatch>(previousStatus: unknown, patch: T): T & { waitingContext?: WaitingContextInput } {
  const entering = patch.status === QUOTE_WAITING_STATUS && previousStatus !== QUOTE_WAITING_STATUS
  const leaving = patch.status !== undefined && patch.status !== QUOTE_WAITING_STATUS && previousStatus === QUOTE_WAITING_STATUS
  if (leaving) return { ...patch, ...QUOTE_WAITING_CLEARED }
  if (!entering) return patch
  const error = validateQuoteWaiting(patch)
  if (error) throw new Error(error)
  const waitingFor = String(patch.waitingFor).trim()
  const waitingFrom = String(patch.waitingFrom).trim()
  return { ...patch, waitingFor, waitingFrom, waitingContext: { subject: waitingFor, onType: 'external', onNames: [waitingFrom], expectedDate: patch.waitingReturnDate } }
}
