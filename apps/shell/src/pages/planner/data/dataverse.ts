// Porte de Tela Planner/src/dataverse.js (adapter live do Dataverse + adapter mock local).
// Comportamento preservado: o Planner usa fetch direto em /api/data/v9.2 com retry,
// Prefer return=representation, fallback de consultas e log via logAppError. O cliente
// de @betinhos/dataverse tem contrato diferente (cleanId em minúsculas, sem retry,
// sem return=representation), então não é usado aqui; ver relatório do porte.
// Respostas do Dataverse entram como `unknown`/`Row` e são mapeadas para os tipos do Planner.
import {
  adminCleanup as adminCleanupMock,
  addAttachment as addMockAttachment,
  addContactAttachment as addMockContactAttachment,
  addContactNote as addMockContactNote,
  addComment as addMockComment,
  collectTask as collectMockTask,
  withDailyNotifications,
  resolveWaitingReturn as resolveMockWaitingReturn,
  createTask as createMockTask,
  createPersonalTag as createMockPersonalTag,
  importPlannerTasks as importMockPlannerTasks,
  createTeam as createMockTeam,
  deleteTeam as deleteMockTeam,
  deleteAttachment as deleteMockAttachment,
  deleteContactAttachment as deleteMockContactAttachment,
  deleteTask as deleteMockTask,
  deleteQuote as deleteMockQuote,
  ensureQuoteTask as ensureMockQuoteTask,
  createQuote as createMockQuote,
  updateQuote as updateMockQuote,
  markQuoteSent as markMockQuoteSent,
  setQuoteOutcome as setMockQuoteOutcome,
  loadState as loadMockState,
  markAllNotificationsRead as markAllMockNotificationsRead,
  markNotificationRead as markMockNotificationRead,
  archivePersonalTag as archiveMockPersonalTag,
  loadPersonalTags as loadMockPersonalTags,
  reorderPersonalTags as reorderMockPersonalTags,
  replaceTaskPersonalTags as replaceMockTaskPersonalTags,
  resetState as resetMockState,
  saveState as saveMockState,
  updateTask as updateMockTask,
  updatePersonalTag as updateMockPersonalTag,
  updateTeam as updateMockTeam,
  createContact as createMockContact,
  createContactFromWhatsAppIntake as createMockContactFromWhatsAppIntake,
  updateContact as updateMockContact,
  archiveContact as archiveMockContact,
  type MockState,
} from "./mock";
import {
  applyOptimisticTaskPatch,
  canRegisterWaitingReturn,
  normalizeAssigneeNames,
  normalizeText,
  normalizePersonalTag,
  normalizePersonalTagIds,
  resolveOwnedPersonalTagIds,
  PERSONAL_TAG_COLORS,
  normalizeWaitingContext,
  isAutomaticQuoteTaskTitle,
  isAutomaticQuoteTitle,
  quoteTaskTitle,
  deriveExecutionActor,
  responsibilityFromIds,
  resolveTaskAssignment,
  STATUSES,
  validateTeamComposition,
  validateWaitingContext,
  waitingContextSummary,
} from "../domain/domain";
import { clientDecisionWaitingContext, isQuoteTask, isQuoteTerminalStatus, QUOTE_CLIENT_DECISION_RETURN, QUOTE_TASK_DONE_BLOCKED, quoteStatusForTaskStatus, taskStatusForQuoteStatus, waitingContextForStatusChange } from "../domain/quoteTaskFlow";
import { applyDerivedStatus, buildQuoteEmailHtml, buildQuotePlainText, lastProposalSentAt, normalizeQuoteRoute, parseQuoteMoney, QUOTE_COMPLETED_STATUSES, QUOTE_VEHICLE_VALUES, quoteRoutePoints, validateQuoteCommercial, validateQuoteRoute } from "../domain/quoteDomain";
import { createQuoteProposalVersion, normalizeQuoteOptions, prepareQuoteProposal, prepareQuoteResponse, resolveQuoteAcceptance, type QuoteSend } from "../domain/quoteScenarios";
import { commitQuoteSend } from "../domain/quoteSendBatch";
import { localDateKey, manualCollectionKey } from "../domain/management";
import { normalizeContact } from "../domain/contactDomain";
import { logAppError, sanitizeDataversePath } from "./errorLogger";
import { financeMemberIds, followUpNotices, isLossReason, readyNotice, urgentNotices, waitingReturnNotices, type QuoteNotice } from "../domain/quoteNotifications";
import { applyQuoteWaiting, QUOTE_WAITING_CLEARED, QUOTE_WAITING_STATUS } from "../domain/quoteWaiting";
import { createSharePointDocs, DOC_MAX_BYTES, sanitizeFileName, uniqueName } from "../../funcionarios/data/sharepoint";
import type { Documento } from "../../funcionarios/data/types";
import type { Employee, PersonalTag, PlannerNotification, PlannerState, QuoteData, QuoteOptionData, QuoteProposalVersion, Task, TaskAttachment, TaskHistoryItem, Team, WaitingContext, WaitingContextInput } from "../domain/types";

void prepareQuoteProposal;

// ---------------------------------------------------------------------------
// Tipos do adapter
// ---------------------------------------------------------------------------

/** Linha crua da Web API (sempre mapeada antes de virar estado). */
export type Row = Record<string, unknown>;
type Payload = Record<string, unknown>;

interface PlannerUserSettings { userId?: string; userName?: string; fullName?: string }
interface PlannerGlobalContext {
  getClientUrl: () => string;
  getCurrentAppUrl?: () => string;
  userSettings?: PlannerUserSettings;
}
export interface PlannerXrm {
  Utility: { getGlobalContext: () => PlannerGlobalContext };
  WebApi?: unknown;
  Navigation?: {
    openForm?: (options: { entityName: string; entityId: string }) => unknown;
    openWebResource?: (resource: string, options?: { data?: string }) => unknown;
  };
}

export interface LiveQuote extends QuoteData {
  channel?: string;
  hasReturn?: boolean;
  responseSent?: boolean;
  optionsVersion?: string;
  acceptedOptionRecordId?: string;
  etag?: string;
  plannerTaskId?: string;
  plannerLink?: string;
  teamsLink?: string;
  options?: LiveQuoteOption[];
}
export interface LiveQuoteOption extends QuoteOptionData { recordId?: string }

export interface AssigneeProfile { id: string; name: string; userId?: string; [extra: string]: unknown }

export interface LiveEmployee extends Employee { emailMicrosoft?: string }

export interface LiveTask extends Task {
  checklist?: unknown[];
  assigneeProfiles?: Array<AssigneeProfile | Employee | undefined>;
  executionActor?: unknown;
  detailsLoaded?: boolean;
  detailsLoading?: boolean;
  detailsError?: unknown;
  contactId?: string;
}

export interface QualityItem {
  id: string;
  type: string;
  code: string;
  title: string;
  description: string;
  status: string;
  dueDate: string;
  assigneeId: string;
  assigneeName: string;
  assigneeProfiles?: Array<Employee | undefined>;
}

export interface LiveIdea { id: string; title: string; details: string; status: unknown; createdAt: string; author: string }
export interface IdeaInput { title?: unknown; details?: unknown; status?: unknown }

export interface PersonalTagAssignment { id: string; tagId: string; taskId: string; ownerUserId: string }

export interface CollectionEvent { id: string; taskId: string; occurredAt: string; referenceDate: string; actorEmployeeId: string }

export interface LiveState extends PlannerState {
  tasks: LiveTask[];
  quotes: LiveQuote[];
  employees: LiveEmployee[];
  currentUserId?: string;
  currentUserEmail?: string;
  personalTagsUnavailable?: boolean;
  quality?: QualityItem[];
  lastUpdated?: string;
  live?: boolean;
  loading?: Record<string, boolean>;
}

/** Entrada de criação e de alteração de tarefa (formulários, cotações, importação). */
export interface TaskChange {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  restrictedVisibility?: boolean;
  waitingContext?: WaitingContextInput | WaitingContext;
  sourceType?: string;
  sourceCode?: string;
  sourceId?: string | null;
  quoteId?: string | null;
  quoteCode?: string;
  quoteTitle?: string;
  quoteStatus?: string;
  parentTaskId?: string | null;
  contactId?: string;
  qualityType?: string;
  qualityId?: string;
  assignmentMode?: string;
  teamIds?: string[];
  teamId?: string;
  teamName?: string;
  teamNames?: string[];
  assigneeIds?: string[];
  assigneeId?: string;
  assigneeNames?: string[];
  assigneeName?: string;
  primaryAssigneeId?: string;
  consultantIds?: string[];
  actorEmployeeId?: string;
  actorUserId?: string;
  actorName?: string;
  suppressQuoteSync?: boolean;
  suppressNotifications?: boolean;
  responseSent?: boolean;
  value?: string;
  commercialTerms?: string;
  quoteCommercialChange?: { previous: unknown; next: unknown };
  mentionedEmployeeIds?: string[];
  deadlineChangeReason?: string;
  [extra: string]: unknown;
}

export interface LiveAttachment extends TaskAttachment {
  sharePointId?: string;
  eventId?: string;
  returnId?: string;
  fileLocator?: string;
  path?: string;
  dataUrl?: string;
}

export interface EmailDispatch {
  id?: string;
  status: string;
  statusValue?: number;
  statusText: string;
  recipientEmployeeId: string;
  recipientEmail: string;
  error: string;
  attempt: number;
  sentAt: string;
  createdAt: string;
  modifiedAt: string;
  idempotencyKey: string;
  eventId: string;
  channel?: string;
}

export interface EmailDispatchFeedback { status: string; type: string; text: string; dispatch?: EmailDispatch }

export interface LiveNotification extends PlannerNotification {
  eventOriginId: string;
  title: string;
  message: string;
  occurredAt: string;
  referenceDate: string;
  dedupeKey: string;
  emailDelivery: EmailDispatch | null;
}

export interface PlannerImportRow {
  plannerTaskId?: string;
  sourceCode?: string;
  title?: string;
  description?: string;
  checklist?: unknown[];
  statusChoice?: number;
  priorityChoice?: number;
  dueDate?: string;
  tags?: string[];
  assignments?: Array<{ employeeId?: string; [extra: string]: unknown }>;
  [extra: string]: unknown;
}

export interface PlannerImportResult { plannerTaskId?: string; result: string; dataverseTaskId?: unknown; error?: string }

export interface AdminCleanupRequest { action?: string; employeeId?: string; userId?: string; status?: string; teamId?: string }

/** Arquivo anexado: File do navegador ou objeto já preparado em base64. */
export type UploadFile = File & { base64?: string };

// ---------------------------------------------------------------------------
// Helpers de coerção (mesma semântica de `valor || ""` do JS original)
// ---------------------------------------------------------------------------

const s = (value: unknown): string => (value ? String(value) : "");
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
const errorMessage = (error: unknown): string => s(asRecord(error).message);
const rowsOf = (value: unknown): Row[] => {
  const list = asRecord(value).value;
  return Array.isArray(list) ? list.filter(isRecord) : [];
};

// Os nomes lógicos finais dependem da metadata DEV. Não preencha com nomes
// presumidos: o adapter live permanece desativado até a solução provisionar o contrato.
export const CONTACT_SCHEMA: Readonly<{ table: string; eventTable: string; taskLookup: string; fields: Readonly<Record<string, string>> }> = Object.freeze({
  table: "",
  eventTable: "",
  taskLookup: "",
  fields: Object.freeze({}),
});

const CONTACT_SCHEMA_ERROR = "Metadata DEV de Contatos não configurada. Provisione a tabela, os eventos e o lookup da tarefa antes de usar o modo live.";
const requireContactSchema = () => {
  if (!CONTACT_SCHEMA.table || !CONTACT_SCHEMA.eventTable || !CONTACT_SCHEMA.taskLookup) throw new Error(CONTACT_SCHEMA_ERROR);
  return CONTACT_SCHEMA;
};

const API_VERSION = "v9.2";
const QUOTE_TABLE = "cr40f_pedidodecotacao";
const QUOTE_OPTION_TABLE = "cr40f_cotacaoopcao";
const QUOTE_OPTION_ITEM_TABLE = "cr40f_cotacaoopcaoitem";
const QUOTE_PROPOSAL_VERSION_TABLE = "cr40f_cotacaopropostaversao";
const QUALITY_ERROR_TABLE = "cr40f_errooperacional";
const QUALITY_ACTION_TABLE = "cr40f_acaooperacional";
const TASK_TABLE = "cr40f_plannertarefa";
const TASK_RESTRICTED_VISIBILITY_FIELD = "cr40f_visibilidade_restrita";
const WAITING_CONTEXT_FIELDS = Object.freeze({
  subject: "cr40f_aguardandosujeito",
  onType: "cr40f_aguardandotipo",
  onId: "cr40f_aguardandoid",
  onName: "cr40f_aguardandonome",
  expectedDate: "cr40f_aguardandodataretorno",
  note: "cr40f_aguardandoobservacao",
});
const EMPLOYEE_TABLE = "cr40f_funcionarios";
const EMPLOYEE_ASSIGNEE_FIELD = "cr40f_cr40f_funcionarioresponsavel";
const EVENT_TABLE = "cr40f_plannertarefaevento";
const PLANNER_EVENTS_QUERY = "?$select=cr40f_plannertarefaeventoid,_cr40f_tarefa_value,cr40f_tipo,cr40f_campo,cr40f_descricao,cr40f_valoranterior,cr40f_valornovo,cr40f_ocorridoem,_cr40f_autor_value,_createdby_value&$orderby=cr40f_ocorridoem desc";
const RELATION_TABLE = "cr40f_plannertarearelacao";
const ASSIGNEE_RELATION_TABLE = "cr40f_plannertarearesponsavel";
const TASK_TEAM_RELATION_TABLE = "cr40f_plannertarefaequipe";
const TEAM_TABLE = "cr40f_plannerequipe";
const TEAM_MEMBER_TABLE = "cr40f_plannerequipemembro";
const TEAM_PRIMARY_FIELD = "cr40f_responsavelprincipal";
const TASK_TEAM_FIELD = "cr40f_equipeplanner";
const NOTIFICATION_TABLE = "cr40f_plannernotificacao";
const EMAIL_DISPATCH_TABLE = "cr40f_plannerdisparo";
const PERSONAL_TAG_TABLE = "cr40f_plannertagpessoal";
const PERSONAL_TAG_TASK_TABLE = "cr40f_plannertagpessoaltarefa";
const IDEA_TABLE = "cr40f_boasideias";
const ENVIRONMENT_VARIABLE_DEFINITION_TABLE = "environmentvariabledefinition";
const ENVIRONMENT_VARIABLE_VALUE_TABLE = "environmentvariablevalue";
const FLOW_URL_SCHEMA = "new_URLFlowsalvararquivosSharePoint";
const READ_FLOW_URL_SCHEMA = "new_URLFlowConsultarArquivosSharePoint";
const DELETE_FLOW_URL_SCHEMA = "new_URLFlowExcluirArquivoSharePoint";
const DEV_DATAVERSE_URL = "https://org23b93544.crm2.dynamics.com";
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const IMAGE_QUALITY = 0.82;
const OPTIMIZABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_OPTIMIZER_WORKER_SOURCE = `
  self.onmessage = async ({ data }) => {
    try {
      const bitmap = await createImageBitmap(data.file);
      const scale = Math.min(1, data.maxEdge / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && data.file.size <= 900 * 1024) {
        bitmap.close?.();
        self.postMessage({ unchanged: true });
        return;
      }
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
      );
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({
        type: data.file.type,
        quality: data.file.type === "image/png" ? undefined : data.quality,
      });
      bitmap.close?.();
      const buffer = await blob.arrayBuffer();
      self.postMessage({ buffer, type: blob.type }, [buffer]);
    } catch (error) {
      self.postMessage({ error: error?.message || "Falha ao otimizar imagem." });
    }
  };
`;
const ENTITY_SETS: Readonly<Record<string, string>> = Object.freeze({
  [QUOTE_TABLE]: "cr40f_pedidodecotacaos",
  [QUOTE_OPTION_TABLE]: "cr40f_cotacaoopcaos",
  [QUOTE_OPTION_ITEM_TABLE]: "cr40f_cotacaoopcaoitems",
  [QUOTE_PROPOSAL_VERSION_TABLE]: "cr40f_cotacaopropostaversaos",
  [QUALITY_ERROR_TABLE]: "cr40f_errooperacionals",
  [QUALITY_ACTION_TABLE]: "cr40f_acaooperacionals",
  [TASK_TABLE]: "cr40f_plannertarefas",
  [EMPLOYEE_TABLE]: "cr40f_funcionarioses",
  [EVENT_TABLE]: "cr40f_plannertarefaeventos",
  [RELATION_TABLE]: "cr40f_plannertarearelacaos",
  [ASSIGNEE_RELATION_TABLE]: "cr40f_plannertarearesponsavels",
  [TASK_TEAM_RELATION_TABLE]: "cr40f_plannertarefaequipes",
  [TEAM_TABLE]: "cr40f_plannerequipes",
  [TEAM_MEMBER_TABLE]: "cr40f_plannerequipemembros",
  [NOTIFICATION_TABLE]: "cr40f_plannernotificacaos",
  [EMAIL_DISPATCH_TABLE]: "cr40f_plannerdisparos",
  [PERSONAL_TAG_TABLE]: "cr40f_plannertagpessoals",
  [PERSONAL_TAG_TASK_TABLE]: "cr40f_plannertagpessoaltarefas",
  [IDEA_TABLE]: "cr40f_boasideiases",
  [ENVIRONMENT_VARIABLE_DEFINITION_TABLE]: "environmentvariabledefinitions",
  [ENVIRONMENT_VARIABLE_VALUE_TABLE]: "environmentvariablevalues",
  systemuser: "systemusers",
  team: "teams",
});
const ORIGIN_VALUES: Record<string, number> = { manual: 100000000, quote: 100000001, quality: 100000002 };
const STATUS_VALUES: Record<string, number> = { todo: 100000000, doing: 100000001, waiting: 100000002, done: 100000003, cancelled: 100000004 };
const PRIORITY_VALUES: Record<string, number> = { low: 100000000, medium: 100000001, high: 100000002, urgent: 100000003 };
const STATUS_BY_VALUE: Record<string, string> = Object.fromEntries(Object.entries(STATUS_VALUES).map(([key, value]) => [value, key]));
const PRIORITY_BY_VALUE: Record<string, string> = Object.fromEntries(Object.entries(PRIORITY_VALUES).map(([key, value]) => [value, key]));
const QUOTE_STATUS_VALUES: Readonly<Record<string, number>> = Object.freeze({
  "Nova": 100004000,
  "Em análise pelo financeiro": 100004001,
  "Aguardando informação": 100004002,
  "Cotada": 100004003,
  "Respondida ao cliente": 100004004,
  "Cancelada": 100004005,
  "Perdida": 100004006,
  "Aceita pelo cliente": 100004007,
});
const QUOTE_PRIORITY_VALUES: Readonly<Record<string, number>> = Object.freeze({ low: 100003000, medium: 100003001, high: 100003002, urgent: 100003003 });
const QUOTE_CHANNEL_VALUES: Readonly<Record<string, number>> = Object.freeze({ WhatsApp: 100001000, Telefone: 100001001, "E-mail": 100001002 });
const lookupCache = new Map<string, string>();
let quoteClientEntitySet = "";
// Campos do pedido (V1.1): perfil do passageiro e observações internas.
const QUOTE_REQUEST_FIELDS = Object.freeze({ passengerProfile: "cr40f_perfilpassageiro", internalNotes: "cr40f_observacoesinternas" });
// Colunas opcionais da cotação (criadas por scripts/ensure-quote-*.ps1), sondadas uma vez e em paralelo.
// V2.1: o que falta, de quem e data de retorno de "Aguardando informação".
const QUOTE_WAITING_FIELDS = Object.freeze({ waitingFor: "cr40f_aguardandooque", waitingFrom: "cr40f_aguardandodequem", waitingReturnDate: "cr40f_aguardandoretorno" });
type OptionalQuoteField = "route" | "lossReason" | "longRoutes" | "requestFields" | "waiting";
const OPTIONAL_QUOTE_FIELDS: Readonly<Record<OptionalQuoteField, string[]>> = Object.freeze({
  route: ["cr40f_trajeto"],
  lossReason: ["cr40f_motivoperda"],
  longRoutes: ["cr40f_origemcompleta", "cr40f_destinocompleto"],
  requestFields: Object.values(QUOTE_REQUEST_FIELDS),
  waiting: Object.values(QUOTE_WAITING_FIELDS),
});
const quoteFieldAvailable: Record<OptionalQuoteField, boolean> = { route: false, lossReason: false, longRoutes: false, requestFields: false, waiting: false };
let optionalQuoteFieldsProbe: Promise<unknown> | null = null;
// Cotações V2 (scripts/ensure-quote-v2-dev.ps1): criador na cotação e cotação na notificação.
interface QuoteV2Schema { creator: boolean; notificationQuote: boolean }
let quoteV2SchemaProbe: Promise<QuoteV2Schema> | null = null;
let quoteScenarioSchemaChecked = false;
const scenarioEntitySets = new Map<string, string>();

function sanitizePathSegment(value: unknown, fallback = "sem-codigo") {
  const sanitized = String(value || "").trim().replace(/[<>:\"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").replace(/\.+$/g, "");
  return sanitized || fallback;
}

function extractFlowRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return asRecord(value);
  try { const parsed: unknown = JSON.parse(String(value)); return parsed && typeof parsed === "object" ? asRecord(parsed) : null; } catch { return null; }
}

export function entitySetName(logicalName: string): string {
  const entitySet = scenarioEntitySets.get(logicalName) || ENTITY_SETS[logicalName];
  if (!entitySet) throw new Error(`Entity Set não mapeado para ${logicalName}.`);
  return entitySet;
}

function isPlannerXrm(candidate: unknown): candidate is PlannerXrm {
  const utility = asRecord(asRecord(candidate).Utility);
  return typeof utility.getGlobalContext === "function" && Boolean(asRecord(candidate).WebApi);
}

function getXrm(): PlannerXrm | null {
  const candidates: unknown[] = [];
  try { candidates.push(asRecord(parent).Xrm); } catch { /* sem parent */ }
  try { candidates.push(asRecord(window).Xrm); } catch { /* sem window */ }
  const xrm = candidates.find(isPlannerXrm);
  if (xrm) return xrm;
  if (typeof window === "undefined" || !/\.crm\d*\.dynamics\.com$/i.test(window.location?.hostname || "") || !/\/webresources\//i.test(window.location?.pathname || "")) return null;
  const getGlobalContext = asRecord(window).GetGlobalContext;
  const context = typeof getGlobalContext === "function" ? asRecord(getGlobalContext()) : null;
  if (typeof context?.getClientUrl !== "function" || !context?.userSettings) throw new Error("Planner: contexto autenticado do Dataverse indisponível.");
  const globalContext: PlannerGlobalContext = {
    getClientUrl: () => s((context.getClientUrl as () => unknown)()),
    userSettings: asRecord(context.userSettings) as PlannerUserSettings,
  };
  const base = globalContext.getClientUrl().replace(/\/$/, "");
  return {
    Utility: { getGlobalContext: () => globalContext },
    Navigation: {
      openForm: ({ entityName, entityId }) => window.open(`${base}/main.aspx?${new URLSearchParams({ pagetype: "entityrecord", etn: entityName, id: entityId })}`, "_blank", "noopener"),
      openWebResource: (resource, { data } = {}) => window.open(`${base}/WebResources/${resource}${data ? `?${new URLSearchParams({ data })}` : ""}`, "_blank", "noopener"),
    },
  };
}

function cleanId(value: unknown) {
  return String(value || "").replace(/[{}]/g, "");
}

function parseStoredList(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

function parseChecklist(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(s(value) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWaitingContext(row: Row = {}) {
  return normalizeWaitingContext({
    subject: row[WAITING_CONTEXT_FIELDS.subject],
    onType: row[WAITING_CONTEXT_FIELDS.onType],
    onIds: parseStoredList(row[WAITING_CONTEXT_FIELDS.onId]),
    onNames: parseStoredList(row[WAITING_CONTEXT_FIELDS.onName]),
    expectedDate: dateOnly(row[WAITING_CONTEXT_FIELDS.expectedDate]),
    note: row[WAITING_CONTEXT_FIELDS.note],
  });
}

function waitingContextPayload(value: unknown): Payload {
  const context = normalizeWaitingContext(value);
  return {
    [WAITING_CONTEXT_FIELDS.subject]: context.subject,
    [WAITING_CONTEXT_FIELDS.onType]: context.onType,
    [WAITING_CONTEXT_FIELDS.onId]: JSON.stringify(context.onIds),
    [WAITING_CONTEXT_FIELDS.onName]: JSON.stringify(context.onNames),
    [WAITING_CONTEXT_FIELDS.expectedDate]: context.expectedDate
      ? `${context.expectedDate}T12:00:00Z`
      : null,
    [WAITING_CONTEXT_FIELDS.note]: context.note,
  };
}

function waitingTargetIds(state: LiveState, context: WaitingContext | null | undefined) {
  const targetIds: string[] = Array.isArray(context?.onIds) ? context.onIds : context?.onId ? [context.onId] : [];
  const targetNames: string[] = Array.isArray(context?.onNames) ? context.onNames : context?.onName ? [context.onName] : [];
  if (context?.onType === "employee") return [...new Set(targetIds.filter(Boolean))];
  return [...new Set((state.teams || [])
    .filter((team) => targetIds.some((id) => String(team.id) === String(id)) || targetNames.some((name) => String(team.name).toLocaleLowerCase("pt-BR") === String(name).toLocaleLowerCase("pt-BR")))
    .flatMap((team) => team.memberIds || []))];
}

async function loadCurrentUserEmail(xrm: PlannerXrm) {
  const userId = cleanId(
    xrm.Utility?.getGlobalContext?.().userSettings?.userId,
  );
  if (!userId) return "";
  try {
    const rows = await retrieveMany(
      xrm,
      "systemuser",
      `?$select=internalemailaddress&$filter=systemuserid eq ${userId}&$top=1`,
    );
    return String(rows[0]?.internalemailaddress || "").trim().toLowerCase();
  } catch (error) {
    console.warn("[Planner] email do usuário atual indisponível", error);
    return "";
  }
}

function apiUrl(xrm: PlannerXrm) {
  const base = xrm.Utility.getGlobalContext().getClientUrl()?.replace(/\/$/, "");
  if (!base) throw new Error("Não foi possível obter a URL do ambiente Dataverse.");
  return `${base}/api/data/${API_VERSION}`;
}

function formatLookup(row: Row, attribute: string, fallback = "Não atribuído") {
  return s(row[`_${attribute}_value@OData.Community.Display.V1.FormattedValue`]) || fallback;
}

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : "";
}

interface RequestOptions { method?: string; body?: string; headers?: Record<string, string> }

async function request(xrm: PlannerXrm, path: string, options: RequestOptions = {}): Promise<unknown> {
  const retryable = (status: number) => status === 408 || status === 429 || status >= 500;
  const method = options.method || "GET";
  const logFailure = (error: unknown, errorCode: string) => void logAppError(error, {
    source: "Dataverse", action: `${method} ${sanitizeDataversePath(path)}`, phase: "dataverse", component: "request", errorCode,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${apiUrl(xrm)}${path}`, {
        credentials: "include",
        ...options,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Prefer: 'odata.include-annotations="*",return=representation',
          ...(options.headers || {}),
        },
      });
    } catch (networkError) {
      logFailure(networkError, "network");
      throw networkError;
    }
    const body = await response.text();
    let parsed: unknown = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }
    if (response.ok) return parsed;
    const parsedError = asRecord(asRecord(parsed).error);
    if (!retryable(response.status) || attempt === 2) {
      const detail = s(parsedError.message) || body || response.statusText;
      const error = new Error(`${method} ${path} falhou: ${response.status} ${detail}`);
      logFailure(error, parsedError.code ? `${response.status} ${String(parsedError.code)}` : String(response.status));
      throw error;
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    await new Promise((resolve) => window.setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 400 * (attempt + 1)));
  }
  return undefined;
}

function nextLinkPath(result: unknown) {
  const link = s(asRecord(result)["@odata.nextLink"]);
  return link ? new URL(link).pathname.replace(`/api/data/${API_VERSION}`, "") + new URL(link).search : "";
}

async function retrieveMany(xrm: PlannerXrm, table: string, query: string): Promise<Row[]> {
  const rows: Row[] = [];
  let next = `/${entitySetName(table)}${query}`;
  while (next) {
    const result = await request(xrm, next);
    rows.push(...rowsOf(result));
    next = nextLinkPath(result);
  }
  return rows;
}

async function retrieveOptional(xrm: PlannerXrm, table: string, query: string, label?: string): Promise<Row[]> {
  try { return await retrieveMany(xrm, table, query); }
  catch (error) {
    console.warn(`[Planner] ${label || table} indisponível; usando fallback compatível`, error);
    return [];
  }
}

function plannerTaskQuery(includeTeamLookup = true, includeWaitingContext = true) {
  const fields = [
    "cr40f_plannertarefaid",
    "cr40f_name",
    "cr40f_titulo",
    "cr40f_descricao",
    "cr40f_checklistjson",
    "cr40f_status",
    "cr40f_prioridade",
    TASK_RESTRICTED_VISIBILITY_FIELD,
    "cr40f_prazo",
    "createdon",
    "modifiedon",
    ...(includeWaitingContext ? Object.values(WAITING_CONTEXT_FIELDS) : []),
    "_createdby_value",
    `_${EMPLOYEE_ASSIGNEE_FIELD}_value`,
    "_cr40f_equipe_value",
    ...(includeTeamLookup ? [`_${TASK_TEAM_FIELD}_value`] : []),
    "_cr40f_pedidocotacao_value",
    "_cr40f_errooperacional_value",
    "_cr40f_acaooperacional_value",
    "cr40f_origem",
    "cr40f_codigoorigem",
  ];
  return `?$select=${fields.join(",")}&$filter=statecode eq 0&$orderby=modifiedon desc`;
}

async function retrievePlannerTasks(xrm: PlannerXrm): Promise<Row[]> {
  try {
    return await retrieveMany(xrm, TASK_TABLE, plannerTaskQuery(true));
  } catch (error) {
    console.warn("[Planner] consulta completa de tarefas indisponível; tentando contrato compatível", error);
    try {
      return await retrieveMany(xrm, TASK_TABLE, plannerTaskQuery(true, false));
    } catch (optionalFieldsError) {
      console.warn("[Planner] campos opcionais de Aguardando indisponíveis; carregando sem contexto de retorno", optionalFieldsError);
      return retrieveMany(xrm, TASK_TABLE, plannerTaskQuery(false, false));
    }
  }
}

async function resolveEnvironmentVariableUrl(xrm: PlannerXrm, schemaName: string, fallback = "") {
  const definitions = await retrieveMany(xrm, ENVIRONMENT_VARIABLE_DEFINITION_TABLE, `?$select=environmentvariabledefinitionid,defaultvalue&$filter=schemaname eq '${schemaName}'&$top=1`);
  const definition = definitions[0];
  if (!definition) return fallback.trim();
  const values = await retrieveMany(xrm, ENVIRONMENT_VARIABLE_VALUE_TABLE, `?$select=value&$filter=_environmentvariabledefinitionid_value eq ${String(definition.environmentvariabledefinitionid)}&$top=1`);
  return String(values[0]?.value || definition.defaultvalue || fallback).trim();
}

async function resolveSharePointFlowUrl(xrm: PlannerXrm) {
  return resolveEnvironmentVariableUrl(xrm, FLOW_URL_SCHEMA, String(import.meta.env?.VITE_FLOW_SALVAR_ANEXOS_SHAREPOINT_URL || ""));
}

async function resolveSharePointReadFlowUrl(xrm: PlannerXrm) {
  return resolveEnvironmentVariableUrl(xrm, READ_FLOW_URL_SCHEMA);
}

async function resolveSharePointDeleteFlowUrl(xrm: PlannerXrm) {
  return resolveEnvironmentVariableUrl(xrm, DELETE_FLOW_URL_SCHEMA, String(import.meta.env?.VITE_FLOW_EXCLUIR_ANEXO_SHAREPOINT_URL || ""));
}

async function resolveLookupNavigation(xrm: PlannerXrm, entity: string, attribute: string, target: string): Promise<string> {
  const cacheKey = `${entity}:${attribute}:${target}`;
  const cached = lookupCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const metadata = await request(xrm, `/EntityDefinitions(LogicalName='${entity}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity`);
  const relationship = rowsOf(metadata).find((item) => s(item.ReferencingAttribute).toLowerCase() === attribute.toLowerCase() && s(item.ReferencedEntity).toLowerCase() === target.toLowerCase());
  if (!relationship?.ReferencingEntityNavigationPropertyName) throw new Error(`Metadata incompleto: lookup ${entity}.${attribute} não aponta para ${target}.`);
  const navigation = String(relationship.ReferencingEntityNavigationPropertyName);
  lookupCache.set(cacheKey, navigation);
  return navigation;
}

async function bindLookup(xrm: PlannerXrm, payload: Payload, entity: string, attribute: string, target: string, id: unknown) {
  if (!id) return;
  const navigation = await resolveLookupNavigation(xrm, entity, attribute, target);
  payload[`${navigation}@odata.bind`] = `/${entitySetName(target)}(${cleanId(id)})`;
}

function normalizeLivePersonalTag(row: Row, currentUserId: string): PersonalTag {
  return normalizePersonalTag({
    id: row.cr40f_plannertagpessoalid,
    name: row.cr40f_nome || row.cr40f_name || "",
    color: row.cr40f_cor,
    sortOrder: row.cr40f_ordem,
    archived: row.cr40f_arquivada,
    ownerUserId: row._cr40f_usuario_value || currentUserId,
  }, currentUserId);
}

interface PersonalTagData { personalTags?: PersonalTag[]; personalTagAssignments?: PersonalTagAssignment[]; personalTagsUnavailable?: boolean }

async function loadLivePersonalTagData(xrm: PlannerXrm, currentUserId: string): Promise<PersonalTagData> {
  if (!currentUserId) return { personalTags: [], personalTagAssignments: [] };
  try {
    const [tagRows, relationRows] = await Promise.all([
      retrieveMany(xrm, PERSONAL_TAG_TABLE, `?$select=cr40f_plannertagpessoalid,cr40f_name,cr40f_nome,cr40f_cor,cr40f_ordem,cr40f_arquivada,_cr40f_usuario_value&$filter=_cr40f_usuario_value eq ${cleanId(currentUserId)} and statecode eq 0&$orderby=cr40f_ordem asc,cr40f_nome asc`),
      retrieveMany(xrm, PERSONAL_TAG_TASK_TABLE, `?$select=cr40f_plannertagpessoaltarefaid,_cr40f_tag_value,_cr40f_tarefa_value,_cr40f_usuario_value&$filter=_cr40f_usuario_value eq ${cleanId(currentUserId)} and statecode eq 0`),
    ]);
    return {
      personalTags: tagRows.map((row) => normalizeLivePersonalTag(row, currentUserId)),
      personalTagAssignments: relationRows.map((row) => ({ id: s(row.cr40f_plannertagpessoaltarefaid), tagId: s(row._cr40f_tag_value), taskId: s(row._cr40f_tarefa_value), ownerUserId: s(row._cr40f_usuario_value) || currentUserId })),
    };
  } catch (error) {
    console.warn("[Planner] tags pessoais indisponíveis; mantendo o Planner operacional", error);
    return { personalTags: [], personalTagAssignments: [], personalTagsUnavailable: true };
  }
}

function applyPersonalTagsToTasks<T extends Task>(tasks: T[] = [], assignments: PersonalTagAssignment[] = []): T[] {
  const tagsByTask = new Map<string, string[]>();
  assignments.forEach((item) => {
    const list = tagsByTask.get(item.taskId) || [];
    list.push(item.tagId);
    tagsByTask.set(item.taskId, list);
  });
  return tasks.map((task) => ({ ...task, personalTagIds: normalizePersonalTagIds(tagsByTask.get(task.id) || task.personalTagIds) }));
}

async function createLivePersonalTag(xrm: PlannerXrm, state: LiveState, input: { name?: unknown; color?: unknown; ownerUserId?: unknown } = {}) {
  const ownerUserId = cleanId(input.ownerUserId || state.currentUserId);
  const existing = (state.personalTags || []).filter((tag) => tag.ownerUserId === ownerUserId);
  const name = String(input.name || "").trim().slice(0, 32);
  const duplicate = existing.some((tag) => normalizePersonalTag(tag).name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0);
  if (!name) throw new Error("Informe um nome para a tag.");
  if (duplicate) throw new Error("Você já tem uma tag com esse nome.");
  const payload: Payload = { cr40f_name: name, cr40f_nome: name, cr40f_cor: input.color || "#1d5ce8", cr40f_ordem: existing.length, cr40f_arquivada: false };
  await bindLookup(xrm, payload, PERSONAL_TAG_TABLE, "cr40f_usuario", "systemuser", ownerUserId);
  const created = asRecord(await request(xrm, `/${entitySetName(PERSONAL_TAG_TABLE)}`, { method: "POST", body: JSON.stringify(payload) }));
  if (!created?.cr40f_plannertagpessoalid) throw new Error("Dataverse criou a tag sem retornar o ID.");
  return loadLiveState(xrm);
}

function normalizeLiveIdea(row: Row): LiveIdea {
  return {
    id: s(row.cr40f_boasideiasid),
    title: s(row.cr40f_name),
    details: s(row.cr40f_detalhes),
    status: row.cr40f_status ?? 100000000,
    createdAt: s(row.createdon),
    author: s(row["_createdby_value@OData.Community.Display.V1.FormattedValue"]),
  };
}

async function loadLiveIdeas(xrm: PlannerXrm) {
  const rows = await retrieveMany(xrm, IDEA_TABLE, "?$select=cr40f_boasideiasid,cr40f_name,cr40f_detalhes,cr40f_status,createdon,_createdby_value&$filter=statecode eq 0&$orderby=createdon desc");
  return rows.map(normalizeLiveIdea);
}

async function createLiveIdea(xrm: PlannerXrm, input: IdeaInput = {}) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Informe o título da ideia.");
  if (title.length > 100) throw new Error("O título deve ter até 100 caracteres.");
  const created = asRecord(await request(xrm, `/${entitySetName(IDEA_TABLE)}`, {
    method: "POST",
    body: JSON.stringify({ cr40f_name: title, cr40f_detalhes: String(input.details || "").trim(), cr40f_status: 100000000 }),
  }));
  if (!created?.cr40f_boasideiasid) throw new Error("Dataverse criou a ideia sem retornar o ID.");
  return normalizeLiveIdea(created);
}

interface IdeaPatchBody { cr40f_status?: number; cr40f_name?: string; cr40f_detalhes?: string }

function ideaPatchBody(input: IdeaInput | number | null | undefined): IdeaPatchBody {
  const patch: IdeaInput = typeof input === "number" ? { status: input } : (input || {});
  const body: IdeaPatchBody = {};
  if (patch.status !== undefined) {
    const allowedStatuses = new Set<unknown>([100000000, 100000001, 100000002, 100000003]);
    if (!allowedStatuses.has(patch.status)) throw new Error("Status de ideia inválido.");
    body.cr40f_status = Number(patch.status);
  }
  if (patch.title !== undefined) {
    const title = String(patch.title || "").trim();
    if (!title) throw new Error("Informe o título da ideia.");
    if (title.length > 100) throw new Error("O título deve ter até 100 caracteres.");
    body.cr40f_name = title;
  }
  if (patch.details !== undefined) {
    const details = String(patch.details || "").trim();
    if (details.length > 2000) throw new Error("Os detalhes devem ter até 2000 caracteres.");
    body.cr40f_detalhes = details;
  }
  return body;
}

async function updateLiveIdea(xrm: PlannerXrm, id: string, input: IdeaInput | number) {
  const body = ideaPatchBody(input);
  if (!Object.keys(body).length) return;
  await request(xrm, `/${entitySetName(IDEA_TABLE)}(${cleanId(id)})`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "If-Match": "*" },
  });
}

async function archiveLiveIdea(xrm: PlannerXrm, id: string) {
  await request(xrm, `/${entitySetName(IDEA_TABLE)}(${cleanId(id)})`, {
    method: "PATCH",
    body: JSON.stringify({ statecode: 1, statuscode: 2 }),
    headers: { "If-Match": "*" },
  });
}

interface PersonalTagPatch { name?: unknown; color?: unknown; sortOrder?: unknown; archived?: unknown }

async function updateLivePersonalTag(xrm: PlannerXrm, state: LiveState, id: string, patch: PersonalTagPatch = {}) {
  const existing = (state.personalTags || []).find((tag) => tag.id === id);
  if (!existing) throw new Error("Tag pessoal não encontrada.");
  const name = patch.name === undefined ? existing.name : String(patch.name || "").trim().slice(0, 32);
  if (!name) throw new Error("Informe um nome para a tag.");
  const duplicate = (state.personalTags || []).some((tag) => tag.id !== id && tag.ownerUserId === existing.ownerUserId && normalizePersonalTag(tag).name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0);
  if (duplicate) throw new Error("Você já tem uma tag com esse nome.");
  const payload: Payload = { cr40f_name: name, cr40f_nome: name };
  if (patch.color !== undefined) payload.cr40f_cor = patch.color;
  if (patch.sortOrder !== undefined) payload.cr40f_ordem = Math.max(0, Number(patch.sortOrder) || 0);
  if (patch.archived !== undefined) payload.cr40f_arquivada = Boolean(patch.archived);
  await request(xrm, `/${entitySetName(PERSONAL_TAG_TABLE)}(${cleanId(id)})`, { method: "PATCH", body: JSON.stringify(payload) });
  return loadLiveState(xrm);
}

async function reorderLivePersonalTags(xrm: PlannerXrm, _state: LiveState, orderedIds: string[] = []) {
  await Promise.all(orderedIds.map((id, index) => request(xrm, `/${entitySetName(PERSONAL_TAG_TABLE)}(${cleanId(id)})`, { method: "PATCH", body: JSON.stringify({ cr40f_ordem: index }) })));
  return loadLiveState(xrm);
}

async function replaceLiveTaskPersonalTags(xrm: PlannerXrm, state: LiveState, taskId: string, tagIds: string[] | { tagIds?: unknown } = {}, ownerUserId: unknown = state.currentUserId) {
  const ids = normalizePersonalTagIds(Array.isArray(tagIds) ? tagIds : tagIds.tagIds);
  const nextIds = resolveOwnedPersonalTagIds(state.personalTags || [], ids, ownerUserId);
  const current = await retrieveMany(xrm, PERSONAL_TAG_TASK_TABLE, `?$select=cr40f_plannertagpessoaltarefaid&$filter=_cr40f_usuario_value eq ${cleanId(ownerUserId)} and _cr40f_tarefa_value eq ${cleanId(taskId)} and statecode eq 0`);
  await Promise.all(current.map((row) => request(xrm, `/${entitySetName(PERSONAL_TAG_TASK_TABLE)}(${cleanId(row.cr40f_plannertagpessoaltarefaid)})`, { method: "DELETE" })));
  await Promise.all(nextIds.map(async (tagId) => {
    const payload: Payload = { cr40f_name: `${cleanId(taskId)}-${cleanId(tagId)}-${cleanId(ownerUserId)}` };
    await bindLookup(xrm, payload, PERSONAL_TAG_TASK_TABLE, "cr40f_tarefa", TASK_TABLE, taskId);
    await bindLookup(xrm, payload, PERSONAL_TAG_TASK_TABLE, "cr40f_tag", PERSONAL_TAG_TABLE, tagId);
    await bindLookup(xrm, payload, PERSONAL_TAG_TASK_TABLE, "cr40f_usuario", "systemuser", ownerUserId);
    await request(xrm, `/${entitySetName(PERSONAL_TAG_TASK_TABLE)}`, { method: "POST", body: JSON.stringify(payload) });
  }));
  return loadLiveState(xrm);
}

export function normalizeMicrosoftEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function reconcileEmployeeUserLinks(xrm: PlannerXrm, employees: Row[] = []) {
  const missingByEmail = new Map<string, Row[]>();
  employees.forEach((employee) => {
    if (employee._cr40f_usuariodataverse_value) return;
    const email = normalizeMicrosoftEmail(employee.cr40f_emailmicrosoft);
    if (!email) return;
    const matches = missingByEmail.get(email) || [];
    matches.push(employee);
    missingByEmail.set(email, matches);
  });

  await Promise.all([...missingByEmail.entries()].map(async ([email, matches]) => {
    try {
      const escapedEmail = email.replace(/'/g, "''");
      const users = await retrieveMany(
        xrm,
        "systemuser",
        `?$select=systemuserid,internalemailaddress,isdisabled&$filter=internalemailaddress eq '${escapedEmail}' and isdisabled eq false&$top=2`,
      );
      const exactUsers = users.filter(
        (user) => normalizeMicrosoftEmail(user.internalemailaddress) === email && !user.isdisabled,
      );
      if (exactUsers.length !== 1) {
        console.warn(`[Planner] vínculo Microsoft não aplicado para ${email}: ${exactUsers.length} usuário(s) ativo(s) correspondente(s).`);
        return;
      }
      const userId = cleanId(exactUsers[0].systemuserid);
      await Promise.all(matches.map(async (employee) => {
        const payload: Payload = {};
        await bindLookup(xrm, payload, EMPLOYEE_TABLE, "cr40f_usuariodataverse", "systemuser", userId);
        await request(xrm, `/${entitySetName(EMPLOYEE_TABLE)}(${cleanId(employee.cr40f_funcionariosid)})`, { method: "PATCH", body: JSON.stringify(payload) });
        employee._cr40f_usuariodataverse_value = userId;
      }));
    } catch (error) {
      console.warn(`[Planner] falha ao vincular usuário Microsoft para ${email}`, error);
    }
  }));

  return employees;
}

async function markQuoteOrigin(xrm: PlannerXrm, quoteId: unknown, taskId: unknown = "") {
  if (!quoteId) return;
  const clientUrl = xrm.Utility?.getGlobalContext?.().getClientUrl?.() || window.location.origin;
  const patch: Payload = { cr40f_origemultimasincronizacao: "Planner", cr40f_ultimasincronizacao: new Date().toISOString() };
  if (taskId) { patch.cr40f_plannertaskid = taskId; patch.cr40f_linktarefaplanner = `${clientUrl}/WebResources/new_TelaPlanner.html?data=taskId=${cleanId(taskId)}`; }
  await request(xrm, `/${entitySetName(QUOTE_TABLE)}(${cleanId(quoteId)})`, { method: "PATCH", body: JSON.stringify(patch) });
}

function choiceKey(choices: Readonly<Record<string, number>>, value: unknown) {
  return Object.entries(choices).find(([, choice]) => choice === value)?.[0];
}

function normalizeQuote(row: Row): LiveQuote {
  return {
    id: s(row.cr40f_pedidodecotacaoid),
    code: s(row.cr40f_numerodacotacao),
    title: s(row.cr40f_titulo) || "Sem título",
    client: s(row.cr40f_clienteempresa),
    clientId: s(row._cr40f_cliente_value),
    status: choiceKey(QUOTE_STATUS_VALUES, row.cr40f_statuscotacao) || s(row["cr40f_statuscotacao@OData.Community.Display.V1.FormattedValue"]),
    channel: s(row["cr40f_canalentrada@OData.Community.Display.V1.FormattedValue"]) || choiceKey(QUOTE_CHANNEL_VALUES, row.cr40f_canalentrada) || "",
    clientContact: s(row.cr40f_contatocliente),
    clientEmail: s(row.cr40f_emailcliente),
    clientPhone: s(row.cr40f_telefonewhatsapp),
    vehicleType: choiceKey(QUOTE_VEHICLE_VALUES, row.cr40f_tipoveiculo) || s(row["cr40f_tipoveiculo@OData.Community.Display.V1.FormattedValue"]),
    origin: String(row.cr40f_origemcompleta ?? row.cr40f_origem ?? ""),
    destination: String(row.cr40f_destinocompleto ?? row.cr40f_destino ?? ""),
    route: normalizeQuoteRoute(row.cr40f_trajeto || [row.cr40f_origemcompleta ?? row.cr40f_origem, row.cr40f_destinocompleto ?? row.cr40f_destino].filter(Boolean).join(" / ")),
    serviceDate: s(row.cr40f_datahoraservico),
    returnDate: s(row.cr40f_datahoraretorno),
    passengers: row.cr40f_quantidadepassageiros == null ? "" : String(row.cr40f_quantidadepassageiros),
    hasReturn: Boolean(row.cr40f_retorno),
    notes: s(row.cr40f_observacoespedido),
    passengerProfile: s(row[QUOTE_REQUEST_FIELDS.passengerProfile]),
    internalNotes: s(row[QUOTE_REQUEST_FIELDS.internalNotes]),
    priority: choiceKey(QUOTE_PRIORITY_VALUES, row.cr40f_prioridade) || "medium",
    commercialTerms: s(row.cr40f_condicaocomercial),
    responseSent: Boolean(row.cr40f_respostaenviadacliente),
    finalizationAt: s(row.cr40f_datahorafinalizacao),
    lossReason: s(row.cr40f_motivoperda),
    waitingFor: s(row[QUOTE_WAITING_FIELDS.waitingFor]),
    waitingFrom: s(row[QUOTE_WAITING_FIELDS.waitingFrom]),
    waitingReturnDate: dateOnly(row[QUOTE_WAITING_FIELDS.waitingReturnDate]),
    optionsVersion: s(row.cr40f_opcoesversao),
    acceptedOptionId: s(row.cr40f_opcaoaceitaid),
    acceptedOptionRecordId: s(row._cr40f_opcaoaceita_value),
    acceptedProposalVersionId: s(row._cr40f_versaopropostaaceita_value),
    etag: s(row["@odata.etag"]),
    deadline: dateOnly(row.cr40f_prazoresponder),
    value: row.cr40f_valorcotado == null ? "" : String(row.cr40f_valorcotado),
    plannerTaskId: s(row.cr40f_plannertaskid),
    creatorEmployeeId: s(row._cr40f_criador_value),
    plannerLink: s(row.cr40f_linktarefaplanner),
    teamsLink: s(row.cr40f_linkmensagemteams),
  };
}

const QUOTE_SELECT = [
  "cr40f_pedidodecotacaoid", "cr40f_numerodacotacao", "cr40f_titulo", "cr40f_clienteempresa", "_cr40f_cliente_value", "cr40f_contatocliente", "cr40f_telefonewhatsapp", "cr40f_emailcliente", "cr40f_canalentrada", "cr40f_tipoveiculo", "cr40f_origem", "cr40f_destino", "cr40f_datahoraservico", "cr40f_retorno", "cr40f_datahoraretorno", "cr40f_quantidadepassageiros", "cr40f_observacoespedido", "cr40f_prioridade", "cr40f_statuscotacao", "cr40f_prazoresponder", "cr40f_valorcotado", "cr40f_condicaocomercial", "cr40f_respostaenviadacliente", "cr40f_datahorafinalizacao", "cr40f_plannertaskid", "cr40f_linktarefaplanner", "cr40f_linkmensagemteams", "cr40f_opcoesversao", "cr40f_opcaoaceitaid", "_cr40f_opcaoaceita_value", "_cr40f_versaopropostaaceita_value",
].join(",");

// Só 404 significa "coluna não existe"; outro erro (rede, 401) não pode virar
// ausência cacheada, senão todo salvamento passa a recusar os campos opcionais.
async function attributeExists(xrm: PlannerXrm, field: string, table: string = QUOTE_TABLE) {
  try { await request(xrm, `/EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${field}')?$select=LogicalName`); return true; }
  catch (error) {
    if (!errorMessage(error).includes("404")) throw error;
    console.warn(`[Planner] coluna opcional ${table}.${field} não existe neste ambiente (scripts/ensure-quote-*-dev.ps1).`);
    return false;
  }
}

function probeQuoteV2Schema(xrm: PlannerXrm): Promise<QuoteV2Schema> {
  quoteV2SchemaProbe ??= Promise.all([attributeExists(xrm, "cr40f_criador"), attributeExists(xrm, "cr40f_cotacao", NOTIFICATION_TABLE)])
    .then(([creator, notificationQuote]) => {
      if (!creator || !notificationQuote) void logAppError(new Error("Schema da V2 de cotações ausente: avisos de cotação desligados."), { action: "probeQuoteV2Schema", severity: "warning", source: "planner-quotes-v2", errorCode: "QUOTE_V2_SCHEMA_MISSING", payload: { creator, notificationQuote } });
      return { creator, notificationQuote };
    })
    .catch((error: unknown) => { quoteV2SchemaProbe = null; throw error; });
  return quoteV2SchemaProbe;
}

// Avisos de cotação vão direto para cr40f_plannernotificacao (sininho), com dedupe
// pela chave. Falha aqui nunca derruba a gravação da cotação: só registra no log.
export async function createQuoteNotifications(xrm: PlannerXrm, notices: QuoteNotice[]): Promise<void> {
  if (!notices.length) return;
  try {
    const schema = await probeQuoteV2Schema(xrm);
    if (!schema.notificationQuote) return;
    const keys = [...new Set(notices.map((item) => item.dedupeKey))];
    const filter = keys.map((key) => `cr40f_chavededupe eq '${key.replace(/'/g, "''")}'`).join(" or ");
    const existing = new Set((await retrieveMany(xrm, NOTIFICATION_TABLE, `?$select=cr40f_chavededupe&$filter=${filter}`)).map((row) => s(row.cr40f_chavededupe)));
    const [recipientNavigation, quoteNavigation] = await Promise.all([
      resolveLookupNavigation(xrm, NOTIFICATION_TABLE, "cr40f_destinatario", EMPLOYEE_TABLE),
      resolveLookupNavigation(xrm, NOTIFICATION_TABLE, "cr40f_cotacao", QUOTE_TABLE),
    ]);
    const occurredAt = new Date().toISOString();
    const pending = [...new Map(notices.filter((item) => !existing.has(item.dedupeKey)).map((item) => [item.dedupeKey, item])).values()];
    // Um aviso que falha (destinatário inativo, permissão) não impede os demais.
    const results = await Promise.allSettled(pending.map((item) => request(xrm, `/${entitySetName(NOTIFICATION_TABLE)}`, { method: "POST", body: JSON.stringify({
      cr40f_name: item.title.slice(0, 100), cr40f_titulo: item.title, cr40f_mensagem: item.message, cr40f_tipo: item.type,
      cr40f_chavededupe: item.dedupeKey, cr40f_datareferencia: item.referenceDate || null, cr40f_ocorridoem: occurredAt,
      [`${recipientNavigation}@odata.bind`]: `/${entitySetName(EMPLOYEE_TABLE)}(${cleanId(item.recipientEmployeeId)})`,
      [`${quoteNavigation}@odata.bind`]: `/${entitySetName(QUOTE_TABLE)}(${cleanId(item.quoteId)})`,
    }) })));
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) throw failed.reason;
  } catch (error) {
    console.warn("[Planner] aviso de cotação não gravado", error);
    void logAppError(error, { action: "createQuoteNotifications", severity: "warning", source: "planner-quotes-v2", errorCode: "QUOTE_NOTICE_FAILED" });
  }
}

function probeOptionalQuoteFields(xrm: PlannerXrm) {
  optionalQuoteFieldsProbe ??= Promise.all((Object.entries(OPTIONAL_QUOTE_FIELDS) as Array<[OptionalQuoteField, string[]]>).map(async ([key, fields]) => {
    quoteFieldAvailable[key] = (await Promise.all(fields.map((field) => attributeExists(xrm, field)))).every(Boolean);
  })).catch((error: unknown) => { optionalQuoteFieldsProbe = null; throw error; });
  return optionalQuoteFieldsProbe;
}

function loadActiveQuotes(xrm: PlannerXrm, quoteFields: string) {
  return retrieveMany(xrm, QUOTE_TABLE, `?$select=${quoteFields}&$filter=statecode eq 0&$orderby=modifiedon desc`);
}

async function quoteSelect(xrm: PlannerXrm) {
  await probeOptionalQuoteFields(xrm);
  if (!quoteScenarioSchemaChecked) {
    try {
      for (const table of [QUOTE_OPTION_TABLE, QUOTE_OPTION_ITEM_TABLE, QUOTE_PROPOSAL_VERSION_TABLE]) {
        const metadata = asRecord(await request(xrm, `/EntityDefinitions(LogicalName='${table}')?$select=EntitySetName`));
        if (!metadata?.EntitySetName) throw new Error(`Entity Set ausente para ${table}.`);
        scenarioEntitySets.set(table, String(metadata.EntitySetName));
      }
      await request(xrm, `/EntityDefinitions(LogicalName='${QUOTE_TABLE}')/Attributes(LogicalName='cr40f_opcoesversao')?$select=LogicalName`);
      quoteScenarioSchemaChecked = true;
    } catch (error) {
      throw new Error(`Schema de opções de cotação indisponível em DEV. Publique as entidades e relacionamentos antes de usar cotações com opções. ${errorMessage(error)}`);
    }
  }
  const v2 = await probeQuoteV2Schema(xrm);
  return [QUOTE_SELECT, ...(Object.entries(OPTIONAL_QUOTE_FIELDS) as Array<[OptionalQuoteField, string[]]>).flatMap(([key, fields]) => quoteFieldAvailable[key] ? fields : []), ...(v2.creator ? ["_cr40f_criador_value"] : [])].join(",");
}

function scenarioId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (key) => { const value = Math.floor(Math.random() * 16); return (key === "x" ? value : (value & 3) | 8).toString(16); });
}

function scenarioJson(value: unknown): Record<string, unknown> {
  try { return value ? asRecord(JSON.parse(String(value))) : {}; } catch { throw new Error("Dados salvos de opções de cotação estão inválidos. A edição foi interrompida para preservar o histórico."); }
}

function quoteIdsFilter(attribute: string, ids: unknown[]) {
  return ids.map((id) => `${attribute} eq ${cleanId(id)}`).join(" or ");
}

async function loadQuoteScenarioData(xrm: PlannerXrm, rawQuotes: Row[]): Promise<LiveQuote[]> {
  const quotes = rawQuotes.map(normalizeQuote);
  if (!quotes.length) return quotes;
  const quoteIds = quotes.map((quote) => quote.id).filter(Boolean);
  const quoteFilter = quoteIdsFilter("_cr40f_pedidocotacao_value", quoteIds);
  const [optionRows, versionRows] = await Promise.all([
    retrieveMany(xrm, QUOTE_OPTION_TABLE, `?$select=cr40f_cotacaoopcaoid,cr40f_nome,cr40f_conteudo,cr40f_revisao,_cr40f_pedidocotacao_value&$filter=statecode eq 0 and (${quoteFilter})`),
    retrieveMany(xrm, QUOTE_PROPOSAL_VERSION_TABLE, `?$select=cr40f_cotacaopropostaversaoid,cr40f_nome,cr40f_conteudo,cr40f_autornome,cr40f_autorid,cr40f_enviadoem,_cr40f_pedidocotacao_value&$filter=statecode eq 0 and (${quoteFilter})&$orderby=cr40f_enviadoem asc`),
  ]);
  const activeOptions = optionRows.filter((row) => {
    const quote = quotes.find((item) => cleanId(item.id) === cleanId(row._cr40f_pedidocotacao_value));
    return quote && quote.optionsVersion && quote.optionsVersion === row.cr40f_revisao;
  });
  const optionRecordIds = activeOptions.map((row) => row.cr40f_cotacaoopcaoid);
  const itemRows = optionRecordIds.length ? await retrieveMany(xrm, QUOTE_OPTION_ITEM_TABLE, `?$select=cr40f_cotacaoopcaoitemid,cr40f_conteudo,_cr40f_opcao_value&$filter=statecode eq 0 and (${quoteIdsFilter("_cr40f_opcao_value", optionRecordIds)})`) : [];
  const itemsByOption = new Map<string, Record<string, unknown>[]>();
  for (const row of itemRows) {
    const item = scenarioJson(row.cr40f_conteudo);
    const list = itemsByOption.get(cleanId(row._cr40f_opcao_value)) || [];
    list.push({ ...item, id: item.id || row.cr40f_cotacaoopcaoitemid });
    itemsByOption.set(cleanId(row._cr40f_opcao_value), list);
  }
  const optionsByQuote = new Map<string, LiveQuoteOption[]>();
  for (const row of activeOptions) {
    const option = { ...scenarioJson(row.cr40f_conteudo), items: itemsByOption.get(cleanId(row.cr40f_cotacaoopcaoid)) || [], recordId: s(row.cr40f_cotacaoopcaoid) } as LiveQuoteOption;
    const list = optionsByQuote.get(cleanId(row._cr40f_pedidocotacao_value)) || [];
    list.push(option);
    optionsByQuote.set(cleanId(row._cr40f_pedidocotacao_value), list);
  }
  const versionsByQuote = new Map<string, QuoteProposalVersion[]>();
  for (const row of versionRows) {
    const content = scenarioJson(row.cr40f_conteudo);
    const version = { ...content, id: content.id || row.cr40f_cotacaopropostaversaoid, createdAt: content.createdAt || row.cr40f_enviadoem || "", authorId: row.cr40f_autorid || content.authorId || "", authorName: row.cr40f_autornome || content.authorName || "" } as QuoteProposalVersion;
    const list = versionsByQuote.get(cleanId(row._cr40f_pedidocotacao_value)) || [];
    list.push(version);
    versionsByQuote.set(cleanId(row._cr40f_pedidocotacao_value), list);
  }
  return quotes.map((quote) => ({
    ...quote,
    etag: s(rawQuotes.find((row) => cleanId(row.cr40f_pedidodecotacaoid) === cleanId(quote.id))?.["@odata.etag"]),
    options: optionsByQuote.get(cleanId(quote.id)) || [],
    proposalVersions: (versionsByQuote.get(cleanId(quote.id)) || []).sort((left, right) => (Number(left.number) || 0) - (Number(right.number) || 0) || String(left.createdAt).localeCompare(String(right.createdAt))),
  }));
}

async function deleteScenarioRows(xrm: PlannerXrm, optionRows: Row[]) {
  for (const option of optionRows) {
    const optionId = option.cr40f_cotacaoopcaoid;
    const items = await retrieveMany(xrm, QUOTE_OPTION_ITEM_TABLE, `?$select=cr40f_cotacaoopcaoitemid&$filter=_cr40f_opcao_value eq ${cleanId(optionId)}`);
    await Promise.all(items.map((item) => request(xrm, `/${entitySetName(QUOTE_OPTION_ITEM_TABLE)}(${cleanId(item.cr40f_cotacaoopcaoitemid)})`, { method: "DELETE" })));
    await request(xrm, `/${entitySetName(QUOTE_OPTION_TABLE)}(${cleanId(optionId)})`, { method: "DELETE" });
  }
}

async function writeQuoteOptions(xrm: PlannerXrm, quoteId: string, options: QuoteOptionData[] | undefined, revisionId: string) {
  const created: Row[] = [];
  const optionNavigation = await resolveLookupNavigation(xrm, QUOTE_OPTION_TABLE, "cr40f_pedidocotacao", QUOTE_TABLE);
  const itemNavigation = await resolveLookupNavigation(xrm, QUOTE_OPTION_ITEM_TABLE, "cr40f_opcao", QUOTE_OPTION_TABLE);
  try {
    const list = options || [];
    for (let index = 0; index < list.length; index += 1) {
      const option = list[index];
      const optionRecordId = scenarioId();
      const { items = [], ...details } = option;
      const content = { ...details, id: option.id || scenarioId() };
      await request(xrm, `/${entitySetName(QUOTE_OPTION_TABLE)}`, { method: "POST", body: JSON.stringify({ cr40f_cotacaoopcaoid: optionRecordId, cr40f_nome: String(option.name || `Opção ${index + 1}`).slice(0, 100), cr40f_conteudo: JSON.stringify(content), cr40f_revisao: revisionId, [`${optionNavigation}@odata.bind`]: `/${entitySetName(QUOTE_TABLE)}(${cleanId(quoteId)})` }) });
      created.push({ cr40f_cotacaoopcaoid: optionRecordId });
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const item = items[itemIndex];
        const itemId = scenarioId();
        await request(xrm, `/${entitySetName(QUOTE_OPTION_ITEM_TABLE)}`, { method: "POST", body: JSON.stringify({ cr40f_cotacaoopcaoitemid: itemId, cr40f_nome: `${String(option.name || `Opção ${index + 1}`).slice(0, 70)} · ${String(item.vehicleType || "Veículo").slice(0, 20)}`, cr40f_conteudo: JSON.stringify({ ...item, id: item.id || scenarioId() }), cr40f_revisao: revisionId, [`${itemNavigation}@odata.bind`]: `/${entitySetName(QUOTE_OPTION_TABLE)}(${optionRecordId})` }) });
      }
    }
    return created;
  } catch (error) {
    try { await deleteScenarioRows(xrm, created); } catch (cleanupError) { console.warn("[Planner] falha ao limpar opções incompletas", cleanupError); }
    throw error;
  }
}

export interface QuoteClient { id: string; name: string }

export async function loadQuoteClients(): Promise<{ clients: QuoteClient[]; entitySet: string }> {
  const xrm = getXrm();
  if (!xrm) {
    const names = [...new Set((loadMockState().quotes || []).map((quote) => String(quote.client || "").trim()).filter(Boolean))];
    return { clients: names.sort((a, b) => a.localeCompare(b, "pt-BR")).map((name) => ({ id: `mock-client-${name}`, name })), entitySet: "" };
  }
  const metadata = asRecord(await request(xrm, "/EntityDefinitions(LogicalName='cr40f_clientes1')?$select=PrimaryIdAttribute,PrimaryNameAttribute,EntitySetName"));
  const idField = s(metadata.PrimaryIdAttribute);
  const nameField = s(metadata.PrimaryNameAttribute);
  const entitySet = s(metadata.EntitySetName);
  if (!idField || !nameField || !entitySet) throw new Error("Metadata de Clientes incompleta.");
  quoteClientEntitySet = entitySet;
  const rows: Row[] = [];
  let next = `/${entitySet}?$select=${idField},${nameField}&$filter=statecode eq 0&$orderby=${nameField} asc`;
  while (next) {
    const result = await request(xrm, next);
    rows.push(...rowsOf(result));
    next = nextLinkPath(result);
  }
  return { clients: rows.map((row) => ({ id: row[idField], name: row[nameField] })).filter((row): row is QuoteClient => Boolean(row.id && row.name)), entitySet };
}

// ~3.000 pessoas por carga; o drawer monta o campo a cada abertura, então o
// resultado fica em cache por 5 minutos.
const REQUESTERS_CACHE_MS = 5 * 60 * 1000;
export interface QuoteRequester { id: string; name: string; classification: string; clientId: string; clientName: string; email: string; phone: string }
let requestersCache: { at: number; promise: Promise<QuoteRequester[]> } | null = null;

export function loadQuoteRequesters(): Promise<QuoteRequester[]> {
  const xrm = getXrm();
  if (!xrm) return Promise.resolve(loadMockQuoteRequesters());
  if (!requestersCache || Date.now() - requestersCache.at > REQUESTERS_CACHE_MS) {
    const promise = fetchQuoteRequesters(xrm).catch((error: unknown) => { requestersCache = null; throw error; });
    requestersCache = { at: Date.now(), promise };
  }
  return requestersCache.promise;
}

function loadMockQuoteRequesters(): QuoteRequester[] {
  return (loadMockState().quotes || []).filter((quote) => quote.clientContact).map((quote) => ({ id: `mock-requester-${quote.id}`, name: s(quote.clientContact), classification: "Passageiro Frequente", clientId: s(quote.clientId), clientName: s(quote.client), email: s(quote.clientEmail), phone: s(quote.clientPhone) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function fetchQuoteRequesters(xrm: PlannerXrm): Promise<QuoteRequester[]> {
  const metadata = asRecord(await request(xrm, "/EntityDefinitions(LogicalName='cr40f_bancodedados')?$select=PrimaryIdAttribute,PrimaryNameAttribute,EntitySetName"));
  const idField = s(metadata.PrimaryIdAttribute);
  const entitySet = s(metadata.EntitySetName);
  const nameField = "cr40f_nomedopassageiro";
  if (!idField || !entitySet) throw new Error("Metadata de Banco de Dados incompleta.");
  const rows: Row[] = [];
  // Qualquer pessoa ativa do banco de dados pode pedir cotação (passageiro
  // frequente, visitante, lead ou sem classificação), não só "Solicitante".
  let next = `/${entitySet}?$select=${idField},${nameField},cr40f_email,cr40f_telefone,cr40f_classificacao,_cr40f_cliente_value&$filter=statecode eq 0&$orderby=${nameField} asc`;
  while (next) {
    const result = await request(xrm, next);
    rows.push(...rowsOf(result));
    next = nextLinkPath(result);
  }
  return rows.map((row) => ({ id: row[idField], name: row[nameField], classification: s(row["cr40f_classificacao@OData.Community.Display.V1.FormattedValue"]), clientId: s(row._cr40f_cliente_value), clientName: s(row["_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue"]), email: s(row.cr40f_email), phone: s(row.cr40f_telefone) })).filter((row): row is QuoteRequester => Boolean(row.id && String(row.name || "").trim()));
}

async function primaryNameAttribute(xrm: PlannerXrm, table: string) {
  const metadata = asRecord(await request(xrm, `/EntityDefinitions(LogicalName='${table}')?$select=PrimaryNameAttribute`));
  if (!metadata?.PrimaryNameAttribute) throw new Error(`Metadata incompleto: ${table} sem atributo de nome principal.`);
  return String(metadata.PrimaryNameAttribute);
}

function normalizePlannerTeam(row: Row, primaryName = "cr40f_nome"): Team & { memberIds: string[]; primaryMemberId: string } {
  return {
    id: s(row[`${TEAM_TABLE}id`] || row.cr40f_plannerequipeid),
    name: s(row[primaryName] || row[`${primaryName}@OData.Community.Display.V1.FormattedValue`]),
    iconName: "users",
    memberIds: [],
    primaryMemberId: s(row[`_${TEAM_PRIMARY_FIELD}_value`]),
  };
}

async function loadPlannerTeams(xrm: PlannerXrm): Promise<Team[]> {
  try {
    const primaryName = await primaryNameAttribute(xrm, TEAM_TABLE);
    let teamRows: Row[];
    try {
      teamRows = await retrieveMany(xrm, TEAM_TABLE, `?$select=${TEAM_TABLE}id,${primaryName},_${TEAM_PRIMARY_FIELD}_value&$filter=statecode eq 0&$orderby=${primaryName} asc`);
    } catch (error) {
      console.warn("[Planner] lookup de principal da equipe indisponível; usando fallback legado", error);
      teamRows = await retrieveMany(xrm, TEAM_TABLE, `?$select=${TEAM_TABLE}id,${primaryName}&$filter=statecode eq 0&$orderby=${primaryName} asc`);
    }
    const memberRows = await retrieveMany(xrm, TEAM_MEMBER_TABLE, `?$select=${TEAM_MEMBER_TABLE}id,_cr40f_equipe_value,_cr40f_funcionario_value&$filter=statecode eq 0`);
    const teams = teamRows.map((row) => normalizePlannerTeam(row, primaryName));
    const membersByTeam = new Map<unknown, unknown[]>();
    memberRows.forEach((row) => {
      const teamId = row._cr40f_equipe_value;
      if (!teamId) return;
      const ids = membersByTeam.get(teamId) || [];
      ids.push(row._cr40f_funcionario_value);
      membersByTeam.set(teamId, ids);
    });
    return teams.map((team) => {
      const memberIds = [...new Set((membersByTeam.get(team.id) || []).filter(Boolean).map(String))];
      return { ...team, memberIds, primaryMemberId: memberIds.includes(team.primaryMemberId) ? team.primaryMemberId : memberIds.length === 1 ? memberIds[0] : "" };
    });
  } catch (error) {
    console.warn("[Planner] equipes indisponíveis; metadata ainda não provisionada", error);
    return [];
  }
}

async function replacePlannerTeamMembers(xrm: PlannerXrm, teamId: string, memberIds: string[] = []) {
  const rows = await retrieveMany(xrm, TEAM_MEMBER_TABLE, `?$select=${TEAM_MEMBER_TABLE}id&$filter=_cr40f_equipe_value eq ${cleanId(teamId)}`);
  await Promise.all(rows.map((row) => request(xrm, `/${entitySetName(TEAM_MEMBER_TABLE)}(${cleanId(row[`${TEAM_MEMBER_TABLE}id`])})`, { method: "DELETE" })));
  await Promise.all([...new Set(memberIds.filter(Boolean).map(String))].map(async (employeeId) => {
    const payload: Payload = { cr40f_name: `${teamId}-${employeeId}` };
    await bindLookup(xrm, payload, TEAM_MEMBER_TABLE, "cr40f_equipe", TEAM_TABLE, teamId);
    await bindLookup(xrm, payload, TEAM_MEMBER_TABLE, "cr40f_funcionario", EMPLOYEE_TABLE, employeeId);
    await request(xrm, `/${entitySetName(TEAM_MEMBER_TABLE)}`, { method: "POST", body: JSON.stringify(payload) });
  }));
}

export interface TeamInput { name?: unknown; memberIds?: string[]; primaryMemberId?: string }

async function createLiveTeam(xrm: PlannerXrm, state: LiveState, input: TeamInput) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Informe um nome para a equipe.");
  if ((state.teams || []).some((team) => team.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0)) throw new Error("Já existe uma equipe com esse nome.");
  const composition = validateTeamComposition(input.memberIds || [], input.primaryMemberId);
  if (!composition.valid) throw new Error(composition.error);
  const primaryName = await primaryNameAttribute(xrm, TEAM_TABLE);
  const payload: Payload = { [primaryName]: name };
  await bindLookup(xrm, payload, TEAM_TABLE, TEAM_PRIMARY_FIELD, EMPLOYEE_TABLE, composition.primaryMemberId);
  const created = asRecord(await request(xrm, `/${entitySetName(TEAM_TABLE)}`, { method: "POST", body: JSON.stringify(payload) }));
  const id = s(created?.[`${TEAM_TABLE}id`] || created?.cr40f_plannerequipeid);
  if (!id) throw new Error("Dataverse criou equipe sem retornar o ID.");
  await replacePlannerTeamMembers(xrm, id, input.memberIds || []);
  return loadLiveState(xrm);
}

async function updateLiveTeam(xrm: PlannerXrm, state: LiveState, id: string, patch: TeamInput) {
  const name = String(patch.name || "").trim();
  if (!name) throw new Error("Informe um nome para a equipe.");
  if ((state.teams || []).some((team) => team.id !== id && team.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0)) throw new Error("Já existe uma equipe com esse nome.");
  const composition = validateTeamComposition(patch.memberIds || [], patch.primaryMemberId || state.teams?.find((team) => team.id === id)?.primaryMemberId);
  if (!composition.valid) throw new Error(composition.error);
  const primaryName = await primaryNameAttribute(xrm, TEAM_TABLE);
  const payload: Payload = { [primaryName]: name };
  await bindLookup(xrm, payload, TEAM_TABLE, TEAM_PRIMARY_FIELD, EMPLOYEE_TABLE, composition.primaryMemberId);
  await request(xrm, `/${entitySetName(TEAM_TABLE)}(${cleanId(id)})`, { method: "PATCH", body: JSON.stringify(payload) });
  await replacePlannerTeamMembers(xrm, id, patch.memberIds || []);
  const refreshedTeams = await loadPlannerTeams(xrm);
  await syncLiveTeamTasks(xrm, { ...state, teams: refreshedTeams }, id);
  return loadLiveState(xrm);
}

async function deleteLiveTeam(xrm: PlannerXrm, state: LiveState, id: string) {
  if (!(state.teams || []).some((team) => team.id === id)) throw new Error("Equipe não encontrada.");
  await replacePlannerTeamMembers(xrm, id, []);
  await request(xrm, `/${entitySetName(TEAM_TABLE)}(${cleanId(id)})`, { method: "DELETE" });
  return loadLiveState(xrm);
}

async function resolveEmployeeIdByName(xrm: PlannerXrm, value: string) {
  if (!value || value === "Não atribuído") return "";
  const escaped = String(value).replace(/'/g, "''");
  const rows = await retrieveMany(xrm, EMPLOYEE_TABLE, `?$select=cr40f_funcionariosid&$filter=cr40f_nomecompleto eq '${escaped}' and statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410001&$top=2`);
  if (!rows.length) throw new Error(`Funcionário "${value}" não encontrado. Verifique cadastro ativo, statecode=0, cr40f_status=0 e cr40f_funcao=202410001 no Dataverse.`);
  if (rows.length > 1) throw new Error(`Mais de um funcionário administrativo ativo corresponde a "${value}". Corrija nomes duplicados antes de salvar.`);
  return s(rows[0].cr40f_funcionariosid);
}

async function resolveAssigneeIds(xrm: PlannerXrm, input: TaskChange): Promise<string[]> {
  if (Array.isArray(input.assigneeIds)) return [...new Set(input.assigneeIds.filter(Boolean))];
  return (await Promise.all(normalizeAssigneeNames(input.assigneeNames || input.assigneeName).map((name) => resolveEmployeeIdByName(xrm, name)))).filter(Boolean);
}

async function replaceTaskAssignees(xrm: PlannerXrm, taskId: string, input: TaskChange) {
  const ids = await resolveAssigneeIds(xrm, input);
  const relations = await retrieveMany(xrm, ASSIGNEE_RELATION_TABLE, `?$select=${ASSIGNEE_RELATION_TABLE}id&$filter=_cr40f_tarefa_value eq ${cleanId(taskId)}`);
  await Promise.all(relations.map((relation) => request(xrm, `/${entitySetName(ASSIGNEE_RELATION_TABLE)}(${cleanId(relation[`${ASSIGNEE_RELATION_TABLE}id`])})`, { method: "DELETE" })));
  await Promise.all(ids.map(async (employeeId) => {
    const payload: Payload = { cr40f_name: `${taskId}-${employeeId}` };
    await bindLookup(xrm, payload, ASSIGNEE_RELATION_TABLE, "cr40f_tarefa", TASK_TABLE, taskId);
    await bindLookup(xrm, payload, ASSIGNEE_RELATION_TABLE, "cr40f_funcionario", EMPLOYEE_TABLE, employeeId);
    await request(xrm, `/${entitySetName(ASSIGNEE_RELATION_TABLE)}`, { method: "POST", body: JSON.stringify(payload) });
  }));
}

async function replaceTaskTeams(xrm: PlannerXrm, taskId: string, input: TaskChange) {
  const teamIds = input.assignmentMode === "team"
    ? [...new Set((input.teamIds || (input.teamId ? [input.teamId] : [])).filter(Boolean).map(String))]
    : [];
  const relations = await retrieveMany(xrm, TASK_TEAM_RELATION_TABLE, `?$select=${TASK_TEAM_RELATION_TABLE}id&$filter=_cr40f_tarefa_value eq ${cleanId(taskId)}`);
  await Promise.all(relations.map((relation) => request(xrm, `/${entitySetName(TASK_TEAM_RELATION_TABLE)}(${cleanId(relation[`${TASK_TEAM_RELATION_TABLE}id`])})`, { method: "DELETE" })));
  await Promise.all(teamIds.map(async (teamId) => {
    const payload: Payload = { cr40f_name: `${taskId}-${teamId}` };
    await bindLookup(xrm, payload, TASK_TEAM_RELATION_TABLE, "cr40f_tarefa", TASK_TABLE, taskId);
    await bindLookup(xrm, payload, TASK_TEAM_RELATION_TABLE, "cr40f_equipe", TEAM_TABLE, teamId);
    await request(xrm, `/${entitySetName(TASK_TEAM_RELATION_TABLE)}`, { method: "POST", body: JSON.stringify(payload) });
  }));
}

async function syncLiveTeamTasks(xrm: PlannerXrm, state: LiveState, teamId: string) {
  let nextState = state;
  const openTasks = (state.tasks || []).filter((task) => !["done", "cancelled"].includes(s(task.status))
    && task.assignmentMode === "team"
    && (task.teamIds || (task.teamId ? [task.teamId] : [])).some((id) => cleanId(id).toLowerCase() === cleanId(teamId).toLowerCase()));
  for (const task of openTasks) {
    nextState = await updateLiveTask(xrm, nextState, task.id, {
      assignmentMode: "team",
      teamIds: task.teamIds || [s(task.teamId)],
      teamNames: task.teamNames || [],
      teamId: task.teamId || teamId,
      suppressNotifications: true,
    });
  }
  return nextState;
}

function normalizeQuality(row: Row, type: string): QualityItem {
  const isAction = type === "action";
  return { id: s(row[isAction ? "cr40f_acaooperacionalid" : "cr40f_errooperacionalid"]), type, code: s(row.cr40f_codigo), title: s(row.cr40f_titulo), description: s(row.cr40f_descricao), status: s(row[isAction ? "cr40f_status@OData.Community.Display.V1.FormattedValue" : "cr40f_status@OData.Community.Display.V1.FormattedValue"]), dueDate: dateOnly(row[isAction ? "cr40f_prazo" : "cr40f_prazoresolucao"]), assigneeId: s(row._cr40f_responsavel_value), assigneeName: s(row["_cr40f_responsavel_value@OData.Community.Display.V1.FormattedValue"]) };
}

interface EventComment { id: string; eventId?: string; authorId: string; text: string; createdAt: string | undefined; author: string; attachments?: LiveAttachment[]; [extra: string]: unknown }
interface EventHistory extends TaskHistoryItem { previousValue: string; nextValue: string }

function normalizeEventDetails(events: Row[] = []) {
  const comments: EventComment[] = events.filter((item) => item.cr40f_campo === "comentario").map((item) => ({ id: item.cr40f_plannertarefaeventoid as string, authorId: cleanId(item._cr40f_autor_value || item._createdby_value), text: s(item.cr40f_valornovo || item.cr40f_descricao), createdAt: item.cr40f_ocorridoem as string | undefined, author: s(item.authorName || item["_cr40f_autor_value@OData.Community.Display.V1.FormattedValue"] || item["_createdby_value@OData.Community.Display.V1.FormattedValue"]) || "Sistema" })).sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
  const returns: EventComment[] = events.filter((item) => item.cr40f_campo === "retorno").map((item) => {
    let raw: Record<string, unknown> = {};
    try { raw = asRecord(JSON.parse(s(item.cr40f_valornovo) || "{}")); } catch { raw = {}; }
    return {
      id: (raw.returnId || item.cr40f_plannertarefaeventoid) as string,
      eventId: item.cr40f_plannertarefaeventoid as string,
      authorId: cleanId(raw.authorId || item._cr40f_autor_value || item._createdby_value),
      text: s(raw.text || item.cr40f_valornovo || item.cr40f_descricao),
      createdAt: (raw.createdAt || item.cr40f_ocorridoem) as string | undefined,
      author: s(raw.author || item.authorName || item["_cr40f_autor_value@OData.Community.Display.V1.FormattedValue"] || item["_createdby_value@OData.Community.Display.V1.FormattedValue"]) || "Sistema",
    };
  }).sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
  const attachments: LiveAttachment[] = events.filter((item) => item.cr40f_campo === "anexo").map((item): LiveAttachment => {
    try {
      const raw = asRecord(JSON.parse(s(item.cr40f_valornovo) || "{}"));
      const sharePointId = s(raw.id || raw.identificador || raw.Identifier || raw.itemId || raw.ItemId);
      return {
        ...raw,
        returnId: s(raw.returnId),
        id: sharePointId || s(item.cr40f_plannertarefaeventoid),
        sharePointId,
        eventId: s(item.cr40f_plannertarefaeventoid),
        fileLocator: s(raw.fileLocator || raw.identificador || raw.Identifier),
        path: s(raw.path || raw.caminhoSharePoint || raw.caminhoCompleto || raw.Path),
        name: s(raw.name || raw.nomeArquivo || raw.Name) || "Anexo",
        mimeType: s(raw.mimeType || raw.MediaType),
        size: (raw.size ?? raw.tamanho ?? raw.Size) as number | undefined,
        createdAt: item.cr40f_ocorridoem as string | undefined,
      };
    } catch {
      return { id: s(item.cr40f_plannertarefaeventoid), sharePointId: "", eventId: s(item.cr40f_plannertarefaeventoid), name: s(item.cr40f_valornovo) || "Anexo", createdAt: item.cr40f_ocorridoem as string | undefined };
    }
  });
  const returnsWithAttachments = returns.map((returnItem) => ({
    ...returnItem,
    attachments: attachments.filter((attachment) => attachment.returnId === returnItem.id),
  }));
  const history: EventHistory[] = events.filter((item) => !["comentario", "retorno", "anexo", "notification:mention"].includes(s(item.cr40f_campo))).map((item) => {
    const authorId = cleanId(item._cr40f_autor_value || item._createdby_value);
    const author = s(item.authorName || item["_cr40f_autor_value@OData.Community.Display.V1.FormattedValue"] || item["_createdby_value@OData.Community.Display.V1.FormattedValue"]) || "Executor não identificado";
    let nextValue = s(item.cr40f_valornovo);
    if (item.cr40f_campo === "status") nextValue = STATUS_BY_VALUE[s(item.cr40f_valornovo)] || s(item.cr40f_valornovo);
    return { id: s(item.cr40f_plannertarefaeventoid), text: item.cr40f_descricao as string | undefined, createdAt: item.cr40f_ocorridoem as string | undefined, author, authorId, field: s(item.cr40f_campo), previousValue: item.cr40f_campo === "status" ? STATUS_BY_VALUE[s(item.cr40f_valoranterior)] || s(item.cr40f_valoranterior) : s(item.cr40f_valoranterior), nextValue };
  });
  return { comments, returns: returnsWithAttachments, attachments, history };
}

function normalizeCollectionEvents(events: Row[] = []): CollectionEvent[] {
  return events.filter((item) => item.cr40f_campo === "notification:overdue_manual").flatMap((item) => {
    try {
      const context = asRecord(JSON.parse(s(item.cr40f_valornovo) || "{}"));
      return [{ id: s(item.cr40f_plannertarefaeventoid), taskId: s(item._cr40f_tarefa_value), occurredAt: s(item.cr40f_ocorridoem), referenceDate: s(context.referenceDate), actorEmployeeId: s(context.actorEmployeeId) }];
    } catch { return []; }
  });
}

interface TaskTeamRelation { id: string; taskId: string; teamId: string; teamName: string }

function normalizeTask(row: Row, events: Row[] = [], assignees: AssigneeProfile[] = [], teamRelations: TaskTeamRelation[] = []) {
  const status = STATUS_BY_VALUE[s(row.cr40f_status)] || "todo";
  const priority = PRIORITY_BY_VALUE[s(row.cr40f_prioridade)] || "medium";
  const origin = choiceKey(ORIGIN_VALUES, row.cr40f_origem) || "manual";
  const { comments, returns, attachments, history } = normalizeEventDetails(events);
  const relationTeams = teamRelations.filter((item) => item.taskId === row.cr40f_plannertarefaid);
  const plannerTeamIds = relationTeams.length ? relationTeams.map((item) => item.teamId) : (row[`_${TASK_TEAM_FIELD}_value`] ? [String(row[`_${TASK_TEAM_FIELD}_value`])] : []);
  const plannerTeamNames = relationTeams.length ? relationTeams.map((item) => item.teamName).filter(Boolean) : (row[`_${TASK_TEAM_FIELD}_value@OData.Community.Display.V1.FormattedValue`] ? [String(row[`_${TASK_TEAM_FIELD}_value@OData.Community.Display.V1.FormattedValue`])] : []);
  const plannerTeamId = plannerTeamIds[0] || "";
  const plannerTeamName = plannerTeamNames.join(", ");
  const relationAssigneeIds = assignees.map((item) => item.id).filter(Boolean);
  const primaryAssigneeId = s(row[`_${EMPLOYEE_ASSIGNEE_FIELD}_value`]) || relationAssigneeIds[0] || "";
  const responsibility = responsibilityFromIds(relationAssigneeIds, primaryAssigneeId);
  const profileById = new Map(assignees.map((item) => [cleanId(item.id).toLowerCase(), item]));
  const orderedAssignees = responsibility.assigneeIds.map((id) => profileById.get(cleanId(id).toLowerCase())).filter((item): item is AssigneeProfile => Boolean(item));
  const fallbackName = formatLookup(row, EMPLOYEE_ASSIGNEE_FIELD);
  return {
    id: s(row.cr40f_plannertarefaid),
    createdAt: s(row.createdon),
    updatedAt: s(row.modifiedon),
    title: s(row.cr40f_titulo || row.cr40f_name) || "Sem título",
    description: s(row.cr40f_descricao),
    checklist: parseChecklist(row.cr40f_checklistjson),
    status,
    quoteStatus: origin === "quote" ? quoteStatusForTaskStatus(status) : "",
    priority,
    restrictedVisibility: Boolean(row[TASK_RESTRICTED_VISIBILITY_FIELD]),
    dueDate: dateOnly(row.cr40f_prazo),
    waitingContext: parseWaitingContext(row),
    assigneeNames: orderedAssignees.length ? orderedAssignees.map((item) => item.name) : normalizeAssigneeNames(fallbackName),
    assigneeProfiles: orderedAssignees.map((item) => ({ id: item.id, name: item.name, userId: item.userId || "" })),
    assigneeName: orderedAssignees.length ? orderedAssignees.map((item) => item.name).join(", ") : fallbackName,
    assigneeIds: responsibility.assigneeIds,
    assigneeId: responsibility.primaryAssigneeId,
    primaryAssigneeId: responsibility.primaryAssigneeId,
    consultantIds: responsibility.consultantIds,
    primaryAssigneeName: orderedAssignees.find((item) => cleanId(item.id).toLowerCase() === cleanId(responsibility.primaryAssigneeId).toLowerCase())?.name || (responsibility.primaryAssigneeId === row[`_${EMPLOYEE_ASSIGNEE_FIELD}_value`] ? fallbackName : ""),
    consultantNames: responsibility.consultantIds.map((id) => profileById.get(cleanId(id).toLowerCase())?.name).filter((name): name is string => Boolean(name)),
    creatorUserId: s(row._createdby_value),
    assignmentMode: plannerTeamIds.length ? "team" : "people",
    teamIds: plannerTeamIds,
    teamNames: plannerTeamNames,
    teamName: plannerTeamName || formatLookup(row, "cr40f_equipe", "Sem equipe"),
    teamId: plannerTeamId,
    quoteId: s(row._cr40f_pedidocotacao_value) || null,
    quoteCode: s(row.quoteCode),
    quoteTitle: s(row.quoteTitle),
    sourceType: origin,
    sourceId: s(row._cr40f_pedidocotacao_value || row._cr40f_errooperacional_value || row._cr40f_acaooperacional_value) || null,
    sourceCode: s(row.cr40f_codigoorigem),
    sourceLabel: origin === "quote" ? "Pedido de cotação" : origin === "quality" ? "Qualidade" : "Tarefa manual",
    comments,
    returns,
    attachments,
    history,
    executionActor: deriveExecutionActor({ status, history }),
  };
}

function normalizeRelation(row: Row) {
  return { id: s(row.cr40f_plannertarearelacaoid), parentTaskId: s(row._cr40f_tarefapai_value), childTaskId: s(row._cr40f_subtarefa_value) };
}

function normalizeTaskTeamRelation(row: Row): TaskTeamRelation {
  return {
    id: s(row.cr40f_plannertarefaequipeid),
    taskId: s(row._cr40f_tarefa_value),
    teamId: s(row._cr40f_equipe_value),
    teamName: s(row["_cr40f_equipe_value@OData.Community.Display.V1.FormattedValue"]),
  };
}

function applyDynamicTeamAssignment<T extends LiveTask>(task: T, teams: Team[] = [], employees: LiveEmployee[] = []): T {
  if (task?.assignmentMode !== "team") return task;
  const teamIds = task.teamIds || (task.teamId ? [task.teamId] : []);
  const selectedTeams = teams.filter((team) => teamIds.some((id) => cleanId(id).toLowerCase() === cleanId(team.id).toLowerCase()));
  const memberIds = [...new Set(selectedTeams.flatMap((team) => team.memberIds || []))];
  const responsibility = responsibilityFromIds(memberIds, selectedTeams[0]?.primaryMemberId || memberIds[0]);
  const employeeById = new Map(employees.map((employee) => [cleanId(employee.id).toLowerCase(), employee]));
  const memberProfiles = responsibility.assigneeIds.map((id) => employeeById.get(cleanId(id).toLowerCase())).filter((employee): employee is LiveEmployee => Boolean(employee));
  return {
    ...task,
    assigneeIds: responsibility.assigneeIds,
    assigneeProfiles: memberProfiles,
    assigneeNames: memberProfiles.map((employee) => employee.name),
    assigneeName: memberProfiles.map((employee) => employee.name).join(", ") || "Não atribuído",
    primaryAssigneeId: responsibility.primaryAssigneeId,
    consultantIds: responsibility.consultantIds,
    primaryAssigneeName: memberProfiles[0]?.name || "",
    consultantNames: memberProfiles.slice(1).map((employee) => employee.name),
  };
}

function measureStage<T>(name: string, operation: () => T | Promise<T>): Promise<T> {
  const startedAt = globalThis.performance?.now?.() || Date.now();
  return Promise.resolve().then(operation).then((result) => {
    const elapsed = Math.round((globalThis.performance?.now?.() || Date.now()) - startedAt);
    console.info(`[Planner] ${name}: ${elapsed} ms`);
    return result;
  }, (error: unknown) => {
    const elapsed = Math.round((globalThis.performance?.now?.() || Date.now()) - startedAt);
    console.warn(`[Planner] ${name}: falhou após ${elapsed} ms`, error);
    throw error;
  });
}

function toEmployeeRecord(row: Row): LiveEmployee {
  return { id: s(row.cr40f_funcionariosid), name: s(row.cr40f_nomecompleto || row.new_apelido) || "Sem nome", apelido: s(row.new_apelido), emailMicrosoft: s(row.cr40f_emailmicrosoft), mentionSearchText: [row.cr40f_nomecompleto, row.new_apelido].filter(Boolean).join(" "), userId: s(row._cr40f_usuariodataverse_value), externalNotificationsAvailable: Boolean(row._cr40f_usuariodataverse_value) };
}

function assigneesByTaskFrom(assigneeRelations: Row[], employeeById: Map<string, LiveEmployee>) {
  const assigneesByTask = new Map<unknown, AssigneeProfile[]>();
  assigneeRelations.forEach((item) => {
    const list = assigneesByTask.get(item._cr40f_tarefa_value) || [];
    const employee = employeeById.get(cleanId(item._cr40f_funcionario_value).toLowerCase());
    list.push({ id: s(item._cr40f_funcionario_value), name: s(item["_cr40f_funcionario_value@OData.Community.Display.V1.FormattedValue"]) || employee?.name || "Sem nome", userId: employee?.userId || "" });
    assigneesByTask.set(item._cr40f_tarefa_value, list);
  });
  return assigneesByTask;
}

function buildCoreState(xrm: PlannerXrm, rows: Row[], relations: Row[], assigneeRelations: Row[], employees: Row[], currentUserEmail = "", teams: Team[] = [], teamRelations: TaskTeamRelation[] = [], personalTagData: PersonalTagData = {}): LiveState {
  const employeeRecords = employees.map(toEmployeeRecord);
  const employeeById = new Map(employeeRecords.map((employee) => [cleanId(employee.id).toLowerCase(), employee]));
  const relationByChild = new Map(relations.map(normalizeRelation).map((item) => [item.childTaskId, item.parentTaskId]));
  const assigneesByTask = assigneesByTaskFrom(assigneeRelations, employeeById);
  const tasks = applyPersonalTagsToTasks(rows.map((row) => {
    const task = normalizeTask(row, [], assigneesByTask.get(row.cr40f_plannertarefaid) || [], teamRelations);
    const creator = employeeRecords.find((employee) => cleanId(employee.userId).toLowerCase() === cleanId(task.creatorUserId).toLowerCase());
    return { ...applyDynamicTeamAssignment(task, teams, employeeRecords), creatorEmployeeId: creator?.id || "", parentTaskId: relationByChild.get(s(row.cr40f_plannertarefaid)) || null, detailsLoaded: false };
  }), personalTagData.personalTagAssignments || []);
  return { quotes: [], employees: employeeRecords, teams, currentUserEmail, currentUserId: cleanId(xrm.Utility?.getGlobalContext?.().userSettings?.userId), personalTags: personalTagData.personalTags || [], personalTagsUnavailable: Boolean(personalTagData.personalTagsUnavailable), quality: [], tasks, notifications: [], lastUpdated: new Date().toISOString(), live: true, loading: { core: false, quotes: true, quality: true, notifications: true } };
}

export async function loadCoreState(xrm: PlannerXrm): Promise<LiveState> {
  const currentUserId = cleanId(xrm.Utility?.getGlobalContext?.().userSettings?.userId);
  const [rows, relations, assigneeRelations, employees, currentUserEmail, teams, teamRelations, personalTagData] = await Promise.all([
    measureStage("tarefas", () => retrievePlannerTasks(xrm)),
    measureStage("relações", () => retrieveMany(xrm, RELATION_TABLE, "?$select=cr40f_plannertarearelacaoid,_cr40f_tarefapai_value,_cr40f_subtarefa_value&$filter=statecode eq 0")),
    measureStage("responsáveis", () => retrieveMany(xrm, ASSIGNEE_RELATION_TABLE, "?$select=cr40f_plannertarearesponsavelid,_cr40f_tarefa_value,_cr40f_funcionario_value&$filter=statecode eq 0")),
    measureStage("funcionários", () => retrieveMany(xrm, EMPLOYEE_TABLE, "?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_emailmicrosoft,_cr40f_usuariodataverse_value&$filter=statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410001&$orderby=cr40f_nomecompleto asc")),
    measureStage("identidade atual", () => loadCurrentUserEmail(xrm)),
    measureStage("equipes do Planner", () => loadPlannerTeams(xrm)),
    measureStage("equipes das tarefas", () => retrieveOptional(xrm, TASK_TEAM_RELATION_TABLE, "?$select=cr40f_plannertarefaequipeid,_cr40f_tarefa_value,_cr40f_equipe_value&$filter=statecode eq 0", "relação tarefa/equipe")),
    measureStage("tags pessoais", () => loadLivePersonalTagData(xrm, currentUserId)),
  ]);
  await measureStage("vínculos Microsoft", () => reconcileEmployeeUserLinks(xrm, employees));
  return buildCoreState(xrm, rows, relations, assigneeRelations, employees, currentUserEmail, teams, teamRelations.map(normalizeTaskTeamRelation), personalTagData);
}

export async function loadSupplementalState(xrm: PlannerXrm, state: LiveState) {
  const quoteFields = await quoteSelect(xrm);
  // Mesma consulta de loadLiveState: carregar só as cotações ligadas às tarefas
  // em memória fazia cotações "sumirem" até a primeira gravação recarregar tudo.
  const loadLinkedQuotes = () => loadActiveQuotes(xrm, quoteFields);
  const [quotes, qualityErrors, qualityActions] = await Promise.all([
    measureStage("cotações vinculadas", loadLinkedQuotes),
    measureStage("erros operacionais", () => retrieveMany(xrm, QUALITY_ERROR_TABLE, "?$select=cr40f_errooperacionalid,cr40f_codigo,cr40f_titulo,cr40f_descricao,cr40f_status,cr40f_prazoresolucao,_cr40f_responsavel_value&$filter=statecode eq 0&$orderby=createdon desc")),
    measureStage("ações operacionais", () => retrieveMany(xrm, QUALITY_ACTION_TABLE, "?$select=cr40f_acaooperacionalid,cr40f_titulo,cr40f_descricao,cr40f_status,cr40f_prazo,_cr40f_responsavel_value&$filter=statecode eq 0&$orderby=createdon desc")),
  ]);
  const quoteRecords = await loadQuoteScenarioData(xrm, quotes);
  const today = localDateKey();
  await createQuoteNotifications(xrm, [...followUpNotices(quoteRecords, today), ...waitingReturnNotices(quoteRecords, financeMemberIds(state), today)]);
  const quoteById = new Map<unknown, LiveQuote>(quoteRecords.map((quote) => [quote.id, quote]));
  const employees = state.employees || [];
  const employeeById = new Map(employees.map((employee) => [cleanId(employee.id).toLowerCase(), employee]));
  const quality = [...qualityErrors.map((row) => normalizeQuality(row, "error")), ...qualityActions.map((row) => normalizeQuality(row, "action"))].map((item) => ({ ...item, assigneeProfiles: employeeById.has(cleanId(item.assigneeId).toLowerCase()) ? [employeeById.get(cleanId(item.assigneeId).toLowerCase())] : [] }));
  const tasks = state.tasks.map((task) => ({ ...task, quoteCode: quoteById.get(task.quoteId)?.code || "", quoteTitle: quoteById.get(task.quoteId)?.title || "" }));
  return { quotes: quoteRecords, quality, tasks, loading: { ...(state.loading || {}), quotes: false, quality: false } };
}

export async function loadTaskDetails(xrm: PlannerXrm, taskId: string) {
  const events = await measureStage(`detalhes ${cleanId(taskId).slice(0, 8)}`, () => retrieveMany(xrm, EVENT_TABLE, `${PLANNER_EVENTS_QUERY}&$filter=_cr40f_tarefa_value eq ${cleanId(taskId)}`));
  const details = normalizeEventDetails(events);
  return { taskId, ...details };
}

export async function searchQuotes(xrm: PlannerXrm, query: unknown) {
  const quoteFields = await quoteSelect(xrm);
  const escaped = String(query || "").trim().replace(/'/g, "''");
  if (!escaped) return [];
  const filter = `contains(cr40f_numerodacotacao,'${escaped}') or contains(cr40f_titulo,'${escaped}') or contains(cr40f_clienteempresa,'${escaped}')`;
  const rows = await measureStage("busca de cotações", () => retrieveMany(xrm, QUOTE_TABLE, `?$select=${quoteFields}&$filter=statecode eq 0 and (${filter})&$orderby=modifiedon desc&$top=25`));
  return rows.map(normalizeQuote);
}

async function loadLiveState(xrm: PlannerXrm): Promise<LiveState> {
  const currentUserId = cleanId(xrm.Utility?.getGlobalContext?.().userSettings?.userId);
  const [quotes, rows, events, relations, assigneeRelations, qualityErrors, qualityActions, employees, currentUserEmail, teams, teamRelations, personalTagData] = await Promise.all([
    quoteSelect(xrm).then((quoteFields) => loadActiveQuotes(xrm, quoteFields)),
    retrievePlannerTasks(xrm),
    retrieveMany(xrm, EVENT_TABLE, "?$select=cr40f_plannertarefaeventoid,_cr40f_tarefa_value,cr40f_tipo,cr40f_campo,cr40f_descricao,cr40f_valornovo,cr40f_ocorridoem,_cr40f_autor_value,_createdby_value&$orderby=cr40f_ocorridoem desc"),
    retrieveMany(xrm, RELATION_TABLE, "?$select=cr40f_plannertarearelacaoid,_cr40f_tarefapai_value,_cr40f_subtarefa_value&$filter=statecode eq 0"),
    retrieveMany(xrm, ASSIGNEE_RELATION_TABLE, "?$select=cr40f_plannertarearesponsavelid,_cr40f_tarefa_value,_cr40f_funcionario_value&$filter=statecode eq 0"),
    retrieveMany(xrm, QUALITY_ERROR_TABLE, "?$select=cr40f_errooperacionalid,cr40f_codigo,cr40f_titulo,cr40f_descricao,cr40f_status,cr40f_prazoresolucao,_cr40f_responsavel_value&$filter=statecode eq 0&$orderby=createdon desc"),
    retrieveMany(xrm, QUALITY_ACTION_TABLE, "?$select=cr40f_acaooperacionalid,cr40f_titulo,cr40f_descricao,cr40f_status,cr40f_prazo,_cr40f_responsavel_value&$filter=statecode eq 0&$orderby=createdon desc"),
    retrieveMany(xrm, EMPLOYEE_TABLE, "?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_emailmicrosoft,_cr40f_usuariodataverse_value&$filter=statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410001&$orderby=cr40f_nomecompleto asc"),
    loadCurrentUserEmail(xrm),
    loadPlannerTeams(xrm),
    retrieveOptional(xrm, TASK_TEAM_RELATION_TABLE, "?$select=cr40f_plannertarefaequipeid,_cr40f_tarefa_value,_cr40f_equipe_value&$filter=statecode eq 0", "relação tarefa/equipe"),
    loadLivePersonalTagData(xrm, currentUserId),
  ]);
  await measureStage("vínculos Microsoft", () => reconcileEmployeeUserLinks(xrm, employees));
  const quoteRecords = await loadQuoteScenarioData(xrm, quotes);
  const employeeRecords = employees.map(toEmployeeRecord);
  const employeeById = new Map(employeeRecords.map((employee) => [cleanId(employee.id).toLowerCase(), employee]));
  const relationByChild = new Map(relations.map(normalizeRelation).map((item) => [item.childTaskId, item.parentTaskId]));
  const assigneesByTask = assigneesByTaskFrom(assigneeRelations, employeeById);
  const eventsByTask = new Map<unknown, Row[]>();
  events.forEach((event) => { const list = eventsByTask.get(event._cr40f_tarefa_value) || []; list.push(event); eventsByTask.set(event._cr40f_tarefa_value, list); });
  const tasks = applyPersonalTagsToTasks(rows.map((row) => {
    const task = normalizeTask(row, eventsByTask.get(row.cr40f_plannertarefaid) || [], assigneesByTask.get(row.cr40f_plannertarefaid) || [], teamRelations.map(normalizeTaskTeamRelation));
    const creator = employeeRecords.find((employee) => cleanId(employee.userId).toLowerCase() === cleanId(task.creatorUserId).toLowerCase());
    return { ...applyDynamicTeamAssignment(task, teams, employeeRecords), creatorEmployeeId: creator?.id || "", parentTaskId: relationByChild.get(s(row.cr40f_plannertarefaid)) || null };
  }), personalTagData.personalTagAssignments || []);
  const quoteById = new Map<unknown, LiveQuote>(quoteRecords.map((quote) => [quote.id, quote]));
  const employeesWithProfiles = employeeRecords;
  const quality = [...qualityErrors.map((row) => normalizeQuality(row, "error")), ...qualityActions.map((row) => normalizeQuality(row, "action"))].map((item) => ({ ...item, assigneeProfiles: employeeById.has(cleanId(item.assigneeId).toLowerCase()) ? [employeesWithProfiles.find((employee) => cleanId(employee.id).toLowerCase() === cleanId(item.assigneeId).toLowerCase())] : [] }));
  const tasksWithProfiles = tasks.map((task) => ({ ...task, assigneeProfiles: task.assigneeProfiles?.length ? task.assigneeProfiles : task.assigneeIds!.map((id) => employeesWithProfiles.find((employee) => cleanId(employee.id).toLowerCase() === cleanId(id).toLowerCase())).filter(Boolean), quoteCode: quoteById.get(task.quoteId)?.code || "", quoteTitle: quoteById.get(task.quoteId)?.title || "", quoteStatus: isQuoteTask(task) ? quoteById.get(task.quoteId)?.status || task.quoteStatus : task.quoteStatus }));
  return { quotes: [...quoteById.values()], employees: employeesWithProfiles, teams, currentUserEmail, currentUserId, personalTags: personalTagData.personalTags || [], personalTagsUnavailable: Boolean(personalTagData.personalTagsUnavailable), quality, tasks: tasksWithProfiles, notifications: [], collectionEvents: normalizeCollectionEvents(events) as unknown as Array<Record<string, unknown>>, lastUpdated: new Date().toISOString(), live: true };
}

const EMAIL_DISPATCH_STATUSES: Readonly<Record<string, number>> = Object.freeze({
  pending: 100000000,
  sent: 100000001,
  failed: 100000002,
  noAddress: 100000003,
});

const DISPATCH_CHANNELS: Record<number, string> = { 100000000: "Teams", 100000001: "Email", 100000002: "PowerAppsPush" };

function normalizeEmailDispatch(row: Row): EmailDispatch {
  const statusValue = Number(row.cr40f_status);
  const status = choiceKey(EMAIL_DISPATCH_STATUSES, statusValue) || "unknown";
  const key = String(row.cr40f_chaveidempotente || "");
  return {
    id: s(row.cr40f_plannerdisparoid),
    status,
    statusValue,
    statusText: s(row.cr40f_statustexto),
    recipientEmployeeId: s(row._cr40f_destinatario_value),
    recipientEmail: s(row.cr40f_destinatariotexto),
    error: s(row.cr40f_erro),
    attempt: Number(row.cr40f_tentativa || 0),
    sentAt: s(row.cr40f_enviadoem),
    createdAt: s(row.createdon),
    modifiedAt: s(row.modifiedon),
    idempotencyKey: key,
    eventId: cleanId(key.split("|")[0]),
    channel: DISPATCH_CHANNELS[Number(row.cr40f_canal)] || String(row.cr40f_canal || ""),
  };
}

function notificationEmailDelivery(row: Row, dispatches: EmailDispatch[] = []): EmailDispatch | null {
  const eventId = cleanId(row._cr40f_eventoorigem_value);
  const recipientId = cleanId(row._cr40f_destinatario_value);
  const type = String(row.cr40f_tipo || "update");
  if (!eventId || !recipientId) return null;
  const expectedKeys = [
    `${eventId}|${recipientId}|${type}|PowerAppsPush`.toLowerCase(),
    `${eventId}|${recipientId}|${type}|Email`.toLowerCase(),
  ];
  const expectedKey = expectedKeys[0];
  const dispatch = dispatches.find((item) => expectedKeys.includes(item.idempotencyKey.toLowerCase()));
  if (dispatch) return dispatch;

  const occurredAt = new Date(s(row.cr40f_ocorridoem || row.createdon) || 0).getTime();
  const isRecent = Number.isFinite(occurredAt) && occurredAt > Date.now() - (15 * 60 * 1000);
  return isRecent ? {
    status: "pending",
    statusText: "Aguardando confirmação do Flow",
    recipientEmployeeId: recipientId,
    recipientEmail: "",
    error: "",
    attempt: 0,
    sentAt: "",
    createdAt: s(row.cr40f_ocorridoem || row.createdon),
    modifiedAt: "",
    idempotencyKey: expectedKey,
    eventId,
  } : null;
}

function normalizeNotification(row: Row, dispatches: EmailDispatch[] = []): LiveNotification {
  return {
    id: s(row.cr40f_plannernotificacaoid),
    taskId: s(row._cr40f_tarefa_value),
    quoteId: s(row._cr40f_cotacao_value),
    recipientEmployeeId: s(row._cr40f_destinatario_value),
    eventOriginId: s(row._cr40f_eventoorigem_value),
    type: s(row.cr40f_tipo) || "update",
    title: s(row.cr40f_titulo || row.cr40f_name) || "Notificação",
    message: s(row.cr40f_mensagem),
    occurredAt: s(row.cr40f_ocorridoem || row.createdon),
    readAt: s(row.cr40f_lidoem),
    referenceDate: dateOnly(row.cr40f_datareferencia),
    dedupeKey: s(row.cr40f_chavededupe),
    emailDelivery: notificationEmailDelivery(row, dispatches),
  };
}

async function loadLiveEmailDispatches(xrm: PlannerXrm, employeeId: string) {
  if (!employeeId) return [];
  try {
    const rows = await retrieveMany(xrm, EMAIL_DISPATCH_TABLE, `?$select=cr40f_plannerdisparoid,cr40f_canal,cr40f_status,cr40f_statustexto,cr40f_destinatariotexto,cr40f_chaveidempotente,cr40f_erro,cr40f_tentativa,cr40f_enviadoem,createdon,modifiedon,_cr40f_destinatario_value&$filter=_cr40f_destinatario_value eq ${cleanId(employeeId)}&$orderby=createdon desc&$top=200`);
    return rows.map(normalizeEmailDispatch);
  } catch (error) {
    console.warn("[Planner] status de e-mail indisponível", error);
    return [];
  }
}

async function loadLiveNotifications(xrm: PlannerXrm, employeeId: string): Promise<LiveNotification[]> {
  if (!employeeId) return [];
  try {
    const quoteColumn = await probeQuoteV2Schema(xrm).then((schema) => schema.notificationQuote ? ",_cr40f_cotacao_value" : "", () => "");
    const [rows, dispatches] = await Promise.all([
      retrieveMany(xrm, NOTIFICATION_TABLE, `?$select=cr40f_plannernotificacaoid,cr40f_name,cr40f_titulo,cr40f_mensagem,cr40f_tipo,cr40f_ocorridoem,cr40f_lidoem,cr40f_datareferencia,cr40f_chavededupe,_cr40f_tarefa_value,_cr40f_destinatario_value,_cr40f_eventoorigem_value${quoteColumn}&$filter=_cr40f_destinatario_value eq ${cleanId(employeeId)} and statecode eq 0&$orderby=cr40f_ocorridoem desc&$top=100`),
      loadLiveEmailDispatches(xrm, employeeId),
    ]);
    return rows.map((row) => normalizeNotification(row, dispatches));
  } catch (error) {
    console.warn("[Planner] notificações indisponíveis", error);
    throw new Error("Notificações indisponíveis no Dataverse. Verifique a tabela e as permissões.", { cause: error });
  }
}

function liveTaskRecipientIds(state: LiveState, task: LiveTask | undefined) {
  if (task?.assignmentMode === "team") {
    const teamIds = task.teamIds || (task.teamId ? [task.teamId] : []);
    return [...new Set((state.teams || []).filter((team) => teamIds.some((id) => String(id) === String(team.id))).flatMap((team) => team.memberIds || []))];
  }
  return [...new Set((task?.assigneeIds || []).filter(Boolean).map(String))];
}

export interface CollectTaskInput { referenceDate?: string; now?: Date; occurredAt?: string; actorEmployeeId?: string; actorUserId?: string }

async function collectLiveTask(xrm: PlannerXrm, state: LiveState, id: string, input: CollectTaskInput = {}) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || ["done", "cancelled"].includes(s(task.status))) throw new Error("A tarefa não está ativa.");
  const referenceDate = input.referenceDate || localDateKey(input.now || new Date());
  const dedupePrefix = manualCollectionKey(id, referenceDate);
  const [existingNotifications, existingEvents] = await Promise.all([
    retrieveMany(xrm, NOTIFICATION_TABLE, `?$select=cr40f_plannernotificacaoid&$filter=startswith(cr40f_chavededupe,'${dedupePrefix.replace(/'/g, "''")}')&$top=1`),
    retrieveMany(xrm, EVENT_TABLE, `?$select=${EVENT_TABLE}id,cr40f_valornovo&$filter=_cr40f_tarefa_value eq ${cleanId(id)} and cr40f_campo eq 'notification:overdue_manual'&$orderby=cr40f_ocorridoem desc&$top=20`),
  ]);
  const eventAlreadyCollected = existingEvents.some((event) => {
    try { return asRecord(JSON.parse(s(event.cr40f_valornovo) || "{}")).referenceDate === referenceDate; } catch { return false; }
  });
  if (existingNotifications.length || eventAlreadyCollected) throw new Error("Esta tarefa já foi cobrada hoje.");
  const recipients = liveTaskRecipientIds(state, task);
  const context = {
    actorEmployeeId: input.actorEmployeeId || "",
    actorUserId: input.actorUserId || "",
    creatorEmployeeId: task.creatorEmployeeId || "",
    assigneeIds: recipients,
    notificationRecipientIds: recipients,
    sourceType: task.sourceType || "manual",
    referenceDate,
    collectionType: "manual_overdue",
  };
  await createEvent(xrm, id, 100000002, "Cobrança manual enviada ao responsável.", "notification:overdue_manual", "", JSON.stringify(context));
  return loadLiveState(xrm);
}

async function markLiveNotificationRead(xrm: PlannerXrm, notificationId: string, readAt = new Date().toISOString()) {
  await request(xrm, `/${entitySetName(NOTIFICATION_TABLE)}(${cleanId(notificationId)})`, { method: "PATCH", body: JSON.stringify({ cr40f_lidoem: readAt }) });
  return readAt;
}

export function withNotificationEnvironment(xrm: PlannerXrm, field: unknown, next: string): string {
  if (!String(field || "").startsWith("notification:")) return next;
  try {
    const context: unknown = JSON.parse(next || "{}");
    const globalContext = xrm.Utility?.getGlobalContext?.();
    const clientUrl = globalContext?.getClientUrl?.()?.replace(/\/$/, "");
    const appUrl = globalContext?.getCurrentAppUrl?.()?.replace(/\/$/, "");
    if (!clientUrl || !context || Array.isArray(context) || typeof context !== "object") return next;
    const record = asRecord(context);
    return JSON.stringify({ ...record, actorName: record.actorName || (record.actorEmployeeId ? globalContext?.userSettings?.userName || "" : ""), plannerBaseUrl: clientUrl, plannerAppUrl: appUrl || "" });
  } catch {
    return next;
  }
}

async function createEvent(xrm: PlannerXrm, taskId: string, type: number, description: string, field = "", previous = "", next = ""): Promise<unknown> {
  const payload: Payload = { cr40f_tipo: type, cr40f_descricao: description, cr40f_campo: field, cr40f_valoranterior: previous, cr40f_valornovo: withNotificationEnvironment(xrm, field, next), cr40f_ocorridoem: new Date().toISOString() };
  await bindLookup(xrm, payload, EVENT_TABLE, "cr40f_tarefa", TASK_TABLE, taskId);
  return request(xrm, `/${entitySetName(EVENT_TABLE)}`, { method: "POST", body: JSON.stringify(payload) });
}

function emailDispatchFeedback(dispatch: EmailDispatch | null, recipientEmail = ""): EmailDispatchFeedback {
  if (!dispatch) return { status: "pending", type: "pending", text: "Evento criado, mas o Flow ainda não confirmou o disparo." };
  if (dispatch.status === "sent") return { status: "sent", type: "success", text: `Push enviado${dispatch.recipientEmail || recipientEmail ? ` para ${dispatch.recipientEmail || recipientEmail}` : ""}.`, dispatch };
  if (dispatch.status === "failed") {
    const detail = String(dispatch.error || "O Flow registrou uma falha sem detalhes.").trim();
    return { status: "failed", type: "error", text: `Push não enviado. ${detail.slice(0, 220)}`, dispatch };
  }
  if (dispatch.status === "noAddress") return { status: "noAddress", type: "warning", text: "Push não enviado: o destinatário não tem identidade Microsoft vinculada.", dispatch };
  return { status: "pending", type: "pending", text: "Evento criado, mas o Flow ainda não confirmou o disparo.", dispatch };
}

async function waitForLiveEmailDispatch(xrm: PlannerXrm, eventId: string): Promise<EmailDispatchFeedback> {
  const escapedEventId = cleanId(eventId).replace(/'/g, "''");
  const query = `?$select=cr40f_plannerdisparoid,cr40f_canal,cr40f_status,cr40f_statustexto,cr40f_destinatariotexto,cr40f_chaveidempotente,cr40f_erro,cr40f_tentativa,cr40f_enviadoem,createdon,modifiedon,_cr40f_destinatario_value&$filter=startswith(cr40f_chaveidempotente,'${escapedEventId}|') and cr40f_canal eq 100000002&$orderby=createdon desc&$top=1`;
  const deadline = Date.now() + 10000;
  let lastError: unknown = null;
  while (Date.now() <= deadline) {
    try {
      const rows = await retrieveMany(xrm, EMAIL_DISPATCH_TABLE, query);
      if (rows[0]) return emailDispatchFeedback(normalizeEmailDispatch(rows[0]), s(rows[0].cr40f_destinatariotexto));
    } catch (error) {
      lastError = error;
      break;
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1000));
  }
  if (lastError) return { status: "unknown", type: "error", text: `Evento criado, mas não foi possível confirmar o envio: ${errorMessage(lastError) || "consulta indisponível"}` };
  return emailDispatchFeedback(null);
}

async function sendLiveNotificationTest(xrm: PlannerXrm, state: LiveState, input: { taskId?: string; message?: string } = {}) {
  const taskId = cleanId(input.taskId);
  const task = (state.tasks || []).find((item) => cleanId(item.id) === taskId);
  if (!task) throw new Error("Selecione uma tarefa válida para o teste.");
  const message = String(input.message || "").trim() || "Teste de notificação do Planner.";
  const currentEmail = String(state.currentUserEmail || "").trim().toLowerCase();
  const testRecipient = (state.employees || []).find((employee) => String(employee.emailMicrosoft || "").trim().toLowerCase() === currentEmail);
  if (!testRecipient?.id) throw new Error("Seu usuário Microsoft não está vinculado a um funcionário ativo do Planner.");
  const event = asRecord(await createEvent(
    xrm,
    taskId,
    100000001,
    `[Teste] Push: ${message}`,
    "notification:test",
    "",
    JSON.stringify({ testNotification: true, testType: "push", actorEmail: currentEmail, notificationRecipientIds: [testRecipient.id] }),
  ));
  const eventId = cleanId(event?.cr40f_plannertarefaeventoid || event?.[`${EVENT_TABLE}id`]);
  const dispatch = eventId
    ? await waitForLiveEmailDispatch(xrm, eventId)
    : { status: "unknown", type: "error", text: "Evento criado, mas a API não devolveu o identificador para confirmar o push." };
  return { state: await loadLiveState(xrm), emailDispatch: dispatch };
}

async function createLiveTask(xrm: PlannerXrm, state: LiveState, input: TaskChange): Promise<LiveState>;
async function createLiveTask(xrm: PlannerXrm, state: LiveState, input: TaskChange, returnCreatedTaskId: true): Promise<string>;
async function createLiveTask(xrm: PlannerXrm, state: LiveState, input: TaskChange, returnCreatedTaskId = false): Promise<LiveState | string> {
  if (input.quoteId && !input.parentTaskId) {
    const mainTask = state.tasks.find((task) => task.quoteId === input.quoteId && !task.parentTaskId);
    if (mainTask) throw new Error("Esta cotação já possui um acompanhamento principal ativo ou encerrado.");
  }
  const linkedQuote = input.quoteId ? state.quotes.find((quote) => cleanId(quote.id) === cleanId(input.quoteId)) : null;
  const managedQuoteTask = isQuoteTask(input) && !input.parentTaskId && Boolean(linkedQuote);
  const quoteStatus = managedQuoteTask ? (input.quoteStatus || linkedQuote?.status || "Nova") : "";
  const status = managedQuoteTask ? taskStatusForQuoteStatus(quoteStatus) : (input.status || "todo");
  const waitingContext = normalizeWaitingContext(input.waitingContext);
  const waitingValidation = managedQuoteTask ? { allowed: true, error: "" } : validateWaitingContext(status, waitingContext);
  if (!waitingValidation.allowed) throw new Error(waitingValidation.error);
  const payload: Payload = { cr40f_titulo: input.title!.trim(), cr40f_descricao: input.description || "", cr40f_status: STATUS_VALUES[status], cr40f_prioridade: PRIORITY_VALUES[s(input.priority)] || PRIORITY_VALUES.medium, cr40f_prazo: input.dueDate ? `${input.dueDate}T12:00:00Z` : null, [TASK_RESTRICTED_VISIBILITY_FIELD]: Boolean(input.restrictedVisibility), ...waitingContextPayload(waitingContext), cr40f_origem: ORIGIN_VALUES[input.sourceType || (input.quoteId ? "quote" : "manual")], cr40f_codigoorigem: input.sourceCode || input.quoteCode || "" };
  if (input.contactId) {
    const schema = requireContactSchema();
    await bindLookup(xrm, payload, TASK_TABLE, schema.taskLookup, schema.table, input.contactId);
  }
  await bindLookup(xrm, payload, TASK_TABLE, "cr40f_pedidocotacao", QUOTE_TABLE, input.quoteId);
  await bindLookup(xrm, payload, TASK_TABLE, "cr40f_errooperacional", QUALITY_ERROR_TABLE, input.qualityType === "error" ? input.qualityId : "");
  await bindLookup(xrm, payload, TASK_TABLE, "cr40f_acaooperacional", QUALITY_ACTION_TABLE, input.qualityType === "action" ? input.qualityId : "");
  const assignment = resolveTaskAssignment(input, state.teams || [], state.employees || []);
  const assigneeIds: string[] = assignment.assigneeIds.length
    ? assignment.assigneeIds
    : [...new Set(await resolveAssigneeIds(xrm, input))];
  await bindLookup(xrm, payload, TASK_TABLE, EMPLOYEE_ASSIGNEE_FIELD, EMPLOYEE_TABLE, assigneeIds[0]);
  await bindLookup(xrm, payload, TASK_TABLE, TASK_TEAM_FIELD, TEAM_TABLE, input.assignmentMode === "team" ? (input.teamIds?.[0] || input.teamId) : "");
  const created = asRecord(await request(xrm, `/${entitySetName(TASK_TABLE)}`, { method: "POST", body: JSON.stringify(payload) }));
  const id = s(created?.cr40f_plannertarefaid);
  if (!id) throw new Error("Dataverse criou tarefa sem retornar o ID.");
  await replaceTaskAssignees(xrm, id, { ...input, ...assignment, assigneeIds });
  await replaceTaskTeams(xrm, id, input);
  await markQuoteOrigin(xrm, input.quoteId, id);
  await createEvent(xrm, id, 100000000, "Tarefa criada.");
  if (assigneeIds.length) {
    await createEvent(xrm, id, 100000003, "Responsáveis atribuídos.", "notification:assignment", "", JSON.stringify({ actorEmployeeId: input.actorEmployeeId || "", actorUserId: input.actorUserId || "", creatorEmployeeId: input.actorEmployeeId || "", assigneeIds, previousAssigneeIds: [], sourceType: managedQuoteTask ? "quote" : input.sourceType || "manual", sourceCode: input.sourceCode || input.quoteCode || "" }));
  }
  if (status === "waiting") {
    const waitingTargets = waitingTargetIds(state, waitingContext);
    await createEvent(xrm, id, 100000002, waitingContextSummary(waitingContext), "notification:waiting", "", JSON.stringify({ actorEmployeeId: input.actorEmployeeId || "", actorUserId: input.actorUserId || "", creatorEmployeeId: managedQuoteTask ? "" : input.actorEmployeeId || "", assigneeIds, waitingContext, waitingTargetIds: waitingTargets, notificationRecipientIds: managedQuoteTask ? [...new Set([...assigneeIds, ...waitingTargets])] : undefined, sourceType: managedQuoteTask ? "quote" : input.sourceType || "manual", sourceCode: input.sourceCode || input.quoteCode || "" }));
  }
  return returnCreatedTaskId ? id : loadLiveState(xrm);
}

async function updateLiveTask(xrm: PlannerXrm, state: LiveState, id: string, patch: TaskChange): Promise<LiveState> {
  const existing = state.tasks.find((item) => item.id === id);
  const linkedQuote = existing?.quoteId ? state.quotes.find((quote) => cleanId(quote.id) === cleanId(existing.quoteId)) : undefined;
  const quoteTask = isQuoteTask(existing || {}) && !existing?.parentTaskId && Boolean(linkedQuote);
  // `quote` existe sempre que `quoteTask` é verdadeiro (mesmo acesso direto do JS original).
  const quote = linkedQuote as LiveQuote;
  if (quoteTask && !patch.suppressQuoteSync && patch.status === "done" && !isQuoteTerminalStatus(quote.status)) throw new Error(QUOTE_TASK_DONE_BLOCKED);
  const previousStatus = existing?.status || "";
  const previousDueDate = existing?.dueDate || "";
  const previousAssigneeIds = existing?.assigneeIds || [];
  const previousPrimaryAssigneeId = existing?.primaryAssigneeId || previousAssigneeIds[0] || "";
  const currentQuoteStatus = existing?.quoteStatus || linkedQuote?.status || "Nova";
  const nextQuoteStatus: string = quoteTask && (patch.quoteStatus !== undefined || patch.status !== undefined)
    ? (patch.quoteStatus !== undefined ? patch.quoteStatus : quoteStatusForTaskStatus(patch.status, currentQuoteStatus))
    : currentQuoteStatus;
  if (quoteTask && patch.responseSent === true && nextQuoteStatus !== "Respondida ao cliente") throw new Error("Envio só pode ser confirmado na cotação respondida.");
  if (quoteTask && patch.responseSent === true && !(quote.proposalVersions || []).length) throw new Error("Registre uma versão da proposta antes de confirmar o envio.");
  if (quoteTask && QUOTE_COMPLETED_STATUSES.includes(nextQuoteStatus) && (patch.status === "done" || patch.quoteStatus !== undefined || patch.responseSent !== undefined || patch.value !== undefined || patch.commercialTerms !== undefined)) {
    const validation = validateQuoteCommercial({ ...quote, status: nextQuoteStatus, value: patch.value ?? quote.value, commercialTerms: patch.commercialTerms ?? quote.commercialTerms });
    if (!validation.valid) throw new Error(Object.values(validation.errors).join(" "));
    if (nextQuoteStatus === "Respondida ao cliente" && (patch.responseSent === false || (patch.responseSent !== true && !quote.responseSent))) throw new Error("Confirme o envio da proposta ao cliente.");
  }
  const nextStatus = patch.status ?? (quoteTask && patch.quoteStatus !== undefined
    ? taskStatusForQuoteStatus(nextQuoteStatus)
    : previousStatus);
  const nextResponseSent = quoteTask && patch.responseSent !== undefined
    ? Boolean(patch.responseSent)
    : nextQuoteStatus === "Respondida ao cliente" && Boolean(linkedQuote?.responseSent);
  const quoteResponseSentChanged = quoteTask && nextResponseSent !== Boolean(linkedQuote?.responseSent);
  const effectiveAssignmentMode = patch.assignmentMode ?? existing?.assignmentMode ?? "people";
  const waitingContext = patch.waitingContext === undefined
    ? normalizeWaitingContext(existing?.waitingContext)
    : normalizeWaitingContext(patch.waitingContext);
  const waitingValidation = quoteTask ? { allowed: true, error: "" } : validateWaitingContext(nextStatus, waitingContext);
  if (existing && previousStatus !== "waiting" && nextStatus === "waiting" && !waitingValidation.allowed) {
    throw new Error(waitingValidation.error);
  }
  const payload: Payload = {};
  if (patch.title !== undefined) payload.cr40f_titulo = patch.title.trim();
  if (patch.description !== undefined) payload.cr40f_descricao = patch.description;
  if (patch.status !== undefined || patch.quoteStatus !== undefined) payload.cr40f_status = STATUS_VALUES[nextStatus];
  if (patch.priority !== undefined) payload.cr40f_prioridade = PRIORITY_VALUES[patch.priority];
  if (patch.dueDate !== undefined) payload.cr40f_prazo = patch.dueDate ? `${patch.dueDate}T12:00:00Z` : null;
  if (patch.restrictedVisibility !== undefined) payload[TASK_RESTRICTED_VISIBILITY_FIELD] = Boolean(patch.restrictedVisibility);
  if (patch.waitingContext !== undefined || (patch.status !== undefined && nextStatus === "waiting")) Object.assign(payload, waitingContextPayload(waitingContext));
  const relationUpdates: Promise<void>[] = [];
  let resolvedAssigneeIds: string[] = previousAssigneeIds;
  let resolvedPrimaryAssigneeId = previousPrimaryAssigneeId;
  if (patch.assigneeId !== undefined || patch.assigneeName !== undefined || patch.assigneeNames !== undefined || patch.assigneeIds !== undefined || patch.primaryAssigneeId !== undefined || patch.consultantIds !== undefined || patch.assignmentMode !== undefined || patch.teamIds !== undefined || patch.teamId !== undefined) {
    relationUpdates.push((async () => {
      const navigation = await resolveLookupNavigation(xrm, TASK_TABLE, EMPLOYEE_ASSIGNEE_FIELD, EMPLOYEE_TABLE);
      const assignment = resolveTaskAssignment({ ...existing, ...patch, assignmentMode: effectiveAssignmentMode }, state.teams || [], state.employees || []);
      const assigneeIds: string[] = assignment.assigneeIds.length
        ? assignment.assigneeIds
        : [...new Set(await resolveAssigneeIds(xrm, { ...existing, ...patch } as TaskChange))];
      resolvedAssigneeIds = assigneeIds;
      resolvedPrimaryAssigneeId = assignment.primaryAssigneeId || assigneeIds[0] || "";
      const employeeId = assigneeIds[0] || "";
      payload[`${navigation}@odata.bind`] = employeeId ? `/${entitySetName(EMPLOYEE_TABLE)}(${cleanId(employeeId)})` : null;
      await replaceTaskAssignees(xrm, id, { ...patch, ...assignment, assigneeIds });
    })());
  }
  if (patch.assignmentMode !== undefined || patch.teamIds !== undefined || patch.teamId !== undefined) {
    relationUpdates.push((async () => {
      const navigation = await resolveLookupNavigation(xrm, TASK_TABLE, TASK_TEAM_FIELD, TEAM_TABLE);
      const primaryTeamId = patch.teamIds?.[0] || patch.teamId;
      payload[`${navigation}@odata.bind`] = patch.assignmentMode === "team" && primaryTeamId ? `/${entitySetName(TEAM_TABLE)}(${cleanId(primaryTeamId)})` : null;
      await replaceTaskTeams(xrm, id, { ...existing, ...patch } as TaskChange);
    })());
  }
  await Promise.all(relationUpdates);
  const quoteSyncPayload = quoteTask && !patch.suppressQuoteSync && (nextQuoteStatus !== currentQuoteStatus || quoteResponseSentChanged || patch.value !== undefined || patch.commercialTerms !== undefined)
    ? quotePayload({ status: nextQuoteStatus, responseSent: nextResponseSent, value: patch.value ?? quote.value, commercialTerms: patch.commercialTerms ?? quote.commercialTerms, finalizationAt: isQuoteTerminalStatus(nextQuoteStatus) ? (quote.finalizationAt || new Date().toISOString()) : "", ...(isQuoteTerminalStatus(linkedQuote?.status) && !isQuoteTerminalStatus(nextQuoteStatus) ? { lossReason: "" } : {}), ...(currentQuoteStatus === QUOTE_WAITING_STATUS && nextQuoteStatus !== QUOTE_WAITING_STATUS ? QUOTE_WAITING_CLEARED : {}) })
    : null;
  const taskPath = `/${entitySetName(TASK_TABLE)}(${cleanId(id)})`;
  const quotePath = quoteTask ? `/${entitySetName(QUOTE_TABLE)}(${cleanId(existing?.quoteId)})` : "";
  if (quoteTask && nextStatus === "done" && quoteSyncPayload) {
    await request(xrm, quotePath, { method: "PATCH", body: JSON.stringify(quoteSyncPayload) });
    try { await request(xrm, taskPath, { method: "PATCH", body: JSON.stringify(payload) }); }
    catch (error) {
      try { await request(xrm, quotePath, { method: "PATCH", body: JSON.stringify(quotePayload({ status: quote.status, responseSent: quote.responseSent, value: quote.value, commercialTerms: quote.commercialTerms, finalizationAt: quote.finalizationAt })) }); }
      catch (rollbackError) { console.warn("[Planner] falha ao restaurar cotação após erro na tarefa", rollbackError); }
      throw error;
    }
    await markQuoteOrigin(xrm, existing?.quoteId).catch((error: unknown) => console.warn("[Planner] tarefa concluída; vínculo de origem não atualizado", error));
  } else {
    await Promise.all([
      request(xrm, taskPath, { method: "PATCH", body: JSON.stringify(payload) }),
      ...(quoteSyncPayload ? [request(xrm, quotePath, { method: "PATCH", body: JSON.stringify(quoteSyncPayload) })] : []),
      markQuoteOrigin(xrm, existing?.quoteId),
    ]);
  }
  const statusChanged = nextStatus !== previousStatus;
  const dueDateChanged = patch.dueDate !== undefined && patch.dueDate !== previousDueDate;
  const waitingChanged = patch.waitingContext !== undefined && JSON.stringify(waitingContext) !== JSON.stringify(normalizeWaitingContext(existing?.waitingContext));
  const suppressNotifications = patch.suppressNotifications === true;
  const nextAssigneeIds = resolvedAssigneeIds;
  const assigneesChanged = (patch.assigneeNames !== undefined || patch.assigneeIds !== undefined || patch.primaryAssigneeId !== undefined || patch.consultantIds !== undefined || patch.assignmentMode !== undefined || patch.teamIds !== undefined || patch.teamId !== undefined) && (JSON.stringify([...previousAssigneeIds].sort()) !== JSON.stringify([...nextAssigneeIds].sort()) || resolvedPrimaryAssigneeId !== previousPrimaryAssigneeId);
  const quoteNotificationContext = quoteTask ? { sourceType: "quote", sourceCode: existing?.sourceCode || existing?.quoteCode || "", creatorEmployeeId: "", notificationRecipientIds: nextAssigneeIds } : {};
  const eventContext = { actorEmployeeId: patch.actorEmployeeId || "", actorUserId: patch.actorUserId || "", creatorEmployeeId: existing?.creatorEmployeeId || "", assigneeIds: nextAssigneeIds, previousAssigneeIds, ...quoteNotificationContext };
  const eventWrites: Promise<unknown>[] = [];
  if (quoteTask && patch.quoteCommercialChange) eventWrites.push(createEvent(xrm, id, 100000002, "Valores, opções ou condições da cotação atualizados.", "quoteCommercial", JSON.stringify(patch.quoteCommercialChange.previous), JSON.stringify(patch.quoteCommercialChange.next)));
  if (!suppressNotifications) {
    if (patch.mentionedEmployeeIds?.length) eventWrites.push(createEvent(xrm, id, 100000001, "Menção na tarefa.", "notification:mention", "", JSON.stringify({ ...eventContext, mentionedEmployeeIds: patch.mentionedEmployeeIds })));
    if (statusChanged) eventWrites.push(createEvent(xrm, id, 100000002, nextStatus === "done" ? "Tarefa concluída." : `Status alterado para ${STATUSES.find((item) => item.id === nextStatus)?.label || nextStatus}.`, "status", previousStatus, nextStatus));
    if (statusChanged && nextStatus === "waiting") eventWrites.push(createEvent(xrm, id, 100000002, waitingContextSummary(waitingContext), "waitingContext", JSON.stringify(normalizeWaitingContext(existing?.waitingContext)), JSON.stringify(waitingContext)));
    if (waitingChanged && !statusChanged) eventWrites.push(createEvent(xrm, id, 100000002, `Contexto de Aguardando atualizado: ${waitingContextSummary(waitingContext)}.`, "waitingContext", JSON.stringify(normalizeWaitingContext(existing?.waitingContext)), JSON.stringify(waitingContext)));
    if (statusChanged && nextStatus === "done" && !quoteTask) eventWrites.push(createEvent(xrm, id, 100000002, "Tarefa concluída por outro responsável.", "notification:status", "", JSON.stringify({ ...eventContext, previousStatus, nextStatus })));
    if ((statusChanged && nextStatus === "waiting") || (waitingChanged && !statusChanged)) {
      const waitingTargets = waitingTargetIds(state, waitingContext);
      eventWrites.push(createEvent(xrm, id, 100000002, waitingContextSummary(waitingContext) || "Tarefa aguardando retorno.", "notification:waiting", "", JSON.stringify({ ...eventContext, previousStatus, nextStatus, waitingContext, waitingTargetIds: waitingTargets, notificationRecipientIds: quoteTask ? [...new Set([...nextAssigneeIds, ...waitingTargets])] : undefined })));
    }
    if (dueDateChanged) eventWrites.push(createEvent(xrm, id, 100000002, `Prazo alterado de ${previousDueDate || "sem prazo"} para ${patch.dueDate || "sem prazo"}.${patch.deadlineChangeReason ? ` Motivo: ${patch.deadlineChangeReason}` : ""}`, "notification:deadline", previousDueDate, JSON.stringify({ ...eventContext, nextDueDate: patch.dueDate || "", reason: patch.deadlineChangeReason || "" })));
    if (assigneesChanged) {
      const addedAssigneeIds = nextAssigneeIds.filter((assigneeId) => !previousAssigneeIds.includes(assigneeId));
      const removedAssigneeIds = previousAssigneeIds.filter((assigneeId) => !nextAssigneeIds.includes(assigneeId));
      eventWrites.push(createEvent(xrm, id, 100000002, "Responsáveis alterados.", "notification:assignees", JSON.stringify(previousAssigneeIds), JSON.stringify({ ...eventContext, addedAssigneeIds, removedAssigneeIds, notificationRecipientIds: quoteTask ? addedAssigneeIds : undefined })));
    }
    if (!statusChanged && !dueDateChanged && !assigneesChanged && !waitingChanged) eventWrites.push(createEvent(xrm, id, patch.status !== undefined ? 100000002 : 100000001, "Tarefa atualizada."));
  }
  if (quoteTask && nextStatus === "done") await Promise.all(eventWrites).catch((error: unknown) => console.warn("[Planner] tarefa concluída; evento de histórico não registrado", error));
  else await Promise.all(eventWrites);
  const confirmedPatch = Object.fromEntries(Object.entries({ ...patch, ...(quoteTask ? { status: nextStatus, quoteStatus: nextQuoteStatus } : {}) }).filter(([key]) => !["actorEmployeeId", "actorUserId", "mentionedEmployeeIds", "deadlineChangeReason", "suppressNotifications", "responseSent"].includes(key)));
  const nextState = applyOptimisticTaskPatch(state, id, confirmedPatch) as LiveState;
  if (quoteTask && (nextQuoteStatus !== currentQuoteStatus || quoteResponseSentChanged)) {
    nextState.quotes = nextState.quotes.map((item) => cleanId(item.id) === cleanId(existing?.quoteId)
      ? { ...item, status: nextQuoteStatus, responseSent: nextResponseSent }
      : item);
  }
  const executionActor = nextStatus === "doing" && statusChanged && (patch.actorEmployeeId || patch.actorUserId || patch.actorName)
    ? (state.employees || []).find((employee) => employee.id === patch.actorEmployeeId || employee.userId === patch.actorUserId) || {
        id: patch.actorEmployeeId || "",
        userId: patch.actorUserId || "",
        name: patch.actorName || "Executor não identificado",
      }
    : null;
  const nextStateWithExecution: LiveState = executionActor
    ? {
        ...nextState,
        tasks: nextState.tasks.map((task) => task.id === id
          ? {
              ...task,
              history: [...(task.history || []), {
                id: `optimistic-execution-${Date.now()}`,
                text: "Status alterado para Em andamento.",
                createdAt: new Date().toISOString(),
                author: executionActor.name || patch.actorName || "Executor não identificado",
                authorId: executionActor.id || patch.actorEmployeeId || "",
                authorUserId: executionActor.userId || patch.actorUserId || "",
                field: "status",
                previousValue: previousStatus,
                nextValue: "doing",
              }],
            }
          : task),
      }
    : nextState;
  return {
    ...nextStateWithExecution,
    tasks: nextStateWithExecution.tasks.map((task) => task.id === id ? { ...task, syncStatus: undefined, detailsLoaded: false, detailsLoading: false, detailsError: undefined } : task),
  };
}

export interface CommentContext { mentionedEmployeeIds?: string[]; [extra: string]: unknown }

async function addLiveComment(xrm: PlannerXrm, taskId: string, text: string, context: CommentContext = {}) {
  await createEvent(xrm, taskId, 100000001, "Comentário adicionado.", "comentario", "", text.trim());
  if (context.mentionedEmployeeIds?.length) await createEvent(xrm, taskId, 100000001, "Menção em comentário.", "notification:mention", "", JSON.stringify({ ...context, commentText: text.trim().slice(0, 160) }));
  return loadLiveState(xrm);
}

async function addLiveAttachment(xrm: PlannerXrm, state: LiveState, taskId: string, file: UploadFile | null | undefined, metadata: { returnId?: string } = {}) {
  if (!file) return state;
  const uploadFile: UploadFile = await optimizeAttachmentFile(file);
  if (uploadFile.size > MAX_ATTACHMENT_SIZE) throw new Error("O anexo deve ter no máximo 5 MB após a compressão.");
  const taskRows = await retrieveMany(xrm, TASK_TABLE, `?$select=cr40f_titulo,cr40f_codigoorigem&$filter=cr40f_plannertarefaid eq ${cleanId(taskId)}&$top=1`);
  const task: Row = taskRows[0] || {};
  const fileName = sanitizePathSegment(uploadFile.name, "arquivo");
  const taskKey = sanitizePathSegment(task.cr40f_codigoorigem || taskId);
  const path = `Tarefas Planner/${String(apiUrl(xrm)).toLowerCase().includes(DEV_DATAVERSE_URL) ? "DEV/" : ""}${taskKey}/Anexos`;
  const flowUrl = await resolveSharePointFlowUrl(xrm);
  if (!flowUrl) throw new Error(`URL do Flow não configurada: ${FLOW_URL_SCHEMA}.`);
  const base64 = uploadFile.base64 || await fileToBase64(uploadFile);
  const response = await fetch(flowUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caminhoCompleto: path, nomeArquivo: fileName, conteudoBase64: base64, mimeType: uploadFile.type || "application/octet-stream", metadados: { tarefaId: taskId, tarefa: task.cr40f_titulo || "", origem: "PLANNER_INTERNO", ...metadata } }) });
  const responseText = await response.text();
  const result = extractFlowRecord(responseText) || {};
  if (!response.ok || result.sucesso !== true) throw new Error(s(result.erro) || `Flow SharePoint falhou: HTTP ${response.status}.`);
  const sharePointId = s(result.identificador || result.Identifier || result.id || result.itemId || result.ItemId);
  const attachment: LiveAttachment = { name: s(result.nomeArquivo || result.Name) || fileName, id: sharePointId, sharePointId, returnId: metadata.returnId || "", fileLocator: s(result.fileLocator || result.identificador || result.Identifier), path: s(result.caminhoSharePoint || result.caminhoCompleto || result.Path), mimeType: s(result.mimeType || result.MediaType) || uploadFile.type || "application/octet-stream", size: (result.tamanho ?? result.Size ?? uploadFile.size) as number };
  if (!attachment.id && !attachment.fileLocator && !attachment.path) throw new Error("Flow SharePoint não retornou identificador ou caminho do arquivo.");
  await createEvent(xrm, taskId, 100000001, "Anexo adicionado.", "anexo", "", JSON.stringify(attachment));
  return {
    ...state,
    tasks: state.tasks.map((item) => item.id === taskId ? {
      ...item,
      attachments: [...(item.attachments || []), attachment],
      detailsLoaded: false,
      detailsLoading: false,
    } : item),
  };
}

export interface WaitingReturnInput { text?: unknown; actorEmployeeId?: string; actorUserId?: string; files?: unknown; returnId?: string }

async function resolveLiveWaitingReturn(xrm: PlannerXrm, state: LiveState, id: string, input: WaitingReturnInput = {}) {
  const existing = state.tasks.find((taskItem) => taskItem.id === id);
  if (!existing || existing.status !== "waiting") {
    throw new Error("A tarefa não está aguardando um retorno.");
  }
  // Proposta enviada: o retorno é a decisão do cliente, registrada na cotação.
  if ((state.quotes || []).find((quote) => cleanId(quote.id) === cleanId(existing.quoteId))?.status === "Respondida ao cliente") throw new Error(QUOTE_CLIENT_DECISION_RETURN);
  const text = String(input.text || "").trim();
  if (!text) throw new Error("Informe o retorno recebido.");
  const actor = (state.employees || []).find((employee) =>
    employee.id === input.actorEmployeeId || employee.userId === input.actorUserId,
  );
  if (!canRegisterWaitingReturn(existing, actor, state.teams || [])) {
    throw new Error("Você não pode registrar este retorno.");
  }
  const files: UploadFile[] = Array.isArray(input.files) ? input.files.filter(Boolean) : [];
  const returnId = input.returnId || `return-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const occurredAt = new Date().toISOString();
  for (const file of files) await addLiveAttachment(xrm, state, id, file, { returnId });
  await createEvent(xrm, id, 100000001, "Retorno registrado.", "retorno", "", JSON.stringify({ returnId, text, createdAt: occurredAt, authorId: input.actorUserId || input.actorEmployeeId || "", author: actor?.name || "Sistema" }));
  const next = await updateLiveTask(xrm, state, id, {
    status: "doing",
    actorEmployeeId: input.actorEmployeeId || "",
    actorUserId: input.actorUserId || "",
  });
  const nextTask = next.tasks.find((taskItem) => taskItem.id === id) || existing;
  const assigneeIds = nextTask.assigneeIds || [];
  await createEvent(
    xrm,
    id,
    100000002,
    "Retorno registrado. Tarefa retomada para Em andamento.",
    "notification:status",
    "waiting",
    JSON.stringify({
      actorEmployeeId: input.actorEmployeeId || "",
      actorUserId: input.actorUserId || "",
      creatorEmployeeId: isQuoteTask(existing) && !existing.parentTaskId ? "" : nextTask.creatorEmployeeId || "",
      assigneeIds,
      notificationRecipientIds: isQuoteTask(existing) && !existing.parentTaskId ? assigneeIds : undefined,
      sourceType: isQuoteTask(existing) && !existing.parentTaskId ? "quote" : undefined,
      sourceCode: isQuoteTask(existing) && !existing.parentTaskId ? nextTask.sourceCode || nextTask.quoteCode || "" : undefined,
      previousStatus: "waiting",
      nextStatus: "doing",
      returnId,
      returnText: text,
    }),
  );
  return loadLiveState(xrm);
}

async function loadLiveAttachmentContent(xrm: PlannerXrm, attachment: LiveAttachment) {
  const flowUrl = await resolveSharePointReadFlowUrl(xrm);
  if (!flowUrl) throw new Error(`URL do Flow de consulta não configurada: ${READ_FLOW_URL_SCHEMA}.`);
  if (!attachment?.sharePointId && !attachment?.fileLocator && !attachment?.path) throw new Error("Anexo sem identificador ou caminho SharePoint.");
  const response = await fetch(flowUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: attachment.sharePointId || "", fileLocator: attachment.fileLocator || "", caminhoSharePoint: attachment.path || "", nomeArquivo: attachment.name || "" }) });
  const responseText = await response.text();
  const result = extractFlowRecord(responseText) || {};
  if (!response.ok || result.sucesso !== true || !result.conteudoBase64) throw new Error(s(result.erro) || `Flow de consulta SharePoint falhou: HTTP ${response.status}.`);
  const mimeType = attachment.mimeType || result.mimeType || "application/octet-stream";
  return { ...attachment, mimeType: mimeType as string, dataUrl: `data:${mimeType};base64,${String(result.conteudoBase64)}` };
}

// --- Anexos da cotação (V2.1) ----------------------------------------------
// Pasta Cotacoes/<id> (DEV em Cotacoes/DEV/<id>) pelos mesmos flows HTTP de Funcionários.
export const QUOTE_ATTACHMENT_ROOT = "Cotacoes";
export const QUOTE_ATTACHMENT_MAX_BYTES = DOC_MAX_BYTES;

export function quoteAttachmentFromDoc(doc: Documento): LiveAttachment {
  return { id: doc.id || doc.caminho, name: doc.nome, sharePointId: doc.id, path: doc.caminho, mimeType: doc.mimeType || "", size: doc.tamanho ?? 0, createdAt: doc.modificadoEm || "" };
}

/** Nome seguro e único na pasta; recusa arquivo acima de 10 MB. */
export function quoteAttachmentName(file: { name?: string; size?: number }, existing: Array<{ name?: string }>): string {
  if ((file.size || 0) > QUOTE_ATTACHMENT_MAX_BYTES) throw new Error(`${file.name || "Arquivo"}: máximo 10 MB por arquivo.`);
  return uniqueName(sanitizeFileName(file.name || "arquivo"), existing.map((item) => item.name || ""));
}

function createQuoteAttachmentStore(xrm: PlannerXrm) {
  const envLabel = String(apiUrl(xrm)).toLowerCase().includes(DEV_DATAVERSE_URL) ? "DEV" : "PROD";
  const docs = createSharePointDocs({ retrieveMultipleRecords: async (entity, options = "") => ({ entities: await retrieveMany(xrm, entity, options) }) }, envLabel, QUOTE_ATTACHMENT_ROOT, "PLANNER_COTACAO");
  const doc = (quoteId: string, attachment: LiveAttachment): Documento => ({ id: attachment.sharePointId || "", caminho: attachment.path || `${docs.pasta(quoteId)}/${attachment.name || ""}`, nome: attachment.name || "", tamanho: attachment.size ?? null, modificadoEm: attachment.createdAt || null, mimeType: attachment.mimeType || null });
  return {
    load: async (quoteId: string) => (await docs.listar(cleanId(quoteId))).map(quoteAttachmentFromDoc),
    add: async (quoteId: string, file: UploadFile, existing: LiveAttachment[]) => {
      const id = cleanId(quoteId);
      const saved = await docs.enviar(id, file, quoteAttachmentName(file, existing));
      // Sem caminho na resposta do flow, o id/abrir/excluir usam o caminho previsível na pasta da cotação.
      return quoteAttachmentFromDoc({ ...saved, caminho: saved.caminho || `${docs.pasta(id)}/${saved.nome}` });
    },
    remove: (quoteId: string, attachment: LiveAttachment) => docs.excluir(cleanId(quoteId), doc(cleanId(quoteId), attachment)),
  };
}

async function deleteLiveAttachment(xrm: PlannerXrm, state: LiveState, taskId: string, attachment: LiveAttachment) {
  const flowUrl = await resolveSharePointDeleteFlowUrl(xrm);
  if (!flowUrl) throw new Error(`URL do Flow de exclusão não configurada: ${DELETE_FLOW_URL_SCHEMA}.`);
  if (!attachment?.sharePointId && !attachment?.fileLocator && !attachment?.path) throw new Error("Anexo sem identificador ou caminho SharePoint.");
  const response = await fetch(flowUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: attachment.sharePointId || attachment.fileLocator || attachment.path || "", fileLocator: attachment.fileLocator || "", caminhoSharePoint: attachment.path || "", nomeArquivo: attachment.name || "", tarefaId: taskId }) });
  const responseText = await response.text();
  const result = extractFlowRecord(responseText) || {};
  if (!response.ok || result.sucesso !== true) throw new Error(s(result.erro) || `Flow de exclusão SharePoint falhou: HTTP ${response.status}.`);
  if (attachment.eventId) await request(xrm, `/${entitySetName(EVENT_TABLE)}(${cleanId(attachment.eventId)})`, { method: "DELETE" });
  return {
    ...state,
    tasks: state.tasks.map((task) => task.id === taskId ? {
      ...task,
      attachments: (task.attachments || []).filter((item) => item.id !== attachment.id),
      detailsLoaded: false,
      detailsLoading: false,
    } : task),
  };
}

async function createLiveSubtask(xrm: PlannerXrm, state: LiveState, parentId: string, input: TaskChange) {
  const nextState = await createLiveTask(xrm, state, { ...input, parentTaskId: parentId, sourceType: input.sourceType || "manual", sourceCode: input.sourceCode || "" });
  const child = nextState.tasks.find((item) => item.title === input.title!.trim() && !item.parentTaskId);
  if (!child) throw new Error("Dataverse criou a subtarefa, mas não foi possível localizar o ID.");
  const payload: Payload = { cr40f_tipo: 100000000, cr40f_name: `${parentId}-${child.id}` };
  await bindLookup(xrm, payload, RELATION_TABLE, "cr40f_tarefapai", TASK_TABLE, parentId);
  await bindLookup(xrm, payload, RELATION_TABLE, "cr40f_subtarefa", TASK_TABLE, child.id);
  await request(xrm, `/${entitySetName(RELATION_TABLE)}`, { method: "POST", body: JSON.stringify(payload) });
  return loadLiveState(xrm);
}

async function optimizeAttachmentFile(file: UploadFile): Promise<UploadFile> {
  if (!file?.type || !OPTIMIZABLE_IMAGE_TYPES.has(file.type) || typeof document === "undefined" || typeof globalThis.createImageBitmap !== "function") return file;
  if (typeof Worker === "function" && typeof OffscreenCanvas === "function") {
    let worker: Worker | undefined;
    let workerUrl: string | undefined;
    try {
      workerUrl = URL.createObjectURL(new Blob([IMAGE_OPTIMIZER_WORKER_SOURCE], { type: "text/javascript" }));
      const activeWorker = new Worker(workerUrl);
      worker = activeWorker;
      return await new Promise<UploadFile>((resolve, reject) => {
        activeWorker.onmessage = ({ data }: MessageEvent<unknown>) => {
          const message = asRecord(data);
          if (message.error) reject(new Error(String(message.error)));
          else if (message.unchanged) resolve(file);
          else {
            const blob = new Blob([message.buffer as ArrayBuffer], { type: s(message.type) || file.type });
            resolve(blob.size < file.size * 0.95 ? new File([blob], file.name, { type: blob.type, lastModified: file.lastModified }) : file);
          }
        };
        activeWorker.onerror = () => reject(new Error("Falha no worker de otimização."));
        activeWorker.postMessage({ file, maxEdge: MAX_IMAGE_EDGE, quality: IMAGE_QUALITY });
      });
    } catch {
      // Fallback abaixo cobre browsers embutidos sem suporte completo a Worker.
    } finally {
      worker?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    }
  }
  try {
    const bitmap = await globalThis.createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 900 * 1024) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, file.type === "image/png" ? undefined : IMAGE_QUALITY));
    bitmap.close?.();
    if (!blob || blob.size >= file.size * 0.95) return file;
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

async function fileToBase64(file: UploadFile): Promise<string> {
  if (!file) throw new Error("Arquivo inválido para anexar.");
  if (file.base64) return file.base64;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").slice(1).join(","));
    reader.onerror = () => reject(new Error("Não foi possível preparar o arquivo para envio."));
    reader.readAsDataURL(file);
  });
}

async function ensureLiveQuoteTask(xrm: PlannerXrm, state: LiveState, quote: LiveQuote) {
  const existing = state.tasks.find((item) => item.quoteId === quote.id && !item.parentTaskId);
  if (existing || quote.plannerTaskId) return state;
  const reference = String(quote.code || quote.title || "").trim();
  return createLiveTask(xrm, state, { title: quoteTaskTitle(quote), quoteId: quote.id, quoteCode: quote.code || "", quoteTitle: quote.title || "", quoteStatus: quote.status, dueDate: quote.deadline, priority: "medium", sourceType: "quote", assigneeName: "Não atribuído", teamName: "Financeiro", description: `Acompanhar a cotação ${reference || "selecionada"} até a resposta ao cliente.` });
}

function quoteDateTime(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function quoteMoney(value: unknown) {
  const number = parseQuoteMoney(value);
  return Number.isFinite(number) ? number : null;
}

function quoteChoice(value: unknown, choices: Readonly<Record<string, number>>, label: string) {
  if (Object.prototype.hasOwnProperty.call(choices, String(value))) return choices[String(value)];
  if (Number.isInteger(value) && Object.values(choices).includes(Number(value))) return value;
  throw new Error(`${label} inválido para cotação: ${String(value ?? "vazio")}. Selecione uma opção válida.`);
}

/** Entrada de gravação da cotação: campos do formulário e da sincronização com a tarefa. */
export type QuotePatch = Record<string, unknown>;

function quotePayload(input: QuotePatch = {}, includeUnset = false, clientNavigation = ""): Payload {
  const payload: Payload = {};
  const has = (key: string) => includeUnset || Object.prototype.hasOwnProperty.call(input, key);
  const set = (key: string, field: string, value: unknown) => { if (has(key)) payload[field] = value; };
  set("title", "cr40f_titulo", input.title == null ? quoteTaskTitle(input) : String(input.title).trim() || quoteTaskTitle(input));
  set("client", "cr40f_clienteempresa", input.client == null ? "" : String(input.client).trim());
  if (has("clientId") && input.clientId) {
    const clientId = cleanId(input.clientId);
    if (!/^[0-9a-f-]{36}$/i.test(clientId) || !quoteClientEntitySet) throw new Error("Cliente cadastrado inválido. Selecione novamente.");
    payload[`${clientNavigation || "cr40f_cliente"}@odata.bind`] = `/${quoteClientEntitySet}(${clientId})`;
  }
  set("clientContact", "cr40f_contatocliente", input.clientContact == null ? "" : String(input.clientContact).trim());
  set("clientPhone", "cr40f_telefonewhatsapp", input.clientPhone == null ? "" : String(input.clientPhone).trim());
  set("clientEmail", "cr40f_emailcliente", input.clientEmail == null ? "" : String(input.clientEmail).trim());
  if (input.channel) payload.cr40f_canalentrada = quoteChoice(input.channel, QUOTE_CHANNEL_VALUES, "Canal de entrada");
  else if (!includeUnset && has("channel")) payload.cr40f_canalentrada = null;
  if (input.vehicleType) payload.cr40f_tipoveiculo = quoteChoice(input.vehicleType === "Basico" ? "Básico" : input.vehicleType, QUOTE_VEHICLE_VALUES, "Tipo de veículo");
  else if (!includeUnset && has("vehicleType")) payload.cr40f_tipoveiculo = null;
  for (const [key, legacyField, longField] of [["origin", "cr40f_origem", "cr40f_origemcompleta"], ["destination", "cr40f_destino", "cr40f_destinocompleto"]]) {
    if (!has(key)) continue;
    const value = input[key] == null ? "" : String(input[key]);
    if (value.length > 10000) throw new Error(`${key === "origin" ? "Origem" : "Destino"} excede 10.000 caracteres.`);
    if (value.length > 300 && !quoteFieldAvailable.longRoutes) throw new Error("Campos de rota longa ainda não disponíveis neste ambiente.");
    payload[legacyField] = value.length > 300 ? `${value.slice(0, 297)}...` : value;
    if (quoteFieldAvailable.longRoutes) payload[longField] = value;
  }
  // Trajeto deixou de ser obrigatório na cotação (fica no agendamento).
  // Trajeto antigo incompleto (ex.: "Origem / ") não é editável na V2: mantém o que está gravado.
  const routeInvalid = has("route") && !!normalizeQuoteRoute(input.route).trim() && !!validateQuoteRoute(normalizeQuoteRoute(input.route));
  if (has("route") && !normalizeQuoteRoute(input.route).trim()) {
    if (quoteFieldAvailable.route) payload.cr40f_trajeto = null;
  } else if (has("route") && !routeInvalid) {
    if (!quoteFieldAvailable.route) throw new Error("Campo Trajeto ainda não disponível no Dataverse. O rascunho foi mantido; publique o schema de cotação em DEV e tente novamente.");
    const route = normalizeQuoteRoute(input.route);
    const points: string[] = quoteRoutePoints({ route });
    payload.cr40f_trajeto = route;
    const routeFields: Array<[string, string, string, string]> = [
      ["origem", points[0], "cr40f_origem", "cr40f_origemcompleta"],
      ["destino", points.at(-1) as string, "cr40f_destino", "cr40f_destinocompleto"],
    ];
    for (const [label, point, legacyField, longField] of routeFields) {
      if (point.length > 300 && !quoteFieldAvailable.longRoutes) throw new Error(`O ponto de ${label} excede o limite do campo legado e os campos completos ainda não estão disponíveis.`);
      payload[legacyField] = point.length > 300 ? `${point.slice(0, 297)}...` : point;
      if (quoteFieldAvailable.longRoutes) payload[longField] = point;
    }
  }
  if (has("serviceDate")) payload.cr40f_datahoraservico = quoteDateTime(input.serviceDate);
  if (has("returnDate")) payload.cr40f_datahoraretorno = quoteDateTime(input.returnDate);
  if (has("hasReturn") || has("returnDate")) payload.cr40f_retorno = Boolean(input.hasReturn || input.returnDate);
  if (has("passengers")) payload.cr40f_quantidadepassageiros = input.passengers === "" ? null : Number(input.passengers);
  set("notes", "cr40f_observacoespedido", input.notes == null ? "" : String(input.notes));
  for (const [key, field] of Object.entries(QUOTE_REQUEST_FIELDS)) {
    if (!has(key)) continue;
    const value = input[key] == null ? "" : String(input[key]);
    if (value.trim() && !quoteFieldAvailable.requestFields) throw new Error("Campos de perfil do passageiro e observações internas ainda não existem neste ambiente. Rode scripts/ensure-quote-pedido-dev.ps1 e tente novamente.");
    if (quoteFieldAvailable.requestFields) payload[field] = value;
  }
  // Campos de espera só são gravados se as colunas existirem (scripts/ensure-quote-v2-dev.ps1).
  if (quoteFieldAvailable.waiting) {
    set("waitingFor", QUOTE_WAITING_FIELDS.waitingFor, s(input.waitingFor));
    set("waitingFrom", QUOTE_WAITING_FIELDS.waitingFrom, s(input.waitingFrom));
    set("waitingReturnDate", QUOTE_WAITING_FIELDS.waitingReturnDate, s(input.waitingReturnDate).slice(0, 10) || null);
  }
  if (has("priority")) payload.cr40f_prioridade = quoteChoice(input.priority, QUOTE_PRIORITY_VALUES, "Prioridade");
  if (has("status")) payload.cr40f_statuscotacao = quoteChoice(input.status, QUOTE_STATUS_VALUES, "Status");
  if (has("deadline")) payload.cr40f_prazoresponder = input.deadline ? `${String(input.deadline)}T12:00:00Z` : null;
  if (has("value")) payload.cr40f_valorcotado = quoteMoney(input.value);
  set("commercialTerms", "cr40f_condicaocomercial", input.commercialTerms == null ? "" : String(input.commercialTerms));
  if (has("responseSent")) payload.cr40f_respostaenviadacliente = Boolean(input.responseSent);
  if (has("finalizationAt")) payload.cr40f_datahorafinalizacao = quoteDateTime(input.finalizationAt);
  if (has("optionsVersion")) payload.cr40f_opcoesversao = input.optionsVersion || null;
  if (has("acceptedOptionId")) payload.cr40f_opcaoaceitaid = input.acceptedOptionId || "";
  if (has("lossReason")) {
    const reason = String(input.lossReason || "").trim();
    if (reason.length > 1000) throw new Error("Motivo da perda excede 1.000 caracteres.");
    if (reason && !quoteFieldAvailable.lossReason) throw new Error("Campo Motivo da perda ainda não disponível no Dataverse DEV.");
    if (quoteFieldAvailable.lossReason) payload.cr40f_motivoperda = reason;
  }
  return payload;
}

async function createLiveQuote(xrm: PlannerXrm, state: LiveState, input: QuotePatch = {}) {
  if (QUOTE_COMPLETED_STATUSES.includes(s(input.status))) throw new Error("Crie a cotação como Nova e registre o resultado comercial depois.");
  await quoteSelect(xrm);
  const normalizedInput: QuotePatch = { ...input, title: String(input.title || "").trim() || quoteTaskTitle(input), optionsVersion: Array.isArray(input.options) ? scenarioId() : "" };
  const clientNavigation = normalizedInput.clientId
    ? await resolveLookupNavigation(xrm, QUOTE_TABLE, "cr40f_cliente", "cr40f_clientes1")
    : "";
  const payload = quotePayload(normalizedInput, true, clientNavigation);
  const schema = await probeQuoteV2Schema(xrm);
  if (schema.creator && normalizedInput.actorEmployeeId) await bindLookup(xrm, payload, QUOTE_TABLE, "cr40f_criador", EMPLOYEE_TABLE, normalizedInput.actorEmployeeId);
  const created = asRecord(await request(xrm, `/${entitySetName(QUOTE_TABLE)}`, { method: "POST", body: JSON.stringify(payload) }));
  const quoteId = cleanId(created?.cr40f_pedidodecotacaoid || created?.[`${QUOTE_TABLE}id`]);
  if (!quoteId) throw new Error("Dataverse criou a cotação sem retornar o ID.");
  if (Array.isArray(normalizedInput.options)) {
    try { await writeQuoteOptions(xrm, quoteId, normalizedInput.options as QuoteOptionData[], s(normalizedInput.optionsVersion)); }
    catch (error) {
      try { await request(xrm, `/${entitySetName(QUOTE_TABLE)}(${quoteId})`, { method: "DELETE" }); } catch (cleanupError) { console.warn("[Planner] falha ao desfazer cotação sem opções", cleanupError); }
      throw new Error(`Não foi possível salvar as opções da cotação. ${errorMessage(error)}`);
    }
  }
  // V2: a cotação é a própria fila; não cria tarefa. Prazo hoje avisa o Financeiro.
  const financeIds = Array.isArray(normalizedInput.financeIds) ? (normalizedInput.financeIds as unknown[]).map(String) : financeMemberIds(state);
  const quote = { id: quoteId, code: s(created.cr40f_numerodacotacao), title: s(normalizedInput.title), client: s(normalizedInput.client), status: "Nova", deadline: s(normalizedInput.deadline) };
  await createQuoteNotifications(xrm, urgentNotices(quote, financeIds, s(normalizedInput.today) || localDateKey()));
  return loadLiveState(xrm);
}

async function updateLiveQuote(xrm: PlannerXrm, state: LiveState, id: string, patch: QuotePatch = {}): Promise<LiveState> {
  const quoteId = cleanId(id);
  const existing = (state.quotes || []).find((quote) => cleanId(quote.id) === quoteId);
  if (!existing) throw new Error("Cotação não encontrada.");
  if (patch.etag && patch.etag !== existing.etag) throw new Error("A cotação foi alterada por outra pessoa. Recarregue antes de salvar.");
  // V2.1: entrar em Aguardando exige o que falta/de quem/retorno; sair limpa os campos.
  patch = applyQuoteWaiting(existing.status, applyDerivedStatus(existing, patch));
  const nextStatus = s(patch.status ?? existing.status);
  if (patch.responseSent === true && nextStatus !== "Respondida ao cliente") throw new Error("Envio só pode ser confirmado na cotação respondida.");
  if (patch.responseSent === true && !((patch.proposalVersions as unknown[] | undefined) || existing.proposalVersions || []).length) throw new Error("Registre uma versão da proposta antes de confirmar o envio.");
  if (nextStatus === "Respondida ao cliente" && !existing.responseSent) throw new Error("Confirme a resposta ao cliente antes de dar baixa.");
  if (QUOTE_COMPLETED_STATUSES.includes(nextStatus) && (patch.status !== undefined || patch.value !== undefined || patch.commercialTerms !== undefined || patch.responseSent !== undefined)) {
    const validation = validateQuoteCommercial({ ...existing, ...patch });
    if (!validation.valid) throw new Error(Object.values(validation.errors).join(" "));
    if (nextStatus === "Respondida ao cliente" && (patch.responseSent === false || (patch.responseSent !== true && !existing.responseSent))) throw new Error("Confirme o envio da proposta ao cliente.");
  }
  const linkedTasks = (state.tasks || []).filter((item) => cleanId(item.quoteId) === quoteId);
  if (patch.status && !isQuoteTerminalStatus(patch.status) && isQuoteTerminalStatus(existing.status)) patch = { ...patch, finalizationAt: "", lossReason: "", responseSent: false };
  await quoteSelect(xrm);
  if (Array.isArray(patch.options) && !existing.etag) throw new Error("O Dataverse não forneceu a versão da cotação. Recarregue antes de substituir as opções para evitar sobrescrever uma edição simultânea.");
  const effectivePatch: QuotePatch = { ...patch };
  if (isAutomaticQuoteTitle(existing) && patch.clientContact !== undefined && patch.title === undefined) effectivePatch.title = quoteTaskTitle({ ...existing, ...patch });
  const clientNavigation = effectivePatch.clientId
    ? await resolveLookupNavigation(xrm, QUOTE_TABLE, "cr40f_cliente", "cr40f_clientes1")
    : "";
  let stagedOptions: { revisionId: string; rows: Row[] } | null = null;
  if (Array.isArray(patch.options)) {
    const patchOptions = patch.options as QuoteOptionData[];
    const revisionId = scenarioId();
    stagedOptions = { revisionId, rows: await writeQuoteOptions(xrm, quoteId, patchOptions, revisionId) };
    effectivePatch.optionsVersion = stagedOptions.revisionId;
    if (patch.value === undefined) effectivePatch.value = patchOptions.length === 1 ? patchOptions[0].value ?? "" : "";
  }
  const payload = quotePayload({ ...effectivePatch, ...(patch.status && patch.status !== "Respondida ao cliente" ? { responseSent: false } : {}) }, false, clientNavigation);
  if (patch.acceptedOptionId !== undefined) {
    const acceptedOption = (existing.options || []).find((option) => option.id === patch.acceptedOptionId);
    if (acceptedOption?.recordId) await bindLookup(xrm, payload, QUOTE_TABLE, "cr40f_opcaoaceita", QUOTE_OPTION_TABLE, acceptedOption.recordId);
  }
  if (patch.acceptedProposalVersionId !== undefined) {
    const versionId = cleanId(patch.acceptedProposalVersionId);
    if (versionId) await bindLookup(xrm, payload, QUOTE_TABLE, "cr40f_versaopropostaaceita", QUOTE_PROPOSAL_VERSION_TABLE, versionId);
    else payload["cr40f_VersaoPropostaAceita@odata.bind"] = null;
  }
  try {
    await request(xrm, `/${entitySetName(QUOTE_TABLE)}(${quoteId})`, { method: "PATCH", body: JSON.stringify(payload), headers: existing.etag ? { "If-Match": existing.etag } : {} });
  } catch (error) {
    if (stagedOptions) { try { await deleteScenarioRows(xrm, stagedOptions.rows); } catch (cleanupError) { console.warn("[Planner] falha ao limpar opções não salvas", cleanupError); } }
    if (errorMessage(error).includes("412")) throw new Error("A cotação foi alterada por outra pessoa. Recarregue os dados antes de salvar para evitar sobrescrever a edição.");
    throw error;
  }
  const ready = readyNotice(existing, { ...existing, ...effectivePatch, status: nextStatus }, new Date().toISOString());
  if (ready) await createQuoteNotifications(xrm, [ready]);
  const statusChanged = nextStatus !== existing.status;
  const terminal = isQuoteTerminalStatus(nextStatus);
  try { await Promise.all(linkedTasks.map((task) => {
    if (task.parentTaskId && ["done", "cancelled"].includes(s(task.status))) return Promise.resolve();
    if (task.parentTaskId) return statusChanged && terminal ? updateLiveTask(xrm, state, task.id, { status: "done" }) : Promise.resolve();
    return updateLiveTask(xrm, state, task.id, {
      suppressQuoteSync: true,
      quoteCommercialChange: JSON.stringify(existing.options || []) !== JSON.stringify(effectivePatch.options ?? existing.options ?? []) || existing.commercialTerms !== (effectivePatch.commercialTerms ?? existing.commercialTerms) || existing.value !== (effectivePatch.value ?? existing.value)
        ? { previous: { optionsVersion: existing.optionsVersion, value: existing.value, commercialTerms: existing.commercialTerms }, next: { optionsVersion: effectivePatch.optionsVersion ?? existing.optionsVersion, value: effectivePatch.value ?? existing.value, commercialTerms: effectivePatch.commercialTerms ?? existing.commercialTerms } } : undefined,
      value: (effectivePatch.value ?? existing.value) as string | undefined,
      commercialTerms: (effectivePatch.commercialTerms ?? existing.commercialTerms) as string | undefined,
      responseSent: nextStatus === "Respondida ao cliente" && Boolean(patch.responseSent ?? existing.responseSent),
      status: statusChanged ? taskStatusForQuoteStatus(nextStatus) : undefined,
      quoteStatus: statusChanged ? nextStatus : undefined,
      waitingContext: (patch.waitingContext as WaitingContextInput | undefined) ?? waitingContextForStatusChange(existing.status, nextStatus, { ...existing, ...effectivePatch }, lastProposalSentAt(existing)),
      title: isAutomaticQuoteTaskTitle(task, existing) ? quoteTaskTitle({ ...existing, ...effectivePatch }) : undefined,
      dueDate: patch.deadline as string | undefined,
      priority: patch.priority as string | undefined,
      assigneeIds: patch.assigneeIds as string[] | undefined,
      assigneeNames: patch.assigneeNames as string[] | undefined,
    });
  })); }
  catch (error) {
    if (QUOTE_COMPLETED_STATUSES.includes(nextStatus)) {
      try { await request(xrm, `/${entitySetName(QUOTE_TABLE)}(${quoteId})`, { method: "PATCH", body: JSON.stringify(quotePayload({ status: existing.status, responseSent: existing.responseSent, value: existing.value, commercialTerms: existing.commercialTerms, finalizationAt: existing.finalizationAt })) }); }
      catch (rollbackError) { console.warn("[Planner] falha ao restaurar cotação após erro na tarefa", rollbackError); }
    }
    throw error;
  }
  return loadLiveState(xrm);
}

async function findQuoteOptionRecord(xrm: PlannerXrm, quoteId: string, optionId: unknown, preferredRecordId: unknown = "") {
  const rows = await retrieveMany(xrm, QUOTE_OPTION_TABLE, `?$select=cr40f_cotacaoopcaoid,cr40f_conteudo&$filter=_cr40f_pedidocotacao_value eq ${cleanId(quoteId)} and statecode eq 0`);
  return rows.find((row) => cleanId(row.cr40f_cotacaoopcaoid) === cleanId(preferredRecordId)) || rows.find((row) => scenarioJson(row.cr40f_conteudo).id === optionId) || null;
}

export interface QuoteSendProposal {
  requestId?: string;
  expectedEtag?: string;
  options?: LiveQuoteOption[];
  draft?: QuotePatch;
  html?: string;
  text?: string;
  send?: QuoteSend;
}

async function markLiveQuoteSent(xrm: PlannerXrm, state: LiveState, id: string, proposal: QuoteSendProposal = {}) {
  const quote = (state.quotes || []).find((item) => cleanId(item.id) === cleanId(id));
  if (!quote || !QUOTE_COMPLETED_STATUSES.includes(quote.status as string)) throw new Error("Finalize a cotação antes de registrar o envio.");
  if (proposal.requestId && (quote.proposalVersions || []).some((version) => version.requestId === proposal.requestId)) return loadLiveState(xrm);
  if (!quote.etag || (proposal.expectedEtag && proposal.expectedEtag !== quote.etag)) throw new Error("A cotação foi alterada por outra pessoa. Recarregue antes de registrar o envio.");
  const requestId = proposal.requestId || scenarioId();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("Identificador do registro de envio inválido.");
  const options = proposal.options || normalizeQuoteOptions(quote);
  const prepared = prepareQuoteResponse({ ...quote, ...proposal.draft, options });
  if (!prepared.valid) throw new Error(prepared.error);
  // Primeiro salva a edição; a confirmação do envio é atômica e usa a nova ETag.
  const savedState = await updateLiveQuote(xrm, state, id, { ...proposal.draft, options, proposalOptions: prepared.options });
  const savedQuote = (savedState.quotes || []).find((item) => cleanId(item.id) === cleanId(id)) as LiveQuote;
  const sentOptions = prepared.options.map((option: QuoteOptionData) => {
    const saved = (savedQuote?.options || []).find((item) => item.id === option.id);
    if (!saved) throw new Error(`A opção “${option.name}” não foi persistida; a proposta continua sem registro de envio.`);
    return { ...option, recordId: saved.recordId };
  });
  const sentQuote = { ...savedQuote, options: savedQuote.options, proposalOptions: sentOptions };
  const user = xrm.Utility?.getGlobalContext?.().userSettings || {};
  // A versão guarda exatamente a prévia exibida (inclusive texto editado) e o
  // registro do envio: canal, destinatário e momento.
  const version = createQuoteProposalVersion(sentQuote, sentOptions, {
    html: proposal.html || buildQuoteEmailHtml(sentQuote, { baseUrl: xrm.Utility.getGlobalContext().getClientUrl?.() || "" }),
    text: proposal.text || buildQuotePlainText(sentQuote),
  }, { id: cleanId(user.userId), name: user.userName || user.fullName || "Usuário Dataverse" }, proposal.send, requestId);
  if (!savedQuote.etag) throw new Error("Recarregue a cotação antes de registrar o envio.");
  // V2: cotação nova não tem tarefa; só a legada recebe o contexto de espera e o evento.
  const task = (savedState.tasks || []).find((item) => cleanId(item.quoteId) === cleanId(id) && !item.parentTaskId);
  const versionNavigation = await resolveLookupNavigation(xrm, QUOTE_PROPOSAL_VERSION_TABLE, "cr40f_pedidocotacao", QUOTE_TABLE);
  const via = version.channel ? ` via ${version.channel} para ${version.recipient}` : "";
  const taskOperations = task ? [
    { method: "PATCH", path: `/${entitySetName(TASK_TABLE)}(${cleanId(task.id)})`, body: { cr40f_status: STATUS_VALUES.waiting, ...waitingContextPayload(clientDecisionWaitingContext(sentQuote, version.sentAt)) } },
    { method: "POST", path: `/${entitySetName(EVENT_TABLE)}`, body: {
      cr40f_tipo: 100000002, cr40f_descricao: `Proposta enviada por ${version.authorName}${via}. Tarefa aguardando a decisão do cliente.`,
      cr40f_campo: "quote:sent", cr40f_valoranterior: quote.status, cr40f_valornovo: JSON.stringify({ versionId: version.id, confirmedAt: version.createdAt, actorUserId: version.authorId, channel: version.channel, recipient: version.recipient, sentAt: version.sentAt }), cr40f_ocorridoem: version.createdAt,
      [`${await resolveLookupNavigation(xrm, EVENT_TABLE, "cr40f_tarefa", TASK_TABLE)}@odata.bind`]: `/${entitySetName(TASK_TABLE)}(${cleanId(task.id)})`,
    } },
  ] : [];
  const operations = [
    { method: "POST", path: `/${entitySetName(QUOTE_PROPOSAL_VERSION_TABLE)}`, body: {
      cr40f_cotacaopropostaversaoid: requestId, cr40f_nome: `${savedQuote.code || "Cotação"} · versão ${version.number}`.slice(0, 100),
      cr40f_conteudo: JSON.stringify(version), cr40f_autornome: version.authorName!.slice(0, 200), cr40f_autorid: version.authorId!.slice(0, 100),
      [`${versionNavigation}@odata.bind`]: `/${entitySetName(QUOTE_TABLE)}(${cleanId(id)})`,
    } },
    { method: "PATCH", path: `/${entitySetName(QUOTE_TABLE)}(${cleanId(id)})`, etag: savedQuote.etag, body: quotePayload({ responseSent: true, status: "Respondida ao cliente", value: sentOptions.length === 1 ? sentOptions[0].value : "", finalizationAt: "" }) },
    ...taskOperations,
  ];
  try {
    await commitQuoteSend(apiUrl(xrm), operations, requestId);
  } catch (error) {
    // A perda da resposta não autoriza repetir a mutação: consulta o ID estável.
    try {
      const persisted = await request(xrm, `/${entitySetName(QUOTE_PROPOSAL_VERSION_TABLE)}(${requestId})?$select=cr40f_conteudo`);
      if (scenarioJson((persisted as Row | null)?.cr40f_conteudo).requestId === requestId) return loadLiveState(xrm);
    } catch { /* Sem prova de confirmação: preservar formulário e falhar. */ }
    throw error;
  }
  return loadLiveState(xrm);
}

export interface QuoteAcceptance { acceptedProposalVersionId?: string; acceptedOptionId?: string }

async function setLiveQuoteOutcome(xrm: PlannerXrm, state: LiveState, id: string, outcome: string, reason: unknown = "", accepted: QuoteAcceptance = {}) {
  if (outcome === "Perdida" && !isLossReason(String(reason).trim())) throw new Error("Escolha o motivo da perda.");
  const quote = (state.quotes || []).find((item) => cleanId(item.id) === cleanId(id));
  const patch: QuotePatch = { status: outcome, lossReason: outcome === "Perdida" ? String(reason).trim() : "", finalizationAt: new Date().toISOString() };
  if (outcome === "Aceita pelo cliente") {
    const { option, version } = resolveQuoteAcceptance(quote, accepted);


    const optionRow = await findQuoteOptionRecord(xrm, id, option.id, option.recordId);
    if (version && !optionRow) throw new Error("A composição escolhida não está disponível no histórico da cotação.");
    Object.assign(patch, { acceptedOptionId: option.id, acceptedOptionRecordId: optionRow?.cr40f_cotacaoopcaoid || "", acceptedProposalVersionId: version?.id || "", value: option.value, commercialTerms: version?.commercialTerms ?? option.commercialTerms ?? quote?.commercialTerms ?? "" });
  }
  const next = await updateLiveQuote(xrm, state, id, patch);
  if (outcome !== "Perdida") return next;
  const task = (next.tasks || []).find((item) => cleanId(item.quoteId) === cleanId(id) && !item.parentTaskId);
  if (!task) return next;
  try {
    await createEvent(xrm, task.id, 100000001, `Motivo da perda: ${String(reason).trim()}`, "resultado-cotacao", "", String(reason).trim());
    return loadLiveState(xrm);
  } catch (error) {
    console.warn("[Planner] resultado salvo, mas histórico do motivo indisponível", error);
    return next;
  }
}

async function deleteLiveTask(xrm: PlannerXrm, state: LiveState, id: string) {
  const task = state.tasks.find((item) => item.id === id);
  const assigneeRelations = await retrieveMany(xrm, ASSIGNEE_RELATION_TABLE, `?$select=${ASSIGNEE_RELATION_TABLE}id&$filter=_cr40f_tarefa_value eq ${cleanId(id)}`);
  const teamRelations = await retrieveOptional(xrm, TASK_TEAM_RELATION_TABLE, `?$select=${TASK_TEAM_RELATION_TABLE}id&$filter=_cr40f_tarefa_value eq ${cleanId(id)}`, "relações de equipe da tarefa");
  await Promise.all(assigneeRelations.map((relation) => request(xrm, `/${entitySetName(ASSIGNEE_RELATION_TABLE)}(${cleanId(relation[`${ASSIGNEE_RELATION_TABLE}id`])})`, { method: "DELETE" })));
  await Promise.all(teamRelations.map((relation) => request(xrm, `/${entitySetName(TASK_TEAM_RELATION_TABLE)}(${cleanId(relation[`${TASK_TEAM_RELATION_TABLE}id`])})`, { method: "DELETE" })));
  if (task?.parentTaskId) {
    const relations = await retrieveMany(xrm, RELATION_TABLE, `?$select=${RELATION_TABLE}id&$filter=_cr40f_subtarefa_value eq ${cleanId(id)}`);
    await Promise.all(relations.map((relation) => request(xrm, `/${entitySetName(RELATION_TABLE)}(${cleanId(relation[`${RELATION_TABLE}id`])})`, { method: "DELETE" })));
  }
  await request(xrm, `/${entitySetName(TASK_TABLE)}(${cleanId(id)})`, { method: "DELETE" });
  return loadLiveState(xrm);
}

async function deleteLiveQuote(xrm: PlannerXrm, state: LiveState, id: string) {
  const quoteId = cleanId(id);
  if (!(state.quotes || []).some((quote) => cleanId(quote.id) === quoteId)) throw new Error("Cotação não encontrada.");
  const linked = await retrieveMany(xrm, TASK_TABLE, `?$select=cr40f_plannertarefaid&$filter=_cr40f_pedidocotacao_value eq ${quoteId}`);
  const [optionRows, proposalRows] = await Promise.all([
    retrieveMany(xrm, QUOTE_OPTION_TABLE, `?$select=cr40f_cotacaoopcaoid&$filter=_cr40f_pedidocotacao_value eq ${quoteId}`),
    retrieveMany(xrm, QUOTE_PROPOSAL_VERSION_TABLE, `?$select=cr40f_cotacaopropostaversaoid&$filter=_cr40f_pedidocotacao_value eq ${quoteId}`),
  ]);
  const deleted = new Set<string>();
  const deleteWithChildren = async (rawTaskId: unknown): Promise<void> => {
    const taskId = cleanId(rawTaskId);
    if (deleted.has(taskId)) return;
    const children = await retrieveMany(xrm, RELATION_TABLE, `?$select=_cr40f_subtarefa_value&$filter=_cr40f_tarefapai_value eq ${taskId}`);
    for (const child of children) if (child._cr40f_subtarefa_value) await deleteWithChildren(child._cr40f_subtarefa_value);
    const parentRelations = await retrieveMany(xrm, RELATION_TABLE, `?$select=${RELATION_TABLE}id&$filter=_cr40f_subtarefa_value eq ${taskId}`);
    for (const relation of parentRelations) await request(xrm, `/${entitySetName(RELATION_TABLE)}(${cleanId(relation[`${RELATION_TABLE}id`])})`, { method: "DELETE" });
    await deleteLiveTask(xrm, state, taskId);
    deleted.add(taskId);
  };
  for (const task of linked) await deleteWithChildren(task.cr40f_plannertarefaid);
  await request(xrm, `/${entitySetName(QUOTE_TABLE)}(${quoteId})`, { method: "DELETE" });
  await deleteScenarioRows(xrm, optionRows);
  await Promise.all(proposalRows.map((row) => request(xrm, `/${entitySetName(QUOTE_PROPOSAL_VERSION_TABLE)}(${cleanId(row.cr40f_cotacaopropostaversaoid)})`, { method: "DELETE" })));
  return loadLiveState(xrm);
}

async function adminCleanupLive(xrm: PlannerXrm, state: LiveState, action: string | AdminCleanupRequest): Promise<LiveState> {
  const adminRequest: AdminCleanupRequest = typeof action === "string" ? { action } : action;
  const actionId = adminRequest?.action;
  if (actionId === "completed_tasks" || actionId === "all_tasks") {
    const tasks = actionId === "completed_tasks" ? (state.tasks || []).filter((task) => task.status === "done") : (state.tasks || []);
    let nextState = state;
    for (const task of tasks) nextState = await deleteLiveTask(xrm, nextState, task.id);
    return nextState;
  }
  if (actionId === "all_tags") {
    for (const tag of state.personalTags || []) {
      const relations = await retrieveMany(xrm, PERSONAL_TAG_TASK_TABLE, `?$select=${PERSONAL_TAG_TASK_TABLE}id&$filter=_cr40f_tag_value eq ${cleanId(tag.id)}`);
      await Promise.all(relations.map((relation) => request(xrm, `/${entitySetName(PERSONAL_TAG_TASK_TABLE)}(${cleanId(relation[`${PERSONAL_TAG_TASK_TABLE}id`])})`, { method: "DELETE" })));
      await request(xrm, `/${entitySetName(PERSONAL_TAG_TABLE)}(${cleanId(tag.id)})`, { method: "DELETE" });
    }
    return { ...state, personalTags: [], tasks: (state.tasks || []).map((task) => ({ ...task, personalTagIds: [] })) };
  }
  if (actionId === "notifications") {
    await Promise.all((state.notifications || []).map((notification) => request(xrm, `/${entitySetName(NOTIFICATION_TABLE)}(${cleanId(notification.id)})`, { method: "DELETE" })));
    return { ...state, notifications: [] };
  }
  const scopedTasks = () => (state.tasks || []).filter((task) => (task.assigneeIds || []).includes(s(adminRequest.employeeId)) && (!adminRequest.status || task.status === adminRequest.status) && (!adminRequest.teamId || (task.teamIds || []).includes(adminRequest.teamId) || task.teamId === adminRequest.teamId));
  if (actionId === "user_tasks") {
    let nextState = state;
    for (const task of scopedTasks()) nextState = await deleteLiveTask(xrm, nextState, task.id);
    return nextState;
  }
  if (actionId === "remove_user_assignments") {
    let nextState = state;
    for (const task of scopedTasks()) {
      const assigneeIds = (task.assigneeIds || []).filter((id) => id !== adminRequest.employeeId);
      const assigneeNames = assigneeIds.map((id) => (state.employees || []).find((employee) => employee.id === id)?.name).filter((name): name is string => Boolean(name));
      nextState = await updateLiveTask(xrm, nextState, task.id, { assigneeIds, assigneeNames });
    }
    return nextState;
  }
  if (actionId === "user_notifications") {
    const rows = await retrieveMany(xrm, NOTIFICATION_TABLE, `?$select=cr40f_plannernotificacaoid&$filter=_cr40f_destinatario_value eq ${cleanId(adminRequest.employeeId)}`);
    await Promise.all(rows.map((row) => request(xrm, `/${entitySetName(NOTIFICATION_TABLE)}(${cleanId(row.cr40f_plannernotificacaoid)})`, { method: "DELETE" })));
    return { ...state, notifications: (state.notifications || []).filter((item) => item.recipientEmployeeId !== adminRequest.employeeId) };
  }
  if (actionId === "user_tags") {
    if (!adminRequest.userId) throw new Error("O funcionário selecionado não possui usuário Dataverse vinculado.");
    const tags = await retrieveMany(xrm, PERSONAL_TAG_TABLE, `?$select=cr40f_plannertagpessoalid&$filter=_cr40f_usuario_value eq ${cleanId(adminRequest.userId)}`);
    for (const tag of tags) {
      const id = tag.cr40f_plannertagpessoalid;
      const relations = await retrieveMany(xrm, PERSONAL_TAG_TASK_TABLE, `?$select=${PERSONAL_TAG_TASK_TABLE}id&$filter=_cr40f_tag_value eq ${cleanId(id)}`);
      await Promise.all(relations.map((relation) => request(xrm, `/${entitySetName(PERSONAL_TAG_TASK_TABLE)}(${cleanId(relation[`${PERSONAL_TAG_TASK_TABLE}id`])})`, { method: "DELETE" })));
      await request(xrm, `/${entitySetName(PERSONAL_TAG_TABLE)}(${cleanId(id)})`, { method: "DELETE" });
    }
    return loadLiveState(xrm);
  }
  if (actionId === "user_contacts" || actionId === "all_contacts") {
    requireContactSchema();
    throw new Error("A tabela live de Contatos ainda não está provisionada neste Planner.");
  }
  if (actionId === "all_teams") {
    let nextState = state;
    for (const team of state.teams || []) nextState = await deleteLiveTeam(xrm, nextState, team.id);
    return nextState;
  }
  if (actionId === "task_activity") {
    const events = await retrieveMany(xrm, EVENT_TABLE, "?$select=cr40f_plannertarefaeventoid,cr40f_campo&$filter=statecode eq 0");
    await Promise.all(events.filter((event) => event.cr40f_campo !== "anexo").map((event) => request(xrm, `/${entitySetName(EVENT_TABLE)}(${cleanId(event.cr40f_plannertarefaeventoid)})`, { method: "DELETE" })));
    return loadLiveState(xrm);
  }
  if (actionId === "task_attachments") {
    const events = await retrieveMany(xrm, EVENT_TABLE, "?$select=cr40f_plannertarefaeventoid,_cr40f_tarefa_value,cr40f_campo,cr40f_valornovo&$filter=cr40f_campo eq 'anexo' and statecode eq 0");
    for (const event of events) {
      let attachment: Record<string, unknown> = {};
      try { attachment = asRecord(JSON.parse(s(event.cr40f_valornovo) || "{}")); } catch { attachment = {}; }
      await deleteLiveAttachment(xrm, state, s(event._cr40f_tarefa_value), { ...attachment, eventId: s(event.cr40f_plannertarefaeventoid) });
    }
    return loadLiveState(xrm);
  }
  if (actionId === "task_assignments") {
    let nextState = state;
    for (const task of state.tasks || []) nextState = await updateLiveTask(xrm, nextState, task.id, { assignmentMode: "people", assigneeIds: [], assigneeNames: [], teamIds: [], teamNames: [] });
    return nextState;
  }
  if (actionId === "task_due_dates") {
    let nextState = state;
    for (const task of (state.tasks || []).filter((item) => item.dueDate)) nextState = await updateLiveTask(xrm, nextState, task.id, { dueDate: "", waitingContext: { ...normalizeWaitingContext(task.waitingContext), dueDate: "" } as WaitingContextInput });
    return nextState;
  }
  if (actionId === "all_planner_data") {
    let nextState = state;
    for (const step of ["task_attachments", "notifications", "all_tags", "all_tasks", "all_teams"]) nextState = await adminCleanupLive(xrm, nextState, step);
    return nextState;
  }
  throw new Error("Ação administrativa inválida.");
}

async function importLivePlannerTasks(xrm: PlannerXrm, state: LiveState, rows: PlannerImportRow[] = []) {
  const apiRows = Array.isArray(rows) ? rows : [];
  const taskAssigneeNavigation = await resolveLookupNavigation(xrm, TASK_TABLE, EMPLOYEE_ASSIGNEE_FIELD, EMPLOYEE_TABLE);
  const relationTaskNavigation = await resolveLookupNavigation(xrm, ASSIGNEE_RELATION_TABLE, "cr40f_tarefa", TASK_TABLE);
  const relationEmployeeNavigation = await resolveLookupNavigation(xrm, ASSIGNEE_RELATION_TABLE, "cr40f_funcionario", EMPLOYEE_TABLE);
  const eventTaskNavigation = await resolveLookupNavigation(xrm, EVENT_TABLE, "cr40f_tarefa", TASK_TABLE);
  const results: PlannerImportResult[] = [];
  let workingState = state;
  const ownerUserId = workingState.currentUserId || "";
  const importedNames = [...new Map(apiRows.flatMap((row) => row.tags || []).map((name): [string, string] => [normalizeText(name), String(name || "").trim().slice(0, 32)]).filter(([key, name]) => key && name)).values()];
  for (const [index, name] of importedNames.entries()) {
    const existing = (workingState.personalTags || []).find((tag) => normalizeText(tag.name) === normalizeText(name));
    if (existing) {
      if (existing.archived) workingState = await updateLivePersonalTag(xrm, workingState, existing.id, { archived: false });
      continue;
    }
    workingState = await createLivePersonalTag(xrm, workingState, { name, color: PERSONAL_TAG_COLORS[index % PERSONAL_TAG_COLORS.length], ownerUserId });
  }
  const tagIdsByName = new Map((workingState.personalTags || []).map((tag) => [normalizeText(tag.name), tag.id]));

  for (const row of apiRows) {
    const sourceCode = row.sourceCode || `MSPLANNER:${String(row.plannerTaskId)}`;
    try {
      const escapedSourceCode = String(sourceCode).replace(/'/g, "''");
      const existing = await retrieveMany(xrm, TASK_TABLE, `?$select=cr40f_plannertarefaid&$filter=cr40f_codigoorigem eq '${escapedSourceCode}'&$top=1`);
      if (existing[0]?.cr40f_plannertarefaid) {
        results.push({ plannerTaskId: row.plannerTaskId, result: "already_exists", dataverseTaskId: existing[0].cr40f_plannertarefaid });
        continue;
      }
      const payload: Payload = {
        cr40f_titulo: String(row.title || "Sem título").trim(),
        cr40f_descricao: row.description || "",
        cr40f_checklistjson: JSON.stringify(row.checklist || []),
        cr40f_status: row.statusChoice,
        cr40f_prioridade: row.priorityChoice,
        cr40f_prazo: row.dueDate || null,
        cr40f_origem: 100000000,
        cr40f_codigoorigem: sourceCode,
      };
      const firstEmployeeId = row.assignments?.find((assignment) => assignment.employeeId)?.employeeId || "";
      if (firstEmployeeId) payload[`${taskAssigneeNavigation}@odata.bind`] = `/cr40f_funcionarioses(${cleanId(firstEmployeeId)})`;
      const created = asRecord(await request(xrm, `/${entitySetName(TASK_TABLE)}`, { method: "POST", body: JSON.stringify(payload) }));
      const taskId = s(created?.cr40f_plannertarefaid);
      if (!taskId) throw new Error("Dataverse criou a tarefa sem retornar o ID.");

      const tagIds = (row.tags || []).map((name) => tagIdsByName.get(normalizeText(name))).filter((tagId): tagId is string => Boolean(tagId));
      if (tagIds.length) workingState = await replaceLiveTaskPersonalTags(xrm, workingState, taskId, tagIds, ownerUserId);

      for (const assignment of (row.assignments || []).filter((item) => item.employeeId)) {
        const relationPayload = {
          cr40f_name: `${taskId}-${String(assignment.employeeId)}`,
          [`${relationTaskNavigation}@odata.bind`]: `/${entitySetName(TASK_TABLE)}(${cleanId(taskId)})`,
          [`${relationEmployeeNavigation}@odata.bind`]: `/${entitySetName(EMPLOYEE_TABLE)}(${cleanId(assignment.employeeId)})`,
        };
        await request(xrm, `/${entitySetName(ASSIGNEE_RELATION_TABLE)}`, { method: "POST", body: JSON.stringify(relationPayload) });
      }
      const eventPayload = {
        cr40f_tipo: 100000000,
        cr40f_descricao: "Tarefa importada do Microsoft Planner.",
        cr40f_ocorridoem: new Date().toISOString(),
        [`${eventTaskNavigation}@odata.bind`]: `/${entitySetName(TASK_TABLE)}(${cleanId(taskId)})`,
      };
      await request(xrm, `/${entitySetName(EVENT_TABLE)}`, { method: "POST", body: JSON.stringify(eventPayload) });
      results.push({ plannerTaskId: row.plannerTaskId, result: "created", dataverseTaskId: taskId });
    } catch (error) {
      results.push({ plannerTaskId: row.plannerTaskId, result: "error", error: errorMessage(error) || "Falha desconhecida." });
    }
  }

  const nextState = await loadLiveState(xrm);
  return {
    nextState,
    results,
    createdCount: results.filter((item) => item.result === "created").length,
    existingCount: results.filter((item) => item.result === "already_exists").length,
    errorCount: results.filter((item) => item.result === "error").length,
    errors: results.filter((item) => item.result === "error"),
  };
}

export interface OpenSourceInput { source?: string; sourceRecordId?: string }
export interface QualityTaskInput { id: string; type?: string; code?: string; title?: string; description?: string; dueDate?: string }
export interface ImportOutcome { nextState: LiveState; results: unknown[]; [extra: string]: unknown }

/** Contrato comum dos adapters live (Dataverse) e mock (localStorage). */
export interface PlannerDataStore {
  live: boolean;
  load: () => Promise<LiveState>;
  loadCore: () => Promise<LiveState>;
  loadContacts: (state?: LiveState) => Promise<unknown[]>;
  loadSupplemental: (state: LiveState) => Promise<Partial<LiveState>>;
  loadNotifications: (employeeId: string) => Promise<PlannerNotification[]>;
  collectTask: (state: LiveState, id: string, input?: CollectTaskInput) => Promise<LiveState>;
  sendNotificationTest: (state: LiveState, input?: { taskId?: string; message?: string }) => Promise<{ state: LiveState; emailDispatch: EmailDispatchFeedback }>;
  markNotificationRead: (state: LiveState, notificationId: string) => Promise<LiveState>;
  markAllNotificationsRead: (state: LiveState, employeeId: string) => Promise<LiveState>;
  loadTaskDetails: (taskId: string) => Promise<{ taskId: string; [extra: string]: unknown }>;
  loadAttachmentContent: (attachment: LiveAttachment) => Promise<LiveAttachment>;
  loadPhotos: () => Promise<{ loading: { photos: boolean } }>;
  searchQuotes: (query: unknown) => Promise<LiveQuote[]>;
  loadIdeas: () => Promise<LiveIdea[]>;
  createIdea: (state: unknown, input: IdeaInput) => Promise<LiveIdea>;
  updateIdea: (state: unknown, id: string, input: IdeaInput | number) => Promise<void>;
  archiveIdea: (state: unknown, id: string) => Promise<void>;
  createTeam: (state: LiveState, input: TeamInput) => Promise<LiveState>;
  updateTeam: (state: LiveState, id: string, patch: TeamInput) => Promise<LiveState>;
  deleteTeam: (state: LiveState, id: string) => Promise<LiveState>;
  loadPersonalTags: (state: LiveState, ownerUserId?: string) => Promise<PersonalTag[]>;
  createPersonalTag: (state: LiveState, input: { name?: unknown; color?: unknown; ownerUserId?: unknown }) => Promise<LiveState>;
  updatePersonalTag: (state: LiveState, id: string, patch: PersonalTagPatch) => Promise<LiveState>;
  archivePersonalTag: (state: LiveState, id: string) => Promise<LiveState>;
  adminCleanup: (state: LiveState, action: string | AdminCleanupRequest) => Promise<LiveState>;
  reorderPersonalTags: (state: LiveState, orderedIds: string[]) => Promise<LiveState>;
  replaceTaskPersonalTags: (state: LiveState, taskId: string, tagIds: string[], ownerUserId?: string) => Promise<LiveState>;
  createTask: (state: LiveState, input: TaskChange) => Promise<LiveState>;
  importPlannerTasks: (state: LiveState, rows?: PlannerImportRow[]) => Promise<ImportOutcome>;
  createContact: (state: LiveState, input: Record<string, unknown>) => Promise<LiveState | null>;
  createContactFromWhatsAppIntake: (state: LiveState, input: Record<string, unknown>) => Promise<{ state: LiveState; [extra: string]: unknown }>;
  updateContact: (state: LiveState, id: string, patch: Record<string, unknown>) => Promise<LiveState | null>;
  archiveContact: (state: LiveState, id: string, context?: Record<string, unknown>) => Promise<LiveState | null>;
  addContactNote: (state: LiveState, id: string, input: Record<string, unknown>, context?: Record<string, unknown>) => Promise<LiveState | null>;
  addContactAttachment: (state: LiveState, id: string, file: UploadFile | null | undefined, previewUrl?: string) => Promise<LiveState | null>;
  deleteContactAttachment: (state: LiveState, id: string, attachment: { id?: string } | null | undefined) => Promise<LiveState | null>;
  loadRelatedTasks: (state: LiveState, contactId: string) => Promise<LiveTask[]>;
  createSubtask: (state: LiveState, parentId: string, input: TaskChange) => Promise<LiveState>;
  createQualityTask: (state: LiveState, item: QualityTaskInput) => Promise<LiveState>;
  updateTask: (state: LiveState, id: string, patch: TaskChange) => Promise<LiveState>;
  resolveWaitingReturn: (state: LiveState, id: string, input: WaitingReturnInput) => Promise<LiveState>;
  deleteTask: (state: LiveState, id: string) => Promise<LiveState>;
  deleteQuote: (state: LiveState, id: string) => Promise<LiveState>;
  addComment: (state: LiveState, id: string, text: string, context?: CommentContext) => Promise<LiveState>;
  addAttachment: (state: LiveState, id: string, file: UploadFile | null | undefined, previewUrl?: string) => Promise<LiveState>;
  deleteAttachment: (state: LiveState, taskId: string, attachment: LiveAttachment) => Promise<LiveState>;
  /** V2.1: anexos da própria cotação no SharePoint (fora do estado global). */
  loadQuoteAttachments: (quoteId: string) => Promise<LiveAttachment[]>;
  addQuoteAttachment: (quoteId: string, file: UploadFile, existing: LiveAttachment[], previewUrl?: string) => Promise<LiveAttachment>;
  deleteQuoteAttachment: (quoteId: string, attachment: LiveAttachment) => Promise<void>;
  ensureQuoteTask: (state: LiveState, quote: LiveQuote) => Promise<LiveState>;
  createQuote: (state: LiveState, input: QuotePatch) => Promise<LiveState>;
  updateQuote: (state: LiveState, id: string, patch: QuotePatch) => Promise<LiveState>;
  markQuoteSent: (state: LiveState, id: string, proposal?: QuoteSendProposal) => Promise<LiveState>;
  setQuoteOutcome: (state: LiveState, id: string, outcome: string, reason?: unknown, accepted?: QuoteAcceptance) => Promise<LiveState>;
  save: (state: LiveState) => Promise<LiveState>;
  reset: () => Promise<LiveState>;
  openSource: (input: OpenSourceInput) => unknown;
}

// O estado é o mesmo objeto nos dois adapters; o mock tipa os seus campos como MockState.
// A ponte abaixo é só de tipo (sem conversão em tempo de execução).
const asMock = (state: LiveState): MockState => state as unknown as MockState;
// Entradas da UI seguem o contrato do adapter live; o mock tem tipos próprios equivalentes.
const bridge = <T,>(value: unknown): T => value as T;

function createMockDataStore(): PlannerDataStore {
  const withMode = (state: MockState): LiveState => ({ ...state, live: false } as unknown as LiveState);
  const withoutMode = ({ live: _live, ...state }: LiveState): MockState => asMock(asMock(state) as LiveState);
  const persist = (state: LiveState) => withMode(saveMockState(withoutMode(state)));
  const mockIdeas: LiveIdea[] = [];
  const mockQuoteAttachments = new Map<string, LiveAttachment[]>();

  return {
    live: false,
    load: async () => withMode(loadMockState()),
    loadCore: async () => ({ ...withMode(loadMockState()), loading: { core: false, quotes: false, quality: false, photos: false } }),
    loadContacts: async (state) => (state?.contacts || loadMockState().contacts || []).map((item) => normalizeContact(item)),
    loadSupplemental: async (state) => ({ ...state, loading: { ...(state.loading || {}), quotes: false, quality: false } }),
    loadNotifications: async (employeeId) => (withDailyNotifications(loadMockState()).notifications || []).filter((item) => !employeeId || item.recipientEmployeeId === employeeId),
    markNotificationRead: async (state, notificationId) => withMode(markMockNotificationRead(asMock(state), notificationId)),
    markAllNotificationsRead: async (state, employeeId) => withMode(markAllMockNotificationsRead(asMock(state), employeeId)),
    loadTaskDetails: async (taskId) => ({ taskId, detailsLoaded: true }),
    loadAttachmentContent: async () => { throw new Error("Prévia de anexo disponível somente no ambiente conectado."); },
    loadPhotos: async () => ({ loading: { photos: false } }),
    searchQuotes: async () => [],
    loadIdeas: async () => [...mockIdeas],
    createIdea: async (_state, input) => {
      const idea: LiveIdea = { id: `mock-${Date.now()}-${mockIdeas.length}`, title: s(input.title), details: s(input.details), status: 100000000, createdAt: new Date().toISOString(), author: "Você · modo local" };
      mockIdeas.unshift(idea);
      return idea;
    },
    updateIdea: async (_state, id, input) => {
      const idea = mockIdeas.find((item) => item.id === id);
      if (!idea) throw new Error("Ideia não encontrada.");
      const body = ideaPatchBody(input);
      if (body.cr40f_status !== undefined) idea.status = body.cr40f_status;
      if (body.cr40f_name !== undefined) idea.title = body.cr40f_name;
      if (body.cr40f_detalhes !== undefined) idea.details = body.cr40f_detalhes;
    },
    archiveIdea: async (_state, id) => {
      const index = mockIdeas.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("Ideia não encontrada.");
      mockIdeas.splice(index, 1);
    },
    createTeam: async (state, input) => withMode(createMockTeam(asMock(state), bridge(input))),
    updateTeam: async (state, id, patch) => withMode(updateMockTeam(asMock(state), id, bridge(patch))),
    deleteTeam: async (state, id) => withMode(deleteMockTeam(asMock(state), id)),
    loadPersonalTags: async (state, ownerUserId) => loadMockPersonalTags(asMock(state), ownerUserId),
    createPersonalTag: async (state, input) => withMode(createMockPersonalTag(asMock(state), bridge(input))),
    updatePersonalTag: async (state, id, patch) => withMode(updateMockPersonalTag(asMock(state), id, bridge(patch))),
    archivePersonalTag: async (state, id) => withMode(archiveMockPersonalTag(asMock(state), id)),
    adminCleanup: async (state, action) => withMode(adminCleanupMock(asMock(state), bridge(action))),
    reorderPersonalTags: async (state, orderedIds) => withMode(reorderMockPersonalTags(asMock(state), orderedIds)),
    replaceTaskPersonalTags: async (state, taskId, tagIds, ownerUserId) => withMode(replaceMockTaskPersonalTags(asMock(state), taskId, tagIds, ownerUserId)),
    createTask: async (state, input) => withMode(createMockTask(asMock(state), bridge(input))),
    importPlannerTasks: async (state, rows = []) => {
      const result = importMockPlannerTasks(asMock(state), bridge(rows));
      return { ...result, nextState: withMode(result.nextState) };
    },
    createContact: async (state, input) => withMode(createMockContact(asMock(state), input)),
    createContactFromWhatsAppIntake: async (state, input) => {
      const result = createMockContactFromWhatsAppIntake(asMock(state), input);
      return { ...result, state: withMode(result.state) };
    },
    updateContact: async (state, id, patch) => withMode(updateMockContact(asMock(state), id, patch)),
    archiveContact: async (state, id, context) => withMode(archiveMockContact(asMock(state), id, context)),
    addContactNote: async (state, id, input, context) => withMode(addMockContactNote(asMock(state), id, input, context)),
    addContactAttachment: async (state, id, file, previewUrl = "") => withMode(addMockContactAttachment(asMock(state), id, { name: file?.name || "Arquivo", mimeType: file?.type || "", size: file?.size || 0, previewUrl })),
    deleteContactAttachment: async (state, id, attachment) => withMode(deleteMockContactAttachment(asMock(state), id, bridge(attachment?.id))),
    loadRelatedTasks: async (state, contactId) => (state?.tasks || []).filter((task) => task.contactId === contactId || ((state.contacts || []).find((contact) => contact.id === contactId)?.linkedTaskIds as string[] | undefined)?.includes(task.id)),
    createSubtask: async (state, parentId, input) => withMode(createMockTask(asMock(state), bridge({ ...input, parentTaskId: parentId }))),
    createQualityTask: async (state, item) => withMode(createMockTask(asMock(state), bridge({ title: item.title, description: item.description, dueDate: item.dueDate, sourceType: "quality", sourceId: item.id, sourceCode: item.code, sourceLabel: item.type === "error" ? "Erro operacional" : "Ação operacional" }))),
    updateTask: async (state, id, patch) => withMode(updateMockTask(asMock(state), id, bridge(patch))),
    resolveWaitingReturn: async (state, id, input) => withMode(resolveMockWaitingReturn(asMock(state), id, bridge(input))),
    collectTask: async (state, id, input) => withMode(collectMockTask(asMock(state), id, input)),
    sendNotificationTest: async () => { throw new Error("O envio de teste exige o ambiente Dataverse conectado."); },
    deleteTask: async (state, id) => withMode(deleteMockTask(asMock(state), id)),
    deleteQuote: async (state, id) => withMode(deleteMockQuote(asMock(state), id)),
    addComment: async (state, id, text, context) => withMode(addMockComment(asMock(state), id, text, context)),
    addAttachment: async (state, id, file, previewUrl = "") => withMode(addMockAttachment(asMock(state), id, { name: file?.name || "Arquivo", mimeType: file?.type || "", size: file?.size || 0, previewUrl })),
    deleteAttachment: async (state, taskId, attachment) => withMode(deleteMockAttachment(asMock(state), taskId, bridge(attachment?.id))),
    loadQuoteAttachments: async (quoteId) => [...(mockQuoteAttachments.get(quoteId) || [])],
    addQuoteAttachment: async (quoteId, file, existing, previewUrl = "") => {
      const attachment: LiveAttachment = { id: `mock-quote-file-${Date.now()}-${existing.length}`, name: quoteAttachmentName(file, existing), mimeType: file.type || "", size: file.size || 0, previewUrl, createdAt: new Date().toISOString() };
      mockQuoteAttachments.set(quoteId, [...(mockQuoteAttachments.get(quoteId) || []), attachment]);
      return attachment;
    },
    deleteQuoteAttachment: async (quoteId, attachment) => { mockQuoteAttachments.set(quoteId, (mockQuoteAttachments.get(quoteId) || []).filter((item) => item.id !== attachment.id)); },
    ensureQuoteTask: async (state, quote) => withMode(ensureMockQuoteTask(asMock(state), quote)),
    createQuote: async (state, input) => withMode(createMockQuote(asMock(state), input)),
    updateQuote: async (state, id, patch) => withMode(updateMockQuote(asMock(state), id, patch)),
    markQuoteSent: async (state, id, proposal) => withMode(markMockQuoteSent(asMock(state), id, proposal)),
    setQuoteOutcome: async (state, id, outcome, reason, accepted) => withMode(setMockQuoteOutcome(asMock(state), id, outcome, bridge(reason), accepted)),
    save: async (state) => persist(state),
    reset: async () => withMode(resetMockState()),
    openSource: () => undefined,
  };
}

declare global {
  // Leitor de anexos exposto para a prévia (mesmo contrato do Tela Planner).
  var __plannerAttachmentLoader: PlannerDataStore["loadAttachmentContent"] | undefined;
}

function registerAttachmentLoader(store: PlannerDataStore) {
  if (typeof globalThis !== "undefined") globalThis.__plannerAttachmentLoader = store.loadAttachmentContent;
  return store;
}

export function createDataStore(): PlannerDataStore {
  const xrm = getXrm();
  if (!xrm) return registerAttachmentLoader(createMockDataStore());
  const quoteAttachments = createQuoteAttachmentStore(xrm);
  return registerAttachmentLoader({
    live: true,
    load: () => loadLiveState(xrm),
    loadCore: () => loadCoreState(xrm),
    loadContacts: async () => { requireContactSchema(); return []; },
    loadSupplemental: (state) => loadSupplementalState(xrm, state),
    loadNotifications: (employeeId) => loadLiveNotifications(xrm, employeeId),
    collectTask: (state, id, input) => collectLiveTask(xrm, state, id, input),
    sendNotificationTest: (state, input) => sendLiveNotificationTest(xrm, state, input),
    markNotificationRead: async (state, notificationId) => { const readAt = await markLiveNotificationRead(xrm, notificationId); return { ...state, notifications: (state.notifications || []).map((item) => item.id === notificationId ? { ...item, readAt } : item) }; },
    markAllNotificationsRead: async (state, employeeId) => {
      const unread = (state.notifications || []).filter((item) => item.recipientEmployeeId === employeeId && !item.readAt);
      await Promise.all(unread.map((item) => markLiveNotificationRead(xrm, item.id)));
      const readAt = new Date().toISOString();
      return { ...state, notifications: (state.notifications || []).map((item) => item.recipientEmployeeId === employeeId ? { ...item, readAt: item.readAt || readAt } : item) };
    },
    loadTaskDetails: (taskId) => loadTaskDetails(xrm, taskId),
    loadAttachmentContent: (attachment) => loadLiveAttachmentContent(xrm, attachment),
    loadPhotos: async () => ({ loading: { photos: false } }),
    searchQuotes: (query) => searchQuotes(xrm, query),
    loadIdeas: () => loadLiveIdeas(xrm),
    createIdea: (_state, input) => createLiveIdea(xrm, input),
    updateIdea: (_state, id, input) => updateLiveIdea(xrm, id, input),
    archiveIdea: (_state, id) => archiveLiveIdea(xrm, id),
    createTeam: (state, input) => createLiveTeam(xrm, state, input),
    updateTeam: (state, id, patch) => updateLiveTeam(xrm, state, id, patch),
    deleteTeam: (state, id) => deleteLiveTeam(xrm, state, id),
    loadPersonalTags: async (state) => state.personalTags || [],
    createPersonalTag: (state, input) => createLivePersonalTag(xrm, state, input),
    updatePersonalTag: (state, id, patch) => updateLivePersonalTag(xrm, state, id, patch),
    archivePersonalTag: (state, id) => updateLivePersonalTag(xrm, state, id, { archived: true }),
    adminCleanup: (state, action) => adminCleanupLive(xrm, state, action),
    reorderPersonalTags: (state, orderedIds) => reorderLivePersonalTags(xrm, state, orderedIds),
    replaceTaskPersonalTags: (state, taskId, tagIds, ownerUserId) => replaceLiveTaskPersonalTags(xrm, state, taskId, tagIds, ownerUserId),
    createTask: (state, input) => createLiveTask(xrm, state, input),
    importPlannerTasks: (state, rows) => importLivePlannerTasks(xrm, state, rows),
    createContact: async () => { requireContactSchema(); return null; },
    createContactFromWhatsAppIntake: async () => {
      requireContactSchema();
      throw new Error("Intake do WhatsApp no adapter live ainda exige o mapeamento dos campos de Contatos, eventos, lookup da Task e chave externa.");
    },
    updateContact: async () => { requireContactSchema(); return null; },
    archiveContact: async () => { requireContactSchema(); return null; },
    addContactNote: async () => { requireContactSchema(); return null; },
    addContactAttachment: async () => { requireContactSchema(); return null; },
    deleteContactAttachment: async () => { requireContactSchema(); return null; },
    loadRelatedTasks: async () => { requireContactSchema(); return []; },
    createSubtask: (state, parentId, input) => createLiveSubtask(xrm, state, parentId, input),
    createQualityTask: (state, item) => createLiveTask(xrm, state, { title: item.title, description: item.description, dueDate: item.dueDate, sourceType: "quality", sourceCode: item.code, qualityType: item.type, qualityId: item.id }),
    updateTask: (state, id, patch) => updateLiveTask(xrm, state, id, patch),
    resolveWaitingReturn: (state, id, input) => resolveLiveWaitingReturn(xrm, state, id, input),
    deleteTask: (state, id) => deleteLiveTask(xrm, state, id),
    deleteQuote: (state, id) => deleteLiveQuote(xrm, state, id),
    addComment: (_state, id, text, context) => addLiveComment(xrm, id, text, context),
    addAttachment: (state, id, file) => addLiveAttachment(xrm, state, id, file),
    loadQuoteAttachments: (quoteId) => quoteAttachments.load(quoteId),
    addQuoteAttachment: (quoteId, file, existing) => quoteAttachments.add(quoteId, file, existing),
    deleteQuoteAttachment: (quoteId, attachment) => quoteAttachments.remove(quoteId, attachment),
    deleteAttachment: (state, taskId, attachment) => deleteLiveAttachment(xrm, state, taskId, attachment),
    ensureQuoteTask: (state, quote) => ensureLiveQuoteTask(xrm, state, quote),
    createQuote: (state, input) => createLiveQuote(xrm, state, input),
    updateQuote: (state, id, patch) => updateLiveQuote(xrm, state, id, patch),
    markQuoteSent: (state, id, proposal) => markLiveQuoteSent(xrm, state, id, proposal),
    setQuoteOutcome: (state, id, outcome, reason, accepted) => setLiveQuoteOutcome(xrm, state, id, outcome, reason, accepted),
    save: () => loadLiveState(xrm),
    reset: () => loadLiveState(xrm),
    openSource: ({ source, sourceRecordId }) => {
      // Cotações abrem no próprio Planner; a Tela Pedir Cotação foi aposentada.
      const resource = source === "quality_error" || source === "quality_action" ? "new_gestao_erros_operacionais.html" : "new_TelaPlanner.html";
      const params = source === "quality_error" ? `errorId=${cleanId(sourceRecordId)}` : source === "quality_action" ? `actionId=${cleanId(sourceRecordId)}` : source === "quote_followup" ? `view=quotes&quoteId=${cleanId(sourceRecordId)}` : `taskId=${cleanId(sourceRecordId)}`;
      return xrm.Navigation?.openWebResource?.(resource, { data: params });
    },
  });
}
