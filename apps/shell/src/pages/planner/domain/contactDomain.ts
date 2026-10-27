// Porte de Tela Planner/src/contactDomain.js (casos de atendimento).

export type ContactStatus = 'new' | 'in_progress' | 'waiting' | 'done'
export type ContactPriority = 'low' | 'medium' | 'high'

export const CONTACT_CHANNELS = Object.freeze([
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'E-mail' },
  { id: 'phone', label: 'Telefone' },
])

export const CONTACT_STATUSES = Object.freeze([
  { id: 'new', label: 'Novo' },
  { id: 'in_progress', label: 'Em atendimento' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'done', label: 'Concluído' },
])

export const CONTACT_PRIORITIES = Object.freeze([
  { id: 'low', label: 'Baixa' },
  { id: 'medium', label: 'Média' },
  { id: 'high', label: 'Alta' },
])

export const CONTACT_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  new: ['new', 'in_progress', 'waiting', 'done'],
  in_progress: ['in_progress', 'waiting', 'done'],
  waiting: ['waiting', 'in_progress', 'done'],
  done: ['done', 'in_progress'],
})

/** Entrada solta de caso (formulário, Dataverse, extensão do WhatsApp). */
export interface ContactInput {
  id?: unknown
  subject?: unknown
  senderName?: unknown
  senderPhone?: unknown
  senderEmail?: unknown
  channel?: unknown
  receivedAt?: string
  updatedAt?: string
  lastMessageAt?: string
  summary?: unknown
  message?: unknown
  lastMessage?: unknown
  priority?: string
  status?: string
  assignmentMode?: string
  teamIds?: unknown
  teamNames?: unknown
  teamId?: unknown
  teamName?: unknown
  assigneeIds?: unknown
  assigneeNames?: unknown
  assigneeName?: unknown
  ownerEmployeeId?: unknown
  ownerName?: unknown
  dueDate?: string
  waitingNote?: unknown
  clientId?: unknown
  quoteId?: unknown
  resolutionOutcome?: unknown
  sourceUrl?: unknown
  externalConversationId?: unknown
  notes?: unknown
  internalNotes?: unknown
  history?: unknown
  attachments?: unknown
  linkedTaskIds?: unknown
  archivedAt?: unknown
}

export interface NormalizedContact {
  id: string
  subject: string
  senderName: string
  senderPhone: string
  senderEmail: string
  channel: string
  receivedAt: string
  updatedAt: string
  lastMessageAt: string
  summary: string
  message: string
  lastMessage: string
  priority: string
  status: string
  assignmentMode: 'people' | 'team'
  teamIds: string[]
  teamNames: string[]
  teamId: string
  teamName: string
  assigneeIds: string[]
  assigneeNames: string[]
  assigneeName: string[]
  ownerEmployeeId: string
  ownerName: string
  dueDate: string
  waitingNote: string
  clientId: string
  quoteId: string
  resolutionOutcome: string
  sourceUrl: string
  externalConversationId: string
  notes: unknown[]
  internalNotes: unknown[]
  history: unknown[]
  attachments: unknown[]
  linkedTaskIds: string[]
  archivedAt: string
}

export interface ContactOwner {
  id?: string
  name?: string
  [extra: string]: unknown
}

const CONTACT_STATUS_IDS = new Set<string>(CONTACT_STATUSES.map((item) => item.id))
const CONTACT_PRIORITY_IDS = new Set<string>(CONTACT_PRIORITIES.map((item) => item.id))
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
const LEGACY_STATUS_ALIASES: Record<string, string> = { resolved: 'done', archived: 'done' }

const text = (value: unknown): string => String(value ?? '').trim()
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value ? [value] : [])
const unique = (values: unknown): string[] => [...new Set(asList(values).map(text).filter(Boolean))]

function canonicalStatus(status: unknown): unknown {
  return (typeof status === 'string' && LEGACY_STATUS_ALIASES[status]) || status
}

function isArchivedContact(contact: ContactInput = {}): boolean {
  return Boolean(contact.archivedAt || contact.status === 'archived')
}

export function contactIsOverdue(contact: ContactInput = {}, today: Date | string | number = new Date()): boolean {
  const todayKey = new Date(today).toISOString().slice(0, 10)
  return Boolean(contact.dueDate && contact.dueDate < todayKey && contact.status !== 'done' && !isArchivedContact(contact))
}

function validDate(value: unknown): boolean {
  if (!value) return false
  const timestamp = new Date(value as string).getTime()
  return Number.isFinite(timestamp)
}

export function contactStatusLabel(status: unknown): string {
  const normalized = canonicalStatus(status)
  return CONTACT_STATUSES.find((item) => item.id === normalized)?.label || (status as string) || 'Novo'
}

export function contactChannelLabel(channel: unknown): string {
  return CONTACT_CHANNELS.find((item) => item.id === channel)?.label || (channel as string) || 'Canal não informado'
}

export function contactPriorityLabel(priority: unknown): string {
  return CONTACT_PRIORITIES.find((item) => item.id === priority)?.label || (priority as string) || 'Média'
}

export function normalizeContact(input: ContactInput = {}, context: { now?: string; owner?: ContactOwner | null } = {}): NormalizedContact {
  const now = context.now || new Date().toISOString()
  const owner: ContactOwner = context.owner || {}
  const canonical = canonicalStatus(input.status)
  const status = typeof canonical === 'string' && CONTACT_STATUS_IDS.has(canonical) ? canonical : 'new'
  const priority = input.priority && CONTACT_PRIORITY_IDS.has(input.priority) ? input.priority : 'medium'
  const channel = input.externalConversationId || input.sourceUrl === 'whatsapp-web'
    ? 'whatsapp'
    : text(input.senderPhone)
      ? 'phone'
      : text(input.senderEmail)
        ? 'email'
        : 'whatsapp'
  const receivedAt = input.receivedAt || now
  const lastMessageAt = input.lastMessageAt || receivedAt
  const message = text(input.lastMessage || input.message)
  const assignmentMode = input.assignmentMode === 'team' ? 'team' : 'people'
  const teamIds = assignmentMode === 'team' ? unique(input.teamIds ?? input.teamId) : []
  const teamNames = assignmentMode === 'team' ? unique(input.teamNames ?? input.teamName) : []
  const assigneeIds = unique(input.assigneeIds ?? (input.ownerEmployeeId || owner.id ? [input.ownerEmployeeId || owner.id] : []))
  const assigneeNames = unique(input.assigneeNames ?? input.assigneeName ?? (input.ownerName || owner.name ? [input.ownerName || owner.name] : []))
  const ownerEmployeeId = text(input.ownerEmployeeId || assigneeIds[0])
  const ownerName = assignmentMode === 'team'
    ? text(input.ownerName) || teamNames.join(', ') || assigneeNames[0] || 'Não atribuído'
    : text(input.ownerName || assigneeNames[0]) || 'Não atribuído'
  const notes: unknown[] = Array.isArray(input.notes) ? input.notes : Array.isArray(input.internalNotes) ? input.internalNotes : []
  return {
    id: text(input.id),
    subject: text(input.subject),
    senderName: text(input.senderName),
    senderPhone: text(input.senderPhone),
    senderEmail: text(input.senderEmail),
    channel,
    receivedAt,
    updatedAt: input.updatedAt || now,
    lastMessageAt,
    summary: text(input.summary),
    message,
    lastMessage: message,
    priority,
    status,
    assignmentMode,
    teamIds,
    teamNames,
    teamId: teamIds[0] || '',
    teamName: assignmentMode === 'team' ? text(input.teamName) || teamNames.join(', ') : '',
    assigneeIds,
    assigneeNames,
    assigneeName: assigneeNames,
    ownerEmployeeId,
    ownerName,
    dueDate: text(input.dueDate),
    waitingNote: status === 'waiting' ? text(input.waitingNote) || 'Esperando resposta' : '',
    clientId: text(input.clientId),
    quoteId: text(input.quoteId),
    resolutionOutcome: text(input.resolutionOutcome),
    sourceUrl: text(input.sourceUrl),
    externalConversationId: text(input.externalConversationId),
    notes,
    internalNotes: notes,
    history: Array.isArray(input.history) ? input.history : [],
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    linkedTaskIds: unique(input.linkedTaskIds),
    archivedAt: text(input.archivedAt) || (input.status === 'archived' ? input.updatedAt || now : ''),
  }
}

export function validateContact(input: ContactInput = {}): { allowed: boolean; error: string } {
  const status = canonicalStatus(input.status)
  if (!text(input.subject)) return { allowed: false, error: 'Informe o assunto do caso.' }
  if (!text(input.senderName)) return { allowed: false, error: 'Informe o remetente.' }
  if (!(typeof status === 'string' && CONTACT_STATUS_IDS.has(status))) return { allowed: false, error: 'Selecione um status válido.' }
  if (!(typeof input.priority === 'string' && CONTACT_PRIORITY_IDS.has(input.priority))) return { allowed: false, error: 'Selecione uma prioridade válida.' }
  if (!text(input.senderPhone) && !text(input.senderEmail)) return { allowed: false, error: 'Informe pelo menos o telefone ou o e-mail do remetente.' }
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { allowed: false, error: 'Informe um prazo válido.' }
  if (status === 'done' && input.resolutionOutcome !== undefined && typeof input.resolutionOutcome !== 'string') return { allowed: false, error: 'O resultado da resolução é inválido.' }
  return { allowed: true, error: '' }
}

export function canTransitionContactStatus(currentStatus: unknown, nextStatus: unknown): boolean {
  const current = canonicalStatus(currentStatus)
  return ((typeof current === 'string' && CONTACT_STATUS_TRANSITIONS[current]) || []).includes(canonicalStatus(nextStatus) as string)
}

export interface ContactFilters {
  query?: string
  channel?: unknown[]
  status?: unknown[]
  priority?: unknown[]
  owner?: unknown[]
  team?: unknown[]
  includeArchived?: boolean
  includeCompleted?: boolean
  overdue?: boolean
  today?: Date | string | number
  mine?: string
}

export function filterContacts<T extends ContactInput>(contacts: T[] = [], filters: ContactFilters = {}): T[] {
  const query = text(filters.query).toLocaleLowerCase('pt-BR')
  const selected = (key: 'channel' | 'status' | 'priority' | 'owner' | 'team') => new Set((filters[key] || []).map(text).filter(Boolean))
  const channels = selected('channel')
  const statuses = selected('status')
  const priorities = selected('priority')
  const owners = selected('owner')
  const teams = selected('team')
  return contacts.filter((contact) => {
    if (!filters.includeArchived && isArchivedContact(contact)) return false
    if (!filters.includeCompleted && !filters.status?.length && canonicalStatus(contact.status) === 'done' && !isArchivedContact(contact)) return false
    if (filters.overdue && !contactIsOverdue(contact, filters.today)) return false
    const searchable = [contact.subject, contact.senderName, contact.senderEmail, contact.senderPhone, contact.summary, contact.message, contact.lastMessage].join(' ').toLocaleLowerCase('pt-BR')
    const assigneeIds = unique(contact.assigneeIds || contact.ownerEmployeeId)
    const assigneeNames = unique(contact.assigneeNames || contact.assigneeName || contact.ownerName)
    const teamIds = unique(contact.teamIds || contact.teamId)
    const teamNames = unique(contact.teamNames || contact.teamName)
    const mine = filters.mine ? assigneeIds.includes(String(filters.mine)) || String(contact.ownerEmployeeId) === String(filters.mine) : true
    return (!query || searchable.includes(query))
      && (!channels.size || channels.has(contact.channel as string))
      && (!statuses.size || statuses.has(canonicalStatus(contact.status) as string))
      && (!priorities.size || priorities.has(contact.priority as string))
      && (!owners.size || owners.has(contact.ownerEmployeeId as string) || owners.has(contact.ownerName as string) || assigneeIds.some((id) => owners.has(id)) || assigneeNames.some((name) => owners.has(name)))
      && (!teams.size || teamIds.some((id) => teams.has(id)) || teamNames.some((name) => teams.has(name)))
      && mine
  })
}

function dueTimestamp(contact: ContactInput): number {
  if (!contact.dueDate) return Number.POSITIVE_INFINITY
  const value = new Date(`${contact.dueDate}T00:00:00`).getTime()
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

export function sortContacts<T extends ContactInput>(contacts: T[] = [], today: Date | string | number = new Date()): T[] {
  return [...contacts].sort((left, right) => {
    const overdueDelta = Number(contactIsOverdue(right, today)) - Number(contactIsOverdue(left, today))
    if (overdueDelta) return overdueDelta
    const priorityDelta = (PRIORITY_ORDER[left.priority ?? ''] ?? 1) - (PRIORITY_ORDER[right.priority ?? ''] ?? 1)
    if (priorityDelta) return priorityDelta
    const dueDelta = dueTimestamp(left) - dueTimestamp(right)
    if (dueDelta) return dueDelta
    return new Date(right.lastMessageAt || right.receivedAt || 0).getTime() - new Date(left.lastMessageAt || left.receivedAt || 0).getTime()
  })
}

export function contactStats(contacts: ContactInput[] = [], today: Date | string | number = new Date()) {
  const todayKey = new Date(today).toISOString().slice(0, 10)
  const visible = contacts.filter((contact) => !isArchivedContact(contact))
  const overdue = visible.filter((contact) => contact.dueDate && contact.dueDate < todayKey && contact.status !== 'done')
  return {
    total: visible.length,
    new: visible.filter((contact) => contact.status === 'new').length,
    inProgress: visible.filter((contact) => contact.status === 'in_progress').length,
    waiting: visible.filter((contact) => contact.status === 'waiting').length,
    overdue: overdue.length,
  }
}

export function contactPermissions(contact: ContactInput | null | undefined, user: { employeeId?: string; isManager?: boolean } | null = {}) {
  const isOwner = Boolean(user?.employeeId && (
    contact?.ownerEmployeeId === user.employeeId ||
    unique(contact?.assigneeIds).includes(String(user.employeeId))
  ))
  const isManager = Boolean(user?.isManager)
  return {
    canEdit: isOwner || isManager,
    canTransfer: isOwner || isManager,
    canResolve: isOwner || isManager,
    canArchive: isOwner || isManager,
  }
}

export function createContactPayload(input: ContactInput = {}, currentEmployee: ContactOwner = {}, now: string = new Date().toISOString()): NormalizedContact {
  return normalizeContact({ ...input, status: input.status || 'new', priority: input.priority || 'medium' }, { owner: currentEmployee, now })
}

export interface ContactEventInput {
  id?: string
  text?: string
  teamName?: string
  assigneeNames?: unknown
  assigneeName?: unknown
  ownerName?: string
  status?: string
  resolutionOutcome?: string
  priority?: string
  next?: string
  previous?: string
  waitingNote?: string
  author?: string
  actorEmployeeId?: string
  reason?: string
  fromEmployeeId?: string
  toEmployeeId?: string
  fromAssigneeIds?: unknown
  toAssigneeIds?: unknown
  fromTeamIds?: unknown
  toTeamIds?: unknown
}

export interface ContactEvent {
  id: string
  type: string
  text: string
  description: string
  createdAt: string
  author: string
  actorEmployeeId: string
  previous: string
  next: string
  reason: string
  fromEmployeeId: string
  toEmployeeId: string
  fromAssigneeIds: string[]
  toAssigneeIds: string[]
  fromTeamIds: string[]
  toTeamIds: string[]
}

export function createContactEvent(type: string, _contact: unknown, input: ContactEventInput = {}, now: string = new Date().toISOString()): ContactEvent {
  const assignmentLabel = input.teamName || asList(input.assigneeNames || input.assigneeName).join(', ') || input.ownerName
  const labels: Record<string, string> = {
    created: 'Caso criado.',
    transfer: `Responsáveis alterados para ${assignmentLabel || 'novo responsável'}.`,
    status: `Status alterado para ${contactStatusLabel(input.status)}.`,
    resolution: input.resolutionOutcome ? `Caso concluído: ${input.resolutionOutcome}.` : 'Caso concluído.',
    priority: `Prioridade alterada para ${contactPriorityLabel(input.priority)}.`,
    deadline: input.next ? `Prazo alterado para ${input.next}.` : 'Prazo removido.',
    waiting: `Observação de Aguardando atualizada: ${input.waitingNote || 'Esperando resposta'}.`,
    archived: 'Caso arquivado.',
    note: 'Nota interna adicionada.',
    attachment: 'Anexo adicionado.',
    attachment_deleted: 'Anexo removido.',
    task: 'Task vinculada ao caso.',
  }
  return {
    id: input.id || `contact-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    text: input.text || labels[type] || 'Caso atualizado.',
    description: input.text || labels[type] || 'Caso atualizado.',
    createdAt: now,
    author: input.author || 'Você',
    actorEmployeeId: input.actorEmployeeId || '',
    previous: input.previous || '',
    next: input.next || '',
    reason: input.reason || '',
    fromEmployeeId: input.fromEmployeeId || '',
    toEmployeeId: input.toEmployeeId || '',
    fromAssigneeIds: unique(input.fromAssigneeIds),
    toAssigneeIds: unique(input.toAssigneeIds),
    fromTeamIds: unique(input.fromTeamIds),
    toTeamIds: unique(input.toTeamIds),
  }
}

export interface LinkedTaskInputOverrides {
  title?: string
  description?: string
  priority?: string
  dueDate?: string
  assignmentMode?: string
  teamIds?: unknown
  teamNames?: unknown
  teamId?: unknown
  teamName?: unknown
  assigneeIds?: unknown
  assigneeNames?: unknown
  assigneeName?: unknown
}

export function buildLinkedTaskInput(contact: ContactInput = {}, input: LinkedTaskInputOverrides = {}) {
  return {
    title: input.title || (contact.subject as string),
    description: input.description || [contact.summary, contact.message || contact.lastMessage].filter(Boolean).join('\n\n'),
    priority: input.priority || contact.priority || 'medium',
    dueDate: input.dueDate ?? contact.dueDate ?? '',
    assignmentMode: input.assignmentMode || contact.assignmentMode || 'people',
    teamIds: input.teamIds ?? (contact.teamIds || (contact.teamId ? [contact.teamId] : [])),
    teamNames: input.teamNames ?? (contact.teamNames || (contact.teamName ? [contact.teamName] : [])),
    teamId: input.teamId ?? contact.teamId ?? '',
    teamName: input.teamName ?? contact.teamName ?? '',
    assigneeIds: input.assigneeIds ?? contact.assigneeIds ?? (contact.ownerEmployeeId ? [contact.ownerEmployeeId] : []),
    assigneeNames: input.assigneeNames ?? input.assigneeName ?? contact.assigneeNames ?? contact.assigneeName ?? (contact.ownerName ? [contact.ownerName] : []),
    assigneeName: input.assigneeNames ?? input.assigneeName ?? contact.assigneeNames ?? contact.assigneeName ?? (contact.ownerName ? [contact.ownerName] : []),
    contactId: contact.id,
    sourceType: 'contact',
    sourceId: contact.id,
    sourceLabel: 'Caso de atendimento',
  }
}

export function isValidContactDate(value: unknown): boolean {
  return !value || validDate(value)
}
