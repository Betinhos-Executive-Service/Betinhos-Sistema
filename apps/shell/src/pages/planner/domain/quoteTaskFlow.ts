// Porte de Tela Planner/src/quoteTaskFlow.js (sem mudança de comportamento).
import { localDateKey } from './management'
import type { Employee, WaitingContext } from './types'

export const QUOTE_STATUS_FLOW: readonly string[] = Object.freeze([
  'Nova',
  'Em análise pelo financeiro',
  'Aguardando informação',
  'Cotada',
  'Respondida ao cliente',
])

export const QUOTE_TERMINAL_STATUSES: readonly string[] = Object.freeze([
  'Aceita pelo cliente',
  'Perdida',
  'Cancelada',
])

// A tarefa só conclui com a decisão do cliente; enquanto a proposta está
// enviada e sem resposta ela fica em Aguardando, cobrada pelo lembrete diário.
const QUOTE_STATUS_TO_TASK_STATUS: Readonly<Record<string, string>> = Object.freeze({
  Nova: 'todo',
  'Em análise pelo financeiro': 'doing',
  'Aguardando informação': 'waiting',
  Cotada: 'doing',
  'Respondida ao cliente': 'waiting',
  'Aceita pelo cliente': 'done',
  Perdida: 'done',
  Cancelada: 'done',
})

export const CLIENT_DECISION_SUBJECT = 'Decisão do cliente sobre a proposta'
export const QUOTE_CLIENT_DECISION_RETURN = 'Esta cotação já foi enviada: registre a decisão do cliente na cotação em vez de um retorno.'
export const QUOTE_TASK_DONE_BLOCKED = 'A tarefa de cotação conclui ao registrar a decisão do cliente (aceite, recusa ou cancelamento) na cotação.'

export function isQuoteTask(task: { quoteId?: unknown; sourceType?: unknown } = {}): boolean {
  return Boolean(task.quoteId || task.sourceType === 'quote')
}

export function isQuoteTerminalStatus(status: unknown): boolean {
  return typeof status === 'string' && QUOTE_TERMINAL_STATUSES.includes(status)
}

export function taskStatusForQuoteStatus(status: unknown): string {
  return QUOTE_STATUS_TO_TASK_STATUS[String(status)] || 'todo'
}

export function quoteStatusForTaskStatus(taskStatus: unknown, currentQuoteStatus = ''): string {
  if (taskStatus === 'done' || taskStatus === 'cancelled') return currentQuoteStatus || 'Nova'
  if (taskStatus === 'waiting') return currentQuoteStatus === 'Respondida ao cliente' ? currentQuoteStatus : 'Aguardando informação'
  if (taskStatus === 'doing') return currentQuoteStatus === 'Cotada' ? 'Cotada' : 'Em análise pelo financeiro'
  return 'Nova'
}

export function addBusinessDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  let remaining = days
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1
  }
  return date.toISOString().slice(0, 10)
}

// Contexto de espera gravado na tarefa quando a proposta é enviada: quem é
// aguardado é o contato do cliente e o retorno é cobrado em 2 dias úteis.
export function clientDecisionWaitingContext(quote: { clientContact?: unknown; client?: unknown } = {}, sentAtIso?: string | number | Date): Omit<WaitingContext, 'onId'> {
  const contact = String(quote.clientContact || quote.client || 'Cliente').trim()
  const sentAt = new Date(sentAtIso as string)
  return {
    subject: CLIENT_DECISION_SUBJECT,
    onType: 'external',
    onIds: [],
    onNames: [contact],
    onName: contact,
    expectedDate: addBusinessDays(localDateKey(Number.isNaN(sentAt.getTime()) ? new Date() : sentAt), 2),
    note: '',
  }
}

// Contexto de espera da tarefa numa troca de status da cotação: entra em
// Respondida → aguarda o cliente; sai de Respondida ou encerra → limpa.
export function waitingContextForStatusChange(
  previousStatus: unknown,
  nextStatus: unknown,
  quote?: { clientContact?: unknown; client?: unknown },
  sentAtIso?: string | number | Date,
): Omit<WaitingContext, 'onId'> | Record<string, never> | undefined {
  if (nextStatus === previousStatus) return undefined
  if (nextStatus === 'Respondida ao cliente') return clientDecisionWaitingContext(quote, sentAtIso)
  if (previousStatus === 'Respondida ao cliente' || isQuoteTerminalStatus(nextStatus)) return {}
  return undefined
}

// "Iniciar cotação": vai para análise e, se ninguém está na tarefa, assume-a.
export function startQuotePatch(
  task: { assigneeIds?: string[] } | null | undefined,
  currentEmployee: Partial<Employee> | null | undefined,
): { status: string; assigneeIds?: string[]; assigneeNames?: Array<string | undefined> } {
  const unassigned = !(task?.assigneeIds || []).length && currentEmployee?.id
  return { status: 'Em análise pelo financeiro', ...(unassigned ? { assigneeIds: [String(currentEmployee.id)], assigneeNames: [currentEmployee.name] } : {}) }
}
