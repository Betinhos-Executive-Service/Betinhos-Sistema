// Busca das cotações: sem acento, por palavras em qualquer ordem e em quase
// todos os campos (identificação, cliente, contato, rota, datas, veículo,
// valores, opções, observações, espera e responsáveis).
import { normalizeText } from './domain'
import type { QuoteInput } from './types'

const PRIORITY_LABELS: Record<string, string> = { low: 'baixa', medium: 'media', high: 'alta', urgent: 'urgente' }

const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '')

// "2026-11-10" ou ISO → "10/11/2026 10/11"; outro formato fica como veio.
function dateTerms(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[3]}/${match[2]}` : String(value ?? '')
}

function optionTerms(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    const items = Array.isArray(option?.items) ? option.items.map((item: Record<string, unknown>) => item?.vehicleType) : []
    return [option?.name, option?.label, option?.vehicleType, option?.legacyVehicleType, option?.value, digits(option?.value), option?.notes, option?.commercialTerms, ...items]
  })
}

/** Texto normalizado com tudo o que a busca encontra numa cotação. */
export function quoteSearchText(quote: QuoteInput, assigneeNames: readonly string[] = []): string {
  const parts: unknown[] = [
    quote.code, String(quote.code ?? '').replace(/[^\p{L}\p{N}]/gu, ''), digits(quote.code),
    quote.title, quote.subject, quote.client, quote.clientContact, quote.clientEmail, quote.clientPhone, digits(quote.clientPhone),
    quote.status, quote.priority && PRIORITY_LABELS[quote.priority],
    quote.route, quote.origin, quote.destination,
    dateTerms(quote.deadline), dateTerms(quote.serviceDate), dateTerms(quote.returnDate),
    quote.vehicleType, quote.passengers, quote.passengerProfile,
    quote.value, digits(quote.value),
    quote.notes, quote.description, quote.internalNotes, quote.commercialTerms,
    quote.lossReason, quote.waitingFor, quote.waitingFrom, dateTerms(quote.waitingReturnDate),
    ...optionTerms(quote.options), ...optionTerms(quote.proposalOptions),
    ...assigneeNames,
  ]
  return normalizeText(parts.filter((part) => part !== undefined && part !== null && part !== '').join(' \n '))
}

/** Palavras da busca, sem acento; todas precisam aparecer (qualquer ordem). */
export function quoteSearchTerms(query: unknown): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean)
}

export function matchesQuoteSearch(quote: QuoteInput, terms: readonly string[], assigneeNames: readonly string[] = []): boolean {
  if (!terms.length) return true
  const text = quoteSearchText(quote, assigneeNames)
  return terms.every((term) => text.includes(term))
}
