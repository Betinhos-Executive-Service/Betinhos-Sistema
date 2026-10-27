// Testes da V1.1: cotações antigas continuam ligadas a uma tarefa principal.
// A V2 não cria tarefa; este fixture recria esse vínculo para cobrir o legado.
import { quoteTaskTitle } from '../domain/domain'
import { createQuote, createTask, saveState, type MockState, type QuotePatch } from './mock'

export function createQuoteWithLegacyTask(state: MockState, input: QuotePatch = {}): MockState {
  const withQuote = createQuote(state, input)
  const quote = withQuote.quotes[0]
  const assigneeIds = input.assigneeIds || []
  const assigneeNames = input.assigneeNames || assigneeIds.map((id) => withQuote.employees?.find((employee) => employee.id === id)?.name).filter((value): value is string => Boolean(value))
  const withTask = createTask(withQuote, { title: quoteTaskTitle(quote), quoteId: quote.id, quoteCode: quote.code, quoteTitle: quote.title, quoteStatus: quote.status, dueDate: quote.deadline, priority: quote.priority, assigneeIds, assigneeNames, assigneeName: assigneeNames.join(', ') || 'Não atribuído', assignmentMode: 'people', teamName: 'Financeiro', description: `Acompanhar a cotação ${quote.code} até a resposta ao cliente.` })
  const taskId = withTask.tasks.find((item) => item.quoteId === quote.id && !item.parentTaskId)?.id || ''
  return saveState({ ...withTask, quotes: withTask.quotes.map((item) => item.id === quote.id ? { ...item, plannerTaskId: taskId } : item) })
}
