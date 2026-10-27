// Porte de Tela Planner/src/quotes/quoteScenarios.js (sem mudança de comportamento).
import { formatMoney, parseQuoteMoney, type ValidationErrors, type ValidationResult } from './quoteDomain'
import type { QuoteInput, QuoteOptionData, QuoteProposalVersion } from './types'

function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (key) => {
    const value = Math.floor(Math.random() * 16)
    return (key === 'x' ? value : (value & 3) | 8).toString(16)
  })
}

export function newQuoteOption(index = 0): QuoteOptionData {
  return {
    id: uuid(),
    name: `Opção ${index + 1}`,
    items: [],
    value: '',
    commercialTerms: '',
    notes: '',
  }
}

export function normalizeQuoteOptions(quote: QuoteInput = {}): QuoteOptionData[] {
  if (Array.isArray(quote.options) && quote.options.length) return quote.options
  if (quote.value || quote.vehicleType || quote.commercialTerms) {
    return [{
      id: `legacy-${quote.id || 'quote'}`,
      name: 'Opção atual',
      items: [],
      legacyVehicleType: quote.vehicleType || '',
      value: quote.value || '',
      commercialTerms: quote.commercialTerms || '',
      notes: '',
      legacy: true,
    }]
  }
  return []
}

export function validateQuoteOption(option: Partial<QuoteOptionData> = {}): ValidationResult {
  const errors: ValidationErrors = {}
  if (!String(option.name || '').trim()) errors.name = 'Informe um nome para a opção.'
  const amount = parseQuoteMoney(option.value)
  if (amount === null || !Number.isFinite(amount) || amount <= 0) errors.value = 'Informe um valor maior que zero.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export function pricedQuoteOptionIds(quote: QuoteInput = {}): string[] {
  return normalizeQuoteOptions(quote).filter((option) => validateQuoteOption(option).valid).map((option) => option.id)
}

export interface QuoteProposalResult {
  valid: boolean
  error: string
  options: QuoteOptionData[]
}

export function prepareIndividualQuoteProposal(quote: QuoteInput, optionId?: string): QuoteProposalResult {
  return prepareQuoteProposal(quote, optionId ? [optionId] : [])
}

export function prepareQuoteResponse(quote: QuoteInput = {}): QuoteProposalResult {
  const ids = pricedQuoteOptionIds(quote)
  if (!ids.length) return { valid: false, error: 'Cadastre ao menos uma opção com título e valor maior que zero antes de confirmar a resposta.', options: [] }
  return prepareQuoteProposal(quote, ids)
}

export const QUOTE_SEND_CHANNELS = ['E-mail', 'WhatsApp', 'Outro']

export interface QuoteSend {
  channel?: string
  recipient?: string
  sentAt?: string
}

export function recipientForChannel(quote: QuoteInput = {}, channel?: string): string {
  return String((channel === 'WhatsApp' ? quote.clientPhone : channel === 'E-mail' ? quote.clientEmail : '') || '').trim()
}

export function defaultQuoteSend(quote: QuoteInput = {}, now: Date = new Date()): Required<QuoteSend> {
  const channel = recipientForChannel(quote, 'E-mail') ? 'E-mail' : recipientForChannel(quote, 'WhatsApp') ? 'WhatsApp' : 'E-mail'
  return { channel, recipient: recipientForChannel(quote, channel), sentAt: now.toISOString() }
}

export function validateQuoteSend(send: QuoteSend | null | undefined = {}): string {
  if (!QUOTE_SEND_CHANNELS.includes(send?.channel as string) || !send) return 'Informe o canal do envio.'
  if (!String(send.recipient || '').trim()) return 'Informe o destinatário do envio.'
  if (String(send.recipient).trim().length > 500) return 'O destinatário excede 500 caracteres.'
  if (send.channel === 'E-mail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(send.recipient).trim())) return 'Informe um e-mail válido para o destinatário.'
  const date = Date.parse(send.sentAt as string)
  if (!Number.isFinite(date) || date > Date.now() + 60000) return 'Informe a data e hora do envio já realizado.'
  return ''
}

export function prepareQuoteProposal(quote: QuoteInput = {}, selectedIds?: string[] | null): QuoteProposalResult {
  const options = normalizeQuoteOptions(quote)
  const selected = new Set(selectedIds || options.map((item) => item.id))
  const proposalOptions = options.filter((item) => selected.has(item.id))
  if (!proposalOptions.length) return { valid: false, error: 'Selecione ao menos uma opção para enviar.', options: [] }
  const invalid = proposalOptions.map((option) => ({ option, result: validateQuoteOption(option) })).find(({ result }) => !result.valid)
  if (invalid) return { valid: false, error: `${invalid.option.name || 'Opção'}: ${Object.values(invalid.result.errors)[0]}`, options: [] }
  return { valid: true, error: '', options: proposalOptions.map((item) => ({ ...item, items: (item.items || []).map((vehicle) => ({ ...vehicle })) })) }
}

export interface ProposalContent {
  html?: string
  text?: string
}

export interface ProposalAuthor {
  id?: string
  name?: string
}

const SNAPSHOT_KEYS = ['title', 'client', 'clientContact', 'clientEmail', 'clientPhone', 'route', 'origin', 'destination', 'serviceDate', 'returnDate', 'passengers', 'passengerProfile', 'notes', 'commercialTerms'] as const

// O registro do envio exige canal, destinatário e momento: a versão gravada é
// a prova do que foi enviado ao cliente.
export function createQuoteProposalVersion(quote: QuoteInput, options: QuoteOptionData[], content: ProposalContent, author: ProposalAuthor, send: QuoteSend, requestId: string = uuid()): QuoteProposalVersion {
  const error = validateQuoteSend(send)
  if (error) throw new Error(error)
  return {
    id: requestId,
    requestId,
    number: (quote.proposalVersions || []).length + 1,
    createdAt: new Date().toISOString(),
    authorId: author.id || '',
    authorName: author.name || '',
    channel: send.channel,
    recipient: String(send.recipient).trim(),
    sentAt: new Date(send.sentAt as string).toISOString(),
    commercialTerms: quote.commercialTerms || '',
    quoteSnapshot: Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, quote[key] ?? ''])),
    options: options.map((option) => ({ ...option, items: (option.items || []).map((item) => ({ ...item })) })),
    html: content.html || '',
    text: content.text || '',
  }
}

export function chosenQuoteOption(quote: QuoteInput = {}): QuoteOptionData | null {
  const version = (quote.proposalVersions || []).find((item) => item.id === quote.acceptedProposalVersionId)
  return version?.options?.find((item) => item.id === quote.acceptedOptionId) || (!quote.acceptedProposalVersionId && !(quote.proposalVersions || []).length ? normalizeQuoteOptions(quote).find((item) => item.id === quote.acceptedOptionId) : null) || null
}

export interface QuoteAcceptanceInput {
  acceptedOptionId?: string
  acceptedProposalVersionId?: string
}

export function resolveQuoteAcceptance(quote: QuoteInput = {}, accepted: QuoteAcceptanceInput = {}): { option: QuoteOptionData; version: QuoteProposalVersion | undefined } {
  const version = (quote.proposalVersions || []).find((item) => item.id === accepted.acceptedProposalVersionId)
  const legacy = quote.status === 'Respondida ao cliente' && !(quote.proposalVersions || []).length && !accepted.acceptedProposalVersionId
  const option = (version?.options || (legacy ? normalizeQuoteOptions(quote) : [])).find((item) => item.id === accepted.acceptedOptionId)
  if (!option) throw new Error('Selecione uma opção de uma proposta registrada como enviada.')
  return { option, version }
}

export function formatQuoteOption(option: Partial<QuoteOptionData> = {}): string {
  return `${option.name || 'Opção'} · ${formatMoney(option.value)}`
}
