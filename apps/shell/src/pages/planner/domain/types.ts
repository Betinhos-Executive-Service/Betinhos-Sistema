// Tipos compartilhados do Planner (porte do Tela Planner em JS).
// Os objetos do Planner são montados de forma defensiva (quase todo campo é opcional
// e normalizado na leitura); por isso os tipos de entrada são parciais e os campos,
// opcionais. Respostas do Dataverse entram como `unknown` e são mapeadas em data/.

export type Tone = 'neutral' | 'warning' | 'action' | 'success' | 'danger'

export interface Option<Id extends string = string> {
  id: Id
  label: string
  tone: Tone
}

export type TaskStatus = 'todo' | 'waiting' | 'doing' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type AssignmentMode = 'people' | 'team'
export type WaitingOnType = 'employee' | 'team' | 'external'

export interface WaitingContext {
  subject: string
  onType: WaitingOnType
  onIds: string[]
  onNames: string[]
  onId: string
  onName: string
  expectedDate: string
  note: string
}

/** Entrada solta de contexto de espera (formulários, Dataverse, legado). */
export interface WaitingContextInput {
  subject?: unknown
  onType?: unknown
  onIds?: unknown
  onNames?: unknown
  onId?: unknown
  onName?: unknown
  expectedDate?: unknown
  note?: unknown
}

export interface Employee {
  id: string
  name: string
  userId?: string
  email?: string
  apelido?: string
  team?: string
  teamName?: string
  role?: string
  mentionSearchText?: string
  externalNotificationsAvailable?: boolean
  active?: boolean
  [extra: string]: unknown
}

export interface Team {
  id: string
  name: string
  memberIds?: string[]
  members?: string[]
  primaryMemberId?: string
  iconName?: string
  archived?: boolean
  [extra: string]: unknown
}

export interface PersonalTag {
  id: string
  name: string
  color: string
  sortOrder: number
  archived: boolean
  ownerUserId: string
}

export interface TaskComment {
  id?: string
  text?: string
  /** Retornos registrados guardam os anexos enviados junto (mock). */
  attachments?: TaskAttachment[]
  author?: string
  authorId?: string
  createdAt?: string
  [extra: string]: unknown
}

export interface TaskAttachment {
  id?: string
  name?: string
  size?: number
  mimeType?: string
  previewUrl?: string
  url?: string
  createdAt?: string
  [extra: string]: unknown
}

export interface TaskHistoryItem {
  id?: string
  text?: string
  type?: string
  action?: string
  field?: string
  from?: unknown
  to?: unknown
  actor?: string
  actorName?: string
  createdAt?: string
  occurredAt?: string
  [extra: string]: unknown
}

export interface Task {
  id: string
  title?: string
  description?: string
  status?: string
  priority?: string
  dueDate?: string
  assignmentMode?: string
  teamIds?: string[]
  teamNames?: string[]
  teamId?: string
  teamName?: string
  assigneeNames?: string[]
  assigneeIds?: string[]
  assigneeId?: string
  assigneeName?: string
  primaryAssigneeId?: string
  primaryAssigneeName?: string
  consultantIds?: string[]
  consultantNames?: string[]
  creatorEmployeeId?: string
  creatorUserId?: string
  restrictedVisibility?: boolean
  quoteId?: string | null
  quoteCode?: string
  quoteTitle?: string
  quoteStatus?: string
  sourceType?: string
  sourceId?: string | null
  sourceCode?: string
  sourceLabel?: string
  parentTaskId?: string | null
  waitingContext?: WaitingContextInput | WaitingContext
  comments?: TaskComment[]
  returns?: TaskComment[]
  attachments?: TaskAttachment[]
  history?: TaskHistoryItem[]
  personalTagIds?: string[]
  syncStatus?: string
  createdAt?: string
  updatedAt?: string
  completedAt?: string
  [extra: string]: unknown
}

export interface QuoteOption {
  id: string
  label?: string
  vehicleType?: string
  value?: string | number
  [extra: string]: unknown
}

export interface Quote {
  id: string
  code?: string
  title?: string
  client?: string
  clientId?: string
  clientContact?: string
  clientEmail?: string
  clientPhone?: string
  status?: string
  priority?: string
  deadline?: string
  value?: string
  route?: string
  origin?: string
  destination?: string
  serviceDate?: string
  returnDate?: string
  vehicleType?: string
  passengers?: string | number
  notes?: string
  description?: string
  options?: QuoteOption[]
  proposalOptions?: QuoteOption[]
  proposalVersions?: Array<Record<string, unknown>>
  acceptedOptionId?: string
  acceptedProposalVersionId?: string
  lossReason?: string
  history?: TaskHistoryItem[]
  [extra: string]: unknown
}

export interface Contact {
  id: string
  subject?: string
  senderName?: string
  senderPhone?: string
  senderEmail?: string
  channel?: string
  status?: string
  priority?: string
  [extra: string]: unknown
}

export interface Idea {
  id: string
  title?: string
  description?: string
  [extra: string]: unknown
}

export interface PlannerNotification {
  id: string
  type?: string
  taskId?: string
  recipientEmployeeId?: string
  readAt?: string
  createdAt?: string
  [extra: string]: unknown
}

export interface PlannerState {
  tasks: Task[]
  quotes: Quote[]
  employees: Employee[]
  teams?: Team[]
  contacts?: Contact[]
  ideas?: Idea[]
  notifications?: PlannerNotification[]
  personalTags?: PersonalTag[]
  personalTagAssignments?: Array<Record<string, unknown>>
  collectionEvents?: Array<Record<string, unknown>>
  [extra: string]: unknown
}

/** Lê um campo de um objeto desconhecido sem `any`. */
export function field(source: unknown, key: string): unknown {
  return source && typeof source === 'object' ? (source as Record<string, unknown>)[key] : undefined
}

// --- Cotações (F2) ---------------------------------------------------------

export interface QuoteVehicleItem {
  vehicleType?: string
  quantity?: string | number
  [extra: string]: unknown
}

export interface QuoteOptionData extends QuoteOption {
  name?: string
  items?: QuoteVehicleItem[]
  commercialTerms?: string
  notes?: string
  legacy?: boolean
  legacyVehicleType?: string
}

/** Versão de proposta enviada (prova do que foi ao cliente). */
export interface QuoteProposalVersion {
  id: string
  requestId?: string
  number?: number
  createdAt?: string
  sentAt?: string
  authorId?: string
  authorName?: string
  channel?: string
  recipient?: string
  commercialTerms?: string
  quoteSnapshot?: Record<string, unknown>
  options?: QuoteOptionData[]
  html?: string
  text?: string
  [extra: string]: unknown
}

/** Cotação com os campos usados pelo domínio de cotações. */
export interface QuoteData extends Quote {
  options?: QuoteOptionData[]
  proposalOptions?: QuoteOptionData[]
  proposalVersions?: QuoteProposalVersion[]
  commercialTerms?: string
  modifiedAt?: string
  finalizationAt?: string
  subject?: string
  passengerProfile?: string
  internalNotes?: string
}

/** Entrada solta de cotação (formulário, testes, registros antigos). */
export type QuoteInput = Partial<QuoteData>
