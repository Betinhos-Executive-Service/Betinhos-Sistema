// Porte de Tela Planner/src/mockStore.js: estado local (localStorage) usado fora do Dynamics.
// Mesmo comportamento e mesma chave de armazenamento do Planner antigo.
import {
  migrateLegacyTeams,
  canRegisterWaitingReturn,
  normalizeAssigneeNames,
  normalizeText,
  normalizeWaitingContext,
  normalizePersonalTag,
  normalizePersonalTagIds,
  PERSONAL_TAG_COLORS,
  resolveTaskAssignment,
  validateTeamComposition,
  STATUSES,
  validatePersonalTag,
  validateWaitingContext,
  waitingContextSummary,
  isAutomaticQuoteTaskTitle,
  isAutomaticQuoteTitle,
  quoteTaskTitle,
} from '../domain/domain'
import { dailyReminderRows, notificationDedupeKey, notificationRecipients } from '../domain/notifications'
import { localDateKey, manualCollectionKey } from '../domain/management'
import {
  CONTACT_CHANNELS,
  canTransitionContactStatus,
  createContactEvent,
  createContactPayload,
  normalizeContact,
  validateContact,
} from '../domain/contactDomain'
import { isQuoteTask, isQuoteTerminalStatus, QUOTE_CLIENT_DECISION_RETURN, QUOTE_TASK_DONE_BLOCKED, quoteStatusForTaskStatus, taskStatusForQuoteStatus, waitingContextForStatusChange } from '../domain/quoteTaskFlow'
import { financeMemberIds, followUpNotices, isLossReason, readyNotice, urgentNotices, type QuoteNotice } from '../domain/quoteNotifications'
import { applyDerivedStatus, buildQuoteEmailHtml, buildQuotePlainText, lastProposalSentAt, normalizeQuoteRoute, QUOTE_COMPLETED_STATUSES, quoteRoutePoints, validateQuoteCommercial } from '../domain/quoteDomain'
import type { NormalizedContact } from '../domain/contactDomain'
import { createQuoteProposalVersion, normalizeQuoteOptions, prepareQuoteProposal, prepareQuoteResponse, resolveQuoteAcceptance } from '../domain/quoteScenarios'
import type {
  Employee,
  PersonalTag,
  PlannerNotification,
  QuoteData,
  QuoteOptionData,
  QuoteProposalVersion,
  Task,
  TaskAttachment,
  TaskComment,
  TaskHistoryItem,
  WaitingContext,
  WaitingContextInput,
} from '../domain/types'

export const STORAGE_KEY = 'betinhos-tela-planner-mock-v3-calendar'

// --- Tipos do estado local -------------------------------------------------

export interface MockChecklistItem {
  id?: string
  title?: string
  done?: boolean
  [extra: string]: unknown
}

export interface MockTask extends Task {
  assigneeNames: string[]
  comments: TaskComment[]
  attachments: TaskAttachment[]
  history: TaskHistoryItem[]
  checklist?: MockChecklistItem[]
  labels?: string[]
  contactId?: string
  whatsappIntakeKey?: string
}

export interface MockQuote extends QuoteData {
  responseSent?: boolean
  createdAt?: string
  plannerTaskId?: string
  channel?: string
  hasReturn?: boolean
  waitingContext?: WaitingContextInput
}

// Alias (e não interface) para aceitar o ContactEvent do domínio sem assinatura de índice.
export type MockContactEvent = {
  id: string
  type?: string
}

export type MockContactNote = {
  id?: string
  text?: string
  author?: string
  createdAt?: string
}

export type MockContact = {
  id: string
  subject?: string
  senderName?: string
  senderPhone?: string
  senderEmail?: string
  channel?: string
  status?: string
  priority?: string
  summary?: string
  assignmentMode?: string
  teamIds?: string[]
  teamNames?: string[]
  teamId?: string
  teamName?: string
  assigneeIds?: string[]
  assigneeNames?: string[]
  assigneeName?: string | string[]
  ownerEmployeeId?: string
  ownerName?: string
  dueDate?: string
  waitingNote?: string
  resolutionOutcome?: string
  notes?: MockContactNote[]
  internalNotes?: MockContactNote[]
  history?: MockContactEvent[]
  attachments?: TaskAttachment[]
  linkedTaskIds?: string[]
  archivedAt?: string
  updatedAt?: string
  [extra: string]: unknown
}

/** O domínio tipa notas, histórico e anexos como unknown[]; no mock eles vêm sempre das funções acima. */
const asMockContact = (contact: NormalizedContact): MockContact => contact as Omit<NormalizedContact, 'notes' | 'internalNotes' | 'history' | 'attachments'> as MockContact

export interface MockNotification extends PlannerNotification {
  contactId?: string
  quoteId?: string
  title?: string
  message?: string
  occurredAt?: string
  referenceDate?: string
  dedupeKey?: string
}

export interface MockCollectionEvent {
  id?: string
  taskId?: string
  referenceDate?: string
  [extra: string]: unknown
}

export interface MockQualityItem {
  id: string
  type: string
  code: string
  title: string
  description: string
  status: string
  dueDate: string
  assigneeName: string
}

// Alias para aceitar o LegacyTeam do domínio (interface sem assinatura de índice).
export type MockTeam = {
  id: string
  name: string
  memberIds?: string[]
  members?: string[]
  primaryMemberId?: string
  iconName?: string
}

export interface MockState {
  tasks: MockTask[]
  quotes: MockQuote[]
  employees: Employee[]
  teams?: MockTeam[]
  contacts?: MockContact[]
  notifications?: MockNotification[]
  personalTags?: PersonalTag[]
  personalTagAssignments?: Array<{ id?: string; tagId?: string; [extra: string]: unknown }>
  collectionEvents?: MockCollectionEvent[]
  quality?: MockQualityItem[]
  currentUserId?: string
  currentUserName?: string
  lastUpdated?: string
  [extra: string]: unknown
}

/** Entrada de criação de tarefa (formulários, cotações, importação, WhatsApp). */
export type TaskInput = {
  title: string
  description?: string
  status?: string
  priority?: string
  dueDate?: string
  parentTaskId?: string | null
  quoteId?: string | null
  quoteCode?: string
  quoteTitle?: string
  quoteStatus?: string
  sourceType?: string
  sourceId?: string | null
  sourceLabel?: string
  sourceCode?: string
  assignmentMode?: string
  teamIds?: string[]
  teamId?: string
  teamNames?: string[]
  teamName?: string
  assigneeIds?: string[]
  assigneeNames?: string[]
  assigneeName?: string | string[]
  primaryAssigneeId?: string
  consultantIds?: string[]
  actorEmployeeId?: string
  actorUserId?: string
  restrictedVisibility?: boolean
  contactId?: string
  waitingContext?: WaitingContextInput
  checklist?: MockChecklistItem[]
  personalTagIds?: string[]
  whatsappIntakeKey?: string
}

/** Patch de tarefa: campos da tarefa mais metadados do ator e da cotação. */
export type TaskPatch = Partial<MockTask> & {
  actorEmployeeId?: string
  actorUserId?: string
  actorName?: string
  mentionedEmployeeIds?: string[]
  responseSent?: boolean
  value?: string
  commercialTerms?: string
}

export interface QuotePatch extends Partial<MockQuote> {
  actorEmployeeId?: string
  /** V2: destinatários do aviso de cotação urgente; sem isso, membros da equipe Financeiro. */
  financeIds?: string[]
  /** Data de hoje (yyyy-mm-dd) para a regra de urgência; padrão: hoje local. */
  today?: string
  assigneeIds?: string[]
  assigneeNames?: string[]
}

export interface ContactInput extends Partial<MockContact> {
  actorEmployeeId?: string
  actorName?: string
  transferReason?: string
  message?: string
  lastMessage?: string
  lastMessageAt?: string
  externalConversationId?: string
  sourceUrl?: string
}

export interface FileLike {
  name?: string
  type?: string
  size?: number
}

export interface AttachmentInput {
  name?: string
  mimeType?: string
  size?: number
  previewUrl?: string
}

// --- Utilitários ------------------------------------------------------------

const dateFromToday = (offset: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return localDateKey(date)
}

const uid = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const lastOf = <T>(items: readonly T[]): T | undefined => items[items.length - 1]

const MOCK_IMAGE_PREVIEWS = {
  vehicle: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#dce7e8"/><rect y="390" width="960" height="250" fill="#b4c5c6"/><circle cx="150" cy="130" r="76" fill="#f5c56b"/><path d="M0 420 Q180 300 360 405 T720 380 T960 410 V640 H0Z" fill="#82999a"/><rect x="180" y="300" width="600" height="145" rx="28" fill="#172b35"/><path d="M270 300 L360 215 H600 L690 300Z" fill="#274753"/><rect x="385" y="235" width="185" height="62" rx="8" fill="#9bb8bd"/><circle cx="310" cy="450" r="58" fill="#15232a"/><circle cx="650" cy="450" r="58" fill="#15232a"/><circle cx="310" cy="450" r="25" fill="#ccd7d8"/><circle cx="650" cy="450" r="25" fill="#ccd7d8"/><text x="44" y="570" fill="#ffffff" font-family="Arial" font-size="30" font-weight="700">EVIDÊNCIA · VEÍCULO EXECUTIVO</text></svg>')}`,
  document: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#f1eee8"/><rect x="225" y="62" width="510" height="516" rx="12" fill="#ffffff" stroke="#d4cbbd" stroke-width="5"/><rect x="275" y="125" width="260" height="22" rx="11" fill="#253d46"/><rect x="275" y="190" width="410" height="13" rx="6" fill="#d9d4cb"/><rect x="275" y="225" width="350" height="13" rx="6" fill="#d9d4cb"/><rect x="275" y="290" width="410" height="115" rx="9" fill="#e8f0ed"/><path d="M320 360 l48 -48 35 31 52 -59 77 81" fill="none" stroke="#2d796f" stroke-width="13"/><circle cx="590" cy="160" r="30" fill="#d9a441"/><text x="275" y="490" fill="#68777a" font-family="Arial" font-size="25">COMPROVANTE DE SERVIÇO</text></svg>')}`,
}

// --- Semente ---------------------------------------------------------------

interface SeedContext {
  waitingContext?: WaitingContextInput
  sourceType?: string
  sourceId?: string
  sourceLabel?: string
  sourceCode?: string
  checklist?: MockChecklistItem[]
  personalTagIds?: string[]
  restrictedVisibility?: boolean
  comments?: TaskComment[]
  returns?: TaskComment[]
  attachments?: TaskAttachment[]
  history?: TaskHistoryItem[]
}

export function seedState(): MockState {
  const quotes: MockQuote[] = [
    { id: 'quote-1008', code: 'COT-1008', title: 'Transfer executivo · Aeroporto GRU', client: 'Grupo Horizonte', clientId: 'mock-client-Grupo Horizonte', clientContact: 'Marina Alves', clientEmail: 'marina@grupohorizonte.example', clientPhone: '(11) 99999-1008', status: 'Em análise pelo financeiro', deadline: dateFromToday(0), value: 'R$ 1.280,00' },
    { id: 'quote-1007', code: 'COT-1007', title: 'Van executiva · Evento corporativo', client: 'Norte & Sul Eventos', clientId: 'mock-client-Norte & Sul Eventos', clientContact: 'Rafael Lima', clientEmail: 'rafael@nortesul.example', clientPhone: '(11) 99999-1007', status: 'Aguardando informação', deadline: dateFromToday(2), value: 'R$ 4.950,00' },
    { id: 'quote-1006', code: 'COT-1006', title: 'Carro blindado · Diretoria', client: 'Alvorada Capital', clientId: 'mock-client-Alvorada Capital', clientContact: 'Camila Torres', clientEmail: 'camila@alvoradacapital.example', clientPhone: '(11) 99999-1006', status: 'Em análise pelo financeiro', deadline: dateFromToday(1), value: 'R$ 2.400,00' },
    { id: 'quote-1005', code: 'COT-1005', title: 'Recepção de convidados · Congonhas', client: 'Casa 9 Produções', status: 'Respondida ao cliente', deadline: dateFromToday(-1), value: 'R$ 860,00' },
    { id: 'quote-1004', code: 'COT-1004', title: 'Roadshow executivo · São Paulo e Campinas', client: 'Vértice Tecnologia', status: 'Nova', deadline: dateFromToday(3), value: 'R$ 8.740,00' },
    { id: 'quote-1003', code: 'COT-1003', title: 'Traslado de palestrantes · Expo Center Norte', client: 'Mosaico Eventos', status: 'Em análise pelo financeiro', deadline: dateFromToday(4), value: 'R$ 3.260,00' },
    { id: 'quote-1002', code: 'COT-1002', title: 'Disposição diária · Alphaville', client: 'Lumen Energia', status: 'Aguardando informação', deadline: dateFromToday(5), value: 'R$ 6.180,00' },
    { id: 'quote-1001', code: 'COT-1001', title: 'Transfer internacional · GRU–Faria Lima', client: 'Kairós Health', status: 'Nova', deadline: dateFromToday(1), value: 'R$ 1.960,00' },
    { id: 'quote-0999', code: 'COT-0999', title: 'Transporte de equipe · Guarujá', client: 'Aurora Produções', status: 'Respondida ao cliente', deadline: dateFromToday(-3), value: 'R$ 5.480,00' },
    { id: 'quote-0998', code: 'COT-0998', title: 'Transfer para conselho · Itaim Bibi', client: 'Orbe Consultoria', status: 'Em análise pelo financeiro', deadline: dateFromToday(0), value: 'R$ 2.150,00' },
    { id: 'quote-0997', code: 'COT-0997', title: 'Operação de embarque · Viracopos', client: 'Delta Foods', status: 'Nova', deadline: dateFromToday(6), value: 'R$ 3.890,00' },
    { id: 'quote-0996', code: 'COT-0996', title: 'Apoio logístico · Hotel Fasano', client: 'Estação 21', status: 'Respondida ao cliente', deadline: dateFromToday(-5), value: 'R$ 1.740,00' },
    { id: 'quote-0995', code: 'COT-0995', title: 'Transfer de executivos · São José dos Campos', client: 'Nexa Industrial', status: 'Nova', deadline: dateFromToday(7), value: 'R$ 4.620,00' },
    { id: 'quote-0994', code: 'COT-0994', title: 'Frota dedicada · Convenção anual', client: 'Pilar Seguros', status: 'Em análise pelo financeiro', deadline: dateFromToday(8), value: 'R$ 12.900,00' },
    { id: 'quote-0993', code: 'COT-0993', title: 'Recepção VIP · Hotel Unique', client: 'Leste Mídia', status: 'Aguardando informação', deadline: dateFromToday(2), value: 'R$ 2.780,00' },
    { id: 'quote-0992', code: 'COT-0992', title: 'Transfer noturno · Santos–GRU', client: 'Maré Logística', status: 'Nova', deadline: dateFromToday(9), value: 'R$ 2.340,00' },
    { id: 'quote-0991', code: 'COT-0991', title: 'Veículo executivo · Diretoria regional', client: 'Horizon Bio', status: 'Respondida ao cliente', deadline: dateFromToday(-7), value: 'R$ 7.350,00' },
  ]
  const tasks: MockTask[] = [
    task('task-1', 'Preparar proposta comercial', 'quote-1008', 'COT-1008', 'Transfer executivo · Aeroporto GRU', 'doing', 'high', 'Marina Alves', 'Comercial', dateFromToday(0), 'Revisar composição de preço e confirmar janela de embarque.'),
    task('task-2', 'Confirmar disponibilidade de veículo', 'quote-1007', 'COT-1007', 'Van executiva · Evento corporativo', 'waiting', 'medium', 'Rafael Lima', 'Operação', dateFromToday(2), 'Aguardando confirmação do parceiro para a segunda van.', null, { waitingContext: { subject: 'confirmação da segunda van', onType: 'team', onId: 'Operação', onName: 'Operação', expectedDate: dateFromToday(2), note: 'Parceiro ainda não confirmou a disponibilidade.' } }),
    task('task-3', 'Validar margem da proposta', 'quote-1008', 'COT-1008', 'Transfer executivo · Aeroporto GRU', 'todo', 'medium', 'Camila Torres', 'Financeiro', dateFromToday(1), 'Validar margem mínima antes de enviar ao cliente.', 'task-1'),
    task('task-4', 'Selecionar motorista de apoio', 'quote-1006', 'COT-1006', 'Carro blindado · Diretoria', 'todo', 'high', 'João Mendes', 'Operação', dateFromToday(1), 'Separar duas opções de motorista habilitado.', 'task-5'),
    task('task-5', 'Montar cotação do carro blindado', 'quote-1006', 'COT-1006', 'Carro blindado · Diretoria', 'doing', 'high', 'Marina Alves', 'Comercial', dateFromToday(1), 'Compor o valor final com deslocamento e espera.'),
    task('task-6', 'Registrar resposta enviada', 'quote-1005', 'COT-1005', 'Recepção de convidados · Congonhas', 'done', 'low', 'Camila Torres', 'Comercial', dateFromToday(-1), 'Resposta enviada e registrada no histórico.'),
    task('task-7', 'Validar causa do erro operacional', null, 'QAL-204', 'Atraso na confirmação do fornecedor', 'waiting', 'high', 'Rafael Lima', 'Qualidade', dateFromToday(1), 'Confirmar causa e registrar ação corretiva.', null, { sourceType: 'quality', sourceId: 'quality-error-204', sourceLabel: 'Erro operacional', sourceCode: 'QAL-204' }),
    task('task-8', 'Abrir ordem de serviço do roadshow', 'quote-1004', 'COT-1004', 'Roadshow executivo · São Paulo e Campinas', 'todo', 'high', 'Marina Alves', 'Operação', dateFromToday(3), 'Criar a OS com as quatro janelas de atendimento e pontos de apoio.'),
    task('task-9', 'Conferir rota São Paulo–Campinas', 'quote-1004', 'COT-1004', 'Roadshow executivo · São Paulo e Campinas', 'doing', 'high', 'João Mendes', 'Operação', dateFromToday(2), 'Validar pedágios, tempo de deslocamento e janela de retorno.', 'task-8'),
    task('task-10', 'Solicitar dados dos passageiros', 'quote-1004', 'COT-1004', 'Roadshow executivo · São Paulo e Campinas', 'waiting', 'medium', 'Camila Torres', 'Comercial', dateFromToday(1), 'Consolidar nomes, celulares e restrições alimentares.', 'task-8'),
    task('task-11', 'Confirmar credenciamento dos palestrantes', 'quote-1003', 'COT-1003', 'Traslado de palestrantes · Expo Center Norte', 'doing', 'medium', 'Camila Torres', 'Comercial', dateFromToday(3), 'Conferir horários de chegada e saída com produção.'),
    task('task-12', 'Reservar van de 15 lugares', 'quote-1003', 'COT-1003', 'Traslado de palestrantes · Expo Center Norte', 'todo', 'high', 'Rafael Lima', 'Operação', dateFromToday(2), 'Bloquear veículo com porta-malas compatível com equipamentos.', 'task-11'),
    task('task-13', 'Revisar diária em Alphaville', 'quote-1002', 'COT-1002', 'Disposição diária · Alphaville', 'waiting', 'medium', 'Marina Alves', 'Financeiro', dateFromToday(4), 'Recalcular hora extra e franquia de quilometragem.'),
    task('task-14', 'Validar motorista bilíngue', 'quote-1001', 'COT-1001', 'Transfer internacional · GRU–Faria Lima', 'todo', 'high', 'João Mendes', 'Operação', dateFromToday(1), 'Confirmar inglês fluente e experiência com passageiros estrangeiros.'),
    task('task-15', 'Enviar condições comerciais', 'quote-0998', 'COT-0998', 'Transfer para conselho · Itaim Bibi', 'doing', 'high', 'Marina Alves', 'Comercial', dateFromToday(0), 'Enviar proposta com política de espera e cancelamento.'),
    task('task-16', 'Registrar aceite do cliente', 'quote-0999', 'COT-0999', 'Transporte de equipe · Guarujá', 'done', 'medium', 'Camila Torres', 'Comercial', dateFromToday(-2), 'Aceite registrado por e-mail e repassado para a operação.'),
    task('task-17', 'Conferir placa e documentação', 'quote-0999', 'COT-0999', 'Transporte de equipe · Guarujá', 'done', 'high', 'Rafael Lima', 'Operação', dateFromToday(-2), 'Documentos conferidos antes do embarque.', 'task-16'),
    task('task-18', 'Acompanhar retorno sobre embarque', 'quote-0997', 'COT-0997', 'Operação de embarque · Viracopos', 'todo', 'medium', 'Rafael Lima', 'Operação', dateFromToday(5), 'Confirmar terminal, acesso e contato do coordenador local.'),
    task('task-19', 'Enviar comprovante de serviço', 'quote-0996', 'COT-0996', 'Apoio logístico · Hotel Fasano', 'done', 'low', 'Camila Torres', 'Financeiro', dateFromToday(-4), 'Comprovante enviado e anexado ao histórico.'),
  ]
  const recurringTasks: Array<[string, string, string | null, string, string, string | string[], string, number]> = [
    ['20', 'Conferir janela de chegada no terminal', 'quote-0995', 'todo', 'medium', 'Rafael Lima', 'Operação', 7],
    ['21', 'Validar cobrança de pedágios', 'quote-0995', 'todo', 'low', 'Camila Torres', 'Financeiro', 8],
    ['22', 'Montar escala da convenção', 'quote-0994', 'doing', 'high', 'João Mendes', 'Operação', 6],
    ['23', 'Confirmar quantidade de veículos', 'quote-0994', 'waiting', 'high', 'Rafael Lima', 'Operação', 5],
    ['24', 'Revisar contrato de disponibilidade', 'quote-0994', 'todo', 'medium', 'Marina Alves', 'Comercial', 8],
    ['25', 'Enviar briefing para recepção VIP', 'quote-0993', 'doing', 'medium', 'Camila Torres', 'Comercial', 1],
    ['26', 'Confirmar equipe de aeroporto', 'quote-0993', 'waiting', 'high', 'João Mendes', 'Operação', 2],
    ['27', 'Definir protocolo de embarque noturno', 'quote-0992', 'todo', 'high', 'Rafael Lima', 'Qualidade', 8],
    ['28', 'Checar adicional de madrugada', 'quote-0992', 'todo', 'medium', 'Marina Alves', 'Financeiro', 9],
    ['29', 'Arquivar aceite da diretoria', 'quote-0991', 'done', 'low', 'Camila Torres', 'Comercial', -6],
    ['30', 'Atualizar quadro de disponibilidade', null, 'doing', 'medium', 'Rafael Lima', 'Operação', 0],
    ['31', 'Conferir certificados dos veículos', null, 'waiting', 'high', 'João Mendes', 'Qualidade', 1],
    ['32', 'Revisar tabela de parceiros', null, 'todo', 'medium', 'Marina Alves', 'Financeiro', 4],
    ['33', 'Distribuir escala do fim de semana', null, 'done', 'low', 'Camila Torres', 'Operação', -1],
    ['34', 'Registrar retorno do cliente', null, 'todo', 'medium', 'Não atribuído', 'Comercial', 3],
    ['35', 'Tratar divergência de quilometragem', null, 'waiting', 'high', 'Marina Alves', 'Qualidade', -2],
    ['36', 'Solicitar segunda via do comprovante', null, 'todo', 'low', 'Camila Torres', 'Financeiro', 5],
    ['37', 'Validar plano de contingência', null, 'doing', 'high', ['João Mendes', 'Rafael Lima'], 'Qualidade', 2],
    ['38', 'Confirmar contato de plantão', null, 'done', 'medium', 'Rafael Lima', 'Operação', -3],
    ['39', 'Reabrir negociação de horário', 'quote-1007', 'todo', 'high', 'Marina Alves', 'Comercial', 2],
  ]
  recurringTasks.forEach(([id, title, quoteId, status, priority, assignee, team, dueOffset]) => {
    const quote = quotes.find((item) => item.id === quoteId)
    tasks.push(task(`task-${id}`, title, quoteId, quote?.code || 'OPS', quote?.title || 'Rotina operacional interna', status, priority, assignee, team, dateFromToday(dueOffset), `Executar ${title.toLocaleLowerCase('pt-BR')} e registrar evidência no histórico.`))
  })
  tasks.push(
    task('task-40', 'Revisar pendências prioritárias do dia', null, 'OPS-040', 'Rotina operacional interna', 'doing', 'high', 'Renan Martins', 'Comercial', dateFromToday(0), 'Consolidar pendências críticas, cobrar responsáveis e registrar próximos passos.'),
    task('task-41', 'Aprovar mensagem para cliente estratégico', 'quote-1004', 'COT-1004', 'Roadshow executivo · São Paulo e Campinas', 'todo', 'high', 'Renan Martins', 'Comercial', dateFromToday(1), 'Validar texto final antes do envio ao cliente e registrar a decisão.', 'task-40'),
    task('task-42', 'Acompanhar retorno do fornecedor', 'quote-1007', 'COT-1007', 'Van executiva · Evento corporativo', 'waiting', 'medium', ['Renan Martins', 'Rafael Lima'], 'Operação', dateFromToday(1), 'Cobrar disponibilidade da segunda van e atualizar a equipe.', null, { waitingContext: { subject: 'disponibilidade da segunda van', onType: 'employee', onId: 'employee-rafael', onName: 'Rafael Lima', expectedDate: dateFromToday(1), note: 'Registrar o retorno e atualizar a equipe.' } }),
    task('task-43', 'Revisar comentário da ocorrência QAL-205', null, 'QAL-205', 'Divergência de quilometragem faturada', 'todo', 'medium', 'Renan Martins', 'Qualidade', dateFromToday(2), 'Ler evidências, validar a tratativa e encaminhar decisão.', null, { sourceType: 'quality', sourceId: 'quality-error-205', sourceLabel: 'Erro operacional', sourceCode: 'QAL-205' }),
    task('task-44', 'Confirmar fechamento semanal', null, 'OPS-044', 'Rotina operacional interna', 'done', 'low', 'Renan Martins', 'Financeiro', dateFromToday(-1), 'Conferir se todas as tarefas críticas têm evidência e responsável.'),
  )
  const seedNow = new Date().toISOString()
  const seedExecutionActor = (id: string, actorId: string, actorUserId: string, actorName: string, minutesAgo: number): void => {
    const item = tasks.find((taskItem) => taskItem.id === id)
    if (!item || item.status !== 'doing') return
    const occurredAt = new Date(Date.now() - minutesAgo * 60000).toISOString()
    item.history = [...(item.history || []), {
      id: `${id}-execution-seed`,
      text: 'Status alterado para Em andamento.',
      createdAt: occurredAt,
      author: actorName,
      authorId: actorId,
      authorUserId: actorUserId,
      field: 'status',
      previousValue: 'todo',
      nextValue: 'doing',
    }]
  }
  seedExecutionActor('task-1', 'employee-marina', 'user-marina', 'Marina Alves', 28)
  seedExecutionActor('task-22', 'employee-joao', 'user-joao', 'João Mendes', 74)
  seedExecutionActor('task-40', 'employee-renan', 'user-renan', 'Renan Martins', 9)
  const enrichTask = (id: string, comments: string[] = [], attachments: Array<string | AttachmentInput> = [], history: string[] = []): void => {
    const item = tasks.find((taskItem) => taskItem.id === id)
    if (!item) return
    item.comments = comments.map((text, index) => ({ id: `${id}-comment-${index + 1}`, text, createdAt: seedNow, author: index ? 'Rafael Lima' : 'Camila Torres' }))
    item.attachments = attachments.map((attachment, index) => {
      const input: AttachmentInput = typeof attachment === 'string' ? { name: attachment } : attachment
      return { id: `${id}-file-${index + 1}`, name: input.name, mimeType: input.mimeType || '', size: input.size || 0, previewUrl: input.previewUrl || '', createdAt: seedNow }
    })
    item.history = [...item.history, ...history.map((text, index) => ({ id: `${id}-history-${index + 1}`, text, createdAt: seedNow, author: index ? 'Sistema' : 'Marina Alves' }))]
  }
  enrichTask('task-1', ['Cliente pediu confirmação da janela de embarque antes do envio.', 'Margem revisada; falta apenas validar a política de espera.'], ['briefing-grupo-horizonte.pdf', 'composicao-cotacao-1008.xlsx'], ['Responsável alterado para Marina Alves.', 'Cotação vinculada ao Planner.'])
  enrichTask('task-7', ['Fornecedor informou indisponibilidade do veículo originalmente reservado.'], ['registro-contato-fornecedor.msg', { name: 'foto-veiculo-executivo.svg', mimeType: 'image/svg+xml', size: 184320, previewUrl: MOCK_IMAGE_PREVIEWS.vehicle }, { name: 'comprovante-contato.svg', mimeType: 'image/svg+xml', size: 97280, previewUrl: MOCK_IMAGE_PREVIEWS.document }], ['Ocorrência QAL-204 convertida em tarefa.', 'Tarefa marcada como aguardando.'])
  enrichTask('task-22', ['Escala inicial aprovada pela coordenação.'], ['escala-convencao-v1.xlsx'], ['Tarefa iniciada pela operação.'])
  enrichTask('task-35', [], ['relatorio-quilometragem.pdf'], ['Prazo ultrapassado; necessário registrar tratativa.'])
  enrichTask('task-40', ['Vou consolidar este quadro antes da reunião das 16h.', 'Rafael, preciso do retorno do parceiro até o fim do dia.'], ['pendencias-operacionais-2026-08-17.xlsx'], ['Tarefa atribuída ao usuário do cenário local.'])
  enrichTask('task-41', ['Mensagem revisada pelo Comercial; aguardando aprovação final.'], [], ['Criada como subtarefa da revisão diária.'])
  enrichTask('task-43', ['Evidência disponível no relatório de quilometragem.'], ['relatorio-quilometragem-qal-205.pdf'], ['Vinculada à ocorrência QAL-205.'])
  const mockAttachmentVariants = [
    { name: 'evidencia-operacional.svg', mimeType: 'image/svg+xml', size: 121856, previewUrl: MOCK_IMAGE_PREVIEWS.vehicle },
    { name: 'comprovante-servico.svg', mimeType: 'image/svg+xml', size: 106496, previewUrl: MOCK_IMAGE_PREVIEWS.document },
  ]
  const attachmentTargetCount = Math.ceil(tasks.length / 2)
  const tasksWithAttachments = tasks.filter((item) => item.attachments.length).length
  tasks.filter((item) => !item.attachments.length).slice(0, Math.max(0, attachmentTargetCount - tasksWithAttachments)).forEach((item, index) => {
    item.attachments.push({ id: `${item.id}-file-mock`, ...mockAttachmentVariants[index % mockAttachmentVariants.length], createdAt: seedNow })
  })
  const addChecklist = (id: string, items: string[]): void => {
    const item = tasks.find((taskItem) => taskItem.id === id)
    if (item) item.checklist = items.map((title, index) => ({ id: `${id}-check-${index + 1}`, title, done: index === items.length - 1 }))
  }
  addChecklist('task-1', ['Revisar tarifa base', 'Confirmar janela de embarque', 'Validar margem', 'Enviar proposta'])
  addChecklist('task-8', ['Criar ordem de serviço', 'Conferir quatro janelas', 'Validar pontos de apoio'])
  addChecklist('task-40', ['Revisar atrasadas', 'Cobrar bloqueios', 'Atualizar próximos passos'])
  addChecklist('task-42', ['Enviar cobrança ao parceiro', 'Registrar retorno', 'Atualizar status da tarefa'])
  const employees: Employee[] = [
    { id: 'employee-marina', name: 'Marina Alves', userId: 'user-marina', externalNotificationsAvailable: true },
    { id: 'employee-rafael', name: 'Rafael Lima', userId: 'user-rafael' },
    { id: 'employee-camila', name: 'Camila Torres', userId: 'user-camila' },
    { id: 'employee-joao', name: 'João Mendes', userId: 'user-joao' },
    { id: 'employee-luiza', name: 'Luiza Prado', userId: '', externalNotificationsAvailable: false },
    { id: 'employee-gustavo', name: 'Gustavo Neri', userId: 'user-gustavo' },
    { id: 'employee-renan', name: 'Renan Martins', userId: 'user-renan', externalNotificationsAvailable: true, isMockCurrentUser: true },
  ]
  const quality: MockQualityItem[] = [
    { id: 'quality-error-204', type: 'error', code: 'QAL-204', title: 'Atraso na confirmação do fornecedor', description: 'Fornecedor respondeu após a janela combinada para o embarque.', status: 'Em tratamento', dueDate: dateFromToday(1), assigneeName: 'Rafael Lima' },
    { id: 'quality-error-205', type: 'error', code: 'QAL-205', title: 'Divergência de quilometragem faturada', description: 'Quilometragem informada não corresponde ao roteiro aprovado.', status: 'Aberto', dueDate: dateFromToday(-2), assigneeName: 'Marina Alves' },
    { id: 'quality-error-206', type: 'error', code: 'QAL-206', title: 'Veículo sem comprovante de higienização', description: 'Evidência não anexada antes do início da operação.', status: 'Em análise', dueDate: dateFromToday(3), assigneeName: 'João Mendes' },
    { id: 'quality-error-207', type: 'error', code: 'QAL-207', title: 'Passageiro aguardou no terminal incorreto', description: 'Ponto de encontro não foi confirmado no briefing final.', status: 'Aberto', dueDate: dateFromToday(4), assigneeName: 'Camila Torres' },
    { id: 'quality-error-208', type: 'error', code: 'QAL-208', title: 'Nota fiscal enviada sem pedido', description: 'Documento fiscal precisa ser associado à cotação correta.', status: 'Concluído', dueDate: dateFromToday(-4), assigneeName: 'Marina Alves' },
    { id: 'quality-action-301', type: 'action', code: 'ACT-301', title: 'Padronizar checklist de aeroporto', description: 'Criar checklist único para GRU, CGH e VCP.', status: 'Em andamento', dueDate: dateFromToday(5), assigneeName: 'João Mendes' },
    { id: 'quality-action-302', type: 'action', code: 'ACT-302', title: 'Atualizar roteiro de contingência', description: 'Documentar alternativas para interdições e atrasos.', status: 'Aberto', dueDate: dateFromToday(6), assigneeName: 'Rafael Lima' },
    { id: 'quality-action-303', type: 'action', code: 'ACT-303', title: 'Treinar confirmação de passageiros', description: 'Reforçar confirmação D-1 e D-0 com a equipe comercial.', status: 'Planejado', dueDate: dateFromToday(8), assigneeName: 'Camila Torres' },
  ]
  employees.forEach((employee) => { employee.externalNotificationsAvailable ??= Boolean(employee.userId) })
  tasks.forEach((item) => {
    item.creatorUserId ||= 'user-renan'
    item.creatorEmployeeId ||= 'employee-renan'
    item.assigneeIds ||= employees.filter((employee) => item.assigneeNames.includes(employee.name)).map((employee) => employee.id)
  })
  const migrated = migrateLegacyTeams(tasks, employees, ['Comercial', 'Financeiro', 'Operação', 'Qualidade'])
  const migratedTasks = migrated.tasks as MockTask[]
  migratedTasks.forEach((item) => {
    const assignment = resolveTaskAssignment({ ...item, assignmentMode: item.assignmentMode, teamIds: item.teamIds, teamId: item.teamId }, migrated.teams, employees)
    item.assignmentMode = assignment.assignmentMode
    item.teamIds = assignment.teamIds
    item.teamNames = assignment.teamNames
    item.teamId = assignment.teamId
    item.teamName = assignment.teamName
    item.assigneeName = item.assigneeNames.join(', ')
  })
  const contacts: MockContact[] = [
    asMockContact(normalizeContact({
      id: 'contact-001',
      subject: 'Confirmação de embarque para diretoria',
      senderName: 'Mariana Costa',
      senderPhone: '+55 11 98888-1200',
      channel: 'whatsapp',
      receivedAt: new Date(Date.now() - 32 * 60000).toISOString(),
      lastMessageAt: new Date(Date.now() - 8 * 60000).toISOString(),
      summary: 'Cliente solicita confirmação do motorista e da janela de embarque.',
      lastMessage: 'Conseguem confirmar o nome do motorista ainda hoje?',
      priority: 'high',
      ownerEmployeeId: 'employee-renan',
      ownerName: 'Renan Martins',
      dueDate: dateFromToday(0),
      quoteId: 'quote-1008',
      notes: [{ id: 'contact-note-001', text: 'Priorizar antes da reunião das 16h.', author: 'Você', createdAt: new Date(Date.now() - 20 * 60000).toISOString() }],
      history: [createContactEvent('created', {}, { text: 'Caso recebido via WhatsApp.', author: 'Sistema' })],
    })),
    asMockContact(normalizeContact({
      id: 'contact-002',
      subject: 'Ajuste de horário do transfer',
      senderName: 'Eduardo Nogueira',
      senderEmail: 'eduardo.nogueira@vertice.example',
      channel: 'email',
      receivedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
      lastMessageAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      summary: 'Solicitação de alteração do horário de retorno do roadshow.',
      lastMessage: 'Podemos antecipar o retorno para 18h30?',
      priority: 'medium',
      status: 'in_progress',
      ownerEmployeeId: 'employee-marina',
      ownerName: 'Marina Alves',
      dueDate: dateFromToday(1),
      quoteId: 'quote-1004',
      history: [createContactEvent('created', {}, { text: 'Caso recebido por e-mail.', author: 'Sistema' })],
    })),
    asMockContact(normalizeContact({
      id: 'contact-003',
      subject: 'Retorno sobre disponibilidade de van',
      senderName: 'Carlos Ribeiro',
      senderPhone: '+55 11 97777-4433',
      channel: 'phone',
      receivedAt: new Date(Date.now() - 26 * 3600000).toISOString(),
      lastMessageAt: new Date(Date.now() - 25 * 3600000).toISOString(),
      summary: 'Fornecedor pediu retorno sobre a segunda van para o evento.',
      lastMessage: 'Ligo novamente amanhã pela manhã para confirmar.',
      priority: 'low',
      status: 'waiting',
      ownerEmployeeId: 'employee-rafael',
      ownerName: 'Rafael Lima',
      dueDate: dateFromToday(-1),
      history: [createContactEvent('created', {}, { text: 'Caso recebido por telefone.', author: 'Sistema' })],
    })),
  ]
  const notifications: MockNotification[] = [
    { id: 'notification-1', taskId: 'task-42', recipientEmployeeId: 'employee-renan', type: 'mention', title: 'Rafael mencionou você', message: 'Preciso do retorno do parceiro até o fim do dia.', occurredAt: new Date().toISOString(), readAt: '' },
    { id: 'notification-2', taskId: 'task-40', recipientEmployeeId: 'employee-renan', type: 'due_today', title: 'Tarefa vence hoje', message: 'Revisar pendências prioritárias do dia', occurredAt: new Date(Date.now() - 3600000).toISOString(), readAt: '' },
  ]
  return { quotes, tasks: migratedTasks, personalTags: [], currentUserId: 'user-renan', contacts, employees, teams: migrated.teams, quality, notifications, collectionEvents: [], lastUpdated: new Date().toISOString() }
}

function task(id: string, title: string, quoteId: string | null, quoteCode: string, quoteTitle: string, status: string, priority: string, assigneeName: string | string[], teamName: string, dueDate: string, description: string, parentTaskId: string | null = null, context: SeedContext = {}): MockTask {
  const assigneeNames = normalizeAssigneeNames(assigneeName)
  return {
    id, title, parentTaskId, quoteId, quoteCode, quoteTitle, status, priority, assigneeNames, assigneeName: assigneeNames.join(', '), teamName, dueDate,
    description, checklist: context.checklist || [], labels: [quoteCode], personalTagIds: normalizePersonalTagIds(context.personalTagIds), sourceType: quoteId ? 'quote' : 'manual', sourceId: quoteId, sourceLabel: quoteId ? 'Pedido de cotação' : 'Tarefa manual', sourceCode: quoteCode, restrictedVisibility: Boolean(context.restrictedVisibility), ...context, waitingContext: normalizeWaitingContext(context.waitingContext), comments: context.comments || [], returns: context.returns || [], attachments: context.attachments || [],
    history: context.history || [{ id: uid('history'), text: 'Tarefa criada no cenário de demonstração.', createdAt: new Date().toISOString(), author: 'Sistema' }],
  }
}

// --- Persistência -----------------------------------------------------------

export function loadState(): MockState {
  return syncQuoteFollowUps(readStoredState(), localDateKey())
}

function readStoredState(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState()
    // O JSON salvo é o próprio MockState gravado por saveState.
    const state = JSON.parse(raw) as MockState
    const normalizeStatus = <T>(status: T): T | string => status === 'Convertida em serviço' ? 'Aceita pelo cliente' : status
    if (state.teams) {
      return {
        collectionEvents: [],
        contacts: [],
        personalTags: [],
        currentUserId: 'user-renan',
        ...state,
        quotes: (state.quotes || []).map((quote) => ({ ...quote, status: normalizeStatus(quote.status) })),
        tasks: (state.tasks || []).map((taskItem) => ({ ...taskItem, quoteStatus: normalizeStatus(taskItem.quoteStatus), restrictedVisibility: Boolean(taskItem.restrictedVisibility), personalTagIds: normalizePersonalTagIds(taskItem.personalTagIds) })),
      }
    }
    const migrated = migrateLegacyTeams(state.tasks || [], state.employees || [], ['Comercial', 'Financeiro', 'Operação', 'Qualidade'])
    return {
      collectionEvents: [],
      contacts: [],
      personalTags: [],
      currentUserId: 'user-renan',
      ...state,
      quotes: (state.quotes || []).map((quote) => ({ ...quote, status: normalizeStatus(quote.status) })),
      tasks: (migrated.tasks as MockTask[]).map((taskItem) => ({ ...taskItem, quoteStatus: normalizeStatus(taskItem.quoteStatus), restrictedVisibility: Boolean(taskItem.restrictedVisibility), personalTagIds: normalizePersonalTagIds(taskItem.personalTagIds) })),
      teams: migrated.teams,
    }
  } catch {
    return seedState()
  }
}

// O hook guarda só os avisos do usuário atual e pode salvar uma cópia antiga.
// Por isso a gravação junta com o que já está salvo: não perde avisos de outros
// destinatários e não desfaz uma leitura (no mock, lido nunca volta a não lido).
function mergeStoredNotifications(notifications: MockNotification[] = []): MockNotification[] {
  let stored: MockNotification[] = []
  try { stored = (JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as MockState).notifications || [] } catch { return notifications }
  const keyOf = (item: MockNotification) => item.dedupeKey || item.id
  const storedByKey = new Map(stored.map((item) => [keyOf(item), item]))
  const merged = notifications.map((item) => {
    const previous = storedByKey.get(keyOf(item))
    return previous?.readAt && !item.readAt ? { ...item, readAt: previous.readAt } : item
  })
  const kept = new Set(merged.map(keyOf))
  return [...merged, ...stored.filter((item) => !kept.has(keyOf(item)))]
}

export function saveState<S extends MockState>(state: S): S {
  const next = { ...state, notifications: mergeStoredNotifications(state.notifications), lastUpdated: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function withDailyNotifications(state: MockState, now: Date = new Date()): MockState {
  const today = localDateKey(now)
  const rows = dailyReminderRows(state.tasks || [], state.employees || [], today)
  const existing = new Set((state.notifications || []).map((item) => item.dedupeKey).filter(Boolean))
  const additions: MockNotification[] = rows.filter((row) => !existing.has(row.dedupeKey)).map((row) => {
    const taskItem = (state.tasks || []).find((item) => item.id === row.taskId)
    const title = row.type === 'overdue' ? 'Tarefa atrasada' : row.type === 'due_today' ? 'Tarefa vence hoje' : 'Tarefa vence amanhã'
    return { id: uid('notification'), taskId: row.taskId, recipientEmployeeId: row.recipientEmployeeId, type: row.type, title, message: taskItem?.title || '', occurredAt: now.toISOString(), readAt: '', referenceDate: row.referenceDate, dedupeKey: row.dedupeKey }
  })
  return additions.length ? { ...state, notifications: [...additions, ...(state.notifications || [])] } : state
}

// --- Tarefas ----------------------------------------------------------------

export function createTask(state: MockState, input: TaskInput): MockState {
  if (input.quoteId && !input.parentTaskId) {
    const mainTask = state.tasks.find((taskItem) => taskItem.quoteId === input.quoteId && !taskItem.parentTaskId)
    if (mainTask) throw new Error('Esta cotação já possui um acompanhamento principal ativo ou encerrado.')
  }
  const sourceType = input.sourceType || (input.quoteId ? 'quote' : 'manual')
  const quote = input.quoteId ? (state.quotes || []).find((quoteItem) => quoteItem.id === input.quoteId) : null
  const managedQuoteTask = isQuoteTask(input) && !input.parentTaskId && Boolean(quote)
  const quoteStatus = managedQuoteTask ? (input.quoteStatus || quote?.status || 'Nova') : ''
  const status = managedQuoteTask ? taskStatusForQuoteStatus(quoteStatus) : (input.status || STATUSES[0].id)
  const waitingContext = normalizeWaitingContext(input.waitingContext)
  const waitingValidation = validateWaitingContext(status, waitingContext)
  if (!waitingValidation.allowed) throw new Error(waitingValidation.error)
  const assignment = resolveTaskAssignment(input, state.teams || [], state.employees || [])
  const assigneeNames = assignment.assigneeNames
  const assigneeIds = assignment.assigneeIds.length ? assignment.assigneeIds : employeeIdsByNames(state.employees, assigneeNames)
  const nextTask: MockTask = {
    id: uid('task'), parentTaskId: input.parentTaskId || null, quoteId: input.quoteId || null,
    quoteCode: input.quoteCode || '', quoteTitle: input.quoteTitle || 'Sem vínculo', title: input.title.trim(),
    status, ...(managedQuoteTask ? { quoteStatus } : {}), priority: input.priority || 'medium', assignmentMode: assignment.assignmentMode, teamIds: assignment.teamIds, teamNames: assignment.teamNames, teamId: assignment.teamId, assigneeNames, assigneeName: assigneeNames.join(', '), assigneeIds, primaryAssigneeId: assignment.primaryAssigneeId || assigneeIds[0] || '', consultantIds: assignment.consultantIds || assigneeIds.slice(1), primaryAssigneeName: assignment.primaryAssigneeName || assigneeNames[0] || '', consultantNames: assignment.consultantNames || assigneeNames.slice(1),
    creatorEmployeeId: input.actorEmployeeId || '', creatorUserId: input.actorUserId || '', restrictedVisibility: Boolean(input.restrictedVisibility), contactId: input.contactId || '',
    teamName: assignment.teamName || input.teamName || '', dueDate: input.dueDate || '', description: input.description || '', waitingContext,
    checklist: input.checklist || [], labels: input.quoteCode ? [input.quoteCode] : [], personalTagIds: normalizePersonalTagIds(input.personalTagIds), sourceType, sourceId: input.sourceId || input.quoteId || null, sourceLabel: input.sourceLabel || (sourceType === 'quality' ? 'Ação de qualidade' : sourceType === 'quote' ? 'Pedido de cotação' : 'Tarefa manual'), sourceCode: input.sourceCode || input.quoteCode || '', comments: [], attachments: [],
    whatsappIntakeKey: input.whatsappIntakeKey || '',
    history: [{ id: uid('history'), text: 'Tarefa criada no mock.', createdAt: new Date().toISOString(), author: 'Você' }],
  }
  const notifications = [...(state.notifications || [])]
  const creationNotificationType = status === 'waiting' ? 'waiting' : 'assignment'
  notificationRecipients({ type: creationNotificationType, assigneeIds, creatorEmployeeId: managedQuoteTask ? '' : nextTask.creatorEmployeeId, mentionedEmployeeIds: waitingTargetIds(state, waitingContext), actorEmployeeId: input.actorEmployeeId }).forEach((recipientEmployeeId) => {
    const message = creationNotificationType === 'waiting' ? waitingContextSummary(waitingContext) : nextTask.title
    notifications.unshift({ id: uid('notification'), taskId: nextTask.id, recipientEmployeeId, type: creationNotificationType, title: creationNotificationType === 'waiting' ? 'Retorno aguardado' : 'Nova tarefa atribuída', message, occurredAt: new Date().toISOString(), readAt: '', dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: nextTask.id, type: creationNotificationType, eventId: nextTask.id }) })
  })
  const contacts = (state.contacts || []).map((contact) => contact.id === input.contactId
    ? { ...contact, updatedAt: new Date().toISOString(), linkedTaskIds: [...new Set([...(contact.linkedTaskIds || []), nextTask.id])], history: [...(contact.history || []), createContactEvent('task', contact, { actorEmployeeId: input.actorEmployeeId })] }
    : contact)
  return saveState({ ...state, tasks: [...state.tasks, nextTask], contacts, notifications })
}

export function updateTask(state: MockState, id: string, patch: TaskPatch): MockState {
  const existing = state.tasks.find((taskItem) => taskItem.id === id)
  const quote = existing?.quoteId ? (state.quotes || []).find((quoteItem) => quoteItem.id === existing.quoteId) : null
  const quoteTask = isQuoteTask(existing || {}) && !existing?.parentTaskId && Boolean(quote)
  if (quoteTask && patch.status === 'done' && !isQuoteTerminalStatus(quote?.status)) throw new Error(QUOTE_TASK_DONE_BLOCKED)
  const currentQuoteStatus = existing?.quoteStatus || quote?.status || 'Nova'
  const nextQuoteStatus = quoteTask && (patch.quoteStatus !== undefined || patch.status !== undefined)
    ? (patch.quoteStatus !== undefined ? patch.quoteStatus : quoteStatusForTaskStatus(patch.status, currentQuoteStatus))
    : currentQuoteStatus
  if (quoteTask && patch.responseSent === true && nextQuoteStatus !== 'Respondida ao cliente') throw new Error('Envio só pode ser confirmado na cotação respondida.')
  if (quoteTask && patch.responseSent === true && !(quote?.proposalVersions || []).length) throw new Error('Registre uma versão da proposta antes de confirmar o envio.')
  if (quote && quoteTask && QUOTE_COMPLETED_STATUSES.includes(nextQuoteStatus) && (patch.status === 'done' || patch.quoteStatus !== undefined || patch.responseSent !== undefined || patch.value !== undefined || patch.commercialTerms !== undefined)) {
    const commercial = { ...quote, status: nextQuoteStatus, value: patch.value ?? quote.value, commercialTerms: patch.commercialTerms ?? quote.commercialTerms }
    const validation = validateQuoteCommercial(commercial)
    if (!validation.valid) throw new Error(Object.values(validation.errors).join(' '))
    if (nextQuoteStatus === 'Respondida ao cliente' && (patch.responseSent === false || (patch.responseSent !== true && !quote.responseSent))) throw new Error('Confirme o envio da proposta ao cliente.')
  }
  const nextStatus = patch.status ?? (quoteTask && patch.quoteStatus !== undefined
    ? taskStatusForQuoteStatus(nextQuoteStatus)
    : existing?.status)
  const waitingContext = patch.waitingContext === undefined
    ? normalizeWaitingContext(existing?.waitingContext)
    : normalizeWaitingContext(patch.waitingContext)
  const waitingValidation = validateWaitingContext(nextStatus, waitingContext)
  if (existing && existing.status !== 'waiting' && nextStatus === 'waiting' && !waitingValidation.allowed) {
    throw new Error(waitingValidation.error)
  }
  const statusChanged = nextStatus !== existing?.status
  const quoteStatusChanged = quoteTask && nextQuoteStatus !== currentQuoteStatus
  const nextResponseSent = quoteTask && patch.responseSent !== undefined
    ? Boolean(patch.responseSent)
    : nextQuoteStatus === 'Respondida ao cliente' && Boolean(quote?.responseSent)
  const quoteResponseSentChanged = quoteTask && nextResponseSent !== Boolean(quote?.responseSent)
  const waitingChanged = patch.waitingContext !== undefined && JSON.stringify(waitingContext) !== JSON.stringify(normalizeWaitingContext(existing?.waitingContext))
  const tasks = state.tasks.map((taskItem): MockTask => {
    if (taskItem.id !== id) return taskItem
    const statusChanged = nextStatus !== taskItem.status
    const waitingChanged = patch.waitingContext !== undefined && JSON.stringify(waitingContext) !== JSON.stringify(normalizeWaitingContext(taskItem.waitingContext))
    const history = [...(taskItem.history || [])]
    const occurredAt = new Date().toISOString()
    const actor = state.employees?.find((employee) => employee.id === patch.actorEmployeeId || employee.userId === patch.actorUserId)
    const actorName = actor?.name || patch.actorName || 'Executor não identificado'
    const actorId = actor?.id || patch.actorEmployeeId || ''
    if (statusChanged) history.push({ id: uid('history'), text: nextStatus === 'done' ? 'Tarefa concluída.' : `Status alterado para ${STATUSES.find((item) => item.id === nextStatus)?.label || nextStatus}.`, createdAt: occurredAt, author: actorName, authorId: actorId, authorUserId: actor?.userId || patch.actorUserId || '', field: 'status', previousValue: taskItem.status, nextValue: nextStatus })
    if (statusChanged && nextStatus === 'waiting') history.push({ id: uid('history'), text: waitingContextSummary(waitingContext), createdAt: new Date().toISOString(), author: actorName, authorId: actorId, authorUserId: actor?.userId || patch.actorUserId || '', field: 'waitingContext', previousValue: '', nextValue: waitingContext })
    if (waitingChanged && !statusChanged) history.push({ id: uid('history'), text: `Contexto de Aguardando atualizado: ${waitingContextSummary(waitingContext)}.`, createdAt: new Date().toISOString(), author: actorName, authorId: actorId, authorUserId: actor?.userId || patch.actorUserId || '', field: 'waitingContext', previousValue: '', nextValue: waitingContext })
    const assignment = patch.assignmentMode !== undefined || patch.teamIds !== undefined || patch.teamId !== undefined || patch.assigneeIds !== undefined || patch.assigneeNames !== undefined || patch.assigneeName !== undefined || patch.primaryAssigneeId !== undefined || patch.consultantIds !== undefined
      ? resolveTaskAssignment({ ...taskItem, ...patch }, state.teams || [], state.employees || [])
      : null
    const { responseSent: _responseSent, value: _value, commercialTerms: _commercialTerms, ...taskPatch } = patch
    return { ...taskItem, ...taskPatch, ...(assignment || {}), assigneeName: assignment ? assignment.assigneeNames.join(', ') : taskItem.assigneeName, status: nextStatus, ...(quoteTask ? { quoteStatus: nextQuoteStatus } : {}), waitingContext, history }
  })
  if (!existing) return saveState({ ...state, tasks })
  const next = tasks.find((taskItem) => taskItem.id === id) as MockTask
  const changes = [
    (statusChanged || quoteStatusChanged) && !(quoteTask && next.status === 'done') ? (next.status === 'waiting' ? 'waiting' : 'status') : '',
    patch.dueDate !== undefined && patch.dueDate !== existing.dueDate ? 'deadline' : '',
    waitingChanged && !statusChanged ? 'waiting' : '',
    (patch.assigneeNames !== undefined || patch.assigneeIds !== undefined || patch.primaryAssigneeId !== undefined || patch.consultantIds !== undefined || patch.assignmentMode !== undefined || patch.teamIds !== undefined || patch.teamId !== undefined) && (JSON.stringify(next.assigneeIds || []) !== JSON.stringify(existing.assigneeIds || []) || next.primaryAssigneeId !== existing.primaryAssigneeId) ? 'assignees' : '',
  ].filter(Boolean)
  const notifications = [...(state.notifications || [])]
  changes.forEach((type) => notificationRecipients({ type: type === 'assignees' && quoteTask ? 'assignment' : type, creatorEmployeeId: quoteTask ? '' : existing.creatorEmployeeId, assigneeIds: next.assigneeIds || employeeIdsByNames(state.employees, next.assigneeNames), mentionedEmployeeIds: type === 'waiting' ? waitingTargetIds(state, next.waitingContext) : [], previousAssigneeIds: existing.assigneeIds || employeeIdsByNames(state.employees, existing.assigneeNames), nextStatus: next.status, actorEmployeeId: patch.actorEmployeeId }).forEach((recipientEmployeeId) => {
    const eventId = uid('event')
    const isWaiting = type === 'waiting'
    notifications.unshift({ id: uid('notification'), taskId: id, recipientEmployeeId, type, title: isWaiting ? (waitingChanged && !statusChanged ? 'Contexto de retorno atualizado' : 'Retorno aguardado') : type === 'deadline' ? 'Prazo alterado' : type === 'status' ? 'Status alterado' : 'Responsáveis alterados', message: isWaiting ? waitingContextSummary(next.waitingContext) || next.title : next.title, occurredAt: new Date().toISOString(), readAt: '', dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: id, type, eventId }) })
  }))
  ;(patch.mentionedEmployeeIds || []).filter((employeeId) => employeeId !== patch.actorEmployeeId).forEach((recipientEmployeeId) => {
    const eventId = uid('event')
    notifications.unshift({ id: uid('notification'), taskId: id, recipientEmployeeId, type: 'mention', title: 'Você foi mencionado', message: next.title, occurredAt: new Date().toISOString(), readAt: '', dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: id, type: 'mention', eventId }) })
  })
  const quoteStatusIsTerminal = isQuoteTerminalStatus(nextQuoteStatus)
  const nextQuotes = quoteTask && (quoteStatusChanged || quoteResponseSentChanged || patch.value !== undefined || patch.commercialTerms !== undefined)
    ? state.quotes.map((quoteItem) => quoteItem.id === existing.quoteId ? {
      ...quoteItem,
      status: nextQuoteStatus,
      value: patch.value ?? quoteItem.value,
      commercialTerms: patch.commercialTerms ?? quoteItem.commercialTerms,
      responseSent: nextResponseSent,
      finalizationAt: quoteStatusIsTerminal ? (quoteItem.finalizationAt || new Date().toISOString()) : '',
      modifiedAt: new Date().toISOString(),
    } : quoteItem)
    : state.quotes
  return saveState({ ...state, tasks, notifications, quotes: nextQuotes })
}

// --- Tags pessoais ----------------------------------------------------------

export function loadPersonalTags(state: MockState, ownerUserId: string = state.currentUserId || ''): PersonalTag[] {
  return (state.personalTags || [])
    .filter((tag) => !ownerUserId || tag.ownerUserId === ownerUserId)
    .map((tag) => normalizePersonalTag(tag, ownerUserId))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'pt-BR'))
}

export interface PersonalTagInput {
  id?: string
  name?: string
  color?: string
  sortOrder?: number
  archived?: boolean
  ownerUserId?: string
}

export function createPersonalTag(state: MockState, input: PersonalTagInput = {}): MockState {
  const ownerUserId = String(input.ownerUserId || state.currentUserId || '').replace(/[{}]/g, '')
  if (!ownerUserId) throw new Error('Usuário atual não identificado para criar a tag.')
  const existing = loadPersonalTags(state, ownerUserId)
  const validation = validatePersonalTag({ ...input, ownerUserId }, existing)
  if (!validation.valid) throw new Error(validation.error)
  const tag = normalizePersonalTag({ ...validation.value, id: uid('personal-tag'), ownerUserId, sortOrder: existing.length })
  return saveState({ ...state, personalTags: [...(state.personalTags || []), tag] })
}

export function updatePersonalTag(state: MockState, id: string, patch: PersonalTagInput = {}): MockState {
  const existing = (state.personalTags || []).find((tag) => tag.id === id)
  if (!existing) throw new Error('Tag pessoal não encontrada.')
  const ownerUserId = String(existing.ownerUserId || state.currentUserId || '').replace(/[{}]/g, '')
  if (state.currentUserId && ownerUserId !== String(state.currentUserId).replace(/[{}]/g, '')) throw new Error('Tag pessoal não pertence ao usuário atual.')
  const currentTags = loadPersonalTags(state, ownerUserId)
  const validation = validatePersonalTag({ ...existing, ...patch, id, ownerUserId }, currentTags)
  if (!validation.valid) throw new Error(validation.error)
  const nextTag = normalizePersonalTag({ ...existing, ...validation.value, id, ownerUserId })
  return saveState({ ...state, personalTags: (state.personalTags || []).map((tag) => tag.id === id ? nextTag : tag) })
}

export function archivePersonalTag(state: MockState, id: string): MockState {
  const existing = (state.personalTags || []).find((tag) => tag.id === id)
  if (!existing) throw new Error('Tag pessoal não encontrada.')
  if (state.currentUserId && existing.ownerUserId !== String(state.currentUserId).replace(/[{}]/g, '')) throw new Error('Tag pessoal não pertence ao usuário atual.')
  return saveState({ ...state, personalTags: (state.personalTags || []).map((tag) => tag.id === id ? { ...tag, archived: true } : tag) })
}

export function reorderPersonalTags(state: MockState, orderedIds: string[] = []): MockState {
  const order = new Map(orderedIds.map((id, index) => [id, index]))
  const currentUserId = String(state.currentUserId || '').replace(/[{}]/g, '')
  return saveState({ ...state, personalTags: (state.personalTags || []).map((tag) => tag.ownerUserId === currentUserId && order.has(tag.id) ? { ...tag, sortOrder: order.get(tag.id) ?? tag.sortOrder } : tag) })
}

export function replaceTaskPersonalTags(state: MockState, taskId: string, tagIds: string[] = [], ownerUserId: string = state.currentUserId || ''): MockState {
  const allowedIds = new Set(loadPersonalTags(state, ownerUserId).map((tag) => tag.id))
  const nextIds = normalizePersonalTagIds(tagIds).filter((id) => allowedIds.has(id))
  return saveState({
    ...state,
    tasks: (state.tasks || []).map((taskItem) => taskItem.id === taskId ? { ...taskItem, personalTagIds: nextIds } : taskItem),
  })
}

// --- Importação do MS Planner ----------------------------------------------

export interface PlannerImportRow {
  plannerTaskId?: string
  title: string
  description?: string
  checklist?: MockChecklistItem[]
  status?: string
  priority?: string
  dueDate?: string
  sourceCode?: string
  tags?: string[]
  assignments?: Array<{ employeeId?: string }>
}

function importedTagNames(rows: PlannerImportRow[] = []): string[] {
  return [...new Map(rows.flatMap((row) => row.tags || []).map((name): [string, string] => [normalizeText(name), String(name || '').trim().slice(0, 32)]).filter(([key, name]) => key && name)).values()]
}

function ensureImportedTags(state: MockState, rows: PlannerImportRow[] = []): MockState {
  let nextState = state
  const ownerUserId = nextState.currentUserId || ''
  importedTagNames(rows).forEach((name, index) => {
    const existing = loadPersonalTags(nextState, ownerUserId).find((tag) => normalizeText(tag.name) === normalizeText(name))
    if (existing) {
      if (existing.archived) nextState = updatePersonalTag(nextState, existing.id, { archived: false })
      return
    }
    nextState = createPersonalTag(nextState, { name, color: PERSONAL_TAG_COLORS[index % PERSONAL_TAG_COLORS.length], ownerUserId })
  })
  return nextState
}

export function importPlannerTasks(state: MockState, rows: PlannerImportRow[] = []) {
  let nextState = ensureImportedTags(state, rows)
  const ownerUserId = nextState.currentUserId || ''
  const tagIdsByName = new Map(loadPersonalTags(nextState, ownerUserId).map((tag) => [normalizeText(tag.name), tag.id]))
  const results = rows.map((row) => {
    const assigneeIds = (row.assignments || []).map((assignment) => assignment.employeeId).filter((value): value is string => Boolean(value))
    const assigneeNames = assigneeIds.map((employeeId) => nextState.employees.find((employee) => employee.id === employeeId)?.name).filter((value): value is string => Boolean(value))
    const personalTagIds = (row.tags || []).map((name) => tagIdsByName.get(normalizeText(name))).filter((value): value is string => Boolean(value))
    nextState = createTask(nextState, { title: row.title, description: row.description, checklist: row.checklist, status: row.status, priority: row.priority, dueDate: row.dueDate, assigneeIds, assigneeNames, personalTagIds, sourceType: 'manual', sourceCode: row.sourceCode })
    return { plannerTaskId: row.plannerTaskId, result: 'created' }
  })
  return { nextState, results, createdCount: results.length, existingCount: 0, errorCount: 0, errors: [] as unknown[] }
}

// --- Cobrança, equipes e retornos ------------------------------------------

function teamRecipients(state: MockState, taskItem: MockTask): string[] {
  const primaryId = taskItem?.primaryAssigneeId || taskItem?.assigneeId || taskItem?.assigneeIds?.[0]
  if (primaryId) return [String(primaryId)]
  if (taskItem?.assignmentMode !== 'team') return []
  const teamIds = taskItem.teamIds || (taskItem.teamId ? [taskItem.teamId] : [])
  const team = (state.teams || []).find((item) => teamIds.some((id) => String(id) === String(item.id)))
  return team?.primaryMemberId ? [team.primaryMemberId] : team?.memberIds?.slice(0, 1) || []
}

export interface CollectInput {
  referenceDate?: string
  now?: Date
  occurredAt?: string
  actorEmployeeId?: string
  actorName?: string
}

export function collectTask(state: MockState, id: string, input: CollectInput = {}): MockState {
  const taskItem = state.tasks.find((item) => item.id === id)
  if (!taskItem || ['done', 'cancelled'].includes(taskItem.status || '')) throw new Error('A tarefa não está ativa.')
  const referenceDate = input.referenceDate || localDateKey(input.now || new Date())
  const events = state.collectionEvents || []
  if (events.some((event) => event.taskId === id && event.referenceDate === referenceDate)) {
    throw new Error('Esta tarefa já foi cobrada hoje.')
  }
  const occurredAt = input.occurredAt || new Date().toISOString()
  const recipientIds = teamRecipients(state, taskItem)
  const event: MockCollectionEvent = {
    id: uid('collection'),
    taskId: id,
    referenceDate,
    occurredAt,
    actorEmployeeId: input.actorEmployeeId || '',
    recipientIds,
    channel: 'planner+teams',
  }
  const notifications = [...(state.notifications || [])]
  const dedupeKey = manualCollectionKey(id, referenceDate)
  recipientIds.filter((recipientId) => recipientId !== input.actorEmployeeId).forEach((recipientId) => {
    notifications.unshift({
      id: uid('notification'),
      taskId: id,
      recipientEmployeeId: recipientId,
      type: 'overdue',
      title: 'Cobrança de atraso',
      message: taskItem.title,
      occurredAt,
      readAt: '',
      referenceDate,
      dedupeKey: `${dedupeKey}|${recipientId}`,
    })
  })
  const history = [...(taskItem.history || []), {
    id: uid('history'),
    text: 'Cobrança manual enviada ao responsável.',
    createdAt: occurredAt,
    author: input.actorName || 'Você',
  }]
  return saveState({
    ...state,
    collectionEvents: [...events, event],
    notifications,
    tasks: state.tasks.map((item) => item.id === id ? { ...item, history } : item),
  })
}

export function refreshTeamTaskAssignments(state: MockState, teamId: string): MockState {
  const team = (state.teams || []).find((item) => String(item.id) === String(teamId))
  if (!team) return state
  const notifications = [...(state.notifications || [])]
  const tasks = state.tasks.map((taskItem): MockTask => {
    if (taskItem.assignmentMode !== 'team' || ['done', 'cancelled'].includes(taskItem.status || '')) return taskItem
    const ids = taskItem.teamIds || (taskItem.teamId ? [taskItem.teamId] : [])
    if (!ids.some((id) => String(id) === String(teamId))) return taskItem
    const assignment = resolveTaskAssignment({ ...taskItem, teamIds: ids, assignmentMode: 'team' }, state.teams || [], state.employees || [])
    const changed = JSON.stringify(assignment.assigneeIds || []) !== JSON.stringify(taskItem.assigneeIds || [])
      || assignment.primaryAssigneeId !== taskItem.primaryAssigneeId
    if (changed) {
      const history = [...(taskItem.history || []), { id: uid('history'), text: 'Responsáveis sincronizados pela equipe.', createdAt: new Date().toISOString(), author: 'Sistema' }]
      notificationRecipients({ type: 'assignees', assigneeIds: assignment.assigneeIds, previousAssigneeIds: taskItem.assigneeIds || [] }).forEach((recipientEmployeeId) => {
        notifications.unshift({ id: uid('notification'), taskId: taskItem.id, recipientEmployeeId, type: 'assignees', title: 'Responsáveis atualizados', message: taskItem.title, occurredAt: new Date().toISOString(), readAt: '', dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: taskItem.id, type: 'assignees', eventId: lastOf(history)?.id }) })
      })
      return { ...taskItem, ...assignment, assigneeName: assignment.assigneeNames.join(', '), history }
    }
    return taskItem
  })
  return saveState({ ...state, tasks, notifications })
}

export interface WaitingReturnInput {
  text?: string
  actorEmployeeId?: string
  actorUserId?: string
  files?: Array<FileLike | null | undefined>
  mentionedEmployeeIds?: string[]
}

export function resolveWaitingReturn(state: MockState, id: string, input: WaitingReturnInput = {}): MockState {
  const existing = state.tasks.find((taskItem) => taskItem.id === id)
  if (!existing || existing.status !== 'waiting') {
    throw new Error('A tarefa não está aguardando um retorno.')
  }
  // Proposta enviada: o retorno é a decisão do cliente, registrada na cotação.
  if ((state.quotes || []).find((quote) => quote.id === existing.quoteId)?.status === 'Respondida ao cliente') throw new Error(QUOTE_CLIENT_DECISION_RETURN)
  const text = String(input.text || '').trim()
  if (!text) throw new Error('Informe o retorno recebido.')
  const actor = (state.employees || []).find((employee) =>
    employee.id === input.actorEmployeeId || employee.userId === input.actorUserId,
  )
  if (!canRegisterWaitingReturn(existing, actor, state.teams || [])) {
    throw new Error('Você não pode registrar este retorno.')
  }
  const occurredAt = new Date().toISOString()
  const returnId = uid('return')
  const returnRecord = {
    id: returnId,
    text,
    createdAt: occurredAt,
    author: actor?.name || 'Você',
    authorId: input.actorUserId || actor?.userId || '',
  }
  const attachments = (input.files || []).map((file) => ({
    id: uid('file'),
    returnId,
    name: file?.name || 'Arquivo',
    mimeType: file?.type || '',
    size: file?.size || 0,
    previewUrl: '',
    createdAt: occurredAt,
  }))
  const historyEntry = {
    id: uid('history'),
    text: 'Retorno registrado. Tarefa retomada para Em andamento.',
    createdAt: occurredAt,
    author: actor?.name || 'Você',
  }
  const tasks = state.tasks.map((taskItem): MockTask => taskItem.id === id ? {
    ...taskItem,
    status: 'doing',
    ...(isQuoteTask(taskItem) && !taskItem.parentTaskId ? { quoteStatus: 'Em análise pelo financeiro' } : {}),
    returns: [...(taskItem.returns || []), { ...returnRecord, attachments }],
    attachments: [...(taskItem.attachments || [])],
    history: [...(taskItem.history || []), historyEntry],
    waitingContext: normalizeWaitingContext(taskItem.waitingContext),
  } : taskItem)
  const next = tasks.find((taskItem) => taskItem.id === id) as MockTask
  const notifications = [...(state.notifications || [])]
  const assigneeIds = next.assigneeIds || employeeIdsByNames(state.employees, next.assigneeNames)
  notificationRecipients({
    type: 'waiting_return',
    creatorEmployeeId: isQuoteTask(existing) && !existing.parentTaskId ? '' : next.creatorEmployeeId,
    assigneeIds,
    actorEmployeeId: input.actorEmployeeId,
  }).forEach((recipientEmployeeId) => {
    const eventId = historyEntry.id
    notifications.unshift({
      id: uid('notification'),
      taskId: id,
      recipientEmployeeId,
      type: 'status',
      title: 'Retorno registrado',
      message: text,
      occurredAt,
      readAt: '',
      dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: id, type: 'waiting_return', eventId }),
    })
  })
  ;(input.mentionedEmployeeIds || []).filter((employeeId) => employeeId !== input.actorEmployeeId).forEach((recipientEmployeeId) => {
    notifications.unshift({
      id: uid('notification'),
      taskId: id,
      recipientEmployeeId,
      type: 'mention',
      title: 'Você foi mencionado',
      message: text,
      occurredAt,
      readAt: '',
      dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: id, type: 'mention', eventId: historyEntry.id }),
    })
  })
  const quotes = isQuoteTask(existing) && !existing.parentTaskId
    ? (state.quotes || []).map((quote) => quote.id === existing.quoteId ? { ...quote, status: 'Em análise pelo financeiro', modifiedAt: occurredAt } : quote)
    : state.quotes
  return saveState({ ...state, tasks, quotes, notifications })
}

export interface TeamInput {
  name?: string
  iconName?: string
  memberIds?: string[]
  primaryMemberId?: string
}

export function createTeam(state: MockState, input: TeamInput): MockState {
  const name = String(input.name || '').trim()
  if (!name) throw new Error('Informe um nome para a equipe.')
  if ((state.teams || []).some((team) => team.name.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0)) {
    throw new Error('Já existe uma equipe com esse nome.')
  }
  const memberIds = [...new Set((input.memberIds || []).filter(Boolean).map(String))]
  const composition = validateTeamComposition(memberIds, input.primaryMemberId)
  if (!composition.valid) throw new Error(composition.error)
  const team: MockTeam = { id: uid('team'), name, iconName: input.iconName || 'users', memberIds, primaryMemberId: composition.primaryMemberId }
  return saveState({ ...state, teams: [...(state.teams || []), team] })
}

export function updateTeam(state: MockState, id: string, patch: TeamInput): MockState {
  const name = String(patch.name || '').trim()
  if (!name) throw new Error('Informe um nome para a equipe.')
  if ((state.teams || []).some((team) => team.id !== id && team.name.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0)) {
    throw new Error('Já existe uma equipe com esse nome.')
  }
  const existing = (state.teams || []).find((team) => team.id === id)
  if (!existing) throw new Error('Equipe não encontrada.')
  const memberIds = [...new Set((patch.memberIds || []).filter(Boolean).map(String))]
  const composition = validateTeamComposition(memberIds, patch.primaryMemberId ?? existing.primaryMemberId)
  if (!composition.valid) throw new Error(composition.error)
  const next = saveState({
    ...state,
    teams: (state.teams || []).map((team) => team.id === id ? { ...team, name, iconName: patch.iconName || 'users', memberIds, primaryMemberId: composition.primaryMemberId } : team),
  })
  return refreshTeamTaskAssignments(next, id)
}

export function deleteTeam(state: MockState, id: string): MockState {
  if (!(state.teams || []).some((team) => team.id === id)) {
    throw new Error('Equipe não encontrada.')
  }
  return saveState({
    ...state,
    teams: (state.teams || []).filter((team) => team.id !== id),
  })
}

function employeeIdsByNames(employees: Employee[] = [], names: string[] = []): string[] {
  const wanted = new Set(normalizeAssigneeNames(names))
  return employees.filter((employee) => wanted.has(employee.name)).map((employee) => employee.id)
}

function waitingTargetIds(state: MockState, context: WaitingContextInput | WaitingContext | undefined): string[] {
  const onIds = context?.onIds
  const onNames = context?.onNames
  const targetIds: unknown[] = Array.isArray(onIds) ? onIds : context?.onId ? [context.onId] : []
  const targetNames: unknown[] = Array.isArray(onNames) ? onNames : context?.onName ? [context.onName] : []
  if (context?.onType === 'employee') return [...new Set(targetIds.filter(Boolean).map((id) => id as string))]
  return [...new Set((state.teams || [])
    .filter((team) => targetIds.some((id) => String(team.id) === String(id)) || targetNames.some((name) => String(team.name).toLocaleLowerCase('pt-BR') === String(name).toLocaleLowerCase('pt-BR')))
    .flatMap((team) => team.memberIds || []))]
}

export function deleteTask(state: MockState, id: string): MockState {
  return saveState({ ...state, tasks: state.tasks.filter((taskItem) => taskItem.id !== id) })
}

export function deleteQuote(state: MockState, id: string): MockState {
  if (!(state.quotes || []).some((quote) => quote.id === id)) throw new Error('Cotação não encontrada.')
  const taskIds = new Set((state.tasks || []).filter((taskItem) => taskItem.quoteId === id).map((taskItem) => taskItem.id))
  let changed = true
  while (changed) {
    changed = false
    for (const taskItem of state.tasks || []) if (taskItem.parentTaskId && taskIds.has(taskItem.parentTaskId) && !taskIds.has(taskItem.id)) { taskIds.add(taskItem.id); changed = true }
  }
  return saveState({ ...state, quotes: state.quotes.filter((quote) => quote.id !== id), tasks: state.tasks.filter((taskItem) => !taskIds.has(taskItem.id)), notifications: (state.notifications || []).filter((item) => !taskIds.has(item.taskId || '')) })
}

// --- Limpeza administrativa -------------------------------------------------

export interface AdminCleanupRequest {
  action: string
  employeeId?: string
  userId?: string
  status?: string
  teamId?: string
}

export function adminCleanup(state: MockState, action: string | AdminCleanupRequest): MockState {
  const request: AdminCleanupRequest = typeof action === 'string' ? { action } : action
  const actionId = request?.action
  const next: MockState = { ...state }
  if (actionId === 'completed_tasks') next.tasks = (state.tasks || []).filter((taskItem) => taskItem.status !== 'done')
  else if (actionId === 'all_tasks') next.tasks = []
  else if (actionId === 'all_tags') {
    next.personalTags = []
    next.personalTagAssignments = []
    next.tasks = (state.tasks || []).map((taskItem) => ({ ...taskItem, personalTagIds: [] }))
  } else if (actionId === 'notifications') next.notifications = []
  else if (actionId === 'user_tasks') next.tasks = (state.tasks || []).filter((taskItem) => !(taskItem.assigneeIds || []).includes(request.employeeId || '') || (request.status && taskItem.status !== request.status) || (request.teamId && !(taskItem.teamIds || []).includes(request.teamId) && taskItem.teamId !== request.teamId))
  else if (actionId === 'remove_user_assignments') next.tasks = (state.tasks || []).map((taskItem) => {
    if ((request.status && taskItem.status !== request.status) || (request.teamId && !(taskItem.teamIds || []).includes(request.teamId) && taskItem.teamId !== request.teamId)) return taskItem
    const assigneeIds = (taskItem.assigneeIds || []).filter((id) => id !== request.employeeId)
    const assigneeNames = assigneeIds.map((id) => (state.employees || []).find((employee) => employee.id === id)?.name).filter((value): value is string => Boolean(value))
    return { ...taskItem, assigneeIds, assigneeNames, assigneeName: assigneeNames.join(', ') }
  })
  else if (actionId === 'user_notifications') next.notifications = (state.notifications || []).filter((item) => item.recipientEmployeeId !== request.employeeId)
  else if (actionId === 'user_tags') {
    const removedIds = (state.personalTags || []).filter((tag) => tag.ownerUserId === request.userId).map((tag) => tag.id)
    next.personalTags = (state.personalTags || []).filter((tag) => !removedIds.includes(tag.id))
    next.personalTagAssignments = (state.personalTagAssignments || []).filter((item) => !removedIds.includes(item.tagId || ''))
    next.tasks = (state.tasks || []).map((taskItem) => ({ ...taskItem, personalTagIds: (taskItem.personalTagIds || []).filter((id) => !removedIds.includes(id)) }))
  } else if (actionId === 'user_contacts') next.contacts = (state.contacts || []).filter((contact) => !(contact.assigneeIds || []).includes(request.employeeId || '') && contact.ownerEmployeeId !== request.employeeId)
  else if (actionId === 'all_teams') next.teams = []
  else if (actionId === 'all_contacts') next.contacts = []
  else if (actionId === 'task_activity') {
    next.collectionEvents = []
    next.tasks = (state.tasks || []).map((taskItem) => ({ ...taskItem, comments: [], returns: [], history: [] }))
  } else if (actionId === 'task_attachments') next.tasks = (state.tasks || []).map((taskItem) => ({ ...taskItem, attachments: [] }))
  else if (actionId === 'task_assignments') next.tasks = (state.tasks || []).map((taskItem) => ({ ...taskItem, assignmentMode: 'people', assigneeIds: [], assigneeNames: [], assigneeName: '', teamIds: [], teamNames: [], teamId: '', teamName: '' }))
  else if (actionId === 'task_due_dates') next.tasks = (state.tasks || []).map((taskItem) => ({ ...taskItem, dueDate: '', waitingContext: { ...normalizeWaitingContext(taskItem.waitingContext), dueDate: '' } }))
  else if (actionId === 'all_planner_data') Object.assign(next, { tasks: [], personalTags: [], personalTagAssignments: [], teams: [], contacts: [], notifications: [], collectionEvents: [] })
  else throw new Error('Ação administrativa inválida.')
  return saveState(next)
}

// --- Contatos ---------------------------------------------------------------

const CONTACT_ASSIGNMENT_KEYS = ['assignmentMode', 'teamIds', 'teamNames', 'teamId', 'teamName', 'assigneeIds', 'assigneeNames', 'assigneeName'] as const

function resolveContactAssignment(state: MockState, patch: ContactInput = {}, existing: Partial<MockContact> = {}) {
  const hasAssignmentPatch = CONTACT_ASSIGNMENT_KEYS.some((key) => patch[key] !== undefined)
  const hasLegacyOwnerPatch = patch.ownerEmployeeId !== undefined && !hasAssignmentPatch
  if (!hasAssignmentPatch && !hasLegacyOwnerPatch) return null
  const source = hasLegacyOwnerPatch
    ? { ...existing, ...patch, assignmentMode: 'people', assigneeIds: patch.ownerEmployeeId ? [patch.ownerEmployeeId] : [], assigneeNames: patch.ownerName ? [patch.ownerName] : [] }
    : { ...existing, ...patch }
  return resolveTaskAssignment(source, state.teams || [], state.employees || [])
}

function contactAssignmentSignature(contact: Partial<MockContact> = {}): string {
  const asList = (value: unknown): string[] => (Array.isArray(value) ? value : value ? [value] : []).map(String)
  return JSON.stringify({
    assignmentMode: contact.assignmentMode === 'team' ? 'team' : 'people',
    teamIds: asList(contact.teamIds || contact.teamId),
    assigneeIds: asList(contact.assigneeIds || contact.ownerEmployeeId),
    assigneeNames: asList(contact.assigneeNames || contact.assigneeName || contact.ownerName),
  })
}

function pushContactNotification(notifications: MockNotification[], contactId: string, recipientEmployeeId: string, type: string, title: string, message: string | undefined, eventId: string): void {
  if (!recipientEmployeeId) return
  const dedupeKey = notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: contactId, type, eventId })
  if (notifications.some((item) => item.dedupeKey === dedupeKey)) return
  notifications.unshift({
    id: uid('notification'),
    contactId,
    recipientEmployeeId,
    type,
    title,
    message,
    occurredAt: new Date().toISOString(),
    readAt: '',
    dedupeKey,
  })
}

export function createContact(state: MockState, input: ContactInput = {}): MockState {
  const assignment = resolveContactAssignment(state, input)
  const actorEmployee = (state.employees || []).find((employee) => String(employee.id) === String(input.actorEmployeeId))
  const defaultOwnerId = input.ownerEmployeeId || input.actorEmployeeId || ''
  const defaultOwnerName = input.ownerName || actorEmployee?.name || 'Não atribuído'
  const contact: MockContact = asMockContact(createContactPayload({ ...input, ownerEmployeeId: defaultOwnerId, ownerName: defaultOwnerName, ...(assignment || {}) }, {
    id: defaultOwnerId,
    name: defaultOwnerName,
  }))
  const validation = validateContact(contact)
  if (!validation.allowed) throw new Error(validation.error)
  const history: MockContactEvent[] = [
    createContactEvent('created', contact, {
      text: `Caso recebido por ${CONTACT_CHANNELS.find((item) => item.id === contact.channel)?.label || contact.channel}.`,
      author: input.actorName || 'Você',
      actorEmployeeId: input.actorEmployeeId || '',
    }),
    ...(contact.history || []),
  ]
  const created: MockContact = { ...contact, id: contact.id || uid('contact'), history }
  const notifications = [...(state.notifications || [])]
  const creationEvent = history[0]
  ;(created.assigneeIds || [created.ownerEmployeeId]).filter((employeeId): employeeId is string => Boolean(employeeId) && employeeId !== input.actorEmployeeId).forEach((recipientEmployeeId) => pushContactNotification(notifications, created.id, recipientEmployeeId, 'contact_assignment', 'Novo caso atribuído', created.subject, creationEvent.id))
  return saveState({ ...state, contacts: [created, ...(state.contacts || [])], notifications })
}

function intakePriority(priority: unknown): string {
  return priority === 'urgent' ? 'high' : priority === 'low' || priority === 'medium' || priority === 'high' ? priority : 'medium'
}

function phoneKey(value: unknown = ''): string {
  return String(value).replace(/\D/g, '')
}

export interface WhatsAppIntakeInput {
  requestId?: string
  conversationKey?: string
  senderName?: string
  senderPhone?: string
  messages?: Array<{ text?: string; direction?: string; sentAt?: string }>
  classification?: { category?: string; priority?: string; summary?: string; nextAction?: string; dueDate?: string }
  actorEmployeeId?: string
  actorName?: string
}

export interface WhatsAppIntakeResult {
  state: MockState
  status: 'duplicate' | 'updated' | 'created'
  contactId: string
  taskId: string
}

export function createContactFromWhatsAppIntake(state: MockState, input: WhatsAppIntakeInput = {}): WhatsAppIntakeResult {
  const sourceKey = String(input.requestId || '').trim()
  const existingTask = (state.tasks || []).find((taskItem) => taskItem.whatsappIntakeKey === sourceKey)
  if (existingTask) return { state, status: 'duplicate', contactId: existingTask.contactId || '', taskId: existingTask.id }
  const phone = phoneKey(input.senderPhone)
  const existing = (state.contacts || []).find((contact) => phoneKey(contact.senderPhone) === phone && phone)
  const classification = input.classification || {}
  const lastMessage = (input.messages && lastOf(input.messages))?.text || ''
  const contactInput: ContactInput = {
    ...(existing || {}),
    subject: existing?.subject || classification.summary || `Atendimento WhatsApp · ${input.senderName}`,
    senderName: input.senderName,
    senderPhone: input.senderPhone,
    channel: 'whatsapp',
    priority: intakePriority(classification.priority),
    status: existing?.status || 'new',
    summary: classification.summary || existing?.summary || '',
    message: lastMessage,
    lastMessage,
    lastMessageAt: (input.messages && lastOf(input.messages))?.sentAt || new Date().toISOString(),
    externalConversationId: input.conversationKey,
    sourceUrl: 'whatsapp-web',
    dueDate: classification.dueDate || existing?.dueDate || '',
    actorEmployeeId: input.actorEmployeeId || state.currentUserId || '',
    actorName: input.actorName || 'WhatsApp Web',
  }
  const nextContactState = existing ? updateContact(state, existing.id, contactInput) : createContact(state, contactInput)
  const contact = (nextContactState.contacts || []).find((item) => phoneKey(item.senderPhone) === phone)
  if (!contact) throw new Error('Contato criado, mas não localizado para vincular a task.')
  const nextState = createTask(nextContactState, {
    title: classification.nextAction || `Acompanhar ${classification.category || 'atendimento'} · ${input.senderName}`,
    description: [classification.summary, lastMessage].filter(Boolean).join('\n\n'),
    priority: intakePriority(classification.priority),
    dueDate: classification.dueDate || '',
    contactId: contact.id,
    sourceType: 'contact',
    sourceId: contact.id,
    sourceLabel: 'WhatsApp Web',
    sourceCode: `WA:${sourceKey}`,
    whatsappIntakeKey: sourceKey,
    actorEmployeeId: input.actorEmployeeId || state.currentUserId || '',
  })
  const createdTask = lastOf(nextState.tasks) as MockTask
  return { state: nextState, status: existing ? 'updated' : 'created', contactId: contact.id, taskId: createdTask.id }
}

export function updateContact(state: MockState, id: string, patch: ContactInput = {}): MockState {
  const existing = (state.contacts || []).find((item) => item.id === id)
  if (!existing) throw new Error('Caso de atendimento não encontrado.')
  const assignment = resolveContactAssignment(state, patch, existing)
  const now = new Date().toISOString()
  const assignmentInput = { ...existing, ...patch, ...(assignment || {}), id }
  const assignmentChanged = contactAssignmentSignature(existing) !== contactAssignmentSignature(assignmentInput)
  const next: MockContact = asMockContact(normalizeContact({ ...assignmentInput, status: assignmentChanged ? 'new' : assignmentInput.status }, { now }))
  if (patch.status !== undefined && !assignmentChanged && !canTransitionContactStatus(existing.status, next.status)) {
    throw new Error(`Não é possível mudar o status de ${existing.status} para ${next.status}.`)
  }
  const validation = validateContact(next)
  if (!validation.allowed) throw new Error(validation.error)
  const history: MockContactEvent[] = [...(existing.history || [])]
  const actor = { author: patch.actorName || 'Você', actorEmployeeId: patch.actorEmployeeId || '' }
  if (assignmentChanged) {
    history.push(createContactEvent('transfer', next, { ...actor, ownerName: next.ownerName, teamName: next.teamName, previous: existing.ownerEmployeeId, next: next.ownerEmployeeId, fromEmployeeId: existing.ownerEmployeeId, toEmployeeId: next.ownerEmployeeId, fromAssigneeIds: existing.assigneeIds, toAssigneeIds: next.assigneeIds, fromTeamIds: existing.teamIds, toTeamIds: next.teamIds, reason: patch.transferReason }))
  }
  if (patch.status !== undefined && patch.status !== existing.status) {
    history.push(createContactEvent('status', next, { ...actor, status: next.status, previous: existing.status, next: next.status }))
  }
  if (patch.resolutionOutcome !== undefined && patch.resolutionOutcome !== existing.resolutionOutcome) {
    history.push(createContactEvent('resolution', next, { ...actor, resolutionOutcome: next.resolutionOutcome }))
  }
  if (patch.priority !== undefined && patch.priority !== existing.priority) {
    history.push(createContactEvent('priority', next, { ...actor, priority: next.priority }))
  }
  if (patch.dueDate !== undefined && patch.dueDate !== existing.dueDate) {
    history.push(createContactEvent('deadline', next, { ...actor, next: next.dueDate }))
  }
  if (patch.waitingNote !== undefined && patch.waitingNote !== existing.waitingNote) {
    history.push(createContactEvent('waiting', next, { ...actor, waitingNote: next.waitingNote }))
  }
  const updated: MockContact = { ...next, updatedAt: now, internalNotes: next.notes, history }
  const notifications = [...(state.notifications || [])]
  if (assignmentChanged) {
    const transferEvent = [...history].reverse().find((event) => event.type === 'transfer') || (lastOf(history) as MockContactEvent)
    ;(next.assigneeIds || [next.ownerEmployeeId]).filter((employeeId): employeeId is string => Boolean(employeeId) && employeeId !== patch.actorEmployeeId).forEach((recipientEmployeeId) => pushContactNotification(notifications, id, recipientEmployeeId, 'contact_transfer', 'Caso transferido para você', updated.subject, transferEvent.id))
  }
  return saveState({ ...state, contacts: (state.contacts || []).map((item) => item.id === id ? updated : item), notifications })
}

export interface ContactActionContext {
  author?: string
  actorEmployeeId?: string
}

export function archiveContact(state: MockState, id: string, context: ContactActionContext = {}): MockState {
  const contact = (state.contacts || []).find((item) => item.id === id)
  if (!contact) throw new Error('Caso de atendimento não encontrado.')
  if (contact.archivedAt) return state
  const now = new Date().toISOString()
  const event = createContactEvent('archived', contact, { author: context.author || 'Você', actorEmployeeId: context.actorEmployeeId || '' }, now)
  const updated = { ...contact, archivedAt: now, updatedAt: now, history: [...(contact.history || []), event] }
  return saveState({ ...state, contacts: (state.contacts || []).map((item) => item.id === id ? updated : item) })
}

export function addContactNote(state: MockState, id: string, input: string | { text?: string } | null | undefined, context: ContactActionContext = {}): MockState {
  const contact = (state.contacts || []).find((item) => item.id === id)
  const value = typeof input === 'string' ? input : input?.text
  if (!contact) throw new Error('Caso de atendimento não encontrado.')
  if (!String(value || '').trim()) throw new Error('Informe a nota interna.')
  const note = { id: uid('contact-note'), text: String(value).trim(), author: context.author || 'Você', authorEmployeeId: context.actorEmployeeId || '', createdAt: new Date().toISOString() }
  const notes = [...(contact.notes || []), note]
  const updated = { ...contact, notes, internalNotes: notes, updatedAt: note.createdAt, history: [...(contact.history || []), createContactEvent('note', contact, context, note.createdAt)] }
  return saveState({ ...state, contacts: (state.contacts || []).map((item) => item.id === id ? updated : item) })
}

export function addContactAttachment(state: MockState, id: string, attachmentInput: AttachmentInput | null | undefined): MockState {
  const contact = (state.contacts || []).find((item) => item.id === id)
  if (!contact) throw new Error('Caso de atendimento não encontrado.')
  if (Number(attachmentInput?.size || 0) > 5 * 1024 * 1024) throw new Error('Cada anexo deve ter no máximo 5 MB.')
  const attachment = { id: uid('contact-file'), name: attachmentInput?.name || 'Arquivo', mimeType: attachmentInput?.mimeType || '', size: attachmentInput?.size || 0, previewUrl: attachmentInput?.previewUrl || '', createdAt: new Date().toISOString() }
  const updated = { ...contact, updatedAt: attachment.createdAt, attachments: [...(contact.attachments || []), attachment], history: [...(contact.history || []), createContactEvent('attachment', contact, { text: `Anexo adicionado: ${attachment.name}.` }, attachment.createdAt)] }
  return saveState({ ...state, contacts: (state.contacts || []).map((item) => item.id === id ? updated : item) })
}

export function deleteContactAttachment(state: MockState, id: string, attachmentId: string): MockState {
  const contact = (state.contacts || []).find((item) => item.id === id)
  if (!contact) throw new Error('Caso de atendimento não encontrado.')
  const attachment = (contact.attachments || []).find((item) => item.id === attachmentId)
  const now = new Date().toISOString()
  const updated = { ...contact, updatedAt: now, attachments: (contact.attachments || []).filter((item) => item.id !== attachmentId), history: [...(contact.history || []), createContactEvent('attachment_deleted', contact, { text: `Anexo removido: ${attachment?.name || 'arquivo'}.` }, now)] }
  return saveState({ ...state, contacts: (state.contacts || []).map((item) => item.id === id ? updated : item) })
}

export function linkTaskToContact(state: MockState, contactId: string, taskId: string): MockState {
  if (!contactId || !taskId) return state
  return saveState({ ...state, contacts: (state.contacts || []).map((item) => item.id === contactId ? { ...item, linkedTaskIds: [...new Set([...(item.linkedTaskIds || []), taskId])] } : item) })
}

// --- Comentários, anexos e notificações ------------------------------------

export function addComment(state: MockState, id: string, text: string, context: { mentionedEmployeeIds?: string[]; actorEmployeeId?: string } = {}): MockState {
  const comment = { id: uid('comment'), text: text.trim(), createdAt: new Date().toISOString(), author: 'Você' }
  const notifications = [...(state.notifications || [])]
  ;(context.mentionedEmployeeIds || []).filter((employeeId) => employeeId !== context.actorEmployeeId).forEach((recipientEmployeeId) => notifications.unshift({ id: uid('notification'), taskId: id, recipientEmployeeId, type: 'mention', title: 'Você foi mencionado', message: text.trim(), occurredAt: new Date().toISOString(), readAt: '', dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: id, type: 'mention', eventId: comment.id }) }))
  return saveState({ ...state, notifications, tasks: state.tasks.map((taskItem) => taskItem.id === id ? { ...taskItem, comments: [...taskItem.comments, comment] } : taskItem) })
}

export function addAttachment(state: MockState, id: string, name: string | AttachmentInput): MockState {
  const input: AttachmentInput = typeof name === 'object' ? name : { name }
  const attachment = { id: uid('file'), name: input.name || 'Arquivo', mimeType: input.mimeType || '', size: input.size || 0, previewUrl: input.previewUrl || '', createdAt: new Date().toISOString() }
  return saveState({ ...state, tasks: state.tasks.map((taskItem) => taskItem.id === id ? { ...taskItem, attachments: [...taskItem.attachments, attachment] } : taskItem) })
}

export function deleteAttachment(state: MockState, taskId: string, attachmentId: string): MockState {
  return saveState({ ...state, tasks: state.tasks.map((taskItem) => taskItem.id === taskId ? { ...taskItem, attachments: taskItem.attachments.filter((attachment) => attachment.id !== attachmentId) } : taskItem) })
}

export function markNotificationRead(state: MockState, notificationId: string, readAt: string = new Date().toISOString()): MockState {
  return saveState({ ...state, notifications: (state.notifications || []).map((item) => item.id === notificationId ? { ...item, readAt } : item) })
}

export function markAllNotificationsRead(state: MockState, recipientEmployeeId: string, readAt: string = new Date().toISOString()): MockState {
  return saveState({ ...state, notifications: (state.notifications || []).map((item) => item.recipientEmployeeId === recipientEmployeeId ? { ...item, readAt: item.readAt || readAt } : item) })
}

// --- Cotações ---------------------------------------------------------------

export function ensureQuoteTask(state: MockState, quote: MockQuote): MockState {
  const existing = state.tasks.find((taskItem) => taskItem.quoteId === quote.id && !taskItem.parentTaskId)
  if (existing) return state
  return createTask(state, { title: quoteTaskTitle(quote), quoteId: quote.id, quoteCode: quote.code, quoteTitle: quote.title, quoteStatus: quote.status, dueDate: quote.deadline, priority: 'medium', assigneeName: 'Não atribuído', assignmentMode: 'people', teamName: 'Financeiro', description: `Acompanhar a cotação ${quote.code} até a resposta ao cliente.` })
}

export function createQuote(state: MockState, input: QuotePatch = {}): MockState {
  if (QUOTE_COMPLETED_STATUSES.includes(input.status || '')) throw new Error('Crie a cotação como Nova e registre o resultado comercial depois.')
  const now = new Date().toISOString()
  const route = normalizeQuoteRoute(input.route || [input.origin, input.destination].filter(Boolean).join(' / '))
  const routePoints = quoteRoutePoints({ route })
  const sequence = Math.max(0, ...(state.quotes || []).map((quote) => Number.parseInt(String(quote.code || '').replace(/\D/g, ''), 10) || 0)) + 1
  const quote: MockQuote = {
    id: uid('quote'), code: input.code || `COT-${String(sequence).padStart(4, '0')}`,
    title: String(input.title || '').trim(), client: String(input.client || '').trim(),
    status: input.status || 'Nova', deadline: input.deadline || '', value: input.value || '',
    vehicleType: input.vehicleType || '', route, origin: routePoints[0] || input.origin || '', destination: lastOf(routePoints) || input.destination || '',
    passengers: input.passengers || '', serviceDate: input.serviceDate || '', returnDate: input.returnDate || '',
    clientContact: input.clientContact || '', clientEmail: input.clientEmail || '', clientPhone: input.clientPhone || '',
    commercialTerms: input.commercialTerms || '', notes: input.notes || '', passengerProfile: input.passengerProfile || '', internalNotes: input.internalNotes || '', options: input.options || [], proposalVersions: [], acceptedOptionId: '', acceptedProposalVersionId: '', priority: input.priority || 'medium', channel: input.channel || '', hasReturn: Boolean(input.returnDate), lossReason: input.lossReason || '', responseSent: false, finalizationAt: '', plannerTaskId: '', creatorEmployeeId: input.actorEmployeeId || '', createdAt: now, modifiedAt: now,
  }
  if (!quote.title) quote.title = quoteTaskTitle(quote)
  // V2: a cotação é a própria fila; não cria tarefa.
  const withQuote: MockState = { ...state, quotes: [quote, ...(state.quotes || [])] }
  return saveState(pushQuoteNotices(withQuote, urgentNotices(quote, input.financeIds ?? financeMemberIds(state), input.today || localDateKey())))
}

function pushQuoteNotices(state: MockState, notices: QuoteNotice[], occurredAt: string = new Date().toISOString()): MockState {
  const existing = new Set((state.notifications || []).map((item) => item.dedupeKey).filter(Boolean))
  const additions: MockNotification[] = notices.filter((item) => !existing.has(item.dedupeKey)).map((item) => ({ id: uid('notification'), taskId: '', readAt: '', occurredAt, ...item }))
  return additions.length ? { ...state, notifications: [...additions, ...(state.notifications || [])] } : state
}

export function syncQuoteFollowUps(state: MockState, today: string = localDateKey()): MockState {
  return pushQuoteNotices(state, followUpNotices(state.quotes || [], today))
}

export function updateQuote(state: MockState, id: string, patchInput: QuotePatch = {}): MockState {
  const existing = (state.quotes || []).find((quote) => quote.id === id)
  if (!existing) throw new Error('Cotação não encontrada.')
  if (patchInput.modifiedAt && patchInput.modifiedAt !== existing.modifiedAt) throw new Error('A cotação foi alterada por outra pessoa. Recarregue antes de salvar.')
  const patch: QuotePatch = applyDerivedStatus(existing, patchInput)
  const nextStatus = patch.status ?? existing.status
  if (patch.responseSent === true && nextStatus !== 'Respondida ao cliente') throw new Error('Envio só pode ser confirmado na cotação respondida.')
  if (patch.responseSent === true && !(patch.proposalVersions || existing.proposalVersions || []).length) throw new Error('Registre uma versão da proposta antes de confirmar o envio.')
  if (nextStatus === 'Respondida ao cliente' && !existing.responseSent && !(patch.proposalVersions || []).some((version) => !(existing.proposalVersions || []).some((previous) => previous.id === version.id) && Number.isFinite(Date.parse(String(version.createdAt))) && prepareQuoteProposal({ options: version.options || [] }).valid)) throw new Error('Confirme a resposta ao cliente antes de dar baixa.')
  if (QUOTE_COMPLETED_STATUSES.includes(nextStatus || '') && (patch.status !== undefined || patch.value !== undefined || patch.commercialTerms !== undefined || patch.responseSent !== undefined)) {
    const validation = validateQuoteCommercial({ ...existing, ...patch })
    if (!validation.valid) throw new Error(Object.values(validation.errors).join(' '))
    if (nextStatus === 'Respondida ao cliente' && (patch.responseSent === false || (patch.responseSent !== true && !existing.responseSent))) throw new Error('Confirme o envio da proposta ao cliente.')
  }
  if (patch.status === 'Aguardando informação' && existing.status !== patch.status) {
    const validation = validateWaitingContext('waiting', patch.waitingContext)
    if (!validation.allowed) throw new Error(validation.error)
  }
  const nextQuote: MockQuote = { ...existing, ...patch, id, modifiedAt: new Date().toISOString() }
  if (patch.route !== undefined) {
    nextQuote.route = normalizeQuoteRoute(patch.route)
    const points = quoteRoutePoints(nextQuote)
    nextQuote.origin = points[0] || ''
    nextQuote.destination = lastOf(points) || ''
  }
  if (Array.isArray(patch.options)) {
    if (patch.value === undefined) nextQuote.value = patch.options.length === 1 ? (patch.options[0].value as string | undefined) ?? '' : ''
  }
  if (isAutomaticQuoteTitle(existing) && patch.clientContact !== undefined && patch.title === undefined) nextQuote.title = quoteTaskTitle(nextQuote)
  if (patch.status && patch.status !== 'Respondida ao cliente') nextQuote.responseSent = false
  const outcomeStatus = nextQuote.status
  const statusChanged = outcomeStatus !== existing.status
  const terminal = isQuoteTerminalStatus(outcomeStatus)
  const reopening = !terminal && isQuoteTerminalStatus(existing.status)
  if (reopening) {
    nextQuote.finalizationAt = ''
    nextQuote.lossReason = ''
    nextQuote.responseSent = false
  }
  const completedAt = nextQuote.finalizationAt || new Date().toISOString()
  const nextWaiting = statusChanged ? waitingContextForStatusChange(existing.status, outcomeStatus, nextQuote, lastProposalSentAt(nextQuote)) : undefined
  const nextState: MockState = {
    ...state,
    quotes: state.quotes.map((quote) => quote.id === id ? nextQuote : quote),
    tasks: state.tasks.map((taskItem): MockTask => {
      if (taskItem.quoteId !== id) return taskItem
      if (taskItem.parentTaskId && ['done', 'cancelled'].includes(taskItem.status || '')) return taskItem
      const nextTaskStatus = taskItem.parentTaskId ? (statusChanged && terminal ? 'done' : taskItem.status) : (statusChanged ? taskStatusForQuoteStatus(outcomeStatus) : taskItem.status)
      const actor: { id: string; name: string } = state.employees?.find((employee) => employee.id === patch.actorEmployeeId) || { id: state.currentUserId || '', name: state.currentUserName || 'Sistema' }
      const history = [...(taskItem.history || [])]
      if (!taskItem.parentTaskId && (JSON.stringify(existing.options || []) !== JSON.stringify(nextQuote.options || []) || existing.commercialTerms !== nextQuote.commercialTerms || existing.value !== nextQuote.value)) history.push({ id: uid('history'), text: 'Valores, opções ou condições da cotação atualizados.', createdAt: nextQuote.modifiedAt, author: actor.name, authorId: actor.id, field: 'quoteCommercial', previousValue: { options: existing.options, value: existing.value, commercialTerms: existing.commercialTerms }, nextValue: { options: nextQuote.options, value: nextQuote.value, commercialTerms: nextQuote.commercialTerms } })
      if (!taskItem.parentTaskId && (nextQuote.proposalVersions || []).length > (existing.proposalVersions || []).length) { const version = lastOf(nextQuote.proposalVersions || []) as QuoteProposalVersion; history.push({ id: uid('history'), text: `Resposta confirmada por ${version.authorName || actor.name}. Aguardando decisão do cliente.`, createdAt: version.createdAt, author: version.authorName || actor.name, authorId: version.authorId || actor.id, field: 'quote:sent', nextValue: version.id }) }
      if (!taskItem.parentTaskId && (taskItem.quoteStatus || existing.status) !== outcomeStatus) history.push({ id: uid('history'), text: `Cotação movida para ${outcomeStatus}.`, createdAt: nextQuote.modifiedAt, author: actor?.name || 'Sistema', authorId: actor?.id || '', field: 'quoteStatus', previousValue: taskItem.quoteStatus || existing.status, nextValue: outcomeStatus })
      if (!taskItem.parentTaskId && patch.deadline !== undefined && patch.deadline !== taskItem.dueDate) history.push({ id: uid('history'), text: `Prazo da cotação atualizado para ${patch.deadline || 'sem prazo'}.`, createdAt: nextQuote.modifiedAt, author: actor?.name || 'Sistema', authorId: actor?.id || '', field: 'dueDate', previousValue: taskItem.dueDate || '', nextValue: patch.deadline || '' })
      if (!taskItem.parentTaskId && patch.assigneeIds !== undefined && JSON.stringify(patch.assigneeIds) !== JSON.stringify(taskItem.assigneeIds || [])) history.push({ id: uid('history'), text: `Responsável atualizado para ${patch.assigneeNames?.join(', ') || 'sem responsável'}.`, createdAt: nextQuote.modifiedAt, author: actor?.name || 'Sistema', authorId: actor?.id || '', field: 'assignees', previousValue: taskItem.assigneeNames || [], nextValue: patch.assigneeNames || [] })
      return {
        ...taskItem,
        title: taskItem.parentTaskId || !isAutomaticQuoteTaskTitle(taskItem, existing) ? taskItem.title : quoteTaskTitle(nextQuote),
        quoteCode: nextQuote.code || taskItem.quoteCode,
        quoteTitle: nextQuote.title || taskItem.quoteTitle,
        dueDate: nextQuote.deadline || taskItem.dueDate,
        priority: nextQuote.priority || taskItem.priority,
        ...(!taskItem.parentTaskId && patch.assigneeIds !== undefined ? { assigneeIds: patch.assigneeIds, assigneeNames: patch.assigneeNames || [], assigneeName: (patch.assigneeNames || []).join(', '), primaryAssigneeId: patch.assigneeIds[0] || '', primaryAssigneeName: patch.assigneeNames?.[0] || '' } : {}),
        history,
        ...(taskItem.parentTaskId ? (statusChanged && terminal ? { status: 'done', completedAt } : {}) : {
          status: nextTaskStatus,
          quoteStatus: outcomeStatus,
          ...(statusChanged ? (nextTaskStatus === 'done' ? { completedAt } : { completedAt: '' }) : {}),
          ...(nextWaiting ? { waitingContext: normalizeWaitingContext(nextWaiting) } : {}),
        }),
      }
    }),
  }
  const ready = readyNotice(existing, nextQuote)
  if (ready) nextState.notifications = pushQuoteNotices(nextState, [ready], nextQuote.modifiedAt).notifications
  const linkedTask = nextState.tasks.find((taskItem) => taskItem.quoteId === id && !taskItem.parentTaskId)
  if (linkedTask) {
    const previousTask = state.tasks.find((taskItem) => taskItem.id === linkedTask.id)
    const nextAssigneeIds = linkedTask.assigneeIds || []
    const previousAssigneeIds = previousTask?.assigneeIds || []
    const notifications = [...(nextState.notifications || [])]
    const notificationChanges: string[] = []
    if (statusChanged && linkedTask.status !== 'waiting' && linkedTask.status !== 'done') notificationChanges.push('status')
    if (patch.deadline !== undefined && patch.deadline !== previousTask?.dueDate) notificationChanges.push('deadline')
    if (patch.assigneeIds !== undefined && JSON.stringify(nextAssigneeIds) !== JSON.stringify(previousAssigneeIds)) notificationChanges.push('assignees')
    notificationChanges.forEach((type) => notificationRecipients({ type: type === 'assignees' ? 'assignment' : type, creatorEmployeeId: '', assigneeIds: nextAssigneeIds, previousAssigneeIds, nextStatus: linkedTask.status, actorEmployeeId: patch.actorEmployeeId }).forEach((recipientEmployeeId) => {
      const eventId = uid('event')
      notifications.unshift({
        id: uid('notification'),
        taskId: linkedTask.id,
        recipientEmployeeId,
        type,
        title: type === 'deadline' ? 'Prazo alterado' : type === 'status' ? 'Status alterado' : 'Responsáveis alterados',
        message: linkedTask.title,
        occurredAt: nextQuote.modifiedAt,
        readAt: '',
        dedupeKey: notificationDedupeKey({ recipientId: recipientEmployeeId, taskId: linkedTask.id, type, eventId }),
      })
    }))
    nextState.notifications = notifications
    if (patch.waitingContext !== undefined) return updateTask(nextState, linkedTask.id, { waitingContext: patch.waitingContext, actorEmployeeId: patch.actorEmployeeId })
  }
  return saveState(nextState)
}

export interface QuoteSendProposal {
  requestId?: string
  expectedModifiedAt?: string
  options?: QuoteOptionData[]
  draft?: QuotePatch
  /** Aceito por compatibilidade com a tela; o mock (como o JS original) não o usa. */
  proposalOptions?: QuoteOptionData[]
  html?: string
  text?: string
  send?: Parameters<typeof createQuoteProposalVersion>[4]
}

export function markQuoteSent(state: MockState, id: string, proposal: QuoteSendProposal = {}): MockState {
  const quote = (state.quotes || []).find((item) => item.id === id)
  if (!quote || !QUOTE_COMPLETED_STATUSES.includes(quote.status || '')) throw new Error('Finalize a cotação antes de registrar o envio.')
  if (proposal.requestId && (quote.proposalVersions || []).some((version) => version.requestId === proposal.requestId)) return state
  if (proposal.expectedModifiedAt && proposal.expectedModifiedAt !== quote.modifiedAt) throw new Error('A cotação foi alterada por outra pessoa. Recarregue antes de registrar o envio.')
  const options = proposal.options || normalizeQuoteOptions(quote)
  const prepared = prepareQuoteResponse({ ...quote, ...proposal.draft, options })
  if (!prepared.valid) throw new Error(prepared.error)
  const sentQuote: MockQuote = { ...quote, ...proposal.draft, options, proposalOptions: prepared.options }
  const version = createQuoteProposalVersion(sentQuote, prepared.options, {
    html: proposal.html || buildQuoteEmailHtml(sentQuote), text: proposal.text || buildQuotePlainText(sentQuote),
  }, { id: state.currentUserId, name: state.currentUserName || state.employees?.find((employee) => employee.userId === state.currentUserId || employee.id === state.currentUserId)?.name || 'Usuário local' }, proposal.send, proposal.requestId)
  return updateQuote(state, id, { ...proposal.draft, options, proposalOptions: prepared.options, proposalVersions: [...(quote.proposalVersions || []), version], responseSent: true, status: 'Respondida ao cliente', value: prepared.options.length > 1 ? '' : prepared.options[0].value as string | undefined, commercialTerms: sentQuote.commercialTerms || '', finalizationAt: '' })
}

export function setQuoteOutcome(state: MockState, id: string, outcome: string, reason: string = '', accepted: Parameters<typeof resolveQuoteAcceptance>[1] = {}): MockState {
  const quote = (state.quotes || []).find((item) => item.id === id)
  if (!quote) throw new Error('Cotação não encontrada.')
  if (outcome === 'Perdida' && !isLossReason(String(reason).trim())) throw new Error('Escolha o motivo da perda.')
  if (outcome === 'Aceita pelo cliente') {
    const { option, version } = resolveQuoteAcceptance(quote, accepted)
    return updateQuote(state, id, { status: outcome, acceptedOptionId: option.id, acceptedProposalVersionId: version?.id || '', value: option.value as string | undefined, commercialTerms: version?.commercialTerms ?? option.commercialTerms ?? quote.commercialTerms ?? '', finalizationAt: new Date().toISOString() })
  }
  return updateQuote(state, id, { status: outcome, lossReason: outcome === 'Perdida' ? String(reason).trim() : '', finalizationAt: new Date().toISOString() })
}

export function resetState(): MockState {
  const next = seedState()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
