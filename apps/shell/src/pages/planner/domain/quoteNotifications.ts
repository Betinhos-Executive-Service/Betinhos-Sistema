// Cotações V2: quem avisar, quando e com qual chave de dedupe. Regras puras.
import { localDateKey } from './management'
import { notificationDedupeKey } from './notifications'
import { lastProposalSentAt } from './quoteDomain'
import { addBusinessDays } from './quoteTaskFlow'
import { QUOTE_WAITING_STATUS } from './quoteWaiting'
import type { QuoteInput } from './types'

// Equipe "Financeiro" recebe o aviso de urgência; nome comparado sem caixa e sem espaços.
export function financeMemberIds(state: { teams?: Array<{ name?: string; memberIds?: unknown[] }> }): string[] {
  const team = (state.teams || []).find((item) => String(item.name || '').trim().toLowerCase() === 'financeiro')
  return (team?.memberIds || []).map(String)
}

export type QuoteNoticeType = 'quote_urgent' | 'quote_ready' | 'quote_follow_up' | 'quote_waiting_return'
export interface QuoteNotice {
  quoteId: string
  recipientEmployeeId: string
  type: QuoteNoticeType
  title: string
  message: string
  referenceDate: string
  dedupeKey: string
}

export const LOSS_REASONS = ['Preço', 'Fechou com outro', 'Desistiu', 'Sem resposta'] as const
export type LossReason = (typeof LOSS_REASONS)[number]
export const QUOTE_FOLLOW_UP_BUSINESS_DAYS = 2

export function isLossReason(value: unknown): value is LossReason {
  return (LOSS_REASONS as readonly unknown[]).includes(value)
}

// cr40f_ChaveDedupe aceita no máximo 100 caracteres no PROD (a metadata diz 450, mas 101+
// falhou com "String or binary data would be truncated"). No formato antigo, com dois GUIDs,
// follow_up tem 101, waiting_return 106 e ready 111. quote_urgent (88) não muda, para não
// reenviar avisos já criados; os demais tiram hífens e o "|" vazio do fim (no máximo 98).
const compact = (value: unknown): string => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
function quoteDedupeKey({ recipientId, quoteId, type, referenceDate = '', eventId = '' }: { recipientId: string; quoteId: string; type: QuoteNoticeType; referenceDate?: string; eventId?: string }): string {
  if (type === 'quote_urgent') return notificationDedupeKey({ recipientId, taskId: quoteId, type, referenceDate, eventId })
  return [compact(recipientId), compact(quoteId), type, compact(referenceDate), compact(eventId)].join('|').replace(/\|+$/, '')
}

function notice(quote: QuoteInput, recipientEmployeeId: string, type: QuoteNoticeType, title: string, referenceDate = '', eventId = '', detail = ''): QuoteNotice {
  const quoteId = String(quote.id || '')
  return {
    quoteId, recipientEmployeeId, type, title, referenceDate,
    message: [quote.code, quote.title || quote.client, detail].filter(Boolean).join(' · '),
    dedupeKey: quoteDedupeKey({ recipientId: recipientEmployeeId, quoteId, type, referenceDate, eventId }),
  }
}

export function urgentNotices(quote: QuoteInput, financeIds: string[], today: string): QuoteNotice[] {
  if ((quote.status || 'Nova') !== 'Nova' || quote.deadline?.slice(0, 10) !== today) return []
  return [...new Set(financeIds.filter(Boolean))].map((id) => notice(quote, id, 'quote_urgent', 'Cotação para hoje'))
}

// enteredAt (instante da transição) entra na chave: cada nova entrada em Cotada avisa de novo.
export function readyNotice(previous: QuoteInput, next: QuoteInput, enteredAt: string): QuoteNotice | null {
  if (previous.status === 'Cotada' || next.status !== 'Cotada' || !next.creatorEmployeeId) return null
  return notice(next, next.creatorEmployeeId, 'quote_ready', 'Preço pronto para enviar', '', enteredAt)
}

// V2.1: na data de retorno (e depois, enquanto aguardar) lembra o criador e o Financeiro, um por dia.
export function waitingReturnNotices(quotes: QuoteInput[], financeIds: string[], today: string): QuoteNotice[] {
  return quotes.flatMap((quote) => {
    const returnDate = String(quote.waitingReturnDate || '').slice(0, 10)
    if (quote.status !== QUOTE_WAITING_STATUS || !returnDate || returnDate > today) return []
    const detail = [quote.waitingFor, quote.waitingFrom && `de ${quote.waitingFrom}`].filter(Boolean).join(' ')
    return [...new Set([quote.creatorEmployeeId, ...financeIds].filter((id): id is string => Boolean(id)))]
      .map((id) => notice(quote, id, 'quote_waiting_return', 'Cobrar informação pendente', today, '', detail))
  })
}

export function followUpNotices(quotes: QuoteInput[], today: string): QuoteNotice[] {
  return quotes.flatMap((quote) => {
    const sentMs = Date.parse(lastProposalSentAt(quote))
    if (quote.status !== 'Respondida ao cliente' || Number.isNaN(sentMs) || !quote.creatorEmployeeId) return []
    // O envio é gravado em UTC; o dia que conta é o de São Paulo (como em daysSince).
    if (addBusinessDays(localDateKey(sentMs), QUOTE_FOLLOW_UP_BUSINESS_DAYS) > today) return []
    return [notice(quote, quote.creatorEmployeeId, 'quote_follow_up', 'Cobrar decisão do cliente', today)]
  })
}
