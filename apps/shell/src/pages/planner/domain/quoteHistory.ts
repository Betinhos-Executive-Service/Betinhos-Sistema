// Porte de Tela Planner/src/quotes/quoteHistory.js (sem mudança de comportamento).
import { normalizeText } from './domain'
import { QUOTE_TERMINAL_STATUSES } from './quoteDomain'
import { chosenQuoteOption } from './quoteScenarios'
import type { QuoteInput, QuoteOptionData, QuoteProposalVersion } from './types'

export const quoteResultLabel = (status: string | undefined): string | undefined => status === 'Perdida' ? 'Negada' : status === 'Aceita pelo cliente' ? 'Aceita' : status
export function acceptedHistoryOption(quote: QuoteInput): QuoteOptionData | null {
  if (quote.status !== 'Aceita pelo cliente') return null
  return chosenQuoteOption(quote)
}
export function quoteHistoryDate(value: unknown): string {
  const date = value ? new Date(value as string) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values: Record<string, string> = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${values.year}-${values.month}-${values.day}`
}

export interface QuoteHistoryFilters {
  query?: string
  status?: string
  from?: string
  to?: string
}

export function filterQuoteHistory<Q extends QuoteInput>(quotes: readonly Q[], { query = '', status = '', from = '', to = '' }: QuoteHistoryFilters = {}): Q[] {
  const needle = normalizeText(query)
  return quotes.filter((quote) => {
    if (!QUOTE_TERMINAL_STATUSES.includes(quote.status as string)) return false
    if (status && quote.status !== status) return false
    if (needle && ![quote.code, quote.client, quote.title, quote.route, quote.origin, quote.destination].some((value) => normalizeText(value).includes(needle))) return false
    const date = quoteHistoryDate(quote.finalizationAt)
    return !(from && (!date || date < from)) && !(to && (!date || date > to))
  }).sort((a, b) => (Date.parse(b.finalizationAt as string) || 0) - (Date.parse(a.finalizationAt as string) || 0))
}

export interface QuoteHistoryPeriod {
  from: string
  to: string
}

export function resolveQuoteHistoryPeriod(preset: string, todayKey: string, customRange: Partial<QuoteHistoryPeriod> = {}): QuoteHistoryPeriod {
  if (preset === 'custom') return { from: customRange.from || '', to: customRange.to || '' }
  if (preset === 'all') return { from: '', to: '' }
  const today = new Date(`${todayKey}T12:00:00Z`)
  if (Number.isNaN(today.getTime())) return { from: '', to: '' }
  if (preset === 'thisMonth') return { from: `${todayKey.slice(0, 7)}-01`, to: todayKey }
  if (!['last30', 'last90'].includes(preset)) return { from: '', to: '' }
  today.setUTCDate(today.getUTCDate() - (preset === 'last30' ? 29 : 89))
  return { from: today.toISOString().slice(0, 10), to: todayKey }
}

export interface QuoteHistorySelection extends QuoteHistoryFilters {
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface QuoteHistoryCounts {
  all: number
  accepted: number
  rejected: number
  cancelled: number
}

export interface QuoteHistoryPage<Q> {
  items: Q[]
  counts: QuoteHistoryCounts
  total: number
  page: number
  pageCount: number
  start: number
  end: number
}

const RESULT_KEYS: Record<string, 'accepted' | 'rejected' | 'cancelled'> = { 'Aceita pelo cliente': 'accepted', Perdida: 'rejected', Cancelada: 'cancelled' }

export function selectQuoteHistory<Q extends QuoteInput>(quotes: readonly Q[], { query = '', status = '', from = '', to = '', direction = 'desc', page = 1, pageSize = 20 }: QuoteHistorySelection = {}): QuoteHistoryPage<Q> {
  const matches = filterQuoteHistory(quotes, { query, from, to })
  const counts: QuoteHistoryCounts = { all: matches.length, accepted: 0, rejected: 0, cancelled: 0 }
  for (const quote of matches) {
    const key = RESULT_KEYS[quote.status as string]
    // Todo status terminal tem chave (filterQuoteHistory só devolve terminais).
    if (key) counts[key] += 1
  }
  const rows = matches.filter((quote) => !status || quote.status === status).sort((a, b) => {
    const left = Date.parse(a.finalizationAt as string), right = Date.parse(b.finalizationAt as string)
    const leftValid = Number.isFinite(left), rightValid = Number.isFinite(right)
    if (leftValid !== rightValid) return leftValid ? -1 : 1
    if (leftValid && left !== right) return (left - right) * (direction === 'asc' ? 1 : -1)
    return String(a.code || '').localeCompare(String(b.code || '')) || String(a.id || '').localeCompare(String(b.id || ''))
  })
  const size = Math.max(1, Math.floor(Number(pageSize) || 20))
  const total = rows.length, pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(pageCount, Math.max(1, Math.floor(Number(page) || 1)))
  const offset = (current - 1) * size
  return { items: rows.slice(offset, offset + size), counts, total, page: current, pageCount, start: total ? offset + 1 : 0, end: Math.min(offset + size, total) }
}

export interface AcceptedHistorySummary {
  option: QuoteOptionData | null
  version: QuoteProposalVersion | null
  value: string | number | undefined
  commercialTerms: string
  legacy: boolean
}

export function acceptedHistorySummary(quote: QuoteInput): AcceptedHistorySummary {
  if (quote.status !== 'Aceita pelo cliente') return { option: null, version: null, value: quote.value, commercialTerms: '', legacy: false }
  const version = (quote.proposalVersions || []).find((item) => item.id === quote.acceptedProposalVersionId) || null
  const option = acceptedHistoryOption(quote)
  const legacy = !quote.acceptedProposalVersionId && !(quote.proposalVersions || []).length
  const commercialTerms = option ? String(option.commercialTerms || '').trim() || String(version?.commercialTerms || (legacy ? quote.commercialTerms : '') || '').trim() : ''
  return { option, version, value: option?.value, commercialTerms, legacy }
}
