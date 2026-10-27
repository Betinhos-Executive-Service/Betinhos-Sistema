// Porte de Tela Planner/src/domain.js (sem mudança de comportamento).
import type {
  AssignmentMode,
  Employee,
  Option,
  PersonalTag,
  Task,
  TaskComment,
  TaskHistoryItem,
  TaskPriority,
  TaskStatus,

  WaitingContext,
  WaitingContextInput,
  WaitingOnType,
} from './types'

export type TaskLike = Partial<Task>
type EmployeeLike = Partial<Employee> | null | undefined
export interface TeamLike {
  id?: string
  name?: string
  memberIds?: string[]
  members?: string[]
  primaryMemberId?: string
  primaryAssigneeId?: string
  iconName?: string
  icon?: string
}

export const STATUSES: Option<TaskStatus>[] = [
  { id: 'todo', label: 'A fazer', tone: 'neutral' },
  { id: 'waiting', label: 'Aguardando', tone: 'warning' },
  { id: 'doing', label: 'Em andamento', tone: 'action' },
  { id: 'done', label: 'Concluído', tone: 'success' },
]

export const PRIORITIES: Option<TaskPriority>[] = [
  { id: 'low', label: 'Baixa', tone: 'neutral' },
  { id: 'medium', label: 'Média', tone: 'warning' },
  { id: 'high', label: 'Alta', tone: 'danger' },
  { id: 'urgent', label: 'Urgente', tone: 'danger' },
]

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
const APP_TIME_ZONE = 'America/Sao_Paulo'
const DATE_PART_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

export function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export const TASK_SOURCES: Option[] = [
  { id: 'manual', label: 'Manual', tone: 'neutral' },
  { id: 'quote', label: 'Cotação', tone: 'action' },
  { id: 'quality', label: 'Qualidade', tone: 'warning' },
]

export const PERSONAL_TAG_COLORS: string[] = [
  '#1d5ce8',
  '#2d796f',
  '#b87900',
  '#b84b5b',
  '#7052a3',
  '#4f6b82',
]
export const DEFAULT_PERSONAL_TAG_COLOR: string = PERSONAL_TAG_COLORS[0]!

export interface PersonalTagInput {
  id?: unknown
  name?: unknown
  nome?: unknown
  color?: unknown
  sortOrder?: unknown
  archived?: unknown
  ownerUserId?: unknown
}

export function normalizePersonalTag(value: PersonalTagInput | null | undefined = {}, ownerUserId: unknown = ''): PersonalTag {
  const source: PersonalTagInput = value && typeof value === 'object' ? value : {}
  const color = typeof source.color === 'string' && PERSONAL_TAG_COLORS.includes(source.color) ? source.color : DEFAULT_PERSONAL_TAG_COLOR
  return {
    id: String(source.id || '').trim(),
    name: String(source.name || source.nome || '').trim().slice(0, 32),
    color,
    sortOrder: Number.isFinite(Number(source.sortOrder)) ? Math.max(0, Number(source.sortOrder)) : 0,
    archived: Boolean(source.archived),
    ownerUserId: String(source.ownerUserId || ownerUserId || '').replace(/[{}]/g, ''),
  }
}

export function normalizePersonalTagIds(value: unknown): string[] {
  const values: unknown[] = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
}

export function resolveOwnedPersonalTagIds(tags: Array<Partial<PersonalTag>> = [], selectedIds: unknown = [], ownerUserId: unknown = ''): string[] {
  const key = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
  const ownerKey = key(ownerUserId)
  const owned = new Map(tags.filter((tag) => key(tag.ownerUserId) === ownerKey).map((tag) => [key(tag.id), tag.id]))
  return normalizePersonalTagIds(selectedIds).map((id) => {
    const resolved = owned.get(key(id))
    if (!resolved) throw new Error('Tag pessoal não encontrada para o usuário atual. Atualize os dados e tente novamente.')
    return resolved
  })
}

export function validatePersonalTag(
  input: PersonalTagInput = {},
  existing: Array<Partial<PersonalTag>> = [],
): { valid: boolean; error: string; value?: PersonalTag } {
  const name = String(input.name || '').trim().slice(0, 32)
  if (!name) return { valid: false, error: 'Informe um nome para a tag.' }
  const normalized = normalizeText(name)
  const duplicate = existing.some((tag) => normalizeText(tag.name) === normalized && tag.id !== input.id)
  if (duplicate) return { valid: false, error: 'Você já tem uma tag com esse nome.' }
  return { valid: true, error: '', value: normalizePersonalTag({ ...input, name }) }
}

export const statusById = (id: unknown): Option<TaskStatus> => STATUSES.find((item) => item.id === id) || STATUSES[0]!
export const priorityById = (id: unknown): Option<TaskPriority> => PRIORITIES.find((item) => item.id === id) || PRIORITIES[1]!
export const sourceById = (id: unknown): Option => TASK_SOURCES.find((item) => item.id === id) || TASK_SOURCES[0]!

export const EMPTY_WAITING_CONTEXT: Readonly<WaitingContext> = Object.freeze({
  subject: '',
  onType: 'employee',
  onIds: [],
  onNames: [],
  onId: '',
  onName: '',
  expectedDate: '',
  note: '',
})

function uniqueStrings(value: unknown): string[] {
  const values: unknown[] = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(values.flatMap((item) => String(item || '').split(',')).map((item) => item.trim()).filter(Boolean))]
}

export interface Responsibility {
  assigneeIds: string[]
  primaryAssigneeId: string
  consultantIds: string[]
}

export function responsibilityFromIds(ids: unknown = [], primaryId: unknown = ''): Responsibility {
  const uniqueIds = uniqueStrings(ids)
  const requestedPrimary = String(primaryId || '').trim()
  const primaryAssigneeId = uniqueIds.find((id) => sameIdentifier(id, requestedPrimary)) || uniqueIds[0] || ''
  const orderedIds = primaryAssigneeId
    ? [primaryAssigneeId, ...uniqueIds.filter((id) => !sameIdentifier(id, primaryAssigneeId))]
    : uniqueIds
  return {
    assigneeIds: orderedIds,
    primaryAssigneeId,
    consultantIds: orderedIds.filter((id) => !sameIdentifier(id, primaryAssigneeId)),
  }
}

export function validateTeamComposition(
  memberIds: unknown = [],
  primaryMemberId: unknown = '',
): { valid: boolean; error: string; primaryMemberId?: string } {
  const members = uniqueStrings(memberIds)
  if (!members.length) return { valid: false, error: 'Inclua pelo menos um membro na equipe.' }
  if (members.length > 1 && !members.some((id) => sameIdentifier(id, primaryMemberId))) {
    return { valid: false, error: 'Escolha o responsável principal da equipe.' }
  }
  return { valid: true, error: '', primaryMemberId: members.length === 1 ? members[0] : String(primaryMemberId).trim() }
}

const WAITING_ON_TYPES: readonly unknown[] = ['employee', 'team', 'external']

export function normalizeWaitingContext(value: unknown = {}): WaitingContext {
  const source: WaitingContextInput = value && typeof value === 'object' ? (value as WaitingContextInput) : {}
  const onType = (WAITING_ON_TYPES.includes(source.onType) ? source.onType : 'employee') as WaitingOnType
  const onIds = uniqueStrings(source.onIds ?? source.onId)
  const onNames = uniqueStrings(source.onNames ?? source.onName)
  const externalName = source.onName ?? (Array.isArray(source.onNames) ? source.onNames.join(', ') : source.onNames)
  return {
    // Preserve o texto enquanto ele está sendo editado; trim em cada render
    // remove o espaço recém-digitado antes que o usuário consiga continuar.
    subject: String(source.subject ?? ''),
    onType,
    onIds,
    onNames,
    onId: onIds[0] || '',
    onName: onType === 'external' ? String(externalName ?? '') : onNames.join(', '),
    expectedDate: String(source.expectedDate || '').slice(0, 10),
    note: String(source.note ?? ''),
  }
}

function sameIdentifier(left: unknown, right: unknown): boolean {
  return String(left || '').replace(/[{}]/g, '').toLowerCase() === String(right || '').replace(/[{}]/g, '').toLowerCase()
}

export function isTaskVisibleToEmployee(task: TaskLike = {}, employee: EmployeeLike, teams: TeamLike[] = []): boolean {
  if (!task.restrictedVisibility) return true
  if (!employee?.id && !employee?.userId) return false

  if (sameIdentifier(task.creatorEmployeeId, employee.id)
    || (task.creatorUserId && employee.userId && sameIdentifier(task.creatorUserId, employee.userId))) return true

  const assigneeIds = task.assigneeIds || (task.assigneeId ? [task.assigneeId] : [])
  if (assigneeIds.some((id) => sameIdentifier(id, employee.id))) return true

  const assigneeNames = task.assigneeNames || normalizeAssigneeNames(task.assigneeName)
  if (assigneeNames.some((name) => normalizeText(name) === normalizeText(employee.name))) return true

  const taskTeamIds = uniqueStrings(task.teamIds ?? task.teamId)
  const taskTeamNames = uniqueStrings(task.teamNames ?? task.teamName)
  return teams
    .filter((team) => taskTeamIds.some((id) => sameIdentifier(id, team.id)) || taskTeamNames.some((name) => normalizeText(name) === normalizeText(team.name)))
    .some((team) => (team.memberIds || team.members || []).some((id) => sameIdentifier(id, employee.id)))
}

export function waitingReturnTargetIds(task: TaskLike | null | undefined, teams: TeamLike[] = []): string[] {
  const context = normalizeWaitingContext(task?.waitingContext)
  const targetIds = Array.isArray(context.onIds) && context.onIds.length
    ? context.onIds
    : context.onId ? [context.onId] : []
  const targetNames = Array.isArray(context.onNames) && context.onNames.length
    ? context.onNames
    : context.onName ? [context.onName] : []
  if (context.onType === 'employee') return targetIds
  if (context.onType === 'external') return []
  return teams
    .filter((team) => targetIds.some((id) => sameIdentifier(id, team.id)) || targetNames.some((name) => normalizeText(name) === normalizeText(team.name)))
    .flatMap((team) => team.memberIds || team.members || [])
}

export function isWaitingReturnResponsible(task: TaskLike | null | undefined, employee: EmployeeLike, teams: TeamLike[] = []): boolean {
  if (task?.status !== 'waiting' || !employee?.id) return false
  const context = normalizeWaitingContext(task.waitingContext)
  const targetNames = Array.isArray(context.onNames) && context.onNames.length
    ? context.onNames
    : context.onName ? [context.onName] : []
  return waitingReturnTargetIds(task, teams).some((id) => sameIdentifier(id, employee.id))
    || (context.onType === 'employee' && targetNames.some((name) => normalizeText(name) === normalizeText(employee.name)))
}

export function canRegisterWaitingReturn(task: TaskLike | null | undefined, employee: EmployeeLike, teams: TeamLike[] = []): boolean {
  if (task?.status !== 'waiting' || !employee?.id) return false
  return Boolean((task.creatorEmployeeId && sameIdentifier(task.creatorEmployeeId, employee.id))
    || (task.creatorUserId && employee.userId && sameIdentifier(task.creatorUserId, employee.userId))
    || isWaitingReturnResponsible(task, employee, teams))
}

export function taskDisplayDueDate(task: TaskLike | null | undefined, employee: EmployeeLike, teams: TeamLike[] = []): string {
  const expectedDate = normalizeWaitingContext(task?.waitingContext).expectedDate
  return expectedDate && isWaitingReturnResponsible(task, employee, teams) ? expectedDate : task?.dueDate || ''
}

export function validateWaitingContext(status: unknown, value: unknown): { allowed: boolean; error: string } {
  if (status !== 'waiting') return { allowed: true, error: '' }
  const context = normalizeWaitingContext(value)
  if (!context.subject.trim()) {
    return { allowed: false, error: 'Informe o que está sendo aguardado.' }
  }
  if (context.onType === 'external') {
    if (!context.onNames.length) return { allowed: false, error: 'Informe quem está sendo aguardado.' }
    return { allowed: true, error: '' }
  }
  if (!context.onIds.length || !context.onNames.length) {
    return { allowed: false, error: 'Informe de quem está sendo aguardado o retorno.' }
  }
  return { allowed: true, error: '' }
}

export function waitingContextSummary(value: unknown): string {
  const context = normalizeWaitingContext(value)
  const subject = context.subject.trim()
  if (!subject || !context.onNames.length) return ''
  const parts = [`Aguardando ${subject}`, context.onNames.join(', ')]
  if (context.expectedDate) parts.push(`até ${formatDate(context.expectedDate)}`)
  return parts.join(' · ')
}

interface QuoteTitleInput { clientContact?: unknown; title?: unknown; code?: unknown }

export function quoteTitle(quote: QuoteTitleInput = {}): string {
  const requester = String(quote.clientContact || '').trim()
  return requester ? `Cotação - ${requester}` : 'Cotação'
}

export function isAutomaticQuoteTitle(quote: QuoteTitleInput = {}): boolean {
  const title = String(quote.title || '').trim()
  return !title || title === 'Cotação' || title === 'Nova cotação' || title === quoteTitle(quote)
}

export function quoteTaskTitle(quote: QuoteTitleInput = {}): string {
  return quoteTitle(quote)
}

export function isAutomaticQuoteTaskTitle(task: { title?: unknown } = {}, quote: QuoteTitleInput = {}): boolean {
  const title = String(task.title || '').trim()
  const previousAutomatic = quoteTitle(quote)
  const legacyAutomatic = `Acompanhar ${String(quote.code || quote.title || 'cotação').trim()}`
  return !title || title === previousAutomatic || title === legacyAutomatic
}

/** Entrada de criação/edição de tarefa (formulário). */
export interface TaskInput {
  title?: string
  description?: string
  status?: string
  priority?: string
  dueDate?: string
  assignmentMode?: string
  teamIds?: string[] | string
  teamId?: string
  teamNames?: string[] | string
  teamName?: string
  assigneeNames?: string[] | string
  assigneeName?: string | string[]
  assigneeIds?: string[]
  assigneeId?: string
  primaryAssigneeId?: string
  consultantIds?: string[]
  actorEmployeeId?: string
  actorUserId?: string
  restrictedVisibility?: boolean
  quoteId?: string | null
  quoteCode?: string
  quoteTitle?: string
  sourceType?: string
  sourceId?: string | null
  sourceCode?: string
  sourceLabel?: string
  waitingContext?: unknown
  [extra: string]: unknown
}

export function buildOptimisticTask(input: TaskInput, parentTaskId: string | null = null): Task {
  const quoteId = input.quoteId || null
  const assigneeNames = normalizeAssigneeNames(input.assigneeNames || input.assigneeName)
  const assignmentMode: AssignmentMode = input.assignmentMode === 'team' ? 'team' : 'people'
  const teamIds = assignmentMode === 'team' ? uniqueStrings(input.teamIds ?? input.teamId) : []
  const optimisticAssigneeNames = assignmentMode === 'team'
    ? normalizeAssigneeNames(input.assigneeNames || input.assigneeName)
    : assigneeNames
  const optimisticTeamNames = assignmentMode === 'team' ? uniqueStrings(input.teamNames ?? input.teamName) : []
  const responsibility = responsibilityFromIds(
    input.assigneeIds || [...(input.primaryAssigneeId ? [input.primaryAssigneeId] : []), ...(input.consultantIds || [])],
    input.primaryAssigneeId || input.assigneeId,
  )
  return {
    id: `optimistic-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
    title: String(input.title || 'Nova tarefa').trim(),
    description: input.description || '',
    status: input.status || 'todo',
    priority: input.priority || 'medium',
    dueDate: input.dueDate || '',
    assignmentMode,
    teamIds,
    teamNames: optimisticTeamNames,
    teamId: teamIds[0] || '',
    assigneeNames: optimisticAssigneeNames,
    assigneeIds: responsibility.assigneeIds,
    primaryAssigneeId: responsibility.primaryAssigneeId,
    consultantIds: responsibility.consultantIds,
    primaryAssigneeName: optimisticAssigneeNames[0] || '',
    consultantNames: optimisticAssigneeNames.slice(1),
    assigneeName: optimisticAssigneeNames.join(', '),
    creatorEmployeeId: input.actorEmployeeId || '',
    creatorUserId: input.actorUserId || '',
    restrictedVisibility: Boolean(input.restrictedVisibility),
    teamName: optimisticTeamNames.join(', ') || 'Sem equipe',
    quoteId,
    quoteCode: input.quoteCode || '',
    quoteTitle: input.quoteTitle || '',
    sourceType: input.sourceType || (quoteId ? 'quote' : 'manual'),
    sourceId: input.sourceId || quoteId,
    sourceCode: input.sourceCode || input.quoteCode || '',
    sourceLabel: input.sourceLabel || (quoteId ? 'Pedido de cotação' : 'Tarefa manual'),
    parentTaskId,
    waitingContext: normalizeWaitingContext(input.waitingContext),
    comments: [],
    returns: [],
    attachments: [],
    history: [],
    syncStatus: 'syncing',
  }
}

export function normalizeAssigneeNames(value: unknown): string[] {
  const values: unknown[] = Array.isArray(value) ? value : value ? [value] : []
  const unique = [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
  if (unique.length > 1) return unique.filter((item) => item !== 'Não atribuído')
  return unique.length ? unique : ['Não atribuído']
}

export function hasTaskResponsible(task: TaskLike = {}): boolean {
  const teamIds = uniqueStrings(task.teamIds ?? task.teamId)
  const assigneeIds = uniqueStrings(task.assigneeIds)
  if (task.assignmentMode === 'team' && teamIds.length) return Boolean(task.primaryAssigneeId || assigneeIds.length)
  if (assigneeIds.length) return true
  return normalizeAssigneeNames(task.assigneeNames ?? task.assigneeName)
    .some((name) => name !== 'Não atribuído')
}

export function buildAssigneeOptions(employees: EmployeeLike[] = []): string[] {
  const names = [...new Set(employees.map((employee) => String(employee?.name || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }))
  return ['Não atribuído', ...names]
}

// "Não atribuído" é o fallback exibido quando nenhum responsável está selecionado,
// não um registro selecionável — por isso fica de fora das opções do seletor múltiplo.
export function buildEmployeeAssigneeOptions(employees: EmployeeLike[] = []): string[] {
  return [...new Set(employees.map((employee) => String(employee?.name || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }))
}

export interface NormalizedTeam {
  id: string
  name: string
  iconName: string
  memberIds: string[]
  primaryMemberId: string
}

export function normalizeTeam(team: TeamLike = {}): NormalizedTeam {
  const members: unknown[] = Array.isArray(team.memberIds) ? team.memberIds : Array.isArray(team.members) ? team.members : []
  return {
    id: String(team.id || ''),
    name: String(team.name || '').trim(),
    iconName: String(team.iconName || team.icon || 'users').trim() || 'users',
    memberIds: [...new Set(members.map((id) => String(id || '').trim()).filter(Boolean))],
    primaryMemberId: String(team.primaryMemberId || team.primaryAssigneeId || '').trim(),
  }
}

export function teamResponsibilitySummary(team: TeamLike = {}, tasks: TaskLike[] = [], employees: EmployeeLike[] = []) {
  const normalizedTeam = normalizeTeam(team)
  const teamTasks = tasks.filter((task) => {
    if (['done', 'cancelled'].includes(String(task?.status))) return false
    if (task?.assignmentMode !== 'team') return false
    const taskTeamIds = uniqueStrings(task?.teamIds ?? task?.teamId)
    return taskTeamIds.some((id) => sameIdentifier(id, normalizedTeam.id))
      || (!taskTeamIds.length && normalizeText(task?.teamName) === normalizeText(normalizedTeam.name))
  })

  return {
    totalTaskCount: teamTasks.length,
    members: normalizedTeam.memberIds.map((memberId) => {
      const employee = employees.find((item) => sameIdentifier(item?.id, memberId))
      return { id: memberId, name: employee?.name || 'Membro sem cadastro', apelido: employee?.apelido || '' }
    }),
  }
}

export interface TaskAssignment {
  assignmentMode: AssignmentMode
  teamIds: string[]
  teamNames: string[]
  teamId: string
  teamName: string
  assigneeIds: string[]
  primaryAssigneeId: string
  consultantIds: string[]
  assigneeNames: string[]
  primaryAssigneeName: string
  consultantNames: string[]
}

const isString = (value: unknown): value is string => Boolean(value)

export function resolveTaskAssignment(input: TaskInput = {}, teams: TeamLike[] = [], employees: Employee[] = []): TaskAssignment {
  const requestedMode = input.assignmentMode === 'team' ? 'team' : 'people'
  const employeeById = new Map(employees.map((employee) => [String(employee.id), employee]))
  const employeeByName = new Map(employees.map((employee) => [String(employee.name), employee]))
  const teamIds = uniqueStrings(input.teamIds ?? input.teamId)
  if (requestedMode === 'team' && teamIds.length) {
    const normalizedTeams = teams.map((team) => normalizeTeam(team))
    const selectedTeams = teamIds.map((id) => normalizedTeams.find((team) => sameIdentifier(team.id, id))).filter((team): team is NormalizedTeam => Boolean(team))
    const memberIds = [...new Set(selectedTeams.flatMap((team) => team.memberIds).concat((selectedTeams.length ? [] : input.assigneeIds || []).map((id) => String(id || '')).filter(Boolean)))]
    const primaryTeam = selectedTeams[0]
    const responsibility = responsibilityFromIds(memberIds, primaryTeam?.primaryMemberId || memberIds[0])
    const memberNames = memberIds.map((id) => employeeById.get(id)?.name).filter(isString)
    const teamNames = selectedTeams.map((team) => team.name).filter(Boolean)
    return {
      assignmentMode: 'team',
      teamIds,
      teamNames: teamNames.length ? teamNames : uniqueStrings(input.teamNames ?? input.teamName),
      teamId: teamIds[0] || '',
      teamName: teamNames.length ? teamNames.join(', ') : String(input.teamName || '').trim(),
      assigneeIds: responsibility.assigneeIds,
      primaryAssigneeId: responsibility.primaryAssigneeId,
      consultantIds: responsibility.consultantIds,
      assigneeNames: memberNames.length ? [
        ...new Set([
          employeeById.get(responsibility.primaryAssigneeId)?.name,
          ...responsibility.consultantIds.map((id) => employeeById.get(id)?.name),
        ].filter(isString)),
      ] : normalizeAssigneeNames(input.assigneeNames || input.assigneeName),
      primaryAssigneeName: employeeById.get(responsibility.primaryAssigneeId)?.name || '',
      consultantNames: responsibility.consultantIds.map((id) => employeeById.get(id)?.name).filter(isString),
    }
  }
  const assigneeNames = normalizeAssigneeNames(input.assigneeNames || input.assigneeName).filter((name) => name !== 'Não atribuído')
  const requestedIds = input.assigneeIds?.length
    ? input.assigneeIds
    : [...(input.primaryAssigneeId ? [input.primaryAssigneeId] : []), ...(input.consultantIds || [])].length
      ? [...(input.primaryAssigneeId ? [input.primaryAssigneeId] : []), ...(input.consultantIds || [])]
      : assigneeNames.map((name) => employeeByName.get(name)?.id)
  const responsibility = responsibilityFromIds(requestedIds, input.primaryAssigneeId || input.assigneeId)
  const resolvedNames = responsibility.assigneeIds.map((id) => employeeById.get(id)?.name).filter(isString)
  return {
    assignmentMode: 'people',
    teamIds: [],
    teamNames: [],
    teamId: '',
    teamName: input.assignmentMode === 'people' ? '' : String(input.teamName || '').trim(),
    assigneeIds: responsibility.assigneeIds,
    primaryAssigneeId: responsibility.primaryAssigneeId,
    consultantIds: responsibility.consultantIds,
    assigneeNames: resolvedNames.length ? resolvedNames : assigneeNames.length ? assigneeNames : ['Não atribuído'],
    primaryAssigneeName: employeeById.get(responsibility.primaryAssigneeId)?.name || '',
    consultantNames: responsibility.consultantIds.map((id) => employeeById.get(id)?.name).filter(isString),
  }
}

export interface LegacyTeam {
  id: string
  name: string
  memberIds: string[]
  primaryMemberId?: string
}

export type MigratedTask<T> = T & Responsibility & {
  assignmentMode: AssignmentMode
  teamIds: string[]
  teamNames: string[]
  teamId: string
  teamName?: string
  waitingContext: WaitingContext
}

export function migrateLegacyTeams<T extends TaskLike>(tasks: T[] = [], employees: Employee[] = [], teamNames: string[] = []): { teams: LegacyTeam[]; tasks: Array<MigratedTask<T>> } {
  const names = [...new Set([
    ...teamNames,
    ...tasks.map((task) => task.teamName),
  ].map((name) => String(name || '').trim()).filter((name) => name && name !== 'Sem equipe'))]
  const teams: LegacyTeam[] = names.map((name) => ({
    id: `team-${normalizeText(name).replace(/[^a-z0-9]+/g, '-')}`,
    name,
    memberIds: [...new Set(tasks.filter((task) => task.teamName === name).flatMap((task) => task.assigneeIds || employees.filter((employee) => (task.assigneeNames || []).includes(employee.name)).map((employee) => employee.id)))],
  }))
  teams.forEach((team) => { team.primaryMemberId = team.memberIds[0] || '' })
  const teamByName = new Map(teams.map((team) => [team.name, team]))
  return {
    teams,
    tasks: tasks.map((task) => {
      const team = teamByName.get(String(task.teamName))
      const waitingContext = normalizeWaitingContext(task.waitingContext)
      const waitingTeams = waitingContext.onType === 'team'
        ? teams.filter((item) => waitingContext.onIds.includes(item.id) || waitingContext.onNames.includes(item.name))
        : []
      const next = waitingTeams.length
        ? { waitingContext: { ...waitingContext, onIds: waitingTeams.map((item) => item.id), onNames: waitingTeams.map((item) => item.name), onId: waitingTeams[0]?.id || '', onName: waitingTeams.map((item) => item.name).join(', ') } }
        : { waitingContext }
      if (!team) {
        const responsibility = responsibilityFromIds(task.assigneeIds, task.primaryAssigneeId || task.assigneeId)
        return { ...task, ...next, ...responsibility, assignmentMode: 'people' as const, teamIds: [], teamNames: [], teamId: '', teamName: '' }
      }
      const responsibility = responsibilityFromIds(task.assigneeIds, task.primaryAssigneeId || team.primaryMemberId)
      return { ...task, ...next, ...responsibility, assignmentMode: 'team' as const, teamIds: [team.id], teamNames: [team.name], teamId: team.id }
    }),
  }
}

export function buildTaskCreationInput(input: TaskInput = {}): TaskInput {
  if (input.quoteId) return { ...input, sourceType: 'quote' }
  return { ...input, quoteId: undefined, sourceType: 'manual', sourceId: undefined, sourceCode: undefined, quoteCode: undefined, quoteTitle: undefined }
}

export function findCreatedMainTask<T extends TaskLike>(previousTasks: Array<TaskLike | null | undefined> = [], nextTasks: T[] = [], expectedTitle: unknown = ''): T | undefined {
  const previousIds = new Set(previousTasks.map((task) => String(task?.id || '')).filter(Boolean))
  const createdMainTasks = nextTasks.filter((task) => !task.parentTaskId && !previousIds.has(String(task.id || '')))
  const title = String(expectedTitle || '').trim()
  return createdMainTasks.find((task) => String(task.title || '').trim() === title)
    || createdMainTasks[0]
    || nextTasks.find((task) => !task.parentTaskId && String(task.title || '').trim() === title)
}

export function mentionedEmployees<E extends Partial<Employee>>(text: unknown, employees: E[] = []): E[] {
  const normalizedText = normalizeText(text)
  if (/(^|[^a-z0-9_])@(all|todos)(?=$|[^a-z0-9_])/i.test(normalizedText)) return employees
  return employees.filter((employee) => {
    const names = [employee?.name, employee?.apelido, employee?.mentionSearchText].filter(Boolean).map(normalizeText)
    return names.some((name) => new RegExp(`(^|[^a-z0-9_])@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9_])`, 'i').test(normalizedText))
  })
}

function dateKeyInAppTimeZone(value: Date = new Date()): string {
  const parts = DATE_PART_FORMATTER.formatToParts(value).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export type DueBucket = 'none' | 'overdue' | 'today' | 'tomorrow' | 'upcoming'

export function getDueBucket(task: { dueDate?: unknown; status?: unknown } | null | undefined, today: Date = new Date()): DueBucket {
  if (!task?.dueDate || ['done', 'cancelled'].includes(String(task.status))) return 'none'
  const dueDate = String(task.dueDate).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'none'
  const todayKey = dateKeyInAppTimeZone(today)
  if (dueDate < todayKey) return 'overdue'
  if (dueDate === todayKey) return 'today'
  if (dueDate === shiftDateKey(todayKey, 1)) return 'tomorrow'
  return 'upcoming'
}

export function getDueBucketForEmployee(task: TaskLike, employee: EmployeeLike, teams: TeamLike[] = [], today: Date = new Date()): DueBucket {
  return getDueBucket({ ...task, dueDate: taskDisplayDueDate(task, employee, teams) }, today)
}

interface TaskState { tasks: TaskLike[] }
type WithTasks<S> = Omit<S, 'tasks'> & { tasks: TaskLike[] }

function updateTaskInState<S extends TaskState>(state: S, taskId: unknown, update: (task: TaskLike) => TaskLike): WithTasks<S> {
  return {
    ...state,
    tasks: state.tasks.map((task) => task.id === taskId ? update(task) : task),
  }
}

export function applyOptimisticTaskPatch<S extends TaskState>(state: S, taskId: unknown, patch: TaskLike): WithTasks<S> {
  return updateTaskInState(state, taskId, (task) => ({ ...task, ...patch, syncStatus: 'syncing' }))
}

export interface ExecutionActor {
  id: string
  userId: string
  name: string
  occurredAt: string
  eventId: string
}

export function deriveExecutionActor(task: TaskLike | null | undefined, employees: Array<Partial<Employee>> | null = null): ExecutionActor | null {
  if (!task || task.status !== 'doing') return null
  const event: TaskHistoryItem | undefined = [...(task.history || [])]
    .filter((item) => item.field === 'status' && item.nextValue === 'doing')
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
    .at(-1)
  if (!event) return null
  const authorId = String(event.authorId || event.actorEmployeeId || '').replace(/[{}]/g, '').toLowerCase()
  const userId = String(event.authorUserId || '').replace(/[{}]/g, '').toLowerCase()
  const employee = (employees || []).find((item) =>
    (authorId && (String(item.userId || '').replace(/[{}]/g, '').toLowerCase() === authorId || String(item.id || '').replace(/[{}]/g, '').toLowerCase() === authorId)) ||
    (userId && String(item.userId || '').replace(/[{}]/g, '').toLowerCase() === userId))
  return {
    id: String(employee?.id || event.authorId || event.actorEmployeeId || ''),
    userId: String(event.authorUserId || ''),
    name: employees ? employee?.name || 'Executor não identificado' : String(event.author || 'Executor não identificado'),
    occurredAt: event.createdAt || '',
    eventId: event.id || '',
  }
}

export function addOptimisticComment<S extends TaskState>(state: S, taskId: unknown, text: unknown): WithTasks<S> {
  const comment: TaskComment = {
    id: `optimistic-comment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: String(text || '').trim(),
    createdAt: new Date().toISOString(),
    author: 'Você',
    syncStatus: 'syncing',
  }
  return updateTaskInState(state, taskId, (task) => ({ ...task, comments: [...(task.comments || []), comment] }))
}

export function addOptimisticReturn<S extends TaskState>(state: S, taskId: unknown, returnRecord: TaskComment): WithTasks<S> {
  return updateTaskInState(state, taskId, (task) => ({
    ...task,
    returns: [...(task.returns || []), { ...returnRecord, syncStatus: 'syncing', attachments: returnRecord.attachments || [] }],
  }))
}

export function addOptimisticAttachment<S extends TaskState>(
  state: S,
  taskId: unknown,
  file: { name?: string; type?: string; size?: number } | null | undefined,
  previewUrl = '',
): WithTasks<S> {
  const attachment = {
    id: `optimistic-attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file?.name || 'Arquivo',
    link: '',
    mimeType: file?.type || '',
    size: file?.size || 0,
    previewUrl,
    createdAt: new Date().toISOString(),
    syncStatus: 'syncing',
  }
  return updateTaskInState(state, taskId, (task) => ({ ...task, attachments: [...(task.attachments || []), attachment] }))
}

export function isOverdue(task: { dueDate?: unknown; status?: unknown } | null | undefined, today: Date = new Date()): boolean {
  return getDueBucket(task, today) === 'overdue'
}

export function isDueToday(task: { dueDate?: unknown; status?: unknown } | null | undefined, today: Date = new Date()): boolean {
  return getDueBucket(task, today) === 'today'
}

export function formatDate(value: unknown): string {
  const date = parseDisplayDate(value)
  if (!date) return 'Sem prazo'
  return SHORT_DATE_FORMATTER.format(date).replace(' de ', ' ')
}

export function formatLongDate(value: unknown): string {
  const date = parseDisplayDate(value)
  if (!date) return 'Sem prazo definido'
  return LONG_DATE_FORMATTER.format(date)
}

function parseDisplayDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const text = String(value).trim()
  if (!text) return null
  const dateKey = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  const date = dateKey ? new Date(`${dateKey}T12:00:00`) : new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

export interface TaskFilters {
  query?: unknown
  status?: unknown
  assignee?: unknown
  priority?: unknown
  source?: unknown
  team?: unknown
  personalTag?: unknown
}

export function filterTasks<T extends TaskLike>(tasks: T[], filters: TaskFilters = {}, employee?: EmployeeLike, teams: TeamLike[] = []): T[] {
  const query = normalizeText(filters.query)
  const queryTokens = query.split(/\s+/).filter(Boolean)
  const selectedValues = (value: unknown): unknown[] => Array.isArray(value) ? value : value ? [value] : []
  const statusValues = new Set(selectedValues(filters.status))
  const assigneeValues = selectedValues(filters.assignee)
  const priorityValues = new Set(selectedValues(filters.priority))
  const sourceValues = new Set(selectedValues(filters.source))
  const teamValues = selectedValues(filters.team)
  const personalTagValues = new Set(selectedValues(filters.personalTag))
  return tasks.filter((task) => {
    if (!isTaskVisibleToEmployee(task, employee, teams)) return false
    if (statusValues.size && !statusValues.has(task.status)) return false
    if (priorityValues.size && !priorityValues.has(task.priority)) return false
    if (sourceValues.size && !sourceValues.has(task.sourceType)) return false
    if (assigneeValues.length) {
      const taskAssignees: unknown[] = task.assigneeNames || normalizeAssigneeNames(task.assigneeName)
      const matchesWaitingReturn = employee && isWaitingReturnResponsible(task, employee, teams)
        && assigneeValues.some((value) => normalizeText(value) === normalizeText(employee.name))
      if (!assigneeValues.some((value) => taskAssignees.includes(value)) && !matchesWaitingReturn) return false
    }
    if (teamValues.length) {
      const taskTeams: unknown[] = task.teamNames?.length ? task.teamNames : [task.teamName].filter(Boolean)
      if (!teamValues.some((value) => taskTeams.includes(value))) return false
    }
    if (personalTagValues.size && !normalizePersonalTagIds(task.personalTagIds).some((id) => personalTagValues.has(id))) return false
    if (!query) return true
    const assigneeSearch = [task.assigneeName, ...(Array.isArray(task.assigneeNames) ? task.assigneeNames : [])].filter(Boolean).join(' ')
    return [task.title, task.quoteTitle, assigneeSearch, task.teamName].some((value) => {
      const normalizedValue = normalizeText(value)
      return normalizedValue.includes(query) || queryTokens.every((token) => normalizedValue.includes(token))
    })
  })
}

export function sortTasks<T extends TaskLike>(tasks: T[], employee?: EmployeeLike, teams: TeamLike[] = []): T[] {
  return [...tasks].sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1
    if (a.status !== 'done' && b.status === 'done') return -1
    return (taskDisplayDueDate(a, employee, teams) || '9999-12-31').localeCompare(taskDisplayDueDate(b, employee, teams) || '9999-12-31')
  })
}

const BOARD_PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

function taskActivityTimestamp(task: TaskLike | null | undefined): number {
  const updatedTimestamp = Date.parse(task?.updatedAt || '')
  if (Number.isFinite(updatedTimestamp)) return updatedTimestamp
  const historyTimestamp = (task?.history || [])
    .map((item) => Date.parse(item?.createdAt || ''))
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0)
  if (historyTimestamp) return historyTimestamp
  const createdTimestamp = Date.parse(task?.createdAt || '')
  return Number.isFinite(createdTimestamp) ? createdTimestamp : 0
}

export type BoardSortKey = 'dueDate' | 'priority' | 'updatedAt' | 'createdAt' | 'title'
export interface BoardSort { key?: string; direction?: string }

function compareBoardTasks(left: TaskLike, right: TaskLike, key: string, employee: EmployeeLike, teams: TeamLike[]): number {
  const leftDue = taskDisplayDueDate(left, employee, teams) || '9999-12-31'
  const rightDue = taskDisplayDueDate(right, employee, teams) || '9999-12-31'
  const leftPriority = BOARD_PRIORITY_RANK[String(left.priority)] ?? 2
  const rightPriority = BOARD_PRIORITY_RANK[String(right.priority)] ?? 2
  const leftTitle = normalizeText(left.title)
  const rightTitle = normalizeText(right.title)
  const leftCreated = Date.parse(left.createdAt || '') || 0
  const rightCreated = Date.parse(right.createdAt || '') || 0
  const compare = <V,>(a: V, b: V) => a === b ? 0 : a < b ? -1 : 1
  const values: Record<string, number> = {
    dueDate: compare(leftDue, rightDue),
    priority: compare(leftPriority, rightPriority),
    updatedAt: compare(taskActivityTimestamp(left), taskActivityTimestamp(right)),
    createdAt: compare(leftCreated, rightCreated),
    title: leftTitle.localeCompare(rightTitle, 'pt-BR'),
  }
  return values[key] || values.dueDate || values.priority || values.title || String(left.id || '').localeCompare(String(right.id || ''))
}

export function sortBoardTasks<T extends TaskLike>(tasks: T[], sort: BoardSort | null | undefined = { key: 'dueDate', direction: 'asc' }, employee?: EmployeeLike, teams: TeamLike[] = []): T[] {
  const direction = sort?.direction === 'desc' ? -1 : 1
  return [...tasks].sort((left, right) => {
    if (left.status === 'done' && right.status !== 'done') return 1
    if (left.status !== 'done' && right.status === 'done') return -1
    return compareBoardTasks(left, right, sort?.key || 'dueDate', employee, teams) * direction
  })
}

export function taskStats(tasks: TaskLike[], today: Date = new Date()): { open: number; overdue: number; today: number; waiting: number } {
  return tasks.reduce<{ open: number; overdue: number; today: number; waiting: number }>((stats, task) => {
    if (task.status !== 'done') stats.open += 1
    if (isOverdue(task, today)) stats.overdue += 1
    if (isDueToday(task, today)) stats.today += 1
    if (task.status === 'waiting') stats.waiting += 1
    return stats
  }, { open: 0, overdue: 0, today: 0, waiting: 0 })
}
