// Porte de Tela Planner/src/taskHistory.js (sem mudança de comportamento).
import type { Employee, TaskHistoryItem } from './types'

const STATUS_LABELS: Record<string, string> = { todo: 'A fazer', waiting: 'Aguardando', doing: 'Em andamento', done: 'Concluído' }

function parseObject(value: unknown): unknown {
  if (value && typeof value === 'object') return value
  try { return JSON.parse(value as string) } catch { return null }
}

function prop(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function dateLabel(value: unknown): string {
  if (!value) return 'Sem prazo'
  const text = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(value as string)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR')
}

function names(value: unknown, employees: Array<Partial<Employee>>): string {
  const list = Array.isArray(value) ? value : parseObject(value)
  if (!Array.isArray(list)) return String(value || 'Sem responsável')
  return list.map((entry: unknown) => employees.find((employee) => employee.id === entry || employee.userId === entry)?.name || entry).join(', ') || 'Sem responsável'
}

export interface TaskHistoryDetails {
  title: string
  before?: string
  after?: string
  detail?: string
}

export function taskHistoryDetails(item: TaskHistoryItem, employees: Array<Partial<Employee>> = []): TaskHistoryDetails {
  const field = item.field || ''
  const previous = item.previousValue
  const next = item.nextValue
  if (field === 'status' || field === 'quoteStatus') return {
    title: field === 'status' ? 'Status alterado' : 'Etapa da cotação alterada',
    before: previous ? STATUS_LABELS[String(previous)] || String(previous) : 'Não informado',
    after: next ? STATUS_LABELS[String(next)] || String(next) : 'Não informado',
  }
  if (field === 'dueDate' || field === 'notification:deadline') {
    const context = parseObject(next)
    const reason = prop(context, 'reason')
    return { title: 'Prazo alterado', before: dateLabel(previous), after: dateLabel(prop(context, 'nextDueDate') ?? next), detail: reason ? `Motivo: ${reason}` : '' }
  }
  if (field === 'assignees' || field === 'notification:assignees') {
    const context = parseObject(next)
    const previousIds = parseObject(previous)
    if (context && !Array.isArray(context)) {
      const added = names(prop(context, 'addedAssigneeIds') || [], employees)
      const removed = names(prop(context, 'removedAssigneeIds') || [], employees)
      return { title: 'Responsáveis alterados', detail: [added !== 'Sem responsável' ? `Adicionados: ${added}` : '', removed !== 'Sem responsável' ? `Removidos: ${removed}` : ''].filter(Boolean).join(' · ') || 'Atribuição atualizada.' }
    }
    return { title: 'Responsáveis alterados', before: names(previousIds || previous, employees), after: names(next, employees) }
  }
  if (field === 'waitingContext') return { title: 'Contexto de aguardando', detail: String(item.text || 'Contexto atualizado.') }
  return { title: String(item.text || 'Alteração registrada') }
}

export function visibleTaskHistory<H extends TaskHistoryItem>(history: H[] | null | undefined): H[] {
  return (history || []).filter((item) => !String(item.field || '').startsWith('notification:') || ['notification:deadline', 'notification:assignees'].includes(String(item.field)))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}
