// Porte de Tela Planner/src/notifications.js (lembretes e destinatários).

export interface NotifiableTask {
  id?: string
  status?: string
  dueDate?: string
  creatorUserId?: string
  creatorEmployeeId?: string
  assigneeIds?: string[]
  assigneeId?: string
  primaryAssigneeId?: string
  [extra: string]: unknown
}

export interface NotifiableEmployee {
  id?: string
  userId?: string
  externalNotificationsAvailable?: boolean
  [extra: string]: unknown
}

export type ReminderType = '' | 'overdue' | 'due_today' | 'due_soon'
export type DeadlineRole = 'creator' | 'assignee' | 'viewer'

const TERMINAL_STATUSES = new Set(['done', 'cancelled'])

const dateKey = (value: unknown): string => String(value || '').slice(0, 10)

export function previousBusinessDay(value: unknown): string {
  const key = dateKey(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return ''
  const date = new Date(`${key}T12:00:00Z`)
  do { date.setUTCDate(date.getUTCDate() - 1) } while ([0, 6].includes(date.getUTCDay()))
  return date.toISOString().slice(0, 10)
}

export function businessDaysSince(startValue: unknown, endValue: unknown): number {
  const startKey = dateKey(startValue)
  const endKey = dateKey(endValue)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey) || startKey >= endKey) return 0
  const cursor = new Date(`${startKey}T12:00:00Z`)
  const end = new Date(`${endKey}T12:00:00Z`)
  let count = 0
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (![0, 6].includes(cursor.getUTCDay())) count += 1
  }
  return count
}

export function deadlineReminderType(task: NotifiableTask | null | undefined, todayKey: unknown): ReminderType {
  const dueDate = dateKey(task?.dueDate)
  const today = dateKey(todayKey)
  if (!dueDate || !today || TERMINAL_STATUSES.has(task?.status ?? '')) return ''
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'due_today'
  if (previousBusinessDay(dueDate) === today) return 'due_soon'
  return ''
}

const cleanId = (value: unknown): string => String(value || '').replace(/[{}]/g, '').toLowerCase()

export function deadlineRole(task: NotifiableTask | null | undefined, employee: NotifiableEmployee | null | undefined): DeadlineRole {
  const userId = cleanId(employee?.userId)
  if (userId && userId === cleanId(task?.creatorUserId)) return 'creator'
  const employeeId = cleanId(employee?.id)
  if (employeeId && (task?.assigneeIds || []).some((id) => cleanId(id) === employeeId)) return 'assignee'
  return 'viewer'
}

export function isTaskWaitingForEmployee(task: NotifiableTask | null | undefined, employee: NotifiableEmployee | null | undefined): boolean {
  const employeeId = cleanId(employee?.id)
  const userId = cleanId(employee?.userId)
  if (task?.status !== 'waiting' || !employeeId) return false
  return cleanId(task.creatorEmployeeId) === employeeId ||
    Boolean(userId && cleanId(task.creatorUserId) === userId) ||
    (task.assigneeIds || []).some((id) => cleanId(id) === employeeId)
}

export interface DeadlineChangeResult {
  allowed: boolean
  role: DeadlineRole
  requiresReason: boolean
  error?: string
}

export function validateDeadlineChange({ task, employee, nextDueDate, reason }: {
  task?: NotifiableTask | null
  employee?: NotifiableEmployee | null
  nextDueDate?: unknown
  reason?: unknown
}): DeadlineChangeResult {
  if (dateKey(nextDueDate) === dateKey(task?.dueDate)) return { allowed: true, role: deadlineRole(task, employee), requiresReason: false }
  const role = deadlineRole(task, employee)
  if (role === 'creator') return { allowed: true, role, requiresReason: false }
  if (role === 'assignee') {
    const hasReason = Boolean(String(reason || '').trim())
    return { allowed: hasReason, role, requiresReason: true, error: hasReason ? '' : 'Informe o motivo da alteração do prazo.' }
  }
  const hasReason = Boolean(String(reason || '').trim())
  return { allowed: hasReason, role, requiresReason: true, error: hasReason ? '' : 'Informe o motivo da alteração do prazo.' }
}

export interface NotificationRecipientsInput {
  creatorEmployeeId?: string
  assigneeIds?: string[]
  mentionedEmployeeIds?: string[]
  previousAssigneeIds?: string[]
  nextStatus?: string
  type?: string
  actorEmployeeId?: string
}

export function notificationRecipients({ creatorEmployeeId, assigneeIds = [], mentionedEmployeeIds = [], previousAssigneeIds = [], nextStatus = '', type, actorEmployeeId }: NotificationRecipientsInput): string[] {
  const actor = cleanId(actorEmployeeId)
  let values: Array<string | undefined> = []
  if (type === 'assignment') values = assigneeIds.filter((id) => !previousAssigneeIds.some((oldId) => cleanId(oldId) === cleanId(id)))
  else if (type === 'mention') values = mentionedEmployeeIds
  else if (type === 'waiting') values = [creatorEmployeeId, ...assigneeIds, ...mentionedEmployeeIds]
  else if (type === 'waiting_return') values = [creatorEmployeeId, ...assigneeIds]
  else if (type === 'status') values = ['done', 'waiting'].includes(nextStatus) ? [creatorEmployeeId, ...assigneeIds] : []
  else if (type === 'assignees') {
    const current = new Set(assigneeIds.map(cleanId))
    const previous = new Set(previousAssigneeIds.map(cleanId))
    values = [
      ...assigneeIds.filter((id) => !previous.has(cleanId(id))),
      ...previousAssigneeIds.filter((id) => !current.has(cleanId(id))),
    ]
  }
  else values = [creatorEmployeeId, ...assigneeIds, ...previousAssigneeIds]
  return [...new Map(values.filter((id): id is string => Boolean(id)).map((id) => [cleanId(id), id])).entries()]
    .filter(([key]) => key !== actor)
    .map(([, id]) => id)
}

export function notificationDedupeKey({ recipientId, taskId, type, referenceDate = '', eventId = '' }: {
  recipientId?: unknown
  taskId?: unknown
  type?: unknown
  referenceDate?: unknown
  eventId?: unknown
}): string {
  return [recipientId, taskId, type, referenceDate, eventId].map(cleanId).join('|')
}

export function unreadCount(notifications: Array<{ readAt?: unknown }> = []): number {
  return notifications.filter((item) => !item.readAt).length
}

export interface DailyReminderRow {
  taskId: string | undefined
  recipientEmployeeId: string
  type: Exclude<ReminderType, ''>
  referenceDate: string
  externalDeliveryAvailable: boolean
  dedupeKey: string
}

export function dailyReminderRows(tasks: NotifiableTask[] = [], employees: NotifiableEmployee[] = [], todayKey: unknown): DailyReminderRow[] {
  const employeeById = new Map(employees.map((employee) => [cleanId(employee.id), employee]))
  return tasks.flatMap((task) => {
    const type = deadlineReminderType(task, todayKey)
    if (!type || type === 'due_soon') return []
    const primaryAssigneeId = cleanId(task.primaryAssigneeId || task.assigneeId || task.assigneeIds?.[0])
    const recipientIds = type === 'overdue' && task.creatorEmployeeId && businessDaysSince(task.dueDate, todayKey) >= 1
      ? [...new Set([primaryAssigneeId, cleanId(task.creatorEmployeeId)].filter(Boolean))]
      : primaryAssigneeId ? [primaryAssigneeId] : []
    return recipientIds.map((employeeId) => {
      const employee = employeeById.get(employeeId)
      return {
        taskId: task.id,
        recipientEmployeeId: employee?.id || employeeId,
        type,
        referenceDate: dateKey(todayKey),
        externalDeliveryAvailable: Boolean(employee?.externalNotificationsAvailable),
        dedupeKey: notificationDedupeKey({ recipientId: employeeId, taskId: task.id, type, referenceDate: todayKey }),
      }
    })
  })
}

export type DailyDigest = Record<string, Record<'due_soon' | 'due_today' | 'overdue', DailyReminderRow[]>>

export function groupDailyDigest(rows: DailyReminderRow[] = []): DailyDigest {
  return rows.reduce<DailyDigest>((groups, row) => {
    const key = cleanId(row.recipientEmployeeId)
    if (!groups[key]) groups[key] = { due_soon: [], due_today: [], overdue: [] }
    if (groups[key][row.type]) groups[key][row.type].push(row)
    return groups
  }, {})
}
