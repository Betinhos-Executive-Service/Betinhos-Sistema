// Porte de Tela Planner/src/plannerImport.js (análise do JSON exportado do Microsoft Planner).
// O JSON colado ou buscado no Graph entra como `unknown` e é lido por `rec()`.

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec => (value && typeof value === 'object' ? (value as Rec) : {})

export const IMPORT_STATUS = Object.freeze({
  todo: 100000000,
  doing: 100000001,
  done: 100000003,
})

export const IMPORT_PRIORITY = Object.freeze({
  low: 100000000,
  medium: 100000001,
  high: 100000002,
  urgent: 100000003,
})

export type ImportStatus = keyof typeof IMPORT_STATUS
export type ImportPriority = keyof typeof IMPORT_PRIORITY

const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({ todo: 'A fazer', doing: 'Em andamento', done: 'Concluído' })
const PRIORITY_LABELS: Readonly<Record<string, string>> = Object.freeze({ low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' })
const MAX_IMPORTED_TAGS = 6

function collectionFrom(value: unknown, keys: string[] = []): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  const source = value as Rec
  for (const key of keys) { const item = source[key]; if (Array.isArray(item)) return item }
  if (Array.isArray(source.value)) return source.value
  return []
}

function parseJson(text: unknown, label: string): unknown {
  if (!String(text || '').trim()) return null
  try {
    return JSON.parse(text as string)
  } catch (error) {
    return { __parseError: `${label}: JSON inválido (${(error as Error).message}).` }
  }
}

function parseError(value: unknown): string {
  return String(rec(value).__parseError || '')
}

function flattenPages(input: unknown, keys: string[]): unknown[] {
  return collectionFrom(input, keys).flatMap((item) => {
    const inner = rec(item).value
    return inner && Array.isArray(inner) ? inner : [item]
  })
}

function firstNonEmpty(...values: unknown[]): string {
  return (values.find((value) => String(value ?? '').trim()) as string | undefined) || ''
}

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || String(value ?? '').trim().toLowerCase() === 'true'
}

function normalizeStatus(percentComplete: unknown): ImportStatus {
  const percent = Number(percentComplete || 0)
  if (percent >= 100) return 'done'
  if (percent > 0) return 'doing'
  return 'todo'
}

function normalizePriority(priority: unknown): ImportPriority {
  switch (Number(priority)) {
    case 1: return 'urgent'
    case 3: return 'high'
    case 9: return 'low'
    default: return 'medium'
  }
}

function normalizeMapping(input: unknown): Map<string, string> {
  const map = new Map<string, string>()
  if (Array.isArray(input)) {
    input.forEach((raw) => {
      const item = rec(raw)
      const graphUserId = firstNonEmpty(item.graphUserId, item.userId, item.microsoftId)
      const employeeId = firstNonEmpty(item.employeeId, item.dataverseEmployeeId)
      if (graphUserId && employeeId) map.set(graphUserId.toLowerCase(), employeeId)
    })
    return map
  }
  if (!input || typeof input !== 'object') return map
  Object.entries(input as Rec).forEach(([graphUserId, employeeId]) => {
    if (graphUserId.trim() && String(employeeId || '').trim()) map.set(graphUserId.toLowerCase(), String(employeeId).trim())
  })
  return map
}

export interface ImportChecklistItem { id: string; title: string; done: boolean }

function normalizeChecklist(details: unknown): ImportChecklistItem[] {
  const checklist = rec(details).checklist
  if (!checklist || typeof checklist !== 'object') return []
  return Object.entries(checklist as Rec)
    .map(([id, item]) => ({ id, title: String(rec(item).title || '').trim(), done: isTrue(rec(item).isChecked) }))
    .filter((item) => item.title)
}

function normalizeCategoryDescriptions(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(Object.entries(input as Rec).map(([key, value]) => [key, String(value || '').trim()]).filter(([, value]) => value))
}

function unwrapCategoryDescriptions(input: unknown): unknown {
  const inner = rec(input).categoryDescriptions
  if (inner && typeof inner === 'object') return inner
  return input
}

function normalizeTaskTags(task: Rec, categoryDescriptions: unknown): string[] {
  const descriptions = normalizeCategoryDescriptions(categoryDescriptions)
  const names = Object.entries(rec(task.appliedCategories))
    .filter(([, applied]) => isTrue(applied))
    .map(([category]) => descriptions[category] || descriptions[category.toLowerCase()] || '')
    .filter(Boolean)
  const seen = new Set<string>()
  return names.filter((name) => {
    const key = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, MAX_IMPORTED_TAGS)
}

function normalizeDetails(input: unknown): Map<string, Rec> {
  const entries: Array<[string, Rec]> = []
  const candidates: unknown[] = Array.isArray(input)
    ? input
    : Array.isArray(rec(input).responses)
      ? [input]
      : collectionFrom(input, ['details'])
  candidates.forEach((raw) => {
    const item = rec(raw)
    if (Array.isArray(item.responses)) {
      item.responses.forEach((rawResponse: unknown) => {
        const response = rec(rawResponse)
        const taskId = firstNonEmpty(response.id, response.taskId)
        const details = response.body
        if (taskId && details && typeof details === 'object' && Number(response.status || 200) < 300) entries.push([taskId, details as Rec])
      })
      return
    }
    const taskId = firstNonEmpty(item.taskId, item.id, item.plannerTaskId)
    const details = item.details || raw
    if (taskId && details && typeof details === 'object') entries.push([taskId, details as Rec])
  })
  return new Map(entries)
}

function hasNextPage(input: unknown): boolean {
  if (!input) return false
  if (Array.isArray(input)) return input.some((page) => Boolean(rec(page)['@odata.nextLink']))
  return Boolean(rec(input)['@odata.nextLink'])
}

export interface ImportAssignment { graphUserId: string; employeeId: string }

export interface ImportRow {
  plannerTaskId: string
  planId: string
  bucketId: string
  title: string
  description: string
  checklist: ImportChecklistItem[]
  tags: string[]
  status: ImportStatus
  statusChoice: number
  priority: ImportPriority
  priorityChoice: number
  dueDate: string | null
  assignments: ImportAssignment[]
  sourceType: 'manual'
  sourceCode: string
}

export interface PlannerImportInput {
  planId?: string
  tasksText?: string
  bucketsText?: string
  detailsText?: string
  employeeMapText?: string
  categoryDescriptions?: unknown
  categoryDescriptionsText?: string
}

export interface PlannerImportAnalysis {
  rows: ImportRow[]
  errors: string[]
  warnings: string[]
  canImport: boolean
  stats: {
    tasks: number
    buckets: number
    detailsRequired: number
    detailsLoaded: number
    checklistTaskCount: number
    taggedTaskCount: number
    assignedTasks: number
    unresolvedAssignees: number
    statusCounts: Record<string, number>
    priorityCounts: Record<string, number>
  }
  unresolvedAssignees: Array<{ graphUserId: string; taskCount: number }>
}

function uniqueById(tasks: unknown[]): Rec[] {
  return [...new Map(tasks.filter((task) => rec(task).id).map((task) => [String(rec(task).id), rec(task)])).values()]
}

export function analyzePlannerImport({ planId = '', tasksText = '', bucketsText = '', detailsText = '', employeeMapText = '', categoryDescriptions = {}, categoryDescriptionsText = '' }: PlannerImportInput = {}): PlannerImportAnalysis {
  const errors: string[] = []
  const warnings: string[] = []
  const parsedTasks = parseJson(tasksText, 'Tarefas')
  const parsedBuckets = parseJson(bucketsText, 'Buckets')
  const parsedDetails = parseJson(detailsText, 'Detalhes')
  const parsedEmployeeMap = parseJson(employeeMapText, 'Mapeamento de responsáveis')
  const parsedCategoryDescriptions = parseJson(categoryDescriptionsText, 'Descrições das categorias')
  ;[parsedTasks, parsedBuckets, parsedDetails, parsedEmployeeMap, parsedCategoryDescriptions].forEach((value) => {
    if (parseError(value)) errors.push(parseError(value))
  })

  const tasks = flattenPages(parsedTasks, ['tasks'])
  const buckets = flattenPages(parsedBuckets, ['buckets'])
  const detailsByTaskId = normalizeDetails(parsedDetails)
  const employeeMap = normalizeMapping(parsedEmployeeMap)
  const importedCategoryDescriptions = unwrapCategoryDescriptions(parsedCategoryDescriptions || categoryDescriptions)
  const bucketIds = new Set(buckets.map((bucket) => String(rec(bucket).id || '')).filter(Boolean))
  const uniqueTasks = uniqueById(tasks)
  const rows: ImportRow[] = []
  const unresolvedAssignees = new Map<string, number>()
  let detailsRequired = 0
  let detailsLoaded = 0
  let checklistTaskCount = 0
  let taggedTaskCount = 0

  uniqueTasks.forEach((task) => {
    const taskId = String(task.id)
    const details = detailsByTaskId.get(taskId)
    const needsDetails = Boolean(task.hasDescription || Number(task.checklistItemCount || 0) > 0)
    if (needsDetails) detailsRequired += 1
    if (details) detailsLoaded += 1
    const checklist = normalizeChecklist(details)
    if (checklist.length) checklistTaskCount += 1
    const tags = normalizeTaskTags(task, importedCategoryDescriptions)
    if (tags.length) taggedTaskCount += 1
    const assignments = Object.keys(rec(task.assignments)).map((graphUserId) => {
      const employeeId = employeeMap.get(graphUserId.toLowerCase()) || ''
      if (!employeeId) unresolvedAssignees.set(graphUserId, (unresolvedAssignees.get(graphUserId) || 0) + 1)
      return { graphUserId, employeeId }
    })
    rows.push({
      plannerTaskId: taskId,
      planId: String(task.planId || planId),
      bucketId: String(task.bucketId || ''),
      title: String(task.title || 'Sem título').trim(),
      description: String(details?.description || ''),
      checklist,
      tags,
      status: normalizeStatus(task.percentComplete),
      statusChoice: IMPORT_STATUS[normalizeStatus(task.percentComplete)],
      priority: normalizePriority(task.priority),
      priorityChoice: IMPORT_PRIORITY[normalizePriority(task.priority)],
      dueDate: (task.dueDateTime as string) || null,
      assignments,
      sourceType: 'manual',
      sourceCode: `MSPLANNER:${taskId}`,
    })
  })

  if (!String(planId || '').trim()) errors.push('Informe o ID do plano antes de continuar.')
  if (!uniqueTasks.length) errors.push('Cole um JSON de tarefas contendo o campo value.')
  if (hasNextPage(parsedTasks)) errors.push('A resposta contém @odata.nextLink. Cole também as páginas seguintes antes de importar.')
  if (detailsRequired > detailsLoaded) warnings.push(`Faltam detalhes de ${detailsRequired - detailsLoaded} tarefa(s). A importação continuará com descrição e checklist vazios; tente buscar os detalhes novamente antes de importar.`)
  if (unresolvedAssignees.size) errors.push(`${unresolvedAssignees.size} usuário(s) atribuído(s) não têm correspondência no mapeamento.`)
  if (buckets.length && rows.some((row) => row.bucketId && !bucketIds.has(row.bucketId))) warnings.push('Há tarefas apontando para buckets que não estão no JSON colado.')
  if (!buckets.length) warnings.push('Buckets não informados. O status será definido exclusivamente pelo percentComplete.')
  if (!detailsRequired) warnings.push('Nenhuma tarefa sinalizou descrição ou checklist para busca adicional.')

  const statusCounts = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {})
  const priorityCounts = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.priority]: (acc[row.priority] || 0) + 1 }), {})
  return {
    rows,
    errors,
    warnings,
    canImport: errors.length === 0,
    stats: {
      tasks: rows.length,
      buckets: buckets.length,
      detailsRequired,
      detailsLoaded,
      checklistTaskCount,
      taggedTaskCount,
      assignedTasks: rows.filter((row) => row.assignments.length).length,
      unresolvedAssignees: unresolvedAssignees.size,
      statusCounts,
      priorityCounts,
    },
    unresolvedAssignees: [...unresolvedAssignees.entries()].map(([graphUserId, taskCount]) => ({ graphUserId, taskCount })),
  }
}

export function importStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

export function importPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] || priority
}

export function graphQueryUrls(planId: unknown) {
  const encoded = encodeURIComponent(String(planId || '').trim())
  return {
    tasks: `https://graph.microsoft.com/v1.0/planner/plans/${encoded}/tasks`,
    buckets: `https://graph.microsoft.com/v1.0/planner/plans/${encoded}/buckets`,
    categoryDescriptions: `https://graph.microsoft.com/v1.0/planner/plans/${encoded}/details`,
    batch: 'https://graph.microsoft.com/v1.0/$batch',
    graphExplorer: 'https://developer.microsoft.com/en-us/graph/graph-explorer',
  }
}

export interface PlannerDetailBatch {
  id: number
  taskCount: number
  taskIds: string[]
  payload: { requests: Array<{ id: string; method: 'GET'; url: string }> }
}

export function plannerDetailBatches(tasksText: string = ''): { batches: PlannerDetailBatch[]; detailTaskCount?: number; error: string } {
  const parsed = parseJson(tasksText, 'Tarefas')
  if (parseError(parsed)) return { batches: [], error: parseError(parsed) }
  const tasks = flattenPages(parsed, ['tasks'])
  const uniqueTasks = uniqueById(tasks)
  const detailTasks = uniqueTasks.filter((task) => Boolean(task.hasDescription || Number(task.checklistItemCount || 0) > 0))
  const batches: PlannerDetailBatch[] = []
  for (let index = 0; index < detailTasks.length; index += 20) {
    const chunk = detailTasks.slice(index, index + 20)
    batches.push({
      id: batches.length + 1,
      taskCount: chunk.length,
      taskIds: chunk.map((task) => String(task.id)),
      payload: {
        requests: chunk.map((task) => ({
          id: String(task.id),
          method: 'GET' as const,
          url: `/planner/tasks/${encodeURIComponent(String(task.id))}/details`,
        })),
      },
    })
  }
  return { batches, detailTaskCount: detailTasks.length, error: '' }
}
