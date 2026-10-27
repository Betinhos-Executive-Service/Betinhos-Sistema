// Porte de Tela Planner/src/quoteDomain.js (sem mudança de comportamento).
import { localDateKey } from './management'
import { addBusinessDays, QUOTE_STATUS_FLOW, QUOTE_TERMINAL_STATUSES } from './quoteTaskFlow'
import type { QuoteInput, QuoteOptionData, Task } from './types'

export { QUOTE_TERMINAL_STATUSES }
export const QUOTE_STATUSES: string[] = [...QUOTE_STATUS_FLOW, ...QUOTE_TERMINAL_STATUSES]

export const QUOTE_PRIORITIES = [
  { id: 'low', label: 'Baixa' },
  { id: 'medium', label: 'Média' },
  { id: 'high', label: 'Alta' },
  { id: 'urgent', label: 'Urgente' },
]

export const QUOTE_VEHICLE_VALUES: Readonly<Record<string, number>> = Object.freeze({
  'Básico': 202410000,
  Executivo: 202410001,
  Blindado: 202410002,
  Van: 202410003,
  'Van Blindado': 202410004,
  Spin: 202410005,
  'Somente Motorista': 202410006,
})

export const QUOTE_OPEN_STATUSES: string[] = [...QUOTE_STATUS_FLOW]
export const QUOTE_COMPLETED_STATUSES = ['Cotada', 'Respondida ao cliente']

// Prazo para responder escolhido por atalho (dias úteis, a partir de hoje).
export const QUOTE_DEADLINE_PRESETS = [
  { id: 'today', label: 'Hoje', days: 0 },
  { id: '2d', label: 'Em 2 dias', days: 2 },
  { id: '7d', label: 'Até 7 dias', days: 7 },
]

export type ValidationErrors = Record<string, string>
export interface ValidationResult {
  valid: boolean
  errors: ValidationErrors
}

export function deadlineFromPreset(presetId: string, today: string = localDateKey()): string {
  const preset = QUOTE_DEADLINE_PRESETS.find((item) => item.id === presetId)
  return preset ? addBusinessDays(today, preset.days) : ''
}

// "Cotada" não é um clique: a cotação fica pronta para enviar assim que uma
// opção tem título e valor, e volta para análise se todas perderem o valor.
export function deriveQuoteStatus(quote: QuoteInput = {}): string {
  const status = quote.status || 'Nova'
  // Registros antigos têm valor único e nenhuma opção: ficam como estão.
  if (!Array.isArray(quote.options) || !quote.options.length) return status
  const priced = quote.options.some((option) => validateScenario(option).valid)
  if (status === 'Em análise pelo financeiro' && priced) return 'Cotada'
  if (status === 'Cotada' && !priced) return 'Em análise pelo financeiro'
  return status
}

// O invariante vale para qualquer gravação, inclusive um status explícito do Kanban.
export function applyDerivedStatus<P extends QuoteInput>(existing: QuoteInput | null | undefined, patch: P): P {
  const next: QuoteInput = { ...existing, ...patch }
  const derived = deriveQuoteStatus(next)
  return derived === next.status ? patch : { ...patch, status: derived }
}

export function lastProposalSentAt(quote: QuoteInput = {}): string {
  const version = quote.proposalVersions?.at(-1)
  return version?.sentAt || version?.createdAt || quote.modifiedAt || ''
}

export function sentLabel(quote: QuoteInput, today: string = localDateKey()): string {
  const days = daysSince(lastProposalSentAt(quote), today)
  if (days === null) return 'Aguardando decisão do cliente'
  return days <= 0 ? 'Enviada hoje' : days === 1 ? 'Enviada há 1 dia' : `Enviada há ${days} dias`
}

export function normalizeQuoteRoute(value: unknown = ''): string {
  return String(value ?? '').split('/').map((point) => point.trim()).join(' / ')
}

export function quoteRoutePoints(quote: QuoteInput = {}): string[] {
  const route = String(quote.route ?? '').trim()
  if (route) return route.split('/').map((point) => point.trim())
  return [quote.origin, quote.destination].map((point) => String(point || '').trim()).filter(Boolean)
}

export function validateQuoteRoute(value: unknown = ''): string {
  const route = normalizeQuoteRoute(value)
  const points = route.split('/')
  if (!route.trim()) return 'Informe o trajeto.'
  if (points.some((point) => !point.trim())) return 'Preencha todos os locais e separe cada um com /.'
  if (points.length < 2) return 'Informe pelo menos dois locais separados por /.'
  if (route.length > 10000) return 'O trajeto excede 10.000 caracteres.'
  return ''
}

export function validateQuoteCommercial(input: QuoteInput = {}): ValidationResult {
  const errors: ValidationErrors = {}
  if (Array.isArray(input.options) && input.options.length) {
    if (input.status === 'Cotada') {
      if (!input.options.some((option) => validateScenario(option).valid)) errors.options = 'Preencha ao menos uma opção com título e valor maior que zero antes de marcar cotada.'
      return { valid: Object.keys(errors).length === 0, errors }
    }
    const confirmedOptions = input.status === 'Respondida ao cliente' && input.proposalVersions?.length ? input.proposalVersions.at(-1)?.options : null
    const proposal: QuoteOptionData[] = confirmedOptions || (Array.isArray(input.proposalOptions) ? input.proposalOptions : input.options)
    if (!proposal.length) errors.options = 'Cadastre e selecione ao menos uma opção.'
    else {
      for (const option of proposal) {
        const result = validateScenario(option)
        if (!result.valid) { errors.options = `${option.name || 'Opção'}: ${Object.values(result.errors)[0]}`; break }
      }
    }
    return { valid: Object.keys(errors).length === 0, errors }
  }
  const number = parseQuoteMoney(input.value)
  if (number === null || !Number.isFinite(number) || number <= 0) errors.value = 'Informe um valor maior que zero.'
  return { valid: Object.keys(errors).length === 0, errors }
}

function validateScenario(option: Partial<QuoteOptionData>): ValidationResult {
  const errors: ValidationErrors = {}
  if (!String(option.name || '').trim()) errors.name = 'Informe um nome para a opção.'
  const amount = parseQuoteMoney(option.value)
  // Número.isFinite(null) é false, como no JS original.
  if (amount === null || !Number.isFinite(amount) || amount <= 0) errors.value = 'Informe um valor maior que zero.'
  return { valid: Object.keys(errors).length === 0, errors }
}
// Etapas do rascunho de 23/10: ① Pedido (quem pede, o que pede, prazo) e
// ② Custo (opções). Trajeto, datas e veículo ficam para o agendamento.
export const QUOTE_CREATE_STEPS = [
  { id: 'request', label: 'Pedido' },
  { id: 'commercial', label: 'Custo' },
]

const REQUEST_FIELDS: Array<[keyof QuoteInput & string, string]> = [
  ['title', 'Informe o título interno.'],
  ['client', 'Informe o cliente ou empresa.'],
  ['clientContact', 'Informe o nome do solicitante.'],
]

export function validateQuoteStep(input: QuoteInput = {}, stepId: string = 'review'): ValidationResult {
  if (stepId === 'review') {
    const errors: ValidationErrors = Object.fromEntries(['request', 'commercial'].flatMap((step) => Object.entries(validateQuoteStep(input, step).errors)))
    return { valid: Object.keys(errors).length === 0, errors }
  }
  const errors: ValidationErrors = {}
  if (stepId === 'request') {
    for (const [field, message] of REQUEST_FIELDS) if (!String(input[field] ?? '').trim()) errors[field] = message
    const phone = String(input.clientPhone || '').trim()
    const email = String(input.clientEmail || '').trim()
    if (!phone && !email) errors.clientPhone = 'Informe pelo menos o telefone ou o e-mail.'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.clientEmail = 'Informe um e-mail válido.'
    if (String(input.notes || '').length > 4000) errors.notes = 'O pedido do cliente excede 4.000 caracteres, limite do Dataverse.'
    if (String(input.passengerProfile || '').length > 300) errors.passengerProfile = 'O perfil do passageiro excede 300 caracteres.'
    if (String(input.internalNotes || '').length > 4000) errors.internalNotes = 'As observações internas excedem 4.000 caracteres.'
    const route = String(input.route ?? '').trim()
    if (route) { const routeError = validateQuoteRoute(route); if (routeError) errors.route = routeError }
  }
  if (stepId === 'commercial' && QUOTE_COMPLETED_STATUSES.includes(String(input.status))) Object.assign(errors, validateQuoteCommercial(input).errors)
  return { valid: Object.keys(errors).length === 0, errors }
}

export function isQuoteOpen(status: unknown): boolean {
  return QUOTE_OPEN_STATUSES.includes(status as string)
}

export interface QuoteFilters {
  query?: string
  status?: string | string[]
  priority?: string | string[]
  responsible?: string | string[]
  deadline?: string | string[]
}

type QuoteTask = Pick<Task, 'quoteId' | 'parentTaskId' | 'assigneeIds'> & { id?: string }

function primaryTaskByQuote(tasks: QuoteTask[]): Map<string, QuoteTask> {
  return new Map(tasks.filter((task) => task.quoteId && !task.parentTaskId).map((task) => [String(task.quoteId), task]))
}

export function filterQuotes<Q extends QuoteInput>(quotes: Q[] = [], tasks: QuoteTask[] = [], filters: QuoteFilters = {}, today: string = localDateKey()): Q[] {
  const taskByQuote = primaryTaskByQuote(tasks)
  const needle = String(filters.query || '').trim().toLocaleLowerCase('pt-BR')
  return quotes.filter((quote) => {
    const task = taskByQuote.get(String(quote.id))
    const searchable = [quote.code, quote.title, quote.client, quote.clientContact, quote.status].join(' ').toLocaleLowerCase('pt-BR')
    if (needle && !searchable.includes(needle)) return false
    const selected = (value: string | string[] | undefined): string[] => Array.isArray(value) ? value : value ? [value] : []
    if (selected(filters.status).length && !selected(filters.status).includes(String(quote.status))) return false
    if (selected(filters.priority).length && !selected(filters.priority).includes(String(quote.priority))) return false
    const responsible = selected(filters.responsible)
    if (responsible.length && !responsible.some((id) => id === 'unassigned' ? !(task?.assigneeIds || []).length : (task?.assigneeIds || []).includes(id))) return false
    const deadline = selected(filters.deadline)
    if (deadline.length && !deadline.some((value) =>
      value === 'overdue' && isQuoteOpen(quote.status) && quote.status !== 'Respondida ao cliente' && quote.deadline && quote.deadline < today ||
      value === 'today' && isQuoteOpen(quote.status) && quote.deadline === today ||
      value === 'no-deadline' && !quote.deadline,
    )) return false
    return true
  })
}

export interface QuoteMetrics {
  active: number
  overdue: number
  dueToday: number
  waiting: number
  unassigned: number
}

export function getQuoteMetrics(quotes: QuoteInput[] = [], tasks: QuoteTask[] = [], today: string = localDateKey()): QuoteMetrics {
  const taskByQuote = primaryTaskByQuote(tasks)
  const active = quotes.filter((quote) => isQuoteOpen(quote.status))
  return {
    active: active.length,
    overdue: active.filter((quote) => quote.status !== 'Respondida ao cliente' && quote.deadline && quote.deadline < today).length,
    dueToday: active.filter((quote) => quote.deadline === today).length,
    waiting: active.filter((quote) => quote.status === 'Aguardando informação').length,
    unassigned: active.filter((quote) => !(taskByQuote.get(String(quote.id))?.assigneeIds || []).length).length,
  }
}

// Etapa do processo em que a cotação está e a única ação primária daquela etapa.
// Os ids são os que a tela executa: start, compose (abre a prévia; o envio é
// registrado nela), return, outcome e reopen.
export interface QuoteStage {
  id: string
  label: string
  statuses: string[]
}

export const QUOTE_STAGES: QuoteStage[] = [
  { id: 'request', label: 'Pedido', statuses: ['Nova', 'Em análise pelo financeiro', 'Aguardando informação'] },
  { id: 'cost', label: 'Custo', statuses: ['Cotada'] },
  { id: 'response', label: 'Resposta', statuses: ['Respondida ao cliente', ...QUOTE_TERMINAL_STATUSES] },
]

export function quoteStage(status: unknown): QuoteStage {
  return QUOTE_STAGES.find((stage) => stage.statuses.includes(status as string)) || QUOTE_STAGES[0]!
}

export interface QuoteAction {
  id: string
  label: string
  status?: string
}

export interface QuoteNextAction {
  primary: QuoteAction
  secondary: QuoteAction[]
}

const QUOTE_NEXT_ACTIONS: Readonly<Record<string, QuoteNextAction>> = Object.freeze({
  Nova: { primary: { id: 'start', label: 'Iniciar cotação', status: 'Em análise pelo financeiro' }, secondary: [{ id: 'wait', label: 'Aguardar informação', status: 'Aguardando informação' }] },
  'Em análise pelo financeiro': { primary: { id: 'compose', label: 'Montar proposta' }, secondary: [{ id: 'wait', label: 'Aguardar informação', status: 'Aguardando informação' }] },
  'Aguardando informação': { primary: { id: 'return', label: 'Registrar retorno' }, secondary: [{ id: 'resume', label: 'Retomar cotação', status: 'Em análise pelo financeiro' }] },
  Cotada: { primary: { id: 'compose', label: 'Montar proposta' }, secondary: [] },
  'Respondida ao cliente': { primary: { id: 'outcome', label: 'Registrar decisão do cliente' }, secondary: [] },
})
const QUOTE_REOPEN_ACTION: QuoteNextAction = Object.freeze({ primary: { id: 'reopen', label: 'Reabrir cotação', status: 'Nova' }, secondary: [] })

export function getQuoteNextAction(quote: QuoteInput = {}): QuoteNextAction {
  return (Object.hasOwn(QUOTE_NEXT_ACTIONS, String(quote.status)) ? QUOTE_NEXT_ACTIONS[String(quote.status)] : undefined) || QUOTE_REOPEN_ACTION
}

export function daysSince(isoDate: unknown, today: string = localDateKey()): number | null {
  const sentMs = Date.parse(isoDate as string)
  if (Number.isNaN(sentMs)) return null
  const sent = localDateKey(new Date(sentMs))
  return Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${sent}T12:00:00Z`)) / 86400000)
}

const VAN_NOTES = [
  'É imprescindível o envio da lista de passageiros (nome completo e CPF) de cada passageiro com 36 horas antes do atendimento, para que tenhamos tempo hábil de solicitar autorização da viagem junto aos órgãos competentes.',
  'Sem essa autorização, infelizmente o veículo não poderá sair de nossa base.',
  'Os veículos desta categoria suportam até 15 passageiros.',
  'Caso seja utilizada a rodovia Rodoanel para evitar trânsito, acrescentar taxa de R$95,00 para cada utilização.',
  'Visando sua segurança, a definição do motorista acontecerá somente no dia anterior à viagem, preservando o descanso entre jornadas.',
  'Esse e-mail é exclusivo para cotação e não garante o agendamento do serviço. Caso aprovado, devolva sua confirmação ao consultor da Betinhos.',
]

const EXECUTIVE_NOTES = [
  'Esse e-mail é exclusivo para cotação e não garante o agendamento do serviço. Caso aprovado, devolva sua confirmação ao consultor da Betinhos.',
  'A definição do motorista acontece próximo à data do atendimento para preservar descanso e segurança operacional.',
  'Caso precise de suporte, acione a equipe Betinhos pelos canais oficiais do atendimento.',
]

export function quoteEmailNotes(quote: QuoteInput = {}): string[] {
  return [...(isVanVehicle(quote.vehicleType) ? VAN_NOTES : EXECUTIVE_NOTES)]
}

export interface QuoteProposalSection {
  id: string
  title: string
  text: string
}

export function quoteProposalSections(quote: QuoteInput = {}): QuoteProposalSection[] {
  return [
    { id: 'request', title: 'Pedido do cliente', text: String(quote.notes ?? '').replace(/\r\n?/g, '\n') },
    { id: 'commercial', title: 'Condições comerciais', text: String(quote.commercialTerms ?? '').replace(/\r\n?/g, '\n') },
  ].filter((section) => section.text.trim())
}

export const QUOTE_ASSET_NAMES = {
  banner: 'new_cotacao_banner.png',
  header: 'new_cotacao_header_solicitacao.png',
  vehicle: 'new_cotacao_banner_veiculos.png',
  commitments: 'new_cotacao_compromissos.png',
  vanVehicle: 'new_cotacao_van_veiculos.png',
  vanInfo: 'new_cotacao_van_info.png',
}

export type QuoteAssetNames = typeof QUOTE_ASSET_NAMES

export function isVanVehicle(vehicleType: unknown): boolean {
  return String(vehicleType || '').toLowerCase().includes('van')
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatDateTime(value: unknown): string {
  if (!value) return ''
  const date = new Date(value as string)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date)
}

// Empty is null; invalid input is NaN. Decimal-dot strings remain compatible
// with existing records; a group of three digits after a dot denotes thousands.
export function parseQuoteMoney(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const raw = String(value).trim().replace(/^R\$\s*/i, '')
  let normalized: string
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) normalized = raw.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+(?:[,.]\d{1,2})?$/.test(raw)) normalized = raw.replace(',', '.')
  else return NaN
  const number = Number(normalized)
  return Number.isFinite(number) ? number : NaN
}

export function formatMoney(value: unknown): string {
  const number = parseQuoteMoney(value)
  if (number === null) return 'Valor sob consulta'
  if (!Number.isFinite(number)) return String(value)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number).replace(/ /g, ' ')
}

export function buildQuoteRouteText(quote: QuoteInput = {}): string[] {
  const points = quoteRoutePoints(quote)
  const departure = formatDateTime(quote.serviceDate)
  const returning = formatDateTime(quote.returnDate)
  const lines: string[] = []
  if (points.length) lines.push(`Trajeto: ${points.join(' / ')}`)
  if (departure) lines.push(`Saída: ${departure}`)
  if (quote.returnDate && returning) lines.push(`Retorno: ${returning}`)
  if (quote.passengers) lines.push(`Passageiros: ${quote.passengers}`)
  return lines.length ? lines : ['Roteiro a definir.']
}

export interface QuoteDraftValidation {
  valid: boolean
  missing: string[]
  error: string
}

export function validateQuoteDraft(input: QuoteInput = {}): QuoteDraftValidation {
  const required: Array<[keyof QuoteInput & string, string]> = [
    ['title', 'título interno'],
    ['client', 'cliente/empresa'],
    ['clientContact', 'nome do solicitante'],
  ]
  const missing = required.filter(([key]) => !String(key === 'route' ? (input.route ?? [input.origin, input.destination].filter(Boolean).join(' / ')) : input[key] ?? '').trim()).map(([, label]) => label)
  const stepErrors: ValidationErrors = { ...validateQuoteStep(input, 'review').errors, ...validateQuoteStep(input, 'commercial').errors }
  if (stepErrors.route) missing.push(stepErrors.route === 'Informe o trajeto.' ? 'trajeto' : stepErrors.route.replace(/^Informe /, '').replace(/\.$/, ''))
  if (stepErrors.clientPhone && !missing.includes('telefone ou e-mail')) missing.push('telefone ou e-mail')
  if (stepErrors.clientEmail && !missing.includes('e-mail válido')) missing.push('e-mail válido')
  if (stepErrors.value || stepErrors.options) missing.push(stepErrors.options || 'valor total maior que zero')
  if (String(input.status || '') === 'Perdida' && !String(input.lossReason || '').trim()) missing.push('motivo da perda')
  return missing.length ? { valid: false, missing, error: `Informe: ${missing.join(', ')}.` } : { valid: true, missing: [], error: '' }
}

function assetUrl(baseUrl: unknown, filename: string, imageUrls: Record<string, string> = {}): string {
  if (imageUrls[filename]) return imageUrls[filename]
  if (!baseUrl) return filename
  return `${String(baseUrl).replace(/\/$/, '')}/WebResources/${filename}`
}

export interface QuoteEmailAssets {
  baseUrl?: string
  clientUrl?: string
  names?: Partial<QuoteAssetNames>
  imageUrls?: Record<string, string>
}

function hasVanOption(quote: QuoteInput): boolean {
  return isVanVehicle(quote.vehicleType) || (quote.proposalOptions || quote.options || []).some((option) => (option.items || []).some((item) => isVanVehicle(item.vehicleType)))
}

export function buildQuoteEmailHtml(quote: QuoteInput = {}, assets: QuoteEmailAssets = {}): string {
  const baseUrl = assets.baseUrl || assets.clientUrl || ''
  const names: QuoteAssetNames = { ...QUOTE_ASSET_NAMES, ...(assets.names || {}) }
  const van = hasVanOption(quote)
  const intro = quote.clientContact || quote.client || 'cliente'
  const notes = quoteEmailNotes(quote)
  const sections = quoteProposalSections(quote).filter((section) => section.id !== 'request')
  const requestLines = String(quote.notes ?? '').replace(/\r\n?/g, '\n').split('\n')
  const orderNotes = requestLines.map((line, index) => `<p style="margin:0 0 ${index === requestLines.length - 1 ? 0 : 4}px;font-size:13px;line-height:1.35;color:#ffffff;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(line) || '&nbsp;'}</p>`).join('')
  const important = notes.map((line) => `<tr><td style="padding:0 0 12px;font-size:14px;line-height:1.65;color:#171512;">&#8226; ${escapeHtml(line)}</td></tr>`).join('')
  const proposalOptions: QuoteOptionData[] = quote.proposalOptions?.length ? quote.proposalOptions : (quote.options || [])
  const individualOption = proposalOptions.length === 1 ? proposalOptions[0]! : null
  const commercialText = [...new Set([individualOption?.name, individualOption?.commercialTerms, quote.commercialTerms].filter((text) => String(text || '').trim()))].join('\n')
  const commercialBand = commercialText ? `<div style="margin:0 0 20px;color:#ffffff;"><p style="margin:0 0 6px;font-size:16px;line-height:1.3;font-weight:700;">Condições Comerciais</p>${commercialText.split('\n').map((line) => `<p style="margin:0;font-size:14px;line-height:1.4;white-space:pre-wrap;">${escapeHtml(line) || '&nbsp;'}</p>`).join('')}</div>` : ''
  if (proposalOptions.length <= 1) { const commercialIndex = sections.findIndex((section) => section.id === 'commercial'); if (commercialIndex >= 0) sections.splice(commercialIndex, 1) }
  const proposalSections = sections.map(({ title, text }) => `<tr><td style="background:#d9d9d9;padding:22px 34px 4px;"><p style="margin:0 0 10px;font-size:16px;line-height:1.35;font-weight:700;">${escapeHtml(title)}:</p>${text.split('\n').map((line) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(line) || '&nbsp;'}</p>`).join('')}</td></tr>`).join('')
  const value = escapeHtml(formatMoney(individualOption ? individualOption.value : quote.value))
  const optionsHtml = proposalOptions.map((option, index) => {
    const details = [option.commercialTerms].filter((item) => String(item || '').trim()).map((item) => `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(item)}</p>`).join('')
    return `<tr><td style="padding:14px 18px;border-bottom:1px solid #b7b7b7;text-align:left;"><p style="margin:0 0 5px;font-weight:700;">${escapeHtml(option.name || `Opção ${index + 1}`)}</p><p class="cotacao-value" style="margin:0;font-size:23px;font-weight:700;">${escapeHtml(formatMoney(option.value))}</p>${details}</td></tr>`
  }).join('')
  const subject = escapeHtml(quote.subject || `Cotação ${quote.code || ''}${quote.client ? ` - ${quote.client}` : ''}`.trim())
  return [
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>', subject, '</title>',
    '<style>body{-webkit-text-size-adjust:100%;}.cotacao-fluid-img{display:block;width:100%;height:auto;border:0;}@media(max-width:640px){.a4-sheet{width:100%!important;max-width:100%!important;min-height:0!important}.cotacao-col,.cotacao-img-pair{display:block!important;width:100%!important}.cotacao-value{font-size:26px!important}}</style></head>',
    '<body style="margin:0;padding:0;background:#0a2f41;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a2f41;margin:0;padding:0;"><tr><td align="center">',
    '<table class="a4-sheet" role="presentation" cellpadding="0" cellspacing="0" border="0" width="794" style="width:794px;max-width:794px;min-height:1123px;background:#d9d9d9;border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;color:#171512;">',
    `<tr><td><img class="cotacao-fluid-img" src="${escapeHtml(assetUrl(baseUrl, names.banner, assets.imageUrls))}" alt="Betinhos Executive Service" width="794"></td></tr>`,
    `<tr><td style="padding:24px 42px 14px;background:#d9d9d9;"><p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Olá ${escapeHtml(intro)},</p><p style="margin:0 0 12px;font-size:14px;line-height:1.62;">A <strong>Betinhos Executive Service</strong> é uma empresa de traslados e serviços executivos presente no estado de São Paulo há mais de 37 anos e, ao longo dessas décadas, mantemos compromisso com Non Compliance, EHS e Safe Fleet.</p><p style="margin:0;font-size:14px;line-height:1.7;">Abaixo segue sua cotação no mesmo formato do material aprovado, com foco nas informações do atendimento e sem a assinatura final.</p></td></tr>`,
    `<tr><td style="background:#0a2f41;padding:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td class="cotacao-col" valign="middle" width="50%" style="width:50%;padding:24px 22px;text-align:center;"><img src="${escapeHtml(assetUrl(baseUrl, names.header, assets.imageUrls))}" alt="Betinhos Executive Service" width="340" style="display:block;width:100%;max-width:340px;height:auto;border:0;margin:0 auto;"></td><td class="cotacao-col" valign="top" width="50%" style="width:50%;padding:18px 24px;color:#ffffff;"><p style="margin:0 0 6px;font-size:14px;line-height:1.25;font-weight:700;color:#ffffff;">Pedido do cliente:</p>${orderNotes}</td></tr></table></td></tr>`,
    `<tr><td style="background:#d9d9d9;padding:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td class="cotacao-img-pair" width="50%" style="width:50%;padding:16px 10px 18px 18px;text-align:center;"><img src="${escapeHtml(assetUrl(baseUrl, van ? names.vanVehicle : names.vehicle, assets.imageUrls))}" alt="${van ? 'Van executiva Betinhos' : 'Frota executiva Betinhos'}" width="360" style="display:block;width:100%;max-width:360px;height:auto;border:0;margin:0 auto;"></td><td class="cotacao-img-pair" width="50%" style="width:50%;padding:16px 18px 18px 10px;text-align:center;"><img src="${escapeHtml(assetUrl(baseUrl, van ? names.vanInfo : names.commitments, assets.imageUrls))}" alt="${van ? 'Informações da van executiva' : 'Compromissos operacionais Betinhos'}" width="360" style="display:block;width:100%;max-width:360px;height:auto;border:0;margin:0 auto;"></td></tr></table></td></tr>`,
    proposalOptions.length > 1 ? `<tr><td style="background:#0a2f41;padding:22px 34px 24px;text-align:center;color:#ffffff;"><p style="margin:0 0 15px;font-size:17px;line-height:1.42;font-weight:700;">${proposalOptions.length > 1 ? 'Escolha a opção que melhor atende à sua necessidade' : 'Sua cotação'}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#d9d9d9;color:#171512;">${optionsHtml}</table><p style="margin:18px 0 0;font-size:15px;line-height:1.42;font-weight:700;">Veja abaixo informações importantes para sua contratação</p></td></tr>` : `<tr><td style="background:#0a2f41;padding:22px 34px 24px;text-align:center;">${commercialBand}<p style="margin:0 0 4px;font-size:17px;line-height:1.35;color:#ffffff;font-weight:700;">Com base nesse comprometimento, faço saber que o custo total é de</p><p class="cotacao-value" style="margin:0 0 16px;font-size:30px;line-height:1.15;color:#ffffff;font-weight:700;">${value}</p><p style="margin:0;font-size:15px;line-height:1.42;color:#ffffff;font-weight:700;">Veja abaixo informações importantes para sua contratação</p></td></tr>`,
    proposalSections,
    `<tr><td style="background:#d9d9d9;padding:22px 34px 24px;"><p style="margin:0 0 14px;font-size:16px;line-height:1.35;font-weight:700;">OBSERVAÇÕES IMPORTANTES:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${important}</table></td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('')
}

export function buildQuotePlainText(quote: QuoteInput = {}): string {
  const route = buildQuoteRouteText(quote).map((line) => `• ${line}`).join('\n')
  const notes = quoteEmailNotes(quote).map((line) => `• ${line}`).join('\n')
  const sections = quoteProposalSections(quote).flatMap(({ title, text }) => ['', `${title.toUpperCase()}:`, text])
  const options: QuoteOptionData[] = quote.proposalOptions?.length ? quote.proposalOptions : (quote.options || [])
  const commercial = options.length ? ['OPÇÕES DA COTAÇÃO:', ...options.flatMap((option, index) => [`${option.name || `Opção ${index + 1}`}`, `Total: ${formatMoney(option.value)}`, option.commercialTerms].filter((line): line is string => Boolean(line)))] : [`Custo total: ${formatMoney(quote.value)}`]
  return [`Cotação ${quote.code || ''}`.trim(), `Olá ${quote.clientContact || quote.client || 'cliente'},`, '', route, '', ...commercial, ...sections, '', 'OBSERVAÇÕES IMPORTANTES:', notes].join('\n')
}

/** Resposta mínima que `loadQuoteImages` usa do `fetch`. */
export interface ImageResponse {
  ok: boolean
  blob(): Promise<Blob>
}
export type ImageFetcher = (url: string, init: { signal?: AbortSignal; credentials: RequestCredentials }) => Promise<ImageResponse>

export interface LoadQuoteImagesOptions {
  baseUrl?: string
  signal?: AbortSignal
  fetcher?: ImageFetcher
}

export interface QuoteImages {
  files: Record<string, Uint8Array>
  imageUrls: Record<string, string>
}

export async function loadQuoteImages(quote: QuoteInput, { baseUrl = '', signal, fetcher = fetch }: LoadQuoteImagesOptions = {}): Promise<QuoteImages> {
  const hasVan = hasVanOption(quote)
  const names = [QUOTE_ASSET_NAMES.banner, QUOTE_ASSET_NAMES.header,
    ...(hasVan
      ? [QUOTE_ASSET_NAMES.vanVehicle, QUOTE_ASSET_NAMES.vanInfo]
      : [QUOTE_ASSET_NAMES.vehicle, QUOTE_ASSET_NAMES.commitments])]
  const files: Record<string, Uint8Array> = {}
  const imageUrls: Record<string, string> = {}
  await Promise.all(names.map(async (name) => {
    const response = await fetcher(assetUrl(baseUrl, name), { signal, credentials: 'same-origin' })
    if (!response.ok) throw new Error(`Não foi possível carregar a imagem ${name}.`)
    const blob = await response.blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new Error(`A imagem ${name} está indisponível.`)
    signal?.throwIfAborted?.()
    let binary = ''
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
    files[name] = bytes
    imageUrls[name] = `data:image/png;base64,${btoa(binary)}`
  }))
  return { files, imageUrls }
}

export interface CopyQuoteAssets extends QuoteEmailAssets, LoadQuoteImagesOptions {
  html?: string
  text?: string
  files?: Record<string, Uint8Array>
}

export interface CopyQuoteResult {
  html: string
  text: string
  method: 'clipboard' | 'execCommand'
}

export async function copyQuoteToClipboard(quote: QuoteInput, assets: CopyQuoteAssets = {}): Promise<CopyQuoteResult> {
  const prepared: CopyQuoteAssets = assets.html || assets.imageUrls ? assets : { ...assets, ...await loadQuoteImages(quote, assets) }
  const html = assets.html || buildQuoteEmailHtml(quote, prepared)
  const text = assets.text || buildQuotePlainText(quote)
  assets.signal?.throwIfAborted?.()
  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
    return { html, text, method: 'clipboard' }
  }
  if (typeof document !== 'undefined') {
    const holder = document.createElement('div')
    holder.contentEditable = 'true'
    holder.innerHTML = html
    holder.style.position = 'fixed'
    holder.style.left = '-9999px'
    document.body.appendChild(holder)
    const selection = document.getSelection()
    const range = document.createRange()
    range.selectNodeContents(holder)
    selection?.removeAllRanges()
    selection?.addRange(range)
    const copied = document.execCommand?.('copy')
    selection?.removeAllRanges()
    holder.remove()
    if (copied) return { html, text, method: 'execCommand' }
  }
  throw new Error('O navegador não permitiu copiar a cotação.')
}

export function quoteSubject(quote: QuoteInput = {}): string {
  return `Cotação ${quote.code || ''}${quote.client ? ` - ${quote.client}` : ''}`.trim()
}
