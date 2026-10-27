// Porte de Tela Planner/src/workItems.js (sem mudança de comportamento).
import { getDueBucket, isTaskVisibleToEmployee, normalizeAssigneeNames, taskDisplayDueDate, waitingReturnTargetIds, type DueBucket, type TaskLike } from './domain'
import type { Employee, Team } from './types'

const TERMINAL_QUALITY_STATUSES = new Set(['resolvido', 'encerrado', 'cancelado', 'concluida', 'cancelada'])
const TASK_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({ todo: 'A fazer', doing: 'Em andamento', waiting: 'Aguardando', done: 'Concluído', cancelled: 'Cancelado' })
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export interface QualityItem {
  id?: string
  type?: string
  code?: string
  title?: string
  description?: string
  status?: string
  dueDate?: string
  assigneeId?: string
  assigneeName?: string
  assigneeProfiles?: unknown[]
  priority?: string
  priorityRank?: number | string
  teamName?: string
  [extra: string]: unknown
}

export interface WorkItem {
  id: string
  source: string
  sourceRecordId?: string
  sourceCode: string
  title: string
  context: string
  assigneeEmployeeId: string
  assigneeIds?: string[]
  primaryAssigneeId?: string
  consultantIds?: string[]
  creatorEmployeeId?: string
  creatorUserId?: string
  restrictedVisibility?: boolean
  assigneeNames?: string[]
  primaryAssigneeName?: string
  consultantNames?: string[]
  assigneeName: string
  assigneeProfiles: unknown[]
  dueAt: string
  dueBucket: DueBucket | string
  waitingTargetIds?: string[]
  priority: string
  priorityRank: number
  teamName: string
  sourceStatus: string
  statusGroup?: string
  statusLabel: string
  isTerminal: boolean
  isOverdue: boolean
  quickTransitions: string[]
  openTarget: { resource: string; params: Record<string, string | undefined> }
  parentTaskId?: string | null
}

function cleanText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim()
  return !text || /\b(undefined|null)\b/i.test(text) ? fallback : text
}

function foldStatus(value: unknown): string {
  return cleanText(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')
}

function isTerminalQualityStatus(value: unknown): boolean {
  return TERMINAL_QUALITY_STATUSES.has(foldStatus(value))
}

function taskTitle(task: TaskLike): string {
  const title = cleanText(task.title)
  if (title) return title
  const reference = cleanText(task.sourceCode || task.quoteCode || task.quoteTitle, 'cotação')
  return task.sourceType === 'quote' || task.quoteId ? `Acompanhar ${reference}` : 'Tarefa sem título'
}

function taskContext(task: TaskLike): string {
  return cleanText(task.description) || cleanText(task.quoteTitle) || 'Tarefa Planner'
}

function qualityStatusGroup(item: QualityItem): string {
  if (isTerminalQualityStatus(item.status)) return 'done'
  if (['em tratamento', 'em andamento'].includes(foldStatus(item.status))) return 'doing'
  return 'todo'
}

function qualityDue(item: QualityItem): string {
  return cleanText(item.dueDate)
}

function qualityWorkItem(item: QualityItem): WorkItem {
  const isAction = item.type === 'action'
  const source = isAction ? 'quality_action' : 'quality_error'
  const statusGroup = qualityStatusGroup(item)
  const isTerminal = statusGroup === 'done'
  return {
    id: `${source}:${item.id}`,
    source,
    sourceRecordId: item.id,
    sourceCode: cleanText(item.code),
    title: cleanText(item.title, isAction ? 'Ação operacional' : 'Ocorrência operacional'),
    context: cleanText(item.description) || (isAction ? 'Ação de qualidade' : 'Ocorrência de qualidade'),
    assigneeEmployeeId: item.assigneeId || '',
    assigneeName: cleanText(item.assigneeName, 'Não atribuído'),
    assigneeProfiles: item.assigneeProfiles || [],
    dueAt: qualityDue(item),
    dueBucket: qualityDue(item) && !isTerminal ? getDueBucket({ dueDate: qualityDue(item), status: statusGroup }) : 'none',
    priority: cleanText(item.priority),
    priorityRank: Number(item.priorityRank || 1),
    teamName: cleanText(item.teamName),
    sourceStatus: cleanText(item.status),
    statusGroup,
    statusLabel: cleanText(item.status, TASK_STATUS_LABELS[statusGroup]),
    isTerminal,
    isOverdue: Boolean(qualityDue(item)) && !isTerminal && getDueBucket({ dueDate: qualityDue(item), status: statusGroup }) === 'overdue',
    quickTransitions: isTerminal ? [] : ['doing', 'waiting'],
    openTarget: { resource: 'new_gestao_erros_operacionais.html', params: isAction ? { actionId: item.id } : { errorId: item.id } },
  }
}

export interface WorkItemsState {
  tasks?: TaskLike[]
  teams?: Array<Partial<Team>>
  quality?: QualityItem[]
  [extra: string]: unknown
}

export function normalizeWorkItems(state: WorkItemsState = {}, employee?: Partial<Employee> | null): WorkItem[] {
  const tasks = (state.tasks || []).filter((task) => isTaskVisibleToEmployee(task, employee, state.teams)).map((task): WorkItem => {
    const dueAt = taskDisplayDueDate(task, employee, state.teams)
    return {
      id: `task:${task.id}`,
      source: task.sourceType === 'quote' ? 'quote_followup' : 'task',
      sourceRecordId: task.id,
      sourceCode: cleanText(task.sourceCode || task.quoteCode),
      title: taskTitle(task),
      context: taskContext(task),
      assigneeEmployeeId: task.assigneeId || task.assigneeIds?.[0] || '',
      assigneeIds: task.assigneeIds || (task.assigneeId ? [task.assigneeId] : []),
      primaryAssigneeId: task.primaryAssigneeId || task.assigneeId || task.assigneeIds?.[0] || '',
      consultantIds: task.consultantIds || (task.assigneeIds || []).slice(1),
      creatorEmployeeId: task.creatorEmployeeId || '',
      creatorUserId: task.creatorUserId || '',
      restrictedVisibility: Boolean(task.restrictedVisibility),
      assigneeNames: task.assigneeNames || normalizeAssigneeNames(task.assigneeName),
      primaryAssigneeName: task.primaryAssigneeName || (task.assigneeNames || [])[0] || '',
      consultantNames: task.consultantNames || (task.assigneeNames || []).slice(1),
      assigneeName: cleanText(task.assigneeName, 'Não atribuído'),
      assigneeProfiles: Array.isArray(task.assigneeProfiles) ? task.assigneeProfiles : [],
      dueAt: cleanText(dueAt),
      dueBucket: getDueBucket({ ...task, dueDate: dueAt }),
      waitingTargetIds: waitingReturnTargetIds(task, state.teams),
      priority: cleanText(task.priority),
      priorityRank: (PRIORITY_RANK[String(task.priority)] ?? 2),
      teamName: cleanText(task.teamName),
      sourceStatus: cleanText(task.status),
      statusGroup: task.status,
      statusLabel: TASK_STATUS_LABELS[String(task.status)] || cleanText(task.status, 'A fazer'),
      isTerminal: ['done', 'cancelled'].includes(String(task.status)),
      isOverdue: getDueBucket({ ...task, dueDate: dueAt }) === 'overdue',
      quickTransitions: ['done', 'cancelled'].includes(String(task.status)) ? [] : ['doing', 'waiting', 'done'],
      openTarget: task.quoteId
        ? { resource: 'new_TelaPlanner.html', params: { view: 'quotes', quoteId: task.quoteId } }
        : { resource: 'new_TelaPlanner.html', params: { taskId: task.id } },
      parentTaskId: task.parentTaskId || null,
    }
  })
  return [...tasks, ...(state.quality || []).map(qualityWorkItem)]
}

type SortableItem = { isOverdue?: boolean; dueAt?: string; priorityRank?: number; title?: string }

export function sortWorkItems<I extends SortableItem>(items: I[] = []): I[] {
  return [...items].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    const aDue = a.dueAt || '9999-12-31'
    const bDue = b.dueAt || '9999-12-31'
    if (aDue !== bDue) return aDue.localeCompare(bDue)
    if (a.priorityRank !== b.priorityRank) return Number(a.priorityRank) - Number(b.priorityRank)
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR')
  })
}

export interface WorkItemFilters {
  query?: unknown
  status?: unknown
  assignee?: unknown
  priority?: unknown
  source?: unknown
  team?: unknown
}

export function filterWorkItems<I extends Partial<WorkItem>>(items: I[] = [], filters: WorkItemFilters = {}): I[] {
  const query = String(filters.query || '').trim().toLocaleLowerCase('pt-BR')
  const selectedValues = (value: unknown): unknown[] => Array.isArray(value) ? value : value ? [value] : []
  const statusValues = new Set(selectedValues(filters.status))
  const assigneeValues = selectedValues(filters.assignee)
  const priorityValues = new Set(selectedValues(filters.priority))
  const sourceValues = new Set(selectedValues(filters.source))
  const teamValues = selectedValues(filters.team)
  return items.filter((item) => {
    const assigneeNames: unknown[] = item.assigneeNames || (item.assigneeName ? [item.assigneeName] : [])
    if (assigneeValues.length && !assigneeValues.some((value) => String(value) === String(item.assigneeEmployeeId) || assigneeNames.includes(value) || String(item.assigneeName || '').includes(String(value)))) return false
    if (statusValues.size && !statusValues.has(item.statusGroup)) return false
    if (priorityValues.size && !priorityValues.has(item.priority)) return false
    if (sourceValues.size) {
      const matchesSource = sourceValues.has(item.source)
        || (sourceValues.has('manual') && item.source === 'task')
        || (sourceValues.has('quote') && item.source === 'quote_followup')
        || (sourceValues.has('quality') && ['quality_error', 'quality_action'].includes(String(item.source)))
      if (!matchesSource) return false
    }
    if (teamValues.length && !teamValues.includes(item.teamName)) return false
    return !query || [item.title, item.context, item.assigneeName, item.sourceCode, item.teamName].join(' ').toLocaleLowerCase('pt-BR').includes(query)
  })
}

export function isAssignedToEmployee(item: Partial<WorkItem>, employee: Partial<Employee> | null | undefined): boolean {
  if (!employee) return false
  const employeeId = String(employee.id || '')
  const employeeName = String(employee.name || '')
  const assigneeIds = [item.assigneeEmployeeId, ...(item.assigneeIds || []), ...(item.waitingTargetIds || [])].filter(Boolean).map(String)
  const assigneeNames = item.assigneeNames || (item.assigneeName ? [item.assigneeName] : [])
  return Boolean(assigneeIds.includes(employeeId)
    || assigneeNames.includes(employeeName)
    || String(item.creatorEmployeeId || '') === employeeId
    || (item.creatorUserId && employee.userId && String(item.creatorUserId) === String(employee.userId)))
}

export function workItemStats(items: Array<Partial<WorkItem>> = []) {
  return items.reduce((stats, item) => {
    if (item.isTerminal) return stats
    stats.open += 1
    if (item.isOverdue) stats.overdue += 1
    if (item.dueBucket === 'today') stats.today += 1
    if (item.dueBucket === 'tomorrow') stats.tomorrow += 1
    if (item.isOverdue || ['today', 'tomorrow'].includes(String(item.dueBucket))) stats.alertCount += 1
    if (item.statusGroup === 'doing') stats.doing += 1
    if (item.statusGroup === 'waiting') stats.waiting += 1
    return stats
  }, { open: 0, overdue: 0, today: 0, tomorrow: 0, doing: 0, waiting: 0, alertCount: 0 })
}
