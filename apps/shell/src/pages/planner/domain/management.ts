// Porte de Tela Planner/src/management.js (sem mudança de comportamento).
import { getDueBucket, normalizeAssigneeNames, normalizeTeam, type DueBucket, type NormalizedTeam, type TaskLike } from './domain'
import type { Employee, Team } from './types'

const TERMINAL = new Set<unknown>(['done', 'cancelled'])
const MANAGEMENT_ALLOWED_EMAILS = new Set([
  'noreply@betinhos.onmicrosoft.com',
  'betinhos@betinhos.onmicrosoft.com',
])
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function localDateKey(value: Date | number = new Date()): string {
  return LOCAL_DATE_FORMATTER.format(value)
}

export function canViewManagement(email: unknown): boolean {
  return MANAGEMENT_ALLOWED_EMAILS.has(String(email || '').trim().toLowerCase())
}

function dateDifference(from: unknown, to: unknown): number {
  const start = new Date(`${String(from).slice(0, 10)}T12:00:00Z`)
  const end = new Date(`${String(to).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

export function daysOverdue(task: { dueDate?: unknown; status?: unknown } | null | undefined, today: Date = new Date()): number {
  if (!task?.dueDate || TERMINAL.has(task.status)) return 0
  const todayKey = localDateKey(today)
  return String(task.dueDate).slice(0, 10) < todayKey
    ? dateDifference(task.dueDate, todayKey)
    : 0
}

function teamById(teams: Array<Partial<Team>> = []): Map<string, NormalizedTeam> {
  return new Map(teams.map((team) => [String(team.id), normalizeTeam(team)]))
}

function collectionRecipients(task: TaskLike | null | undefined, teams: Array<Partial<Team>> = []): string[] {
  const primaryId = task?.primaryAssigneeId || task?.assigneeId || task?.assigneeIds?.[0]
  if (primaryId) return [String(primaryId)]
  if (task?.assignmentMode === 'team') {
    const byId = teamById(teams)
    return [...new Set((task.teamIds || (task.teamId ? [task.teamId] : []))
      .flatMap((id) => byId.get(String(id))?.memberIds || []))].slice(0, 1)
  }
  return []
}

export interface CollectionEvent {
  taskId?: string
  occurredAt?: string
  referenceDate?: string
  [extra: string]: unknown
}

export type CollectionRow<T extends TaskLike> = T & {
  overdueDays: number
  assignmentLabel: string
  assigneeNames: string[]
  assigneeIds: string[]
  creatorName: string
  lastCollectionAt: string
  collectionDate: string
}

export function collectionRows<T extends TaskLike>(
  tasks: T[] = [],
  employees: Array<Partial<Employee>> = [],
  teams: Array<Partial<Team>> = [],
  collectionEvents: CollectionEvent[] = [],
  today: Date = new Date(),
): Array<CollectionRow<T>> {
  const employeeById = new Map(employees.map((employee) => [String(employee.id), employee]))
  const creatorName = (task: T) => employeeById.get(String(task.creatorEmployeeId || ''))?.name || 'Não identificado'
  return tasks
    .filter((task) => !TERMINAL.has(task.status) && daysOverdue(task, today) > 0)
    .map((task) => {
      const recipients = collectionRecipients(task, teams)
      const last = [...collectionEvents]
        .filter((event) => event.taskId === task.id)
        .sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')))[0]
      const assigneeNames = task.assignmentMode === 'team'
        ? (task.teamNames || (task.teamName ? [task.teamName] : []))
        : (task.assigneeNames || normalizeAssigneeNames(task.assigneeName))
      return {
        ...task,
        overdueDays: daysOverdue(task, today),
        assignmentLabel: task.assignmentMode === 'team' ? 'Equipe' : 'Pessoas',
        assigneeNames,
        assigneeIds: recipients.length ? recipients : task.assigneeIds || [],
        creatorName: creatorName(task),
        lastCollectionAt: last?.occurredAt || '',
        collectionDate: last?.referenceDate || '',
      }
    })
    .sort((left, right) => right.overdueDays - left.overdueDays || String(left.dueDate || '').localeCompare(String(right.dueDate || '')))
}

export interface WorkloadGroup<T extends TaskLike = TaskLike> {
  key: string
  label: string
  type: 'team' | 'employee'
  total: number
  overdue: number
  today: number
  open: number
  tasks: T[]
}

export function workloadGroups<T extends TaskLike>(tasks: T[] = [], teams: Array<Partial<Team>> = [], today: Date = new Date()): Array<WorkloadGroup<T>> {
  const byTeam = teamById(teams)
  const groups = new Map<string, WorkloadGroup<T>>()
  const add = (key: string, label: string, type: 'team' | 'employee', task: T) => {
    const current = groups.get(key) || { key, label, type, total: 0, overdue: 0, today: 0, open: 0, tasks: [] }
    current.total += 1
    current.open += 1
    const bucket = getDueBucket(task, today)
    if (bucket === 'overdue') current.overdue += 1
    if (bucket === 'today') current.today += 1
    current.tasks.push(task)
    groups.set(key, current)
  }
  tasks.filter((task) => !TERMINAL.has(task.status)).forEach((task) => {
    if (task.assignmentMode === 'team') {
      const ids = task.teamIds || (task.teamId ? [task.teamId] : [])
      if (ids.length) ids.forEach((id) => add(`team:${id}`, byTeam.get(String(id))?.name || task.teamName || 'Equipe sem cadastro', 'team', task))
      else add('team:unassigned', 'Equipe não definida', 'team', task)
      return
    }
    const ids = task.primaryAssigneeId ? [task.primaryAssigneeId] : task.assigneeIds?.slice(0, 1) || []
    const names = task.primaryAssigneeName ? [task.primaryAssigneeName] : (task.assigneeNames || normalizeAssigneeNames(task.assigneeName)).slice(0, 1)
    if (!ids.length && (!names.length || names.includes('Não atribuído'))) {
      add('employee:unassigned', 'Sem responsável', 'employee', task)
      return
    }
    ids.forEach((id, index) => add(`employee:${id}`, names[index] || 'Responsável sem cadastro', 'employee', task))
  })
  const bucketRank: Record<DueBucket, number> = { overdue: 0, today: 1, tomorrow: 2, upcoming: 3, none: 4 }
  const compareTasks = (left: T, right: T) => {
    const overdueDelta = daysOverdue(right, today) - daysOverdue(left, today)
    if (overdueDelta) return overdueDelta
    const bucketDelta = (bucketRank[getDueBucket(left, today)] ?? 4) - (bucketRank[getDueBucket(right, today)] ?? 4)
    if (bucketDelta) return bucketDelta
    const leftDate = String(left.dueDate || '9999-12-31').slice(0, 10)
    const rightDate = String(right.dueDate || '9999-12-31').slice(0, 10)
    return leftDate.localeCompare(rightDate) || String(left.title || '').localeCompare(String(right.title || ''), 'pt-BR')
  }
  return [...groups.values()]
    .map((group) => ({ ...group, tasks: [...group.tasks].sort(compareTasks) }))
    .sort((left, right) => right.overdue - left.overdue || right.total - left.total || left.label.localeCompare(right.label, 'pt-BR'))
}

export function workloadTotals(tasks: TaskLike[] = [], today: Date = new Date()): { unique: number; today: number; overdue: number } {
  const openTasks = tasks.filter((task) => !TERMINAL.has(task.status))
  return {
    unique: openTasks.length,
    today: openTasks.filter((task) => getDueBucket(task, today) === 'today').length,
    overdue: openTasks.filter((task) => getDueBucket(task, today) === 'overdue').length,
  }
}

export function overviewCollections<R>(rows: R[] = [], limit = 3): R[] {
  return rows.slice(0, limit)
}

export function overviewWorkload<G extends { total: number; overdue: number; label: string }>(groups: G[] = [], limit = 4): G[] {
  return [...groups]
    .sort((left, right) => right.total - left.total || right.overdue - left.overdue || left.label.localeCompare(right.label, 'pt-BR'))
    .slice(0, limit)
}

interface WaitingLike { expectedDate?: string; onNames?: string[]; onName?: string; onType?: string }

export function waitingRows<T extends TaskLike>(tasks: T[] = [], teams: Array<Partial<Team>> = [], today: Date = new Date()) {
  const ctx = (task: T): WaitingLike | undefined => task.waitingContext as WaitingLike | undefined
  return tasks.filter((task) => {
    if (task.status !== 'waiting') return false
    const expectedDate = ctx(task)?.expectedDate
    return !expectedDate || getDueBucket({ status: 'waiting', dueDate: expectedDate }, today) === 'overdue'
  }).map((task) => ({
    ...task,
    waitingExpectedDate: ctx(task)?.expectedDate || '',
    waitingOverdueDays: ctx(task)?.expectedDate ? daysOverdue({ ...task, dueDate: ctx(task)?.expectedDate }, today) : 0,
    waitingTarget: ctx(task)?.onNames?.join(', ') || ctx(task)?.onName || 'Sem parte informada',
    waitingTargetType: ctx(task)?.onType || 'employee',
    teamNames: task.teamNames || (task.teamName ? [task.teamName] : []),
    teams,
  })).sort((left, right) => right.waitingOverdueDays - left.waitingOverdueDays || String(left.waitingExpectedDate).localeCompare(String(right.waitingExpectedDate)))
}

export function manualCollectionKey(taskId: unknown, referenceDate: unknown): string {
  return `manual-overdue|${taskId}|${referenceDate}`
}
