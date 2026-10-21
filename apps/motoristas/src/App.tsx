import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  findFirstPendingServiceDetail,
  getInitialChecklistId,
  getInitialComunicadoId,
  getInitialDetail,
  getInitialParams,
  getVoucherDraftKey,
  initialStore,
  isSameDetail,
  loadStore,
  STORAGE_KEY
} from "./app/bootstrap";
import { useHardwareBackGuard } from "./app/backGuard";
import { BuildStamp } from "./components/layout/BuildStamp";
import {
  getServiceTaskBackScreen,
  hasUploadedReceiveProofs,
  isReceiveStepPending,
  shouldRouteServiceToVoucher
} from "./app/detailFlow";
import {
  AUTO_REFRESH_INTERVAL_MS,
  buildHashRoute,
  getHashRouteFallbackScreen,
  getHashRouteRestoreScreen,
  getScreenMotion,
  isHashRoutingEnabled,
  parseHashRoute,
  screenNeedsHashDetail,
  shouldAutoRefreshScreen,
  type HashRoute
} from "./app/navigation";
import {
  cancelServiceRemote,
  assertCollisionSchemaReadyRemote,
  assertExpenseSchemaReadyRemote,
  createIdeaRemote,
  createMaintenanceRequestRemote,
  createOne,
  DATAVERSE,
  finalizeExchangeRemote,
  finalizeMaintenanceRemote,
  finalizeServiceRemote,
  getDriverContext,
  getDriverCurrentVehicleId,
  hasDataverseRuntime,
  loadCollisionLookupNavigationNamesRemote,
  loadExpenseReferenceDataRemote,
  loadMyIdeasRemote,
  loadMyVehiclesRemote,
  setMyCurrentVehicleRemote,
  loadReceiptClienteOptionsRemote,
  loadExpenseLookupNavigationNamesRemote,
  loadMaintenanceRequestVehiclesRemote,
  loadRemoteDetailByParams,
  loadRemoteStore,
  markDetailViewedRemote,
  resolveServiceVehicleRemote,
  loadActiveFleetRemote,
  prefetchExpenseReferenceDataRemote,
  saveServiceObservationRemote,
  saveVoucherDraftRemote,
  saveVoucherRemote,
  updateOne,
  uploadCollisionPhotoRemote,
  uploadExpenseInvoiceRemote,
  uploadReceiveProofRemote,
  type DriverContext,
  type MaintenanceRequestVehicleOption
} from "./lib/dataverse";
import { readReceiptQuick } from "./lib/dataverse";
import { createQrChargeRemote, updateQrChargeRemote } from "./lib/dataverse";
import { getReceivableCents, qrChargeCoversReceivable, type QrCharge } from "./lib/qrCharge";
import { QrChargeScreen } from "./screens/QrChargeScreen";
import {
  INITIAL_QUICK_READ,
  QUICK_READ_FILL_STEP_MS,
  applyQuickRead,
  downscaleForQuickRead,
  expenseFlowView,
  hasRemoteReferenceData,
  nextQuickReadState,
  runQuickReadPipeline,
  shouldRunQuickRead,
  startQuickReadState,
  type QuickReadFilledFields,
  type QuickReadState
} from "./lib/receiptQuickRead";
import { getQuickReadMockMode, readReceiptQuickMock } from "./lib/receiptQuickReadMock";
import { IDEA_STATUS, type Idea, type IdeaDraft } from "./lib/ideas";
import { APP_CONNECTION_LOST_MESSAGE, APP_OPERATION_ERROR_MESSAGE, reportAppError, type AppErrorNotice } from "./lib/appErrorLogger";
import { isComunicadoPending, isMockComunicados, loadDriverComunicado, loadDriverComunicados, type ComunicadoDestinatario } from "./lib/comunicados";
import type { ComunicadosLoadStatus } from "./screens/ComunicadosScreen";
import { isChecklistPending, isMockChecklists, loadDriverChecklist, loadDriverChecklists, type ChecklistVeiculo } from "./lib/checklists";
import type { ChecklistsLoadStatus } from "./screens/ChecklistsScreen";
import { clearMediaDraft, loadMediaDraft, saveMediaDraft, touchMediaDraft } from "./lib/mediaDraftStore";
import { describeExpenseSubmission, normalizeStoredExpenseSubmissions, type ExpenseSubmission, type ExpenseUploadRow } from "./lib/expenseUploadState";
import { resumeExpenseSubmission, type ExpenseSubmissionProgress } from "./lib/expenseSubmission";
import { ExpenseSendOverlay, type ExpenseSendState } from "./components/common/ExpenseSendOverlay";
import type { ExpenseUploadMode } from "./lib/expenseUploadMode";
import { resolveExpenseUploadModeRemote, expenseSubmissionStorageKey, ensureExpenseSubmissionRemote, loadExpenseUploadRowsRemote, transitionExpenseUploadRemote, dispatchExpenseUploadRemote, createExpenseUploadItem } from "./lib/dataverse";

const EXCHANGE_ERROR_MESSAGES: Record<string, string> = {
  EXCHANGE_CONCURRENCY_CONFLICT: "A troca foi alterada por outra pessoa. Atualize a agenda e tente novamente.",
  EXCHANGE_VERSION_REQUIRED: "Atualize a agenda antes de executar esta ação.",
  EXCHANGE_INVALID_WINDOW: "O fim da troca deve ser posterior ao início.",
  EXCHANGE_OVERLAP: "Existe outra troca para este motorista ou veículo no período.",
  POSSESSION_CHAIN_GAP: "O histórico de posse precisa ser reconciliado pela operação antes desta troca.",
  POSSESSION_OVERLAP: "Existe sobreposição no histórico de posse. Contate a operação.",
  POSSESSION_NOT_OPEN: "A posse esperada do veículo não está aberta. Contate a operação.",
  IDENTITY_NOT_MAPPED: "Seu usuário não está vinculado a um funcionário ativo. Contate a operação.",
  FORBIDDEN_LIFECYCLE: "Você não tem permissão ou esta troca não aceita essa ação.",
  EXCHANGE_OUT_OF_WINDOW_REASON_REQUIRED: "A troca está fora do combinado. Conte o motivo antes de confirmar."
};

function exchangeUserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? "");
  const code = Object.keys(EXCHANGE_ERROR_MESSAGES).find((candidate) => message.includes(candidate));
  return code ? EXCHANGE_ERROR_MESSAGES[code] : APP_OPERATION_ERROR_MESSAGE;
}
import {
  cancelDetailLocally,
  clearMaintenancePhotos,
  deleteMaintenancePhoto as deleteFinalizationMaintenancePhoto,
  detailsToClipboardText,
  finalizeDetailLocally,
  findDetailByParams,
  removeAgendaDetail,
  saveMaintenancePhoto,
  saveSignatureLocally,

  type LocalStore
} from "./lib/localWorkflow";
import { LocalToast, type ToastState, type ToastTone } from "./components/common/LocalToast";
import { LoadingOverlay, type LoadingOverlayState } from "./components/common/LoadingOverlay";
import { CollisionScreen } from "./screens/CollisionScreen";
import { ComunicadosScreen } from "./screens/ComunicadosScreen";
import { ChecklistsScreen } from "./screens/ChecklistsScreen";
import { ButtonPreviewScreen } from "./screens/ButtonPreviewScreen";
import { CollisionStartScreen } from "./screens/CollisionStartScreen";
import { DetailsScreen } from "./screens/DetailsScreen";
import { ExpenseScreen } from "./screens/ExpenseScreen";
import { FinalizeScreen, type MaintenanceFinalizeDraft } from "./screens/FinalizeScreen";
import { HistoryDetailsScreen } from "./screens/HistoryDetailsScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { InitialScreen } from "./screens/InitialScreen";
import { LocalCancelScreen } from "./screens/LocalCancelScreen";
import { MediaCaptureScreen } from "./screens/MediaCaptureScreen";
import { ReceiptReadingScreen } from "./screens/ReceiptReadingScreen";
import { ReceiptIllegibleScreen } from "./screens/ReceiptIllegibleScreen";
import { MaintenancePhotoPreviewScreen } from "./screens/MaintenancePhotoPreviewScreen";
import { ReceiveScreen } from "./screens/ReceiveScreen";
import { ReceiptPreviewScreen, ReceiptScreen } from "./screens/ReceiptScreen";
import {
  MaintenanceRequestScreen,
  type MaintenanceRequestDraft,
  type MaintenanceRequestFields,
  type MaintenanceRequestPhoto
} from "./screens/MaintenanceRequestScreen";
import { IdeasScreen } from "./screens/IdeasScreen";
import { MyVehicleScreen } from "./screens/MyVehicleScreen";
import { VehicleChoiceDialog } from "./components/details/VehicleChoiceDialog";
import {
  buildInfleetServiceVehiclePatch,
  needsDriverChoice,
  type DriverVehicleChoice,
  type FleetVehicle,
  type InfleetVehicleResolution
} from "./lib/serviceVehicleInfleet";
import { isThirdPartyDriver } from "./lib/myVehicle";
import { createMockFleetLoader, MOCK_FLEET, pickMockInfleetScenario, resolveMockServiceVehicle } from "./lib/serviceVehicleInfleetMock";

// Referência estável: o diálogo compara com a lista exibida para saber se oferece "Nenhuma das opções".
const loadMockAllFleet = async () => MOCK_FLEET;
import { ServicesScreen } from "./screens/ServicesScreen";
import { SignatureScreen } from "./screens/SignatureScreen";
import { VoucherScreen } from "./screens/VoucherScreen";
import {
  COLLISION_ATTACHMENT_STATUS,
  buildCollisionCreatePayload,
  createEmptyCollisionDraft,
  getCollisionPhotoLabel,
  hasCollisionThirdParty,
  type CollisionDraft,
  type CollisionPhoto,
  type CollisionPhotoKind
} from "./lib/collisions";
import { DEFAULT_EXPENSE_REFERENCE_DATA, buildExpenseCreatePayload, type ExpenseDraft, type ExpensePhoto, type ExpenseReferenceData } from "./lib/expenses";
import { hasMediaDraftContent, prepareVideoBlobForUpload, revokePreviewUrl } from "./lib/mediaDrafts";
import type { CapturedVideoDraft, DetailData, MaintenancePhotoKind, Screen } from "./types";

type RemoteOperation = {
  title: string;
  message: string;
  detailId?: string;
  phase: "loading" | "success";
};

type RefreshOptions = {
  silent?: boolean;
};

type ReceiptEntrySource = "home" | "service";

const LOCAL_RECEIPT_CLIENT_MOCKS = [
  "Particular",
  "Tenaris",
  "Embraer",
  "Johnson & Johnson",
  "Bayer",
  "Volkswagen",
  "Natura"
];

const EMPTY_MAINTENANCE_REQUEST_DRAFT: MaintenanceRequestDraft = {
  descricao: "",
  kmAtual: "",
  veiculoId: "",
  gravidade: ""
};

const EMPTY_EXPENSE_DRAFT: ExpenseDraft = {
  categoriaId: "",
  veiculoId: "",
  valor: "",
  dataGasto: new Date().toISOString().slice(0, 10),
  formaPagamentoId: "",
  cidadeId: "",
  estabelecimento: "",
  descricao: "",
  kmInformado: "",
  litros: ""
};

const EMPTY_MAINTENANCE_FINALIZE_DRAFT: MaintenanceFinalizeDraft = {
  serviceDone: "",
  value: "",
  payment: "",
  cidadeId: "",
  establishment: "",
  notes: ""
};

function FlowProgressOverlay({ operation }: { operation: RemoteOperation }) {
  return (
    <div className="flow-progress-overlay" role="status" aria-live="polite" aria-label={operation.title}>
      <div className={`flow-progress-card is-${operation.phase}`}>
        <div className="flow-progress-track" aria-hidden="true">
          <span />
        </div>
        <div className="flow-progress-kicker">{operation.detailId ?? "Processo remoto"}</div>
        <h2>{operation.title}</h2>
        <p>{operation.message}</p>
        <div className="flow-progress-note">Mantenha esta tela aberta.</div>
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const DATA_LOADING_SUCCESS_DURATION_MS = 420;

function isTrueLike(value: unknown) {
  return value === true || value === 1 || value === "true";
}

function findDetailFromHashRoute(store: LocalStore, route: HashRoute | null) {
  if (!route?.detailId) return null;
  return findDetailByParams([...store.agenda, ...store.history], route.detailId, route.detailType ?? "");
}

function getInitialScreenFromHashRoute(route: HashRoute, detail: DetailData | null): Screen {
  const restoredScreen = getHashRouteRestoreScreen(route.screen);
  if (screenNeedsHashDetail(restoredScreen) && !detail) {
    return getHashRouteFallbackScreen(restoredScreen);
  }
  return restoredScreen;
}

function inferToastTone(message: string): ToastTone {
  const normalized = message.trim().toLowerCase();

  if (
    normalized.includes("falha") ||
    normalized.includes("erro") ||
    normalized.includes("não foi") ||
    normalized.includes("nao foi") ||
    normalized.includes("não encontrado") ||
    normalized.includes("nao encontrado")
  ) {
    return "error";
  }

  if (
    normalized.includes("atenção") ||
    normalized.includes("atencao") ||
    normalized.includes("aviso") ||
    normalized.includes("conclua") ||
    normalized.includes("ainda nao") ||
    normalized.includes("ainda não")
  ) {
    return "warning";
  }

  if (
    normalized.includes("salva") ||
    normalized.includes("salvo") ||
    normalized.includes("enviado") ||
    normalized.includes("registrado") ||
    normalized.includes("atualizado") ||
    normalized.includes("copiadas") ||
    normalized.includes("copiado") ||
    normalized.includes("reiniciados") ||
    normalized.includes("apagada") ||
    normalized.includes("apagado")
  ) {
    return "success";
  }

  return "info";
}

const VOUCHER_DRAFTS_STORAGE_KEY = "app-motoristas-voucher-drafts-v1";
const FINALIZE_DRAFT_ASSETS_STORAGE_KEY = "app-motoristas-finalize-draft-assets-v1";
const SERVICE_OBSERVATION_DRAFTS_KEY = "app-motoristas-service-observation-drafts-v1";

type PersistedReceiveProof = Omit<ExpensePhoto, "previewUrl" | "rawBlob">;

type PersistedFinalizeDraftAssets = {
  signatures: Record<string, string>;
  photos: LocalStore["photos"];
  receiveProofs: Record<string, PersistedReceiveProof[]>;
};

function getDetailDraftKey(detail: DetailData) {
  return `${detail.type}:${detail.dataverse?.id ?? detail.id}`;
}

function loadServiceObservationDrafts(storage: Storage = window.localStorage): Record<string, string> {
  try {
    const raw = storage.getItem(SERVICE_OBSERVATION_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => key && typeof value === "string")
      .map(([key, value]) => [key, value] as const);
    return Object.fromEntries(entries) as Record<string, string>;
  } catch (error) {
    reportAppError(error, { severity: "warning", source: "app", action: "loadServiceObservationDrafts", phase: "localStorage", notifyUser: false });
    return {};
  }
}

function loadVoucherDrafts(storage: Storage = window.localStorage): Record<string, Record<string, string>> {
  try {
    const raw = storage.getItem(VOUCHER_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => key && value && typeof value === "object" && !Array.isArray(value))
      .map(([key, value]) => {
        const draftEntries = Object.entries(value as Record<string, unknown>)
          .filter(([fieldKey, fieldValue]) => fieldKey && typeof fieldValue === "string")
          .map(([fieldKey, fieldValue]) => [fieldKey, fieldValue] as const);
        return [key, Object.fromEntries(draftEntries) as Record<string, string>] as const;
      });
    return Object.fromEntries(
      entries
    ) as Record<string, Record<string, string>>;
  } catch (error) {
    reportAppError(error, { severity: "warning", source: "app", action: "loadVoucherDrafts", phase: "localStorage", notifyUser: false });
    return {};
  }
}

function loadFinalizeDraftAssets(storage: Storage = window.localStorage): PersistedFinalizeDraftAssets {
  try {
    const raw = storage.getItem(FINALIZE_DRAFT_ASSETS_STORAGE_KEY);
    if (!raw) return { signatures: {}, photos: {}, receiveProofs: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedFinalizeDraftAssets>;
    return {
      signatures: parsed.signatures && typeof parsed.signatures === "object" ? parsed.signatures : {},
      photos: parsed.photos && typeof parsed.photos === "object" ? parsed.photos : {},
      receiveProofs: parsed.receiveProofs && typeof parsed.receiveProofs === "object" ? parsed.receiveProofs : {}
    };
  } catch (error) {
    reportAppError(error, { severity: "warning", source: "app", action: "loadFinalizeDraftAssets", phase: "localStorage", notifyUser: false });
    return { signatures: {}, photos: {}, receiveProofs: {} };
  }
}

function serializeReceiveProofs(receiveProofs: Record<string, ExpensePhoto[]>): Record<string, PersistedReceiveProof[]> {
  return Object.fromEntries(
    Object.entries(receiveProofs).map(([detailId, photos]) => [
      detailId,
      photos
        .filter((photo) => Boolean(photo.dataUrl))
        .map(({ previewUrl: _previewUrl, rawBlob: _rawBlob, ...photo }) => photo)
    ])
  );
}

function isVideoMediaDraft(dataUrl?: string | null, rawBlob?: Blob | null) {
  return Boolean(rawBlob) || String(dataUrl ?? "").startsWith("data:video/");
}

type UploadableMediaDraft = {
  dataUrl: string;
  rawBlob?: Blob;
  posterUrl?: string;
  durationLabel?: string;
  mediaType?: "foto" | "video";
};

async function prepareMediaDraftForUpload<T extends UploadableMediaDraft>(photo: T): Promise<T> {
  if (!photo.rawBlob || photo.dataUrl) return photo;
  const prepared = await prepareVideoBlobForUpload(photo.rawBlob);
  return {
    ...photo,
    dataUrl: prepared.dataUrl,
    posterUrl: photo.posterUrl ?? prepared.posterUrl,
    durationLabel: photo.durationLabel ?? prepared.durationLabel,
    mediaType: "video"
  };
}

function revokePhotoPreviewUrls(photos: Array<{ previewUrl?: string }>) {
  photos.forEach((photo) => revokePreviewUrl(photo.previewUrl));
}

function App() {
  const devMode = useMemo(() => new URLSearchParams(window.location.search).get("dev") ?? "", []);
  const previewHashActive = useMemo(() => /^#\/?preview(?:[/?]|$)/i.test(window.location.hash), []);
  const isButtonPreviewMode = devMode === "preview" || previewHashActive;
  const isReceiptPreviewMode = devMode === "recibo";
  const isLocalhostRuntime = useMemo(() => ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname), []);
  const hashRoutingActive = useMemo(
    () => isHashRoutingEnabled() && !isButtonPreviewMode && !isReceiptPreviewMode,
    [isButtonPreviewMode, isReceiptPreviewMode]
  );
  const [store, setStore] = useState<LocalStore>(() => {
    const localStore = loadStore();
    const savedAssets = loadFinalizeDraftAssets();
    return {
      ...localStore,
      signatures: { ...localStore.signatures, ...savedAssets.signatures },
      photos: { ...localStore.photos, ...savedAssets.photos }
    };
  });
  const initialHashRouteRef = useRef<HashRoute | null>(hashRoutingActive ? parseHashRoute(window.location.hash) : null);
  const initialHashDetail = initialHashRouteRef.current ? findDetailFromHashRoute(store, initialHashRouteRef.current) : null;
  const initialDetailRef = useRef<DetailData | null>(initialHashRouteRef.current ? initialHashDetail : getInitialDetail(store));
  const initialScreen = initialHashRouteRef.current
    ? getInitialScreenFromHashRoute(initialHashRouteRef.current, initialHashDetail)
    : (initialDetailRef.current ? "detalhes" : "inicio");
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const previousScreenRef = useRef<Screen>(initialScreen);
  const lastMediaScreenRef = useRef<Screen>(initialScreen);
  const [mediaDraftLoaded, setMediaDraftLoaded] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<DetailData | null>(() => initialDetailRef.current);
  const [receiptEntrySource, setReceiptEntrySource] = useState<ReceiptEntrySource>(
    () => initialScreen === "reciboPersonalizado" && initialHashDetail ? "service" : "home"
  );
  const [maintenancePhotoKind, setMaintenancePhotoKind] = useState<MaintenancePhotoKind>("NOTAFISCAL");
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const [photoDraftPreviewUrl, setPhotoDraftPreviewUrl] = useState("");
  const [photoDraftRawBlob, setPhotoDraftRawBlob] = useState<Blob | null>(null);
  const [photoDraftIsVideo, setPhotoDraftIsVideo] = useState(false);
  const [toast, setToastState] = useState<ToastState | null>(null);
  const [dataLoading, setDataLoading] = useState<LoadingOverlayState | null>(null);
  const [criticalError, setCriticalErrorState] = useState("");
  const [completingDetailKey, setCompletingDetailKey] = useState("");
  const [queueHighlightDetailKey, setQueueHighlightDetailKey] = useState("");
  const [remoteOperation, setRemoteOperation] = useState<RemoteOperation | null>(null);
  const [remoteMode, setRemoteMode] = useState(false);
  const [driverContext, setDriverContext] = useState<DriverContext | null>(null);
  const [vehicleChoiceRequest, setVehicleChoiceRequest] = useState<{
    resolution: InfleetVehicleResolution;
    resolve: (choice: DriverVehicleChoice | null) => void;
    loadFleet: () => Promise<FleetVehicle[]>;
  } | null>(null);
  const [comunicados, setComunicados] = useState<ComunicadoDestinatario[]>([]);
  const [comunicadosStatus, setComunicadosStatus] = useState<ComunicadosLoadStatus>(() => isMockComunicados() || hasDataverseRuntime() ? "loading" : "ready");
  const [selectedComunicadoId, setSelectedComunicadoId] = useState("");
  // Tela de origem ao abrir um comunicado direto (ex.: aba Serviços), para o Voltar retornar a ela.
  const [comunicadoOrigin, setComunicadoOrigin] = useState<"servicos" | "">("");
  const pendingComunicadoDeepLinkRef = useRef(getInitialComunicadoId());
  const [checklists, setChecklists] = useState<ChecklistVeiculo[]>([]);
  const [checklistsStatus, setChecklistsStatus] = useState<ChecklistsLoadStatus>(() => isMockChecklists() || hasDataverseRuntime() ? "loading" : "ready");
  const [selectedChecklistId, setSelectedChecklistId] = useState("");
  const [checklistOrigin, setChecklistOrigin] = useState<"servicos" | "">("");
  const pendingChecklistDeepLinkRef = useRef(getInitialChecklistId());
  const pendingServiceDeepLinkRef = useRef(getInitialParams());
  // true quando o deep link de serviço já abriu a tela; o fluxo pós-carga não deve sobrescrever a navegação.
  const serviceDeepLinkHandledRef = useRef(false);
  const [voucherDrafts, setVoucherDrafts] = useState<Record<string, Record<string, string>>>(() => loadVoucherDrafts());
  const [serviceObservationDrafts, setServiceObservationDrafts] = useState<Record<string, string>>(() => loadServiceObservationDrafts());
  const [maintenanceVehicles, setMaintenanceVehicles] = useState<MaintenanceRequestVehicleOption[]>([]);
  const [maintenanceCurrentVehicleId, setMaintenanceCurrentVehicleId] = useState("");
  const [maintenanceVehiclesLoading, setMaintenanceVehiclesLoading] = useState(false);
  const [maintenanceRequestDraft, setMaintenanceRequestDraft] = useState<MaintenanceRequestDraft>({ ...EMPTY_MAINTENANCE_REQUEST_DRAFT });
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({ ...EMPTY_EXPENSE_DRAFT });
  const [expenseQuickRead, setExpenseQuickRead] = useState<QuickReadState>(INITIAL_QUICK_READ);
  const expenseQuickReadSeqRef = useRef(0);
  const [expenseQuickReadPhoto, setExpenseQuickReadPhoto] = useState("");
  const [expenseQuickReadFilling, setExpenseQuickReadFilling] = useState(false);
  const [expenseQuickReadFilled, setExpenseQuickReadFilled] = useState<QuickReadFilledFields>({});
  const expenseDraftRef = useRef(expenseDraft);
  expenseDraftRef.current = expenseDraft;
  const expenseRetakeTargetIdRef = useRef("");
  const expenseDateTouchedRef = useRef(false);
  const [expenseReferenceData, setExpenseReferenceData] = useState<ExpenseReferenceData>(DEFAULT_EXPENSE_REFERENCE_DATA);
  const [expenseReferenceLoading, setExpenseReferenceLoading] = useState(false);
  const [expenseReferenceError, setExpenseReferenceError] = useState("");
  const [receiptClienteOptions, setReceiptClienteOptions] = useState<string[]>([]);
  const [expensePhotos, setExpensePhotos] = useState<ExpensePhoto[]>([]);
  const [expenseSubmissions, setExpenseSubmissions] = useState<ExpenseSubmission[]>([]);
  const [expenseUploadRows, setExpenseUploadRows] = useState<Record<string, ExpenseUploadRow[]>>({});
  const [expenseUploadReady, setExpenseUploadReady] = useState(false);
  const [expenseUploadMode, setExpenseUploadMode] = useState<ExpenseUploadMode | "pending">("pending");
  const expenseSubmissionsRef = useRef<ExpenseSubmission[]>([]);
  const expenseJournalQueueRef = useRef<Promise<void>>(Promise.resolve());
  const expenseNoticeRef = useRef(new Set<string>());
  const expenseSubmitBusyRef = useRef(false);
  const [expenseSend, setExpenseSend] = useState<ExpenseSendState | null>(null);
  const expenseRunningRef = useRef(new Set<string>());
  const [expenseRunningIds, setExpenseRunningIds] = useState<string[]>([]);
  const expenseUploadRowsRef = useRef(expenseUploadRows);
  expenseUploadRowsRef.current = expenseUploadRows;
  const expenseAutoResumeAtRef = useRef(new Map<string, number>());
  const expenseAutoRetryCountRef = useRef(new Map<string, number>());
  const expenseUnclaimedSinceRef = useRef(new Map<string, number>());
  const expenseWorkerRef = useRef<{
    run: (submission: ExpenseSubmission, motoristaId: string, retryFailed: boolean) => Promise<boolean>;
    verify: (submission: ExpenseSubmission, announceError: boolean) => Promise<void>;
  } | null>(null);
  const expenseUploadStatuses = expenseSubmissions
    .map(submission => ({
      submission,
      status: expenseRunningIds.includes(submission.expenseId)
        ? { state: "processing" as const, text: "Enviando gasto." }
        : describeExpenseSubmission(submission, expenseUploadRows[submission.expenseId] ?? [])
    }))
    // Only expenses that need attention are listed; normal processing stays silent.
    .filter(entry => entry.status.state !== "complete" && entry.status.state !== "processing");

  // Ref first, then the durable write, serialized so concurrent updates never drop a journal entry.
  const commitExpenseSubmissions = (motoristaId: string, update: (list: ExpenseSubmission[]) => ExpenseSubmission[]) => {
    const list = update(expenseSubmissionsRef.current);
    expenseSubmissionsRef.current = list;
    setExpenseSubmissions([...list]);
    const key = expenseSubmissionStorageKey(motoristaId);
    const write = expenseJournalQueueRef.current.then(() => list.length ? saveMediaDraft({ submissions: list }, key) : clearMediaDraft(key));
    expenseJournalQueueRef.current = write.catch(() => undefined);
    return write;
  };
  const upsertExpenseSubmission = (motoristaId: string, submission: ExpenseSubmission) => commitExpenseSubmissions(motoristaId, list =>
    list.some(item => item.expenseId === submission.expenseId) ? list.map(item => item.expenseId === submission.expenseId ? submission : item) : [...list, submission]);
  const removeExpenseSubmission = (motoristaId: string, expenseId: string) => commitExpenseSubmissions(motoristaId, list => list.filter(item => item.expenseId !== expenseId));

  useEffect(() => {
    if (!remoteMode) return;
    let active = true;
    // Decide pela configuracao do ambiente (Flow assincrono configurado), nao pela URL; nunca rejeita.
    resolveExpenseUploadModeRemote().then(mode => { if (active) setExpenseUploadMode(mode); });
    return () => { active = false; };
  }, [remoteMode]);

  useEffect(() => {
    if (!remoteMode || !driverContext || expenseUploadMode !== "async") return;
    let active = true;
    setExpenseUploadReady(false);
    loadMediaDraft<unknown>(expenseSubmissionStorageKey(driverContext.id)).then(saved => {
      if (!active) return;
      const list = normalizeStoredExpenseSubmissions(saved);
      expenseSubmissionsRef.current = list;
      setExpenseSubmissions(list);
      setExpenseUploadReady(true);
    }).catch(error => { if (active) setCriticalError(error instanceof Error ? error.message : "Falha ao restaurar envio de despesa."); });
    return () => { active = false; };
  }, [remoteMode, driverContext?.id, expenseUploadMode]);

  useEffect(() => {
    const tracked = expenseSubmissions.filter(submission => submission.expenseConfirmed).map(submission => submission.expenseId);
    if (!tracked.length || !remoteMode) return;
    let active = true;
    let busy = false;
    let reportedFailure = false;
    const refresh = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const entries = await Promise.all(tracked.map(async id => [id, await loadExpenseUploadRowsRemote(id)] as const));
        if (active) setExpenseUploadRows(current => ({ ...current, ...Object.fromEntries(entries) }));
        reportedFailure = false;
      } catch (error) {
        if (active && !reportedFailure) reportAppError(error, { severity: "warning", source: "app", action: "expenseUploadStatus", phase: "poll", screen: "gastos", detailId: tracked[0] });
        reportedFailure = true;
      } finally { busy = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    const onVisible = () => { void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [expenseSubmissions, remoteMode]);

  // Background outcome: finished expenses leave the journal; problems are announced once.
  useEffect(() => {
    if (!driverContext) return;
    for (const submission of expenseSubmissionsRef.current) {
      if (expenseRunningIds.includes(submission.expenseId)) continue;
      const status = describeExpenseSubmission(submission, expenseUploadRows[submission.expenseId] ?? []);
      if (status.state === "complete") {
        void removeExpenseSubmission(driverContext.id, submission.expenseId);
      } else if (status.state === "failed" && (expenseAutoRetryCountRef.current.get(submission.expenseId) ?? 0) >= 2 && !expenseNoticeRef.current.has(submission.expenseId)) {
        expenseNoticeRef.current.add(submission.expenseId);
        setToast("Um comprovante de gasto não foi anexado. Abra Registrar gasto e toque em Tentar de novo.", "warning");
      }
    }
  }, [expenseUploadRows, expenseSubmissions, expenseRunningIds, driverContext?.id]);

  // Background worker: resumes interrupted sends, retries confirmed failures twice and
  // closes attempts the server never picked up, without the driver having to wait.
  useEffect(() => {
    if (!remoteMode || !driverContext || !expenseUploadReady) return;
    const motoristaId = driverContext.id;
    const tick = () => {
      const worker = expenseWorkerRef.current;
      if (!worker || !navigator.onLine) return;
      const now = Date.now();
      for (const submission of expenseSubmissionsRef.current) {
        const id = submission.expenseId;
        if (expenseRunningRef.current.has(id) || now - (expenseAutoResumeAtRef.current.get(id) ?? 0) < 30000) continue;
        const status = describeExpenseSubmission(submission, expenseUploadRowsRef.current[id] ?? []);
        if (status.state !== "unclaimed") expenseUnclaimedSinceRef.current.delete(id);
        if (status.state === "interrupted") {
          expenseAutoResumeAtRef.current.set(id, now);
          void worker.run(submission, motoristaId, false);
        } else if (status.state === "failed" && (expenseAutoRetryCountRef.current.get(id) ?? 0) < 2) {
          expenseAutoResumeAtRef.current.set(id, now);
          expenseAutoRetryCountRef.current.set(id, (expenseAutoRetryCountRef.current.get(id) ?? 0) + 1);
          void worker.run(submission, motoristaId, true);
        } else if (status.state === "unclaimed") {
          const since = expenseUnclaimedSinceRef.current.get(id) ?? now;
          expenseUnclaimedSinceRef.current.set(id, since);
          if (now - since < 120000) continue;
          expenseAutoResumeAtRef.current.set(id, now);
          expenseUnclaimedSinceRef.current.delete(id);
          void worker.verify(submission, false);
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 10000);
    window.addEventListener("online", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("online", tick); };
  }, [remoteMode, driverContext?.id, expenseUploadReady]);
  const [expensePhotoDraft, setExpensePhotoDraft] = useState("");
  const [expensePhotoPreviewUrl, setExpensePhotoPreviewUrl] = useState("");
  const [expensePhotoPosterUrl, setExpensePhotoPosterUrl] = useState("");
  const [expensePhotoDurationLabel, setExpensePhotoDurationLabel] = useState("");
  const [expensePhotoRawBlob, setExpensePhotoRawBlob] = useState<Blob | null>(null);
  const [expensePhotoIsVideo, setExpensePhotoIsVideo] = useState(false);
  const [expensePreviewPhotoId, setExpensePreviewPhotoId] = useState("");
  const [receiveProofs, setReceiveProofs] = useState<Record<string, ExpensePhoto[]>>(() => loadFinalizeDraftAssets().receiveProofs);
  // Cobrança paga por QR em cada serviço; o registro definitivo fica no Dataverse (cr40f_cobrancastripe).
  const [qrChargesPaid, setQrChargesPaid] = useState<Record<string, QrCharge>>({});
  const [receiveUploadedCounts, setReceiveUploadedCounts] = useState<Record<string, number>>({});
  const [receivePhotoDraft, setReceivePhotoDraft] = useState("");
  const [receivePhotoPreviewUrl, setReceivePhotoPreviewUrl] = useState("");
  const [receivePhotoPosterUrl, setReceivePhotoPosterUrl] = useState("");
  const [receivePhotoDurationLabel, setReceivePhotoDurationLabel] = useState("");
  const [receivePhotoRawBlob, setReceivePhotoRawBlob] = useState<Blob | null>(null);
  const [receivePhotoIsVideo, setReceivePhotoIsVideo] = useState(false);
  const [receivePreviewPhotoId, setReceivePreviewPhotoId] = useState("");
  const [collisionDraft, setCollisionDraft] = useState<CollisionDraft>(() => createEmptyCollisionDraft());
  const [collisionPhotos, setCollisionPhotos] = useState<CollisionPhoto[]>([]);
  const [collisionPhotoDraft, setCollisionPhotoDraft] = useState("");
  const [collisionPhotoPreviewUrl, setCollisionPhotoPreviewUrl] = useState("");
  const [collisionPhotoPosterUrl, setCollisionPhotoPosterUrl] = useState("");
  const [collisionPhotoDurationLabel, setCollisionPhotoDurationLabel] = useState("");
  const [collisionPhotoRawBlob, setCollisionPhotoRawBlob] = useState<Blob | null>(null);
  const [collisionPhotoIsVideo, setCollisionPhotoIsVideo] = useState(false);
  const [collisionPhotoKind, setCollisionPhotoKind] = useState<CollisionPhotoKind>("cena");
  const [collisionPreviewPhotoId, setCollisionPreviewPhotoId] = useState("");
  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    let active = true;
    void loadMediaDraft<PersistedFinalizeDraftAssets>().then((saved) => {
      if (!active || !saved) return;
      setStore((current) => ({
        ...current,
        signatures: { ...current.signatures, ...saved.signatures },
        photos: { ...current.photos, ...saved.photos }
      }));
      setReceiveProofs((current) => ({ ...current, ...saved.receiveProofs }));
    }).catch((error) => reportAppError(error, { severity: "warning", source: "app", action: "loadFinalizeDraftAssets", phase: "indexedDB", screen }))
      .finally(() => { if (active) setMediaDraftLoaded(true); });
    return () => { active = false; };
  }, [isButtonPreviewMode, isReceiptPreviewMode]);
  const [maintenanceRequestPhotos, setMaintenanceRequestPhotos] = useState<MaintenanceRequestPhoto[]>([]);
  const [maintenanceRequestPhotoDraft, setMaintenanceRequestPhotoDraft] = useState("");
  const [maintenanceRequestPhotoPreviewUrl, setMaintenanceRequestPhotoPreviewUrl] = useState("");
  const [maintenanceRequestPhotoPosterUrl, setMaintenanceRequestPhotoPosterUrl] = useState("");
  const [maintenanceRequestPhotoDurationLabel, setMaintenanceRequestPhotoDurationLabel] = useState("");
  const [maintenanceRequestPhotoRawBlob, setMaintenanceRequestPhotoRawBlob] = useState<Blob | null>(null);
  const [maintenanceRequestPhotoIsVideo, setMaintenanceRequestPhotoIsVideo] = useState(false);
  const [maintenanceRequestPreviewPhotoId, setMaintenanceRequestPreviewPhotoId] = useState("");
  const [maintenanceExistingPreview, setMaintenanceExistingPreview] = useState(false);
  const [maintenanceFinalizeDraft, setMaintenanceFinalizeDraft] = useState<MaintenanceFinalizeDraft>({ ...EMPTY_MAINTENANCE_FINALIZE_DRAFT });
  const finalizeTimerRef = useRef<number | null>(null);
  const completingClearTimerRef = useRef<number | null>(null);
  const queueHighlightTimerRef = useRef<number | null>(null);
  const voucherDraftTimerRef = useRef<number | null>(null);
  const lastGlobalErrorRef = useRef<{ id: string; at: number }>({ id: "", at: 0 });

  const clearMaintenanceFinalizePhotoDraft = (keepPreviewUrl = false) => {
    if (!keepPreviewUrl) revokePreviewUrl(photoDraftPreviewUrl);
    setPhotoDraft(null);
    setPhotoDraftPreviewUrl("");
    setPhotoDraftRawBlob(null);
    setPhotoDraftIsVideo(false);
  };

  const clearMaintenanceRequestPhotoDraftState = (keepPreviewUrl = false) => {
    if (!keepPreviewUrl) revokePreviewUrl(maintenanceRequestPhotoPreviewUrl);
    setMaintenanceRequestPhotoDraft("");
    setMaintenanceRequestPhotoPreviewUrl("");
    setMaintenanceRequestPhotoPosterUrl("");
    setMaintenanceRequestPhotoDurationLabel("");
    setMaintenanceRequestPhotoRawBlob(null);
    setMaintenanceRequestPhotoIsVideo(false);
  };

  const clearExpensePhotoDraftState = (keepPreviewUrl = false) => {
    if (!keepPreviewUrl) revokePreviewUrl(expensePhotoPreviewUrl);
    setExpensePhotoDraft("");
    setExpensePhotoPreviewUrl("");
    setExpensePhotoPosterUrl("");
    setExpensePhotoDurationLabel("");
    setExpensePhotoRawBlob(null);
    setExpensePhotoIsVideo(false);
  };

  const clearReceivePhotoDraftState = (keepPreviewUrl = false) => {
    if (!keepPreviewUrl) revokePreviewUrl(receivePhotoPreviewUrl);
    setReceivePhotoDraft("");
    setReceivePhotoPreviewUrl("");
    setReceivePhotoPosterUrl("");
    setReceivePhotoDurationLabel("");
    setReceivePhotoRawBlob(null);
    setReceivePhotoIsVideo(false);
  };

  const clearCollisionPhotoDraftState = (keepPreviewUrl = false) => {
    if (!keepPreviewUrl) revokePreviewUrl(collisionPhotoPreviewUrl);
    setCollisionPhotoDraft("");
    setCollisionPhotoPreviewUrl("");
    setCollisionPhotoPosterUrl("");
    setCollisionPhotoDurationLabel("");
    setCollisionPhotoRawBlob(null);
    setCollisionPhotoIsVideo(false);
  };

  const logAppError = (error: unknown, action: string, phase = "") => {
    reportAppError(error, {
      severity: "error",
      source: "app",
      action,
      phase,
      screen,
      detailId: selectedDetail?.id,
      detailType: selectedDetail?.type
    });
  };

  const setToast = (message: string, tone?: ToastTone) => {
    const trimmed = /failed to fetch|não foi possível conectar ao servidor|nao foi possivel conectar ao servidor|offline/i.test(message)
      ? APP_OPERATION_ERROR_MESSAGE
      : message.trim();
    if (!trimmed) {
      setToastState(null);
      return;
    }

    setToastState({
      id: Date.now() + Math.floor(Math.random() * 1000),
      message: trimmed,
      tone: tone ?? inferToastTone(trimmed)
    });
  };

  const setCriticalError = (message: string) => setCriticalErrorState(message ? APP_OPERATION_ERROR_MESSAGE : "");

  const setDataLoadingState = (loading: LoadingOverlayState | null) => {
    if (loading) setToastState(null);
    setDataLoading(loading);
  };

  const completeDataLoadingState = async (title: string, message?: string) => {
    setDataLoadingState({
      phase: "success",
      title,
      message
    });
    await wait(DATA_LOADING_SUCCESS_DURATION_MS);
    setDataLoadingState(null);
  };

  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    if (remoteMode) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, photos: {}, signatures: {} }));
    } catch (error) {
      reportAppError(error, {
        severity: "warning",
        source: "app",
        action: "persistLocalStore",
        phase: "localStorage",
        screen
      });
    }
  }, [isButtonPreviewMode, isReceiptPreviewMode, remoteMode, screen, store]);

  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    try {
      localStorage.setItem(VOUCHER_DRAFTS_STORAGE_KEY, JSON.stringify(voucherDrafts));
    } catch (error) {
      reportAppError(error, {
        severity: "warning",
        source: "app",
        action: "persistVoucherDrafts",
        phase: "localStorage",
        screen
      });
    }
  }, [isButtonPreviewMode, isReceiptPreviewMode, screen, voucherDrafts]);

  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode || !mediaDraftLoaded) return;
    const payload = {
        signatures: store.signatures,
        photos: store.photos,
        receiveProofs: serializeReceiveProofs(receiveProofs)
      } satisfies PersistedFinalizeDraftAssets;
    void saveMediaDraft(payload).then(() => localStorage.removeItem(FINALIZE_DRAFT_ASSETS_STORAGE_KEY)).catch((error) => {
      reportAppError(error, {
        severity: "warning",
        source: "app",
        action: "persistFinalizeDraftAssets",
        phase: "indexedDB",
        screen
      });
      setToast(exchangeUserError(error), "warning");
    });
  }, [isButtonPreviewMode, isReceiptPreviewMode, mediaDraftLoaded, store.photos, store.signatures, receiveProofs]);

  useEffect(() => {
    if (lastMediaScreenRef.current === screen) return;
    lastMediaScreenRef.current = screen;
    if (isButtonPreviewMode || isReceiptPreviewMode || !mediaDraftLoaded) return;
    void touchMediaDraft().catch((error) => {
      reportAppError(error, { severity: "warning", source: "app", action: "touchFinalizeDraftAssets", phase: "indexedDB", screen });
      setToast(exchangeUserError(error), "warning");
    });
  }, [isButtonPreviewMode, isReceiptPreviewMode, mediaDraftLoaded, screen]);

  // Guarda o motorista logado para recarregar comunicados sem depender do estado ainda não aplicado.
  const comunicadosDriverIdRef = useRef("");
  const reloadComunicados = useCallback(async () => {
    try {
      setComunicados(await loadDriverComunicados(comunicadosDriverIdRef.current));
      setComunicadosStatus("ready");
    } catch (error) {
      // Mantém a lista já carregada; só exibe o estado de erro quando nunca houve carga.
      setComunicadosStatus((current) => current === "ready" ? current : "error");
      throw error;
    }
  }, []);

  // Checklists usam o mesmo motorista logado dos comunicados.
  const reloadChecklists = useCallback(async () => {
    try {
      setChecklists(await loadDriverChecklists(comunicadosDriverIdRef.current));
      setChecklistsStatus("ready");
    } catch (error) {
      setChecklistsStatus((current) => current === "ready" ? current : "error");
      throw error;
    }
  }, []);

  // Deep link do push de checklist: abre o checklist apontado sem esperar a agenda.
  useEffect(() => {
    const deepLinkId = pendingChecklistDeepLinkRef.current;
    if (!deepLinkId || isButtonPreviewMode || isReceiptPreviewMode) return;
    if (!hasDataverseRuntime() && !isMockChecklists()) return;
    let alive = true;
    loadDriverChecklist(deepLinkId)
      .then((item) => {
        if (!alive || pendingChecklistDeepLinkRef.current !== deepLinkId) return;
        pendingChecklistDeepLinkRef.current = "";
        setDataLoadingState(null);
        if (!item) {
          setScreen("checklists");
          setToast("Este checklist não está mais com você.", "warning");
          return;
        }
        setChecklists((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
        setSelectedChecklistId(item.id);
        setScreen("checklists");
      })
      .catch((error) => {
        reportAppError(error, { severity: "warning", source: "app", action: "loadDriverChecklist", phase: "deep-link" });
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isMockChecklists()) return;
    reloadChecklists().catch((error) => {
      reportAppError(error, { severity: "warning", source: "app", action: "loadMockChecklists" });
    });
  }, []);

  // Deep link do push: busca só esse destinatário em paralelo com a agenda e abre o comunicado
  // assim que ele chega, sem esperar loadRemoteStore nem a lista completa. A lista completa, ao
  // chegar, substitui o item provisório; se esta busca falhar, o efeito abaixo segue como fallback.
  useEffect(() => {
    const deepLinkId = pendingComunicadoDeepLinkRef.current;
    if (!deepLinkId || isButtonPreviewMode || isReceiptPreviewMode) return;
    if (!hasDataverseRuntime() && !isMockComunicados()) return;
    let alive = true;
    loadDriverComunicado(deepLinkId)
      .then((item) => {
        if (!alive || !item || pendingComunicadoDeepLinkRef.current !== deepLinkId) return;
        pendingComunicadoDeepLinkRef.current = "";
        setComunicados((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
        setSelectedComunicadoId(item.id);
        setScreen("comunicados");
        setDataLoadingState(null);
      })
      .catch((error) => {
        reportAppError(error, { severity: "warning", source: "app", action: "loadDriverComunicado", phase: "deep-link" });
      });
    return () => { alive = false; };
  }, []);

  // Deep link de serviço vindo do push (form OnLoad -> data=servicoId=...&tipo=...): busca o detalhe
  // em paralelo com loadRemoteStore e abre assim que chega. Se o serviço saiu da agenda do motorista
  // (ex.: "Serviço retirado da agenda"), cai em Serviços em vez de mostrar erro.
  useEffect(() => {
    const { serviceId, type } = pendingServiceDeepLinkRef.current;
    if (!serviceId || isButtonPreviewMode || isReceiptPreviewMode || !hasDataverseRuntime()) return;
    // Detalhe já presente no cache local: a tela inicial já é "detalhes"; o fluxo pós-carga atualiza.
    if (initialDetailRef.current) return;
    let alive = true;
    loadRemoteDetailByParams(serviceId, type)
      .then((detail) => {
        if (!alive || serviceDeepLinkHandledRef.current) return;
        serviceDeepLinkHandledRef.current = true;
        setDataLoadingState(null);
        if (!detail) {
          setSelectedDetail(null);
          setScreen("servicos");
          setToast("Este serviço não está mais na sua agenda.", "warning");
          return;
        }
        markDetailViewedRemote(detail).catch((error) => {
          reportAppError(error, { severity: "error", source: "app", action: "markDetailViewedRemote", phase: "push-deep-link", screen: "detalhes", detailId: detail.id, detailType: detail.type });
        });
        setSelectedDetail(detail);
        setScreen("detalhes");
      })
      .catch((error) => {
        // Sem acesso ao registro (ex.: serviço retirado do motorista) ou falha de rede: o fluxo pós-carga decide.
        reportAppError(error, { severity: "warning", source: "app", action: "loadRemoteDetailByParams", phase: "push-deep-link-fast" });
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const deepLinkId = pendingComunicadoDeepLinkRef.current;
    if (!deepLinkId || comunicadosStatus !== "ready") return;
    pendingComunicadoDeepLinkRef.current = "";
    if (!comunicados.some((item) => item.id.toLowerCase() === deepLinkId)) return;
    setSelectedComunicadoId(comunicados.find((item) => item.id.toLowerCase() === deepLinkId)?.id ?? "");
    setScreen("comunicados");
  }, [comunicados, comunicadosStatus]);

  useEffect(() => {
    if (!isMockComunicados()) return;
    reloadComunicados().catch((error) => {
      reportAppError(error, { severity: "warning", source: "app", action: "loadMockComunicados" });
      setToast("Não foi possível carregar os comunicados de teste. Confira o painel de comunicados indicado em ?mockApiPort=.", "warning");
    });
  }, []);

  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    if (!hasDataverseRuntime()) return;
    let alive = true;
    setRemoteMode(true);
    setDataLoadingState({
      phase: "loading",
      title: "Carregando dados",
      message: "Sincronizando agenda no Dataverse."
    });
    loadRemoteStore()
      .then((remote) => {
        if (!alive) return;
        setDataLoadingState(null);
        const remoteStore = { ...store, agenda: remote.agenda, history: remote.history };
        const hashRoute = initialHashRouteRef.current;
        const remoteInitialDetail = hashRoute ? findDetailFromHashRoute(remoteStore, hashRoute) : getInitialDetail(remoteStore);
        setDriverContext(remote.driver);
        comunicadosDriverIdRef.current = remote.driver?.id ?? "";
        reloadComunicados().catch((error) => {
          reportAppError(error, { severity: "warning", source: "app", action: "loadDriverComunicados", phase: "initial" });
          setToast("Não foi possível carregar comunicados. Atualize o aplicativo.", "warning");
        });
        reloadChecklists().catch((error) => {
          reportAppError(error, { severity: "warning", source: "app", action: "loadDriverChecklists", phase: "initial" });
        });
        setStore((current) => ({
          ...current,
          agenda: remote.agenda,
          history: remote.history
        }));
        if (hashRoute) {
          const routedScreen = getInitialScreenFromHashRoute(hashRoute, remoteInitialDetail);
          if (screenNeedsHashDetail(routedScreen)) {
            if (remoteInitialDetail) {
              markDetailViewedRemote(remoteInitialDetail).catch((error) => {
                reportAppError(error, {
                  severity: "error",
                  source: "app",
                  action: "markDetailViewedRemote",
                  phase: "hash-route",
                  screen: routedScreen,
                  detailId: remoteInitialDetail.id,
                  detailType: remoteInitialDetail.type
                });
                setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
              });
              setSelectedDetail(remoteInitialDetail);
              setScreen(routedScreen);
              setToast("");
              return;
            }
            if (hashRoute.detailId && hashRoute.detailType) {
              loadRemoteDetailByParams(hashRoute.detailId, hashRoute.detailType)
                .then((detail) => {
                  if (!alive) return;
                  if (!detail) {
                    setSelectedDetail(null);
                    setScreen(getHashRouteFallbackScreen(routedScreen));
                    setToast("Serviço do link não encontrado.");
                    return;
                  }
                  markDetailViewedRemote(detail).catch((error) => {
                    reportAppError(error, {
                      severity: "error",
                      source: "app",
                      action: "markDetailViewedRemote",
                      phase: "hash-route-remote-detail",
                      screen: routedScreen,
                      detailId: detail.id,
                      detailType: detail.type
                    });
                    setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
                  });
                  setSelectedDetail(detail);
                  setScreen(routedScreen);
                  setToast("");
                })
                .catch((error) => {
                  if (!alive) return;
                  reportAppError(error, {
                    severity: "error",
                    source: "app",
                    action: "loadRemoteDetailByParams",
                    phase: "hash-route",
                    screen: routedScreen
                  });
                  setSelectedDetail(null);
                  setScreen(getHashRouteFallbackScreen(routedScreen));
                  setToast(error instanceof Error ? error.message : "Serviço do link não encontrado.");
                });
              return;
            }
            setSelectedDetail(null);
            setScreen(getHashRouteFallbackScreen(routedScreen));
            setToast("");
            return;
          }
          setSelectedDetail(remoteInitialDetail);
          setScreen(routedScreen);
          setToast("");
          return;
        }
        if (serviceDeepLinkHandledRef.current) {
          // O caminho rápido do push já abriu o serviço (ou Serviços); não sobrescreve a navegação do motorista.
          setToast("");
          return;
        }
        if (remoteInitialDetail) {
          serviceDeepLinkHandledRef.current = true;
          markDetailViewedRemote(remoteInitialDetail).catch((error) => {
            reportAppError(error, {
              severity: "error",
              source: "app",
              action: "markDetailViewedRemote",
              phase: "initial-detail",
              screen: "detalhes",
              detailId: remoteInitialDetail.id,
              detailType: remoteInitialDetail.type
            });
            setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
          });
          setSelectedDetail(remoteInitialDetail);
          setScreen("detalhes");
          return;
        }
        const initialParams = getInitialParams();
        if (initialParams.serviceId) {
          serviceDeepLinkHandledRef.current = true;
          loadRemoteDetailByParams(initialParams.serviceId, initialParams.type)
            .then((detail) => {
              if (!alive) return;
              if (!detail) {
                setScreen("servicos");
                setToast("Este serviço não está mais na sua agenda.", "warning");
                return;
              }
              markDetailViewedRemote(detail).catch((error) => {
                reportAppError(error, {
                  severity: "error",
                  source: "app",
                  action: "markDetailViewedRemote",
                  phase: "deep-link",
                  screen: "detalhes",
                  detailId: detail.id,
                  detailType: detail.type
                });
                setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
              });
              setSelectedDetail(detail);
              setScreen("detalhes");
              setToast("");
            })
            .catch((error) => {
              if (!alive) return;
              reportAppError(error, {
                severity: "error",
                source: "app",
                action: "loadRemoteDetailByParams",
                phase: "initial-deep-link",
                screen
              });
              setToast(error instanceof Error ? error.message : "Serviço remoto não encontrado.");
            });
          return;
        }
        setToast("");
      })
      .catch((error) => {
        if (!alive) return;
        reportAppError(error, {
          severity: "critical",
          source: "app",
          action: "loadRemoteStore",
          phase: "bootstrap",
          screen
        });
        setRemoteMode(false);
        setToast(error instanceof Error ? error.message : "Falha ao carregar Dataverse.");
      });
    return () => {
      alive = false;
    };
  }, [isButtonPreviewMode, isReceiptPreviewMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToastState(null), toast.tone === "error" ? 3600 : 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const showConnectionLostPopup = () => setCriticalErrorState(APP_CONNECTION_LOST_MESSAGE);

    if (navigator.onLine === false) showConnectionLostPopup();
    window.addEventListener("offline", showConnectionLostPopup);
    return () => window.removeEventListener("offline", showConnectionLostPopup);
  }, []);

  useEffect(() => {
    const onGlobalError = (event: Event) => {
      const detail = (event as CustomEvent<AppErrorNotice>).detail;
      if (!detail?.userMessage) return;

      const now = Date.now();
      if (lastGlobalErrorRef.current.id === detail.id && now - lastGlobalErrorRef.current.at < 4000) return;
      lastGlobalErrorRef.current = { id: detail.id, at: now };

      if (detail.severity === "critical") {
        setCriticalError(detail.userMessage);
        return;
      }

      const tone: ToastTone =
        detail.severity === "warning"
          ? "warning"
          : detail.severity === "info"
            ? "info"
            : "error";

      setToastState({
        id: now + Math.floor(Math.random() * 1000),
        message: detail.userMessage,
        tone
      });
    };

    window.addEventListener("appmotoristas:error", onGlobalError as EventListener);
    return () => window.removeEventListener("appmotoristas:error", onGlobalError as EventListener);
  }, []);

  useEffect(() => {
    return () => {
      if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
      if (completingClearTimerRef.current) window.clearTimeout(completingClearTimerRef.current);
      if (voucherDraftTimerRef.current) window.clearTimeout(voucherDraftTimerRef.current);
    };
  }, []);

  const confirmedMaintenancePhotos = useMemo(() => {
    if (!selectedDetail) return [];
    return Object.keys(store.photos[selectedDetail.id] ?? {}) as MaintenancePhotoKind[];
  }, [selectedDetail, store.photos]);

  const receiptDetail = receiptEntrySource === "service" ? selectedDetail ?? undefined : undefined;
  const screenMotion = getScreenMotion(screen, previousScreenRef.current);
  const canGeneratePersonalReceipt =
    isTrueLike(driverContext?.funcionario?.cr40f_gerarrecibopersonalizado) ||
    isLocalhostRuntime;
  const canChargeByQr = isTrueLike(driverContext?.funcionario?.cr40f_podecobrarqrcode) || isLocalhostRuntime;
  const getQrChargeOpener = (detail: DetailData) =>
    canChargeByQr && getReceivableCents(detail) > 0 ? () => setScreen("cobrancaQr") : undefined;
  const qrChargeCovers = (detail: DetailData) => qrChargeCoversReceivable(qrChargesPaid[detail.id], detail);
  const receiveStepPending = (detail: DetailData) =>
    isReceiveStepPending(detail, { receiveProofs, receiveUploadedCounts, remoteMode, proofWaived: qrChargeCovers(detail) });
  const getQrChargeProps = (detail: DetailData) => ({
    onOpenQrCharge: getQrChargeOpener(detail),
    qrChargePaid: qrChargesPaid[detail.id],
    proofWaived: qrChargeCovers(detail)
  });

  useEffect(() => {
    previousScreenRef.current = screen;
  }, [screen]);

  useHardwareBackGuard(screen, hashRoutingActive);

  useEffect(() => {
    if (!hashRoutingActive) return;
    const hashDetail = screen ==="reciboPersonalizado" ? receiptDetail : selectedDetail;
    const nextHash = buildHashRoute(screen, hashDetail ? { id: hashDetail.id, type: hashDetail.type } : null);
    if (window.location.hash === nextHash) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${nextHash}`);
  }, [hashRoutingActive, receiptDetail, screen, selectedDetail]);

  useEffect(() => {
    if (!remoteMode || !driverContext) return;
    prefetchExpenseReferenceDataRemote();
  }, [driverContext, remoteMode]);

  const localIdeasRef = useRef<Idea[]>([]);
  const ideasGateway = useMemo(() => {
    if (remoteMode) return { load: loadMyIdeasRemote, create: createIdeaRemote };
    return {
      load: async () => [...localIdeasRef.current],
      create: async (draft: IdeaDraft) => {
        const idea: Idea = { id: `local-idea-${Date.now()}`, title: draft.title.trim(), details: draft.details.trim(), status: IDEA_STATUS.nova, createdAt: new Date().toISOString() };
        localIdeasRef.current = [idea, ...localIdeasRef.current];
        return idea;
      }
    };
  }, [remoteMode]);

  useEffect(() => {
    if ((screen !== "solicitarManutencao" && screen !== "gastos" && screen !== "colisoes") || !remoteMode) return;
    let alive = true;
    setMaintenanceVehiclesLoading(true);
    getDriverContext()
      .then(async (driver) => {
        const vehicles = await loadMaintenanceRequestVehiclesRemote(driver, {
          onlyOwnCategory: screen === "solicitarManutencao",
          activeOnly: screen === "colisoes"
        });
        if (!alive) return;
        setDriverContext(driver);
        const currentVehicleId = getDriverCurrentVehicleId(driver);
        const availableCurrentVehicleId = vehicles.some((vehicle) => vehicle.id === currentVehicleId) ? currentVehicleId : "";
        setMaintenanceCurrentVehicleId(availableCurrentVehicleId);
        setMaintenanceRequestDraft((current) => (
          current.veiculoId && !vehicles.some((vehicle) => vehicle.id === current.veiculoId)
            ? { ...current, veiculoId: "" }
            : current
        ));
        setMaintenanceVehicles(vehicles);
      })
      .catch((error) => {
        if (!alive) return;
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "loadMaintenanceRequestVehiclesRemote",
          phase: "maintenance-request",
          screen
        });
        setToast(error instanceof Error ? error.message : "Falha ao carregar veículos.");
      })
      .finally(() => {
        if (alive) setMaintenanceVehiclesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [screen, remoteMode]);

  useEffect(() => {
    const shouldLoadExpenseReference = screen === "gastos" || (screen === "finalizar" && selectedDetail?.type === "MANUTENCAO");
    if (!shouldLoadExpenseReference || !remoteMode) return;
    let alive = true;
    const hasReferenceData =
      expenseReferenceData.categories.length > 0 &&
      expenseReferenceData.paymentMethods.length > 0 &&
      expenseReferenceData.cities.length > 0;
    setExpenseReferenceLoading(!hasReferenceData);
    setExpenseReferenceError("");
    loadExpenseReferenceDataRemote()
      .then((referenceData) => {
        if (!alive) return;
        setExpenseReferenceData(referenceData);
        setExpenseReferenceError("");
      })
      .catch((error) => {
        if (!alive) return;
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "loadExpenseReferenceDataRemote",
          phase: screen === "finalizar" ? "maintenance-finalize" : "expense-form",
          screen
        });
        const message = error instanceof Error ? error.message : "Falha ao carregar categorias de despesas.";
        setExpenseReferenceError(message);
        setToast(message);
      })
      .finally(() => {
        if (alive) setExpenseReferenceLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [screen, remoteMode, selectedDetail?.type]);

  useEffect(() => {
    if (screen !== "reciboPersonalizado") {
      setReceiptClienteOptions([]);
      return;
    }

    if (!remoteMode) {
      setReceiptClienteOptions(isLocalhostRuntime ? LOCAL_RECEIPT_CLIENT_MOCKS : []);
      return;
    }

    let alive = true;
    loadReceiptClienteOptionsRemote()
      .then((clientes) => {
        if (!alive) return;
        setReceiptClienteOptions(clientes.length ? clientes : (isLocalhostRuntime ? LOCAL_RECEIPT_CLIENT_MOCKS : []));
      })
      .catch((error) => {
        if (!alive) return;
        setDataLoadingState(null);
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "loadReceiptClienteOptionsRemote",
          phase: "receipt-form",
          screen
        });
        setReceiptClienteOptions(isLocalhostRuntime ? LOCAL_RECEIPT_CLIENT_MOCKS : []);
      });

    return () => {
      alive = false;
    };
  }, [isLocalhostRuntime, remoteMode, screen]);

  const show = (node: React.ReactNode) => (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          className={`screen-motion screen-motion--${screenMotion.kind}`}
          style={{ transformOrigin: screenMotion.origin }}
          initial={screenMotion.initial}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={screenMotion.exit}
          transition={screenMotion.transition}
        >
          {node}
        </motion.div>
      </AnimatePresence>
      <LocalToast toast={dataLoading ? null : toast} onDismiss={() => setToastState(null)} />
      <LoadingOverlay loading={dataLoading} />
      {remoteOperation ? <FlowProgressOverlay operation={remoteOperation} /> : null}
      {expenseSend ? <ExpenseSendOverlay state={expenseSend} onClose={closeExpenseSendError} /> : null}
      {vehicleChoiceRequest ? (
        <VehicleChoiceDialog
          resolution={vehicleChoiceRequest.resolution}
          loadFleet={vehicleChoiceRequest.loadFleet}
          loadAllVehicles={remoteMode ? loadActiveFleetRemote : loadMockAllFleet}
          onChoose={closeVehicleChoice}
          onCancel={cancelVehicleChoice}
        />
      ) : null}
      {criticalError ? (
        <div className="critical-error-overlay" role="dialog" aria-modal="true" aria-labelledby="critical-error-title">
          <div className="critical-error-card">
            <div className="critical-error-kicker">Atenção</div>
            <h2 id="critical-error-title">Processo não foi concluído</h2>
            <p>{criticalError}</p>
            <div className="critical-error-actions">
              <button type="button" onClick={() => setCriticalError("")}>Entendi</button>
            </div>
          </div>
        </div>
      ) : null}
      <BuildStamp />
    </>
  );

  if (isButtonPreviewMode) {
    return show(<ButtonPreviewScreen onShowToast={setToast} />);
  }

  if (isReceiptPreviewMode) {
    return show(<ReceiptPreviewScreen />);
  }

  const resetLocalData = () => {
    if (remoteMode || !isLocalhostRuntime) return;
    const confirmed = window.confirm("Resetar dados locais, rascunhos e anexos salvos neste navegador?");
    if (!confirmed) return;

    if (voucherDraftTimerRef.current) {
      window.clearTimeout(voucherDraftTimerRef.current);
      voucherDraftTimerRef.current = null;
    }
    if (finalizeTimerRef.current) {
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    if (completingClearTimerRef.current) {
      window.clearTimeout(completingClearTimerRef.current);
      completingClearTimerRef.current = null;
    }
    if (queueHighlightTimerRef.current) {
      window.clearTimeout(queueHighlightTimerRef.current);
      queueHighlightTimerRef.current = null;
    }

    revokePhotoPreviewUrls(expensePhotos);
    Object.values(receiveProofs).forEach((photos) => revokePhotoPreviewUrls(photos));
    revokePhotoPreviewUrls(collisionPhotos);
    revokePhotoPreviewUrls(maintenanceRequestPhotos);
    clearMaintenanceFinalizePhotoDraft();
    clearMaintenanceRequestPhotoDraftState();
    clearExpensePhotoDraftState();
    clearReceivePhotoDraftState();
    clearCollisionPhotoDraftState();

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VOUCHER_DRAFTS_STORAGE_KEY);
    localStorage.removeItem(FINALIZE_DRAFT_ASSETS_STORAGE_KEY);
    localStorage.removeItem(SERVICE_OBSERVATION_DRAFTS_KEY);
    void clearMediaDraft();

    setStore(initialStore());
    setSelectedDetail(null);
    setScreen("inicio");
    setReceiptEntrySource("home");
    setVoucherDrafts({});
    setServiceObservationDrafts({});
    setReceiveProofs({});
    setReceiveUploadedCounts({});
    setExpensePhotos([]);
    setExpensePreviewPhotoId("");
    setCollisionDraft(createEmptyCollisionDraft());
    setCollisionPhotos([]);
    setCollisionPreviewPhotoId("");
    setMaintenanceRequestPhotos([]);
    setMaintenanceRequestPreviewPhotoId("");
    setMaintenanceExistingPreview(false);
    setMaintenanceRequestDraft({ ...EMPTY_MAINTENANCE_REQUEST_DRAFT });
    setExpenseDraft({ ...EMPTY_EXPENSE_DRAFT });
    resetExpenseQuickRead();
    setMaintenanceFinalizeDraft({ ...EMPTY_MAINTENANCE_FINALIZE_DRAFT });
    setPhotoDraft(null);
    setPhotoDraftPreviewUrl("");
    setPhotoDraftRawBlob(null);
    setPhotoDraftIsVideo(false);
    setRemoteOperation(null);
    setCriticalError("");
    setCompletingDetailKey("");
    setQueueHighlightDetailKey("");
    setToast("Dados locais resetados.");
  };

  const refreshLocal = async (detailToRefresh?: DetailData, options?: RefreshOptions) => {
    const silent = options?.silent === true;

    if (remoteMode) {
      if (!silent) {
        setDataLoadingState({
          phase: "loading",
          title: "Carregando dados",
          message: "Atualizando dados do Dataverse."
        });
      }
      try {
        const remote = await loadRemoteStore();
        setDriverContext(remote.driver);
        comunicadosDriverIdRef.current = remote.driver?.id ?? "";
        setStore((current) => ({ ...current, agenda: remote.agenda, history: remote.history }));
        try {
          await reloadComunicados();
        } catch (error) {
          reportAppError(error, { severity: "warning", source: "app", action: "loadDriverComunicados", phase: "refresh" });
          if (!silent) setToast("Não foi possível atualizar comunicados. Tente novamente.", "warning");
        }
        // Não recarrega com o formulário do checklist aberto: o motorista pode estar enviando fotos.
        if (screen !== "checklists" || !selectedChecklistId) {
          try {
            await reloadChecklists();
          } catch (error) {
            reportAppError(error, { severity: "warning", source: "app", action: "loadDriverChecklists", phase: "refresh" });
          }
        }
        if (detailToRefresh) {
          const refreshedDetail =
            findDetailByParams([...remote.agenda, ...remote.history], detailToRefresh.id, detailToRefresh.type) ??
            await loadRemoteDetailByParams(detailToRefresh.dataverse?.id ?? detailToRefresh.id, detailToRefresh.type);
          if (refreshedDetail) setSelectedDetail(refreshedDetail);
        }
        if (!silent) await completeDataLoadingState("Dados atualizados", "Dataverse sincronizado.");
      } catch (error) {
        if (!silent) setDataLoadingState(null);
        logAppError(error, "loadRemoteStore", "refresh");
        if (!silent || error instanceof Error) {
          setToast(error instanceof Error ? error.message : "Falha ao atualizar Dataverse.");
        }
      }
      return;
    }
    setStore((current) => ({ ...current }));
  };

  useEffect(() => {
    if (!remoteMode || remoteOperation || !shouldAutoRefreshScreen(screen)) return;

    let refreshing = false;
    const autoRefresh = () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      void refreshLocal(selectedDetail ?? undefined, { silent: true }).finally(() => { refreshing = false; });
    };

    const timer = window.setInterval(autoRefresh, AUTO_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", autoRefresh);
    window.addEventListener("pageshow", autoRefresh);
    document.addEventListener("visibilitychange", autoRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", autoRefresh);
      window.removeEventListener("pageshow", autoRefresh);
      document.removeEventListener("visibilitychange", autoRefresh);
    };
  }, [remoteMode, remoteOperation, screen, selectedDetail]);

  const blockIfNotFirstPending = (detail: typeof selectedDetail = selectedDetail) => {
    if (!detail) return true;
    if (detail.type !== "SERVICO") return false;
    const firstPendingDetail = findFirstPendingServiceDetail(store.agenda);
    if (!firstPendingDetail || isSameDetail(firstPendingDetail, detail)) return false;
    const firstPendingKey = `${firstPendingDetail.type}:${firstPendingDetail.id}`;
    if (queueHighlightTimerRef.current) window.clearTimeout(queueHighlightTimerRef.current);
    setQueueHighlightDetailKey(firstPendingKey);
    queueHighlightTimerRef.current = window.setTimeout(() => {
      setQueueHighlightDetailKey("");
      queueHighlightTimerRef.current = null;
    }, 3600);
    setToast("Conclua os itens anteriores da fila antes de prosseguir.");
    setScreen("servicos");
    return true;
  };

  const getServiceObservationDraft = (detail: DetailData | null) => detail ? serviceObservationDrafts[getDetailDraftKey(detail)] ?? "" : "";

  const saveSelectedServiceObservation = async (observation: string) => {
    if (!selectedDetail || selectedDetail.type !== "SERVICO") return;
    const draftKey = getDetailDraftKey(selectedDetail);
    setServiceObservationDrafts((current) => ({ ...current, [draftKey]: observation }));
    if (remoteMode) await saveServiceObservationRemote(selectedDetail, observation);
  };

  // Abre a escolha do carro e espera a resposta do motorista (null = voltou sem escolher).
  const askVehicleChoice = (resolution: InfleetVehicleResolution, loadFleet: () => Promise<FleetVehicle[]>) =>
    new Promise<DriverVehicleChoice | null>((resolve) => setVehicleChoiceRequest({ resolution, resolve, loadFleet }));

  const closeVehicleChoice = useCallback((choice: DriverVehicleChoice | null) => {
    setVehicleChoiceRequest((current) => {
      current?.resolve(choice);
      return null;
    });
  }, []);
  const cancelVehicleChoice = useCallback(() => closeVehicleChoice(null), [closeVehicleChoice]);

  const finalizeSelected = async (fields: Record<string, string>) => {
    if (!selectedDetail || remoteOperation) return;
    const detailToFinalize = selectedDetail;
    const agendaBeforeFinalize = store.agenda;
    const receiveProofCount = receiveProofs[detailToFinalize.id]?.length ?? 0;
    const finalFields =
      receiveProofCount > 0
        ? { ...fields, "Comprovantes de Recebimento": `${receiveProofCount} comprovante(s) anexado(s).` }
        : fields;
    const detailKey = `${detailToFinalize.type}:${detailToFinalize.id}`;
    const voucherDraftKey = getVoucherDraftKey(detailToFinalize);
    const isVoucher = detailToFinalize.type === "SERVICO" && ("Horario Inicial" in finalFields || "Horário Inicial" in finalFields);
    if (blockIfNotFirstPending(detailToFinalize)) return;

    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    if (completingClearTimerRef.current) window.clearTimeout(completingClearTimerRef.current);

    if (remoteMode) {
      const operationTitle =
        detailToFinalize.type === "SERVICO" && isVoucher
          ? "Enviando voucher"
          : detailToFinalize.type === "MANUTENCAO"
            ? "Enviando manutenção"
            : detailToFinalize.type === "TROCA"
              ? "Finalizando troca"
              : "Finalizando serviço";
      const setProgress = (message: string) => {
        setRemoteOperation({
          title: operationTitle,
          message,
          detailId: detailToFinalize.id,
          phase: "loading"
        });
      };
      const setSuccess = (message: string) => {
        setRemoteOperation({
          title: operationTitle,
          message,
          detailId: detailToFinalize.id,
          phase: "success"
        });
      };
      try {
        setProgress("Conferindo fila no Dataverse.");
        const remoteBeforeFinalize = await loadRemoteStore();
        const remoteFirstPendingDetail = detailToFinalize.type === "SERVICO"
          ? findFirstPendingServiceDetail(remoteBeforeFinalize.agenda)
          : undefined;
        setStore((current) => ({ ...current, agenda: remoteBeforeFinalize.agenda, history: remoteBeforeFinalize.history }));

        if (remoteFirstPendingDetail && !isSameDetail(remoteFirstPendingDetail, detailToFinalize)) {
          setRemoteOperation(null);
          setToast("Conclua os itens anteriores da fila antes de prosseguir.");
          setSelectedDetail(null);
          setScreen("servicos");
          return;
        }

        // Infleet decide o carro do serviço; abaixo de 85% o motorista escolhe. Falha da Infleet não bloqueia.
        let vehicleResolution: InfleetVehicleResolution | undefined;
        let vehicleChoice: DriverVehicleChoice | null = null;
        let skipVehicle = false;
        if (detailToFinalize.type === "SERVICO" && detailToFinalize.dataverse?.id) {
          setProgress("Conferindo o carro na Infleet.");
          const driver = driverContext ?? await getDriverContext();
          if (isThirdPartyDriver(driver?.funcionario)) {
            // Terceiro não usa a Infleet nem escolhe carro: a finalização não grava o veículo.
            skipVehicle = true;
          } else {
            vehicleResolution = await resolveServiceVehicleRemote(detailToFinalize.dataverse.id);
            if (needsDriverChoice(vehicleResolution)) {
              setRemoteOperation(null);
              vehicleChoice = await askVehicleChoice(vehicleResolution, loadActiveFleetRemote);
              if (!vehicleChoice) return;
              setProgress("Registrando o carro escolhido.");
            }
          }
        }

        const signatureDataUrl = store.signatures[detailToFinalize.id];
        const photos = store.photos[detailToFinalize.id];
        if (detailToFinalize.type === "SERVICO" && isVoucher) {
          await saveVoucherRemote({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress, vehicleResolution, vehicleChoice, skipVehicle });
        } else if (detailToFinalize.type === "SERVICO") {
          await finalizeServiceRemote({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress, vehicleResolution, vehicleChoice, skipVehicle });
        } else if (detailToFinalize.type === "MANUTENCAO") {
          await finalizeMaintenanceRemote({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress });
        } else if (detailToFinalize.type === "TROCA") {
          await finalizeExchangeRemote({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress });
        }
        setSuccess("Enviado com sucesso.");
        await wait(720);
      } catch (error) {
        logAppError(error, "finalizeSelected", detailToFinalize.type);
        setRemoteOperation(null);
        if (isVoucher) {
          setVoucherDrafts((current) => ({ ...current, [voucherDraftKey]: finalFields }));
        }
        if (detailToFinalize.type === "TROCA") setToast(exchangeUserError(error), "error");
        else setCriticalError(APP_OPERATION_ERROR_MESSAGE);
        return;
      }

      setStore((current) => {
        const signatures = { ...current.signatures };
        const photos = { ...current.photos };
        delete signatures[detailToFinalize.id];
        delete photos[detailToFinalize.id];
        return { ...current, signatures, photos };
      });
      setReceiveProofs((current) => {
        if (!current[detailToFinalize.id]) return current;
        const next = { ...current };
        delete next[detailToFinalize.id];
        return next;
      });
    } else if (detailToFinalize.type === "SERVICO") {
      // Mock local: simula a Infleet para testar a UI sem Dataverse. Cenário por ?mockInfleet=.
      const scenario = pickMockInfleetScenario(detailToFinalize.id);
      setRemoteOperation({ title: "Finalizando serviço", message: "Conferindo o carro na Infleet.", detailId: detailToFinalize.id, phase: "loading" });
      const resolution = await resolveMockServiceVehicle(scenario);
      setRemoteOperation(null);
      let choice: DriverVehicleChoice | null = null;
      if (needsDriverChoice(resolution)) {
        const loadMockFleet = createMockFleetLoader(scenario);
        // Terceiro sem carro cadastrado: a lista dele vem vazia e o diálogo oferece a frota ativa.
        choice = await askVehicleChoice(resolution, resolution.motivo === "motorista-terceiro"
          ? async () => {
              const mine = await loadMockFleet();
              return mine.length > 0 ? mine : MOCK_FLEET;
            }
          : loadMockFleet);
        if (!choice) return;
        if (resolution.motivo === "motorista-terceiro") choice = { ...choice, origem: "terceiro" };
      }
      const patch = buildInfleetServiceVehiclePatch(resolution, choice, (vehicleId) => vehicleId);
      const outcome = resolution.decisao === "automatico"
        ? `automático: ${resolution.escolhido?.placa} (${resolution.escolhido?.percentual}%)`
        : `escolhido pelo motorista (${choice?.origem === "frota" ? "frota" : choice?.origem === "terceiro" ? "carros do terceiro" : "carros da janela"}): ${choice?.placa}`;
      console.info("[mock Infleet]", scenario, patch);
      setToast(`Teste Infleet (${scenario}) · ${outcome}`, "success");
    }

    setCompletingDetailKey(detailKey);
    setVoucherDrafts((current) => {
      if (!current[voucherDraftKey]) return current;
      const next = { ...current };
      delete next[voucherDraftKey];
      return next;
    });
    if (detailToFinalize.type === "MANUTENCAO") {
      setMaintenanceFinalizeDraft({ serviceDone: "", value: "", payment: "", cidadeId: "", establishment: "", notes: "" });
    }
    setSelectedDetail(null);
    setScreen("servicos");

    finalizeTimerRef.current = window.setTimeout(() => {
      if (remoteMode) {
        setStore((current) => ({
          ...current,
          agenda: removeAgendaDetail(current.agenda, detailToFinalize)
        }));
      } else {
        setStore((current) => finalizeDetailLocally(current, detailToFinalize, finalFields));
        setReceiveProofs((current) => {
          if (!current[detailToFinalize.id]) return current;
          const next = { ...current };
          delete next[detailToFinalize.id];
          return next;
        });
        setReceiveUploadedCounts((current) => {
          if (!current[detailToFinalize.id]) return current;
          const next = { ...current };
          delete next[detailToFinalize.id];
          return next;
        });
      }
      setRemoteOperation(null);
      finalizeTimerRef.current = null;
      setCompletingDetailKey("");
      completingClearTimerRef.current = null;

      if (!remoteMode) return;

      void Promise.race([
        loadRemoteStore(),
        wait(8000).then(() => {
          throw new Error("Falha ao confirmar a atualização da agenda no Dataverse.");
        })
      ])
        .then((remote) => {
          setStore((current) => ({
            ...current,
            agenda: removeAgendaDetail(remote.agenda, detailToFinalize),
            history: remote.history
          }));
          setReceiveProofs((current) => {
            if (!current[detailToFinalize.id]) return current;
            const next = { ...current };
            delete next[detailToFinalize.id];
            return next;
          });
          setReceiveUploadedCounts((current) => {
            if (!current[detailToFinalize.id]) return current;
            const next = { ...current };
            delete next[detailToFinalize.id];
            return next;
          });
        })
        .catch((error) => {
          reportAppError(error, {
            source: "app", action: "finalizeSelected", phase: "confirm-agenda-after-finalize", screen: "servicos",
            detailId: detailToFinalize.id, detailType: detailToFinalize.type,
            payload: { dataverseId: detailToFinalize.dataverse?.id, timeoutMs: 8000, restoredToAgenda: true }, notifyUser: false
          });
          setStore((current) => ({
            ...current,
            agenda: current.agenda.some((item) => item.detail?.id === detailToFinalize.id && item.detail?.type === detailToFinalize.type)
              ? current.agenda
              : agendaBeforeFinalize
          }));
          setCriticalError(
            `${error instanceof Error ? error.message : "Falha ao atualizar a agenda."} O serviço voltou para a galeria. Finalize novamente.`
          );
        });
    }, 1650);
  };

  const cancelSelected = async (reason: string) => {
    if (!selectedDetail || remoteOperation) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setToast("Informe o motivo do cancelamento.");
      return;
    }
    const detailToCancel = selectedDetail;
    if (detailToCancel.type === "TROCA") {
      reportAppError(new Error("[FORBIDDEN_LIFECYCLE] Motorista não pode cancelar troca."), {
        severity: "warning",
        source: "app",
        action: "cancelSelected",
        detailId: detailToCancel.id,
        detailType: detailToCancel.type
      });
      setToast("Cancelamento de troca deve ser solicitado à Operação.", "warning");
      setScreen("servicos");
      return;
    }
    if (remoteMode) {
      try {
        setRemoteOperation({
          title: "Enviando cancelamento",
          message: "Atualizando status no Dataverse.",
          detailId: detailToCancel.id,
          phase: "loading"
        });
        await cancelServiceRemote(detailToCancel, trimmedReason);
        setRemoteOperation({
          title: "Enviando cancelamento",
          message: "Enviado com sucesso.",
          detailId: detailToCancel.id,
          phase: "success"
        });
        await wait(720);
        setSelectedDetail(null);
        setScreen("servicos");
        setToast("Cancelamento enviado para analise.");
        setReceiveProofs((current) => {
          if (!current[detailToCancel.id]) return current;
          const next = { ...current };
          delete next[detailToCancel.id];
          return next;
        });
        setReceiveUploadedCounts((current) => {
          if (!current[detailToCancel.id]) return current;
          const next = { ...current };
          delete next[detailToCancel.id];
          return next;
        });
        loadRemoteStore()
          .then((remote) => setStore((current) => ({ ...current, agenda: remote.agenda, history: remote.history })))
          .catch((error) => {
            reportAppError(error, {
              severity: "error",
              source: "app",
              action: "loadRemoteStore",
              phase: "after-cancel",
              screen: "servicos",
              detailId: detailToCancel.id,
              detailType: detailToCancel.type
            });
            setToast(error instanceof Error ? error.message : "Cancelado, mas falhou ao atualizar a agenda.");
          })
          .finally(() => {
            setRemoteOperation(null);
          });
        return;
      } catch (error) {
        logAppError(error, "cancelSelected", detailToCancel.type);
        setRemoteOperation(null);
        setToast(error instanceof Error ? error.message : "Falha ao cancelar no Dataverse.");
        return;
      }
    }
    const next = cancelDetailLocally(store, detailToCancel, trimmedReason);
    setStore(next);
    setReceiveProofs((current) => {
      if (!current[detailToCancel.id]) return current;
      const copy = { ...current };
      delete copy[detailToCancel.id];
      return copy;
    });
    setReceiveUploadedCounts((current) => {
      if (!current[detailToCancel.id]) return current;
      const copy = { ...current };
      delete copy[detailToCancel.id];
      return copy;
    });
    setSelectedDetail(null);
    setScreen("servicos");
    setToast("Cancelado localmente.");
  };

  const saveVoucherDraft = (fields: Record<string, string>) => {
    if (!selectedDetail || selectedDetail.type !== "SERVICO") return;
    const detail = selectedDetail;
    setVoucherDrafts((current) => {
      const draftKey = getVoucherDraftKey(detail);
      if (Object.keys(fields).length === 0) {
        if (!current[draftKey]) return current;
        const next = { ...current };
        delete next[draftKey];
        return next;
      }
      return {
        ...current,
        [draftKey]: fields
      };
    });

    if (!remoteMode) return;
    if (voucherDraftTimerRef.current) window.clearTimeout(voucherDraftTimerRef.current);
    voucherDraftTimerRef.current = window.setTimeout(() => {
      saveVoucherDraftRemote(detail, fields).catch((error) => {
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "saveVoucherDraftRemote",
          phase: "debounced-save",
          screen: "voucher",
          detailId: detail.id,
          detailType: detail.type
        });
        setToast(error instanceof Error ? error.message : "Falha ao salvar rascunho do voucher.");
      });
    }, 450);
  };

  const isExpenseDraftBlank = (draft: ExpenseDraft) =>
    !draft.categoriaId && !draft.veiculoId && !draft.valor && !draft.formaPagamentoId && !draft.cidadeId &&
    !draft.estabelecimento && !draft.descricao && !draft.kmInformado && !draft.litros && !expenseDateTouchedRef.current;

  const navigateFromInitial = (screenName: string) => {
    // Pending sends that need the driver go first; otherwise open the camera straight away.
    if (screenName === "gastos" && !expenseUploadStatuses.length && expensePhotos.length === 0 && isExpenseDraftBlank(expenseDraft)) {
      setComunicadoOrigin("");
      openExpenseCamera();
      return;
    }
    if (screenName === "personalReceipt" || screenName === "reciboPersonalizado" || screenName === "gerarReciboPersonalizado") {
      openPersonalReceiptFromHome();
      return;
    }
    if (screenName === "checklists") {
      setChecklistOrigin("");
      setSelectedChecklistId("");
      setScreen("checklists");
      return;
    }
    if (screenName === "servicos" || screenName === "comunicados" || screenName === "historico" || screenName === "solicitarManutencao" || screenName === "gastos" || screenName === "colisoesInicio" || screenName === "boasIdeias" || screenName === "meuCarro") {
      setComunicadoOrigin("");
      setScreen(screenName);
    }
  };

  const setExpenseRunning = (expenseId: string, running: boolean) => {
    if (running) expenseRunningRef.current.add(expenseId); else expenseRunningRef.current.delete(expenseId);
    setExpenseRunningIds([...expenseRunningRef.current]);
  };

  // Whole remote pipeline for one journaled expense; safe to repeat because IDs are reused.
  const runExpenseSubmission = async (submission: ExpenseSubmission, motoristaId: string, retryFailed: boolean, onProgress?: (event: ExpenseSubmissionProgress) => void) => {
    if (expenseRunningRef.current.has(submission.expenseId)) return false;
    setExpenseRunning(submission.expenseId, true);
    let rows: ExpenseUploadRow[];
    try {
      if (!Object.keys(submission.payload).length) {
        await assertExpenseSchemaReadyRemote();
        const names = await loadExpenseLookupNavigationNamesRemote({ includeVeiculo: Boolean(submission.vehicleId), includeReserva: false });
        submission.payload = buildExpenseCreatePayload({
          draft: submission.draft, referenceData: await loadExpenseReferenceDataRemote(), motoristaId, veiculoId: submission.vehicleId ?? "",
          photos: submission.items.map(item => ({ id: item.id, dataUrl: item.dataUrl, mediaType: item.mimeType.startsWith("video/") ? "video" : "foto" })),
          categoryEntitySet: DATAVERSE.categoriasDespesasOperacionais, paymentMethodEntitySet: DATAVERSE.formasPagamentoDespesas,
          cityEntitySet: DATAVERSE.cidades, motoristaEntitySet: DATAVERSE.funcionarios, veiculoEntitySet: DATAVERSE.veiculos,
          reservaEntitySet: DATAVERSE.geral, lookupNavigationNames: names
        });
      }
      rows = await resumeExpenseSubmission(submission, {
        save: value => upsertExpenseSubmission(motoristaId, value),
        ensure: ensureExpenseSubmissionRemote,
        loadRows: loadExpenseUploadRowsRemote,
        retry: (id, attempt, next) => transitionExpenseUploadRemote({ action: "retry", attachmentId: id, attemptId: attempt, nextAttemptId: next }),
        dispatch: dispatchExpenseUploadRemote,
        report: (error, attachmentId, attemptId) => reportAppError(error, { severity: "warning", source: "app", action: "expenseUpload", phase: "acceptanceUnknown", screen: "gastos", detailId: submission.expenseId, payload: { attachmentId, attemptId } }),
        progress: onProgress
      }, retryFailed);
    } catch (error) {
      reportAppError(error, { severity: "warning", source: "app", action: "expenseUpload", phase: "background", screen: "gastos", detailId: submission.expenseId });
      if (!onProgress && !expenseNoticeRef.current.has(`offline:${submission.expenseId}`)) {
        expenseNoticeRef.current.add(`offline:${submission.expenseId}`);
        setToast("Não deu para enviar o gasto agora. O app tenta de novo sozinho.", "warning");
      }
      return false;
    } finally {
      setExpenseRunning(submission.expenseId, false);
    }
    setExpenseUploadRows(current => ({ ...current, [submission.expenseId]: rows }));
    const state = describeExpenseSubmission(submission, rows).state;
    return state === "processing" || state === "complete";
  };

  // The driver waits only until the server accepts the photos; storing them in
  // OneDrive continues in background and is followed silently.
  const submitExpenseAsync = async (draft: ExpenseDraft) => {
    if (expenseSubmitBusyRef.current || !expenseUploadReady || !driverContext) return;
    expenseSubmitBusyRef.current = true;
    let journaled = false;
    try {
      const photos = await Promise.all(expensePhotos.filter(hasMediaDraftContent).map(prepareMediaDraftForUpload));
      const submission: ExpenseSubmission = {
        expenseId: crypto.randomUUID(), expenseConfirmed: false, draft: { ...draft }, payload: {}, motoristaId: driverContext.id,
        vehicleId: draft.veiculoId || getDriverCurrentVehicleId(driverContext),
        items: photos.map((photo, index) => createExpenseUploadItem(photo.dataUrl, index + 1))
      };
      const total = submission.items.length;
      setExpenseSend({ phase: "saving", current: 0, total });
      // Never send anything until the durable journal succeeds.
      await upsertExpenseSubmission(driverContext.id, submission);
      journaled = true;
      expenseAutoResumeAtRef.current.set(submission.expenseId, Date.now());
      const accepted = await runExpenseSubmission(submission, driverContext.id, false, event => {
        if (event.phase === "uploading") setExpenseSend({ phase: "uploading", current: event.order, total });
      });
      // The journal owns the expense from here; an empty form avoids a duplicate.
      const clearForm = () => {
        revokePhotoPreviewUrls(expensePhotos);
        setExpensePhotos([]);
        setExpensePreviewPhotoId("");
        setExpenseDraft({ ...EMPTY_EXPENSE_DRAFT, dataGasto: new Date().toISOString().slice(0, 10) });
        resetExpenseQuickRead();
      };
      if (!accepted) {
        clearForm();
        setExpenseSend({ phase: "error", current: 0, total });
        return;
      }
      setExpenseSend({ phase: "done", current: total, total });
      await wait(1100);
      clearForm();
      setExpenseSend(null);
      setScreen("inicio");
    } catch (error) {
      reportAppError(error, { source: "app", action: "expenseUpload", phase: "journal", screen: "gastos" });
      setExpenseSend(null);
      setToast(journaled ? "O gasto ficou salvo no celular e será enviado sozinho." : "Não foi possível salvar o gasto neste aparelho. Toque em Registrar de novo.", journaled ? "warning" : "error");
    } finally {
      expenseSubmitBusyRef.current = false;
    }
  };

  const closeExpenseSendError = () => {
    setExpenseSend(null);
    setScreen("inicio");
  };

  const handleExpenseUploadAction = async (expenseId: string) => {
    const submission = expenseSubmissionsRef.current.find(item => item.expenseId === expenseId);
    if (!submission || !driverContext || expenseRunningRef.current.has(expenseId)) return;
    const action = describeExpenseSubmission(submission, expenseUploadRows[expenseId] ?? []).action;
    if (!action) return;
    if (action !== "verify") {
      expenseNoticeRef.current.delete(expenseId);
      expenseAutoResumeAtRef.current.set(expenseId, Date.now());
      void runExpenseSubmission(submission, driverContext.id, action === "retry");
      return;
    }
    void verifyExpenseUpload(submission, true);
  };

  const verifyExpenseUpload = async (submission: ExpenseSubmission, announceError: boolean) => {
    const expenseId = submission.expenseId;
    if (expenseRunningRef.current.has(expenseId)) return;
    setExpenseRunning(expenseId, true);
    try {
      // An explicit user action may close an unclaimed attempt. A claimed run
      // is protected by the server's row version and continues processing.
      const current = await loadExpenseUploadRowsRemote(expenseId);
      for (const item of submission.items) {
        if (current.some(row => row.cr40f_anexodespesaoperacionalid === item.id && row.new_uploadattemptid === item.attemptId && row.cr40f_status === 100000000)) {
          await transitionExpenseUploadRemote({ action: "cancelUnclaimed", attachmentId: item.id, attemptId: item.attemptId });
        }
      }
      const rows = await loadExpenseUploadRowsRemote(expenseId);
      setExpenseUploadRows(previous => ({ ...previous, [expenseId]: rows }));
    } catch (error) {
      reportAppError(error, { severity: "warning", source: "app", action: "expenseUpload", phase: "verify", screen: "gastos", detailId: expenseId });
      if (announceError) setToast("Não deu para consultar o envio agora. Tente de novo em instantes.", "warning");
    } finally {
      setExpenseRunning(expenseId, false);
    }
  };
  expenseWorkerRef.current = { run: runExpenseSubmission, verify: verifyExpenseUpload };

  const submitExpense = async (draft: ExpenseDraft) => {
    if (remoteMode && expenseUploadMode === "async") return submitExpenseAsync(draft);
    if (remoteOperation || (remoteMode && expenseUploadMode === "pending")) return;
    if (!remoteMode) {
      setToast("Abra no Power Apps para registrar no Dataverse.");
      return;
    }

    let createdExpenseId = "";
    try {
      setRemoteOperation({
        title: "Registrando gasto",
        message: "Identificando motorista.",
        phase: "loading"
      });
      const driver = driverContext ?? await getDriverContext();
      const veiculoId = draft.veiculoId || getDriverCurrentVehicleId(driver);
      const photosToSubmit = expensePhotos.filter((photo) => hasMediaDraftContent(photo));
      setRemoteOperation({
        title: "Registrando gasto",
        message: "Conferindo schema do Dataverse.",
        phase: "loading"
      });
      await assertExpenseSchemaReadyRemote();
      setRemoteOperation({
        title: "Registrando gasto",
        message: "Preparando arquivos do comprovante.",
        phase: "loading"
      });
      const preparedPhotosToSubmit = await Promise.all(photosToSubmit.map((photo) => prepareMediaDraftForUpload(photo)));
      const lookupNavigationNames = await loadExpenseLookupNavigationNamesRemote({
        includeVeiculo: Boolean(draft.veiculoId || veiculoId),
        includeReserva: false
      });
      setRemoteOperation({
        title: "Registrando gasto",
        message: "Criando despesa.",
        phase: "loading"
      });
      const payload = buildExpenseCreatePayload({
        draft,
        photos: preparedPhotosToSubmit,
        referenceData: expenseReferenceData,
        motoristaId: driver.id,
        veiculoId,
        categoryEntitySet: DATAVERSE.categoriasDespesasOperacionais,
        paymentMethodEntitySet: DATAVERSE.formasPagamentoDespesas,
        cityEntitySet: DATAVERSE.cidades,
        motoristaEntitySet: DATAVERSE.funcionarios,
        veiculoEntitySet: DATAVERSE.veiculos,
        reservaEntitySet: DATAVERSE.geral,
        lookupNavigationNames
      });
      const result = await createOne(DATAVERSE.despesasOperacionais, payload);
      createdExpenseId = result.id;
      if (preparedPhotosToSubmit.length) {
        let completedUploads = 0;
        setRemoteOperation({
          title: "Registrando gasto",
          message: `Enviando ${preparedPhotosToSubmit.length} arquivo(s) em paralelo (0/${preparedPhotosToSubmit.length}).`,
          detailId: result.id,
          phase: "loading"
        });
        const uploadResults = await Promise.allSettled(preparedPhotosToSubmit.map(async (photo, index) => {
          const link = await uploadExpenseInvoiceRemote({
            expenseId: result.id,
            expenseName: String(payload.cr40f_nome ?? "Despesa"),
            motoristaId: driver.id,
            dataUrl: photo.dataUrl,
            fileName: photo.mediaType === "video" ? `video-comprovante-${index + 1}` : `comprovante-${index + 1}`,
            order: index + 1,
            onProgress: (message) => setRemoteOperation({
              title: "Registrando gasto",
              message: `Uploads paralelos: ${message}`,
              detailId: result.id,
              phase: "loading"
            })
          });
          completedUploads += 1;
          setRemoteOperation({
            title: "Registrando gasto",
            message: `Uploads paralelos concluídos (${completedUploads}/${preparedPhotosToSubmit.length}).`,
            detailId: result.id,
            phase: "loading"
          });
          return link;
        }));
        const failedUploads = uploadResults.filter((uploadResult) => uploadResult.status === "rejected").length;
        if (failedUploads) {
          throw new Error(`Despesa criada, mas ${failedUploads} de ${preparedPhotosToSubmit.length} arquivo(s) falharam no upload.`);
        }
      }
      if (preparedPhotosToSubmit.length) {
        await updateOne(DATAVERSE.despesasOperacionais, result.id, { cr40f_statusanexo: 100000002 });
      }
      setRemoteOperation({
        title: "Registrando gasto",
        message: "Despesa registrada.",
        detailId: result.id,
        phase: "success"
      });
      await wait(720);
      setRemoteOperation(null);
      revokePhotoPreviewUrls(expensePhotos);
      setExpenseDraft({
        categoriaId: "",
        veiculoId: "",
        valor: "",
        dataGasto: new Date().toISOString().slice(0, 10),
        formaPagamentoId: "",
        cidadeId: "",
        estabelecimento: "",
        descricao: "",
        kmInformado: "",
        litros: ""
      });
      resetExpenseQuickRead();
      setExpensePhotos([]);
      clearExpensePhotoDraftState();
      setExpensePreviewPhotoId("");
      setScreen("inicio");
      setToast("Gasto registrado.");
    } catch (error) {
      if (createdExpenseId) {
        try {
          await updateOne(DATAVERSE.despesasOperacionais, createdExpenseId, { cr40f_statusanexo: 100000003 });
        } catch (statusError) {
          logAppError(statusError, "submitExpense", "statusanexo");
        }
      }
      logAppError(error, "submitExpense", "create");
      setRemoteOperation(null);
      setCriticalError(error instanceof Error ? error.message : "Falha ao registrar gasto.");
    }
  };

  const submitCollision = async (draft: CollisionDraft) => {
    if (remoteOperation) return;
    if (!remoteMode) {
      setToast("Abra no Power Apps para registrar no Dataverse.");
      return;
    }

    let createdCollisionId = "";
    let uploadedCount = 0;
    try {
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Identificando motorista.",
        phase: "loading"
      });
      const driver = driverContext ?? await getDriverContext();
      const veiculoId = draft.veiculoId || getDriverCurrentVehicleId(driver);
      const collisionHasThirdParty = hasCollisionThirdParty(draft);
      const photosToSubmit = collisionPhotos.filter((photo) =>
        hasMediaDraftContent(photo) &&
        (collisionHasThirdParty || (photo.kind !== "danoTerceiro" && photo.kind !== "documentoTerceiro"))
      );
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Conferindo schema do Dataverse.",
        phase: "loading"
      });
      await assertCollisionSchemaReadyRemote();
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Preparando evidências.",
        phase: "loading"
      });
      const preparedPhotosToSubmit = await Promise.all(photosToSubmit.map((photo) => prepareMediaDraftForUpload(photo)));
      const lookupNavigationNames = await loadCollisionLookupNavigationNamesRemote();
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Criando ocorrência.",
        phase: "loading"
      });
      const payload = buildCollisionCreatePayload({
        draft,
        photos: preparedPhotosToSubmit,
        motoristaId: driver.id,
        veiculoId,
        motoristaEntitySet: DATAVERSE.funcionarios,
        veiculoEntitySet: DATAVERSE.veiculos,
        lookupNavigationNames
      });
      const result = await createOne(DATAVERSE.colisoes, payload);
      createdCollisionId = result.id;
      const collisionName = String(payload.cr40f_nome ?? "Colisão");
      if (preparedPhotosToSubmit.length) {
        setRemoteOperation({
          title: "Registrando colisão",
          message: `Enviando ${preparedPhotosToSubmit.length} arquivo(s) em paralelo (0/${preparedPhotosToSubmit.length}).`,
          detailId: result.id,
          phase: "loading"
        });
        const uploadResults = await Promise.allSettled(preparedPhotosToSubmit.map(async (photo, index) => {
          const link = await uploadCollisionPhotoRemote({
            collisionId: result.id,
            collisionName,
            motoristaId: driver.id,
            dataUrl: photo.dataUrl,
            kind: photo.kind,
            order: index + 1,
            onProgress: (message) => setRemoteOperation({
              title: "Registrando colisão",
              message: `Uploads paralelos: ${message}`,
              detailId: result.id,
              phase: "loading"
            })
          });
          uploadedCount += 1;
          setRemoteOperation({
            title: "Registrando colisão",
            message: `Uploads paralelos concluídos (${uploadedCount}/${preparedPhotosToSubmit.length}).`,
            detailId: result.id,
            phase: "loading"
          });
          return link;
        }));
        const failedUploads = uploadResults.filter((uploadResult) => uploadResult.status === "rejected").length;
        if (failedUploads) {
          throw new Error(`Colisão criada, mas ${failedUploads} de ${preparedPhotosToSubmit.length} arquivo(s) falharam no upload.`);
        }
      }
      if (preparedPhotosToSubmit.length) {
        await updateOne(DATAVERSE.colisoes, result.id, { cr40f_statusanexo: COLLISION_ATTACHMENT_STATUS.completo });
      }
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Colisão registrada.",
        detailId: result.id,
        phase: "success"
      });
      await wait(720);
      setRemoteOperation(null);
      revokePhotoPreviewUrls(collisionPhotos);
      setCollisionDraft(createEmptyCollisionDraft());
      setCollisionPhotos([]);
      clearCollisionPhotoDraftState();
      setCollisionPreviewPhotoId("");
      setScreen("inicio");
      setToast("Colisão registrada.");
    } catch (error) {
      if (createdCollisionId) {
        try {
          await updateOne(DATAVERSE.colisoes, createdCollisionId, {
            cr40f_statusanexo: uploadedCount > 0 ? COLLISION_ATTACHMENT_STATUS.parcial : COLLISION_ATTACHMENT_STATUS.falhou
          });
        } catch (statusError) {
          logAppError(statusError, "submitCollision", "statusanexo");
        }
      }
      logAppError(error, "submitCollision", "create");
      setRemoteOperation(null);
      setCriticalError(error instanceof Error ? error.message : "Falha ao registrar colisão.");
    }
  };

  const submitMaintenanceRequest = async (fields: MaintenanceRequestFields) => {
    if (remoteOperation) return;
    if (!remoteMode) {
      setToast("Abra no Power Apps para enviar ao Dataverse.");
      return;
    }

    try {
      setRemoteOperation({
        title: "Solicitando manutenção",
        message: "Identificando motorista.",
        phase: "loading"
      });
      const driver = await getDriverContext();
      setRemoteOperation({
        title: "Solicitando manutenção",
        message: "Criando ordem de manutenção.",
        phase: "loading"
      });
      const preparedPhotos = await Promise.all(
        maintenanceRequestPhotos.filter((photo) => hasMediaDraftContent(photo)).map((photo) => prepareMediaDraftForUpload(photo))
      );
      const result = await createMaintenanceRequestRemote({
        descricao: fields.descricao,
        kmAtual: fields.kmAtual,
        veiculoId: fields.veiculoId,
        motoristaId: driver.id,
        gravidade: fields.gravidade,
        photos: preparedPhotos.map((photo) => photo.dataUrl),
        onProgress: (message) => setRemoteOperation({
          title: "Solicitando manutenção",
          message,
          phase: "loading"
        })
      });
      setRemoteOperation({
        title: "Solicitando manutenção",
        message: "Solicitação enviada.",
        detailId: result.id,
        phase: "success"
      });
      await wait(720);
      setRemoteOperation(null);
      revokePhotoPreviewUrls(maintenanceRequestPhotos);
      setMaintenanceRequestDraft({ descricao: "", kmAtual: "", veiculoId: maintenanceCurrentVehicleId, gravidade: "" });
      setMaintenanceRequestPhotos([]);
      clearMaintenanceRequestPhotoDraftState();
      setScreen("inicio");
      setToast("Solicitação enviada para aprovação.");
    } catch (error) {
      logAppError(error, "submitMaintenanceRequest", "create");
      setRemoteOperation(null);
      setCriticalError(error instanceof Error ? error.message : "Falha ao solicitar manutenção.");
    }
  };

  const openMaintenanceRequestCamera = () => {
    clearMaintenanceRequestPhotoDraftState();
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("fotoSolicitacaoManutencao");
  };

  const openMaintenanceRequestVideoPreview = (video: CapturedVideoDraft) => {
    setMaintenanceRequestPhotoDraft("");
    setMaintenanceRequestPhotoPreviewUrl(video.previewUrl);
    setMaintenanceRequestPhotoPosterUrl(video.posterUrl ?? "");
    setMaintenanceRequestPhotoDurationLabel(video.durationLabel ?? "");
    setMaintenanceRequestPhotoRawBlob(video.rawBlob);
    setMaintenanceRequestPhotoIsVideo(true);
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("previewFotoSolicitacaoManutencao");
  };

  const openMaintenanceRequestPreview = (photoId: string) => {
    const photo = maintenanceRequestPhotos.find((item) => item.id === photoId);
    if (!photo) return;
    setMaintenanceRequestPhotoDraft(photo.dataUrl);
    setMaintenanceRequestPhotoPreviewUrl(photo.previewUrl ?? "");
    setMaintenanceRequestPhotoPosterUrl(photo.posterUrl ?? "");
    setMaintenanceRequestPhotoDurationLabel(photo.durationLabel ?? "");
    setMaintenanceRequestPhotoRawBlob(photo.rawBlob ?? null);
    setMaintenanceRequestPhotoIsVideo(isVideoMediaDraft(photo.dataUrl, photo.rawBlob));
    setMaintenanceRequestPreviewPhotoId(photoId);
    setScreen("previewFotoSolicitacaoManutencao");
  };

  const confirmMaintenanceRequestPhoto = () => {
    if (!hasMediaDraftContent({ dataUrl: maintenanceRequestPhotoDraft, rawBlob: maintenanceRequestPhotoRawBlob, mediaType: maintenanceRequestPhotoIsVideo ? "video" : "foto" })) {
      return setScreen("solicitarManutencao");
    }
    if (maintenanceRequestPreviewPhotoId) {
      setMaintenanceRequestPhotos((current) =>
        current.map((photo) => {
          if (photo.id !== maintenanceRequestPreviewPhotoId) return photo;
          if (photo.previewUrl && photo.previewUrl !== (maintenanceRequestPhotoPreviewUrl || undefined)) revokePreviewUrl(photo.previewUrl);
          return {
            ...photo,
            dataUrl: maintenanceRequestPhotoDraft,
            previewUrl: maintenanceRequestPhotoPreviewUrl || undefined,
            posterUrl: maintenanceRequestPhotoPosterUrl || undefined,
            durationLabel: maintenanceRequestPhotoDurationLabel || undefined,
            mediaType: maintenanceRequestPhotoIsVideo ? "video" : "foto",
            rawBlob: maintenanceRequestPhotoIsVideo ? maintenanceRequestPhotoRawBlob ?? undefined : undefined
          };
        })
      );
    } else {
      setMaintenanceRequestPhotos((current) => [
        ...current,
        {
          id: `request-photo-${Date.now()}-${current.length + 1}`,
          dataUrl: maintenanceRequestPhotoDraft,
          previewUrl: maintenanceRequestPhotoPreviewUrl || undefined,
          posterUrl: maintenanceRequestPhotoPosterUrl || undefined,
          durationLabel: maintenanceRequestPhotoDurationLabel || undefined,
          mediaType: maintenanceRequestPhotoIsVideo ? "video" : "foto",
          rawBlob: maintenanceRequestPhotoIsVideo ? maintenanceRequestPhotoRawBlob ?? undefined : undefined
        }
      ]);
    }
    clearMaintenanceRequestPhotoDraftState(true);
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("solicitarManutencao");
  };

  const deleteMaintenanceRequestPhoto = () => {
    if (maintenanceRequestPreviewPhotoId) {
      setMaintenanceRequestPhotos((current) => {
        const removed = current.find((photo) => photo.id === maintenanceRequestPreviewPhotoId);
        revokePreviewUrl(removed?.previewUrl);
        return current.filter((photo) => photo.id !== maintenanceRequestPreviewPhotoId);
      });
    }
    clearMaintenanceRequestPhotoDraftState();
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("solicitarManutencao");
  };

  function resetExpenseQuickRead() {
    expenseQuickReadSeqRef.current++;
    expenseRetakeTargetIdRef.current = "";
    expenseDateTouchedRef.current = false;
    setExpenseQuickRead(INITIAL_QUICK_READ);
    setExpenseQuickReadPhoto("");
    setExpenseQuickReadFilling(false);
    setExpenseQuickReadFilled({});
  }

  const runExpenseQuickRead = async (dataUrl: string) => {
    const mockMode = remoteMode ? null : getQuickReadMockMode();
    if ((!remoteMode && !mockMode) || !shouldRunQuickRead(expenseQuickRead)) return;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const started = startQuickReadState(expenseQuickRead, { online });
    setExpenseQuickRead(started);
    if (started.status !== "lendo") return;
    const seq = ++expenseQuickReadSeqRef.current;
    setExpenseQuickReadPhoto(dataUrl);
    setExpenseQuickReadFilling(false);
    const { outcome, referenceData } = await runQuickReadPipeline({
      referenceData: expenseReferenceData,
      isReferenceReady: mockMode ? (data) => data.categories.length > 0 && data.paymentMethods.length > 0 : hasRemoteReferenceData,
      loadReferenceData: mockMode ? async () => DEFAULT_EXPENSE_REFERENCE_DATA : loadExpenseReferenceDataRemote,
      prepareImage: () => downscaleForQuickRead(dataUrl),
      read: mockMode ? (_base64, categorias, formas, timeoutMs) => readReceiptQuickMock(mockMode, categorias, formas, timeoutMs) : readReceiptQuick
    });
    if (seq !== expenseQuickReadSeqRef.current) return;
    if (referenceData && referenceData !== expenseReferenceData) setExpenseReferenceData(referenceData);
    if (outcome.kind === "lido" && referenceData) {
      setExpenseQuickReadFilling(true);
      await new Promise((resolve) => window.setTimeout(resolve, QUICK_READ_FILL_STEP_MS));
      if (seq !== expenseQuickReadSeqRef.current) return;
      const before = expenseDraftRef.current;
      const { draft: after, filled } = applyQuickRead(before, outcome.leitura, referenceData, { replaceAutoDate: !expenseDateTouchedRef.current });
      setExpenseDraft(after);
      setExpenseQuickReadFilled(filled);
    }
    setExpenseQuickReadFilling(false);
    setExpenseQuickRead((current) => nextQuickReadState(current, outcome));
  };

  /** Sai da tela de leitura: ignora a resposta que ainda vier e segue para o preenchimento manual. */
  const cancelExpenseQuickRead = () => {
    expenseQuickReadSeqRef.current++;
    setExpenseQuickReadFilling(false);
    setExpenseQuickRead((current) => ({ ...current, status: "manual" }));
  };

  const retakeQuickReadPhoto = () => {
    const targetId = expensePhotos[0]?.id ?? "";
    openExpenseCamera();
    expenseRetakeTargetIdRef.current = targetId;
  };

  const openExpenseCamera = () => {
    expenseRetakeTargetIdRef.current = "";
    clearExpensePhotoDraftState();
    setExpensePreviewPhotoId("");
    setScreen("fotoGasto");
  };

  const openExpenseVideoPreview = (video: CapturedVideoDraft) => {
    setExpensePhotoDraft("");
    setExpensePhotoPreviewUrl(video.previewUrl);
    setExpensePhotoPosterUrl(video.posterUrl ?? "");
    setExpensePhotoDurationLabel(video.durationLabel ?? "");
    setExpensePhotoRawBlob(video.rawBlob);
    setExpensePhotoIsVideo(true);
    setExpensePreviewPhotoId("");
    setScreen("previewFotoGasto");
  };

  const openExpensePreview = (photoId: string) => {
    const photo = expensePhotos.find((item) => item.id === photoId);
    if (!photo) return;
    setExpensePhotoDraft(photo.dataUrl);
    setExpensePhotoPreviewUrl(photo.previewUrl ?? "");
    setExpensePhotoPosterUrl(photo.posterUrl ?? "");
    setExpensePhotoDurationLabel(photo.durationLabel ?? "");
    setExpensePhotoRawBlob(photo.rawBlob ?? null);
    setExpensePhotoIsVideo(isVideoMediaDraft(photo.dataUrl, photo.rawBlob));
    setExpensePreviewPhotoId(photoId);
    setScreen("previewFotoGasto");
  };

  const confirmExpensePhoto = () => {
    const retakeTargetId = expenseRetakeTargetIdRef.current;
    expenseRetakeTargetIdRef.current = "";
    const isNewPhoto = !expensePreviewPhotoId;
    const retaking = isNewPhoto && Boolean(retakeTargetId) && expensePhotos.some((photo) => photo.id === retakeTargetId);
    const shouldQuickRead = isNewPhoto && !expensePhotoIsVideo && Boolean(expensePhotoDraft) && (expensePhotos.length === 0 || retaking);
    const quickReadDataUrl = expensePhotoDraft;
    if (!hasMediaDraftContent({ dataUrl: expensePhotoDraft, rawBlob: expensePhotoRawBlob, mediaType: expensePhotoIsVideo ? "video" : "foto" })) {
      return setScreen("gastos");
    }
    if (expensePreviewPhotoId) {
      setExpensePhotos((current) =>
        current.map((photo) => {
          if (photo.id !== expensePreviewPhotoId) return photo;
          if (photo.previewUrl && photo.previewUrl !== (expensePhotoPreviewUrl || undefined)) revokePreviewUrl(photo.previewUrl);
          return {
            ...photo,
            dataUrl: expensePhotoDraft,
            previewUrl: expensePhotoPreviewUrl || undefined,
            posterUrl: expensePhotoPosterUrl || undefined,
            durationLabel: expensePhotoDurationLabel || undefined,
            mediaType: expensePhotoIsVideo ? "video" : "foto",
            rawBlob: expensePhotoIsVideo ? expensePhotoRawBlob ?? undefined : undefined
          };
        })
      );
    } else if (retaking) {
      setExpensePhotos((current) =>
        current.map((photo) => {
          if (photo.id !== retakeTargetId) return photo;
          if (photo.previewUrl && photo.previewUrl !== (expensePhotoPreviewUrl || undefined)) revokePreviewUrl(photo.previewUrl);
          return {
            ...photo,
            dataUrl: expensePhotoDraft,
            previewUrl: expensePhotoPreviewUrl || undefined,
            posterUrl: expensePhotoPosterUrl || undefined,
            durationLabel: expensePhotoDurationLabel || undefined,
            mediaType: expensePhotoIsVideo ? "video" : "foto",
            rawBlob: expensePhotoIsVideo ? expensePhotoRawBlob ?? undefined : undefined
          };
        })
      );
    } else {
      setExpensePhotos((current) => [
        ...current,
        {
          id: `expense-photo-${Date.now()}-${current.length + 1}`,
          dataUrl: expensePhotoDraft,
          previewUrl: expensePhotoPreviewUrl || undefined,
          posterUrl: expensePhotoPosterUrl || undefined,
          durationLabel: expensePhotoDurationLabel || undefined,
          mediaType: expensePhotoIsVideo ? "video" : "foto",
          rawBlob: expensePhotoIsVideo ? expensePhotoRawBlob ?? undefined : undefined
        }
      ]);
    }
    clearExpensePhotoDraftState(true);
    setExpensePreviewPhotoId("");
    setScreen("gastos");
    if (shouldQuickRead) void runExpenseQuickRead(quickReadDataUrl);
  };

  const deleteExpensePhoto = () => {
    if (expensePreviewPhotoId) {
      setExpensePhotos((current) => {
        const removed = current.find((photo) => photo.id === expensePreviewPhotoId);
        revokePreviewUrl(removed?.previewUrl);
        return current.filter((photo) => photo.id !== expensePreviewPhotoId);
      });
    }
    clearExpensePhotoDraftState();
    setExpensePreviewPhotoId("");
    setScreen("gastos");
  };

  const openReceiveCamera = () => {
    clearReceivePhotoDraftState();
    setReceivePreviewPhotoId("");
    setScreen("fotoReceber");
  };

  const openReceiveVideoPreview = (video: CapturedVideoDraft) => {
    setReceivePhotoDraft("");
    setReceivePhotoPreviewUrl(video.previewUrl);
    setReceivePhotoPosterUrl(video.posterUrl ?? "");
    setReceivePhotoDurationLabel(video.durationLabel ?? "");
    setReceivePhotoRawBlob(video.rawBlob);
    setReceivePhotoIsVideo(true);
    setReceivePreviewPhotoId("");
    setScreen("previewFotoReceber");
  };

  const openReceivePreview = (photoId: string) => {
    if (!selectedDetail) return;
    const photo = receiveProofs[selectedDetail.id]?.find((item) => item.id === photoId);
    if (!photo) return;
    setReceivePhotoDraft(photo.dataUrl);
    setReceivePhotoPreviewUrl(photo.previewUrl ?? "");
    setReceivePhotoPosterUrl(photo.posterUrl ?? "");
    setReceivePhotoDurationLabel(photo.durationLabel ?? "");
    setReceivePhotoRawBlob(photo.rawBlob ?? null);
    setReceivePhotoIsVideo(isVideoMediaDraft(photo.dataUrl, photo.rawBlob));
    setReceivePreviewPhotoId(photoId);
    setScreen("previewFotoReceber");
  };

  const confirmReceivePhoto = () => {
    if (!selectedDetail) return setScreen("servicos");
    if (!hasMediaDraftContent({ dataUrl: receivePhotoDraft, rawBlob: receivePhotoRawBlob, mediaType: receivePhotoIsVideo ? "video" : "foto" })) {
      return setScreen("receber");
    }

    setReceiveProofs((current) => {
      const detailPhotos = current[selectedDetail.id] ?? [];
      const nextPhoto: ExpensePhoto = {
        id: receivePreviewPhotoId || `receive-photo-${Date.now()}-${detailPhotos.length + 1}`,
        dataUrl: receivePhotoDraft,
        previewUrl: receivePhotoPreviewUrl || undefined,
        posterUrl: receivePhotoPosterUrl || undefined,
        durationLabel: receivePhotoDurationLabel || undefined,
        mediaType: receivePhotoIsVideo ? "video" : "foto",
        rawBlob: receivePhotoIsVideo ? receivePhotoRawBlob ?? undefined : undefined
      };
      const nextPhotos = receivePreviewPhotoId
        ? detailPhotos.map((photo) => {
          if (photo.id !== receivePreviewPhotoId) return photo;
          if (photo.previewUrl && photo.previewUrl !== nextPhoto.previewUrl) revokePreviewUrl(photo.previewUrl);
          return nextPhoto;
        })
        : [...detailPhotos, nextPhoto];
      return {
        ...current,
        [selectedDetail.id]: nextPhotos
      };
    });
    setReceiveUploadedCounts((current) => {
      if (!current[selectedDetail.id]) return current;
      const next = { ...current };
      delete next[selectedDetail.id];
      return next;
    });

    clearReceivePhotoDraftState(true);
    setReceivePreviewPhotoId("");
    setScreen("receber");
  };

  const deleteReceivePhoto = () => {
    if (!selectedDetail) return;
    if (receivePreviewPhotoId) {
      setReceiveProofs((current) => {
        const removed = (current[selectedDetail.id] ?? []).find((photo) => photo.id === receivePreviewPhotoId);
        revokePreviewUrl(removed?.previewUrl);
        return {
          ...current,
          [selectedDetail.id]: (current[selectedDetail.id] ?? []).filter((photo) => photo.id !== receivePreviewPhotoId)
        };
      });
    }
    setReceiveUploadedCounts((current) => {
      if (!current[selectedDetail.id]) return current;
      const next = { ...current };
      delete next[selectedDetail.id];
      return next;
    });
    clearReceivePhotoDraftState();
    setReceivePreviewPhotoId("");
    setScreen("receber");
  };

  const continueAfterReceive = async () => {
    if (!selectedDetail || remoteOperation) return;
    const detailToContinue = selectedDetail;
    const photos = receiveProofs[detailToContinue.id] ?? [];
    if (!photos.length && !qrChargeCovers(detailToContinue)) return;
    if (blockIfNotFirstPending(detailToContinue)) return;

    const goNext = () => {
      if (blockIfNotFirstPending(detailToContinue)) return;
      setScreen(shouldRouteServiceToVoucher(detailToContinue) ? "voucher" : "finalizar");
    };

    // Sem foto só chega aqui com o QR pago no total: não há o que enviar.
    if (!photos.length || hasUploadedReceiveProofs(detailToContinue, receiveProofs, receiveUploadedCounts) || !remoteMode) {
      goNext();
      return;
    }

    const dvId = detailToContinue.dataverse?.id;
    if (!dvId) {
      goNext();
      return;
    }

    try {
      setRemoteOperation({
        title: "Enviando comprovantes",
        message: "Preparando upload dos comprovantes.",
        detailId: detailToContinue.id,
        phase: "loading"
      });
      const preparedPhotos = await Promise.all(photos.map((photo) => prepareMediaDraftForUpload(photo)));
      let completedUploads = 0;
      const uploadResults = await Promise.allSettled(
        preparedPhotos.map(async (photo, index) => {
          const link = await uploadReceiveProofRemote({
            reservaId: dvId,
            reservaName: detailToContinue.id,
            motoristaId: driverContext?.id,
            dataUrl: photo.dataUrl,
            fileName: photo.id,
            order: index + 1,
            onProgress: (message) =>
              setRemoteOperation({
                title: "Enviando comprovantes",
                message,
                detailId: detailToContinue.id,
                phase: "loading"
              })
          });
          completedUploads += 1;
          setRemoteOperation({
            title: "Enviando comprovantes",
            message: `Comprovantes enviados (${completedUploads}/${preparedPhotos.length}).`,
            detailId: detailToContinue.id,
            phase: "loading"
          });
          return link;
        })
      );
      const failedUploads = uploadResults.filter((result) => result.status === "rejected").length;
      if (failedUploads) {
        throw new Error(`${failedUploads} de ${preparedPhotos.length} comprovante(s) falharam no upload.`);
      }
      setReceiveUploadedCounts((current) => ({ ...current, [detailToContinue.id]: preparedPhotos.length }));
      setRemoteOperation({
        title: "Enviando comprovantes",
        message: "Comprovantes enviados com sucesso.",
        detailId: detailToContinue.id,
        phase: "success"
      });
      await wait(420);
      setRemoteOperation(null);
      goNext();
    } catch (error) {
      logAppError(error, "continueAfterReceive", detailToContinue.type);
      setRemoteOperation(null);
      setCriticalError(error instanceof Error ? error.message : "Falha ao enviar comprovantes de recebimento.");
    }
  };

  const openVoucherFlow = () => {
    if (!selectedDetail) return;
    if (blockIfNotFirstPending(selectedDetail)) return;
    if (receiveStepPending(selectedDetail)) {
      setScreen("receber");
      return;
    }
    setScreen("voucher");
  };

  const openFinalizeFlow = (serviceObservation?: string) => {
    if (!selectedDetail) return;
    const detailForFlow = selectedDetail;
    if (selectedDetail.type === "SERVICO" && serviceObservation !== undefined) {
      setServiceObservationDrafts((current) => ({ ...current, [getDetailDraftKey(selectedDetail)]: serviceObservation }));
    }
    if (blockIfNotFirstPending(detailForFlow)) return;
    if (receiveStepPending(detailForFlow)) {
      setScreen("receber");
      return;
    }
    setScreen("finalizar");
  };

  const openReceiveFlow = () => {
    if (!selectedDetail) return;
    if (blockIfNotFirstPending(selectedDetail)) return;
    setScreen("receber");
  };

  const openLocalCancelFlow = () => {
    if (!selectedDetail) return;
    if (blockIfNotFirstPending(selectedDetail)) return;
    setScreen("canceladoLocal");
  };

  const openPersonalReceipt = () => {
    if (!selectedDetail) return;
    setReceiptEntrySource("service");
    setScreen("reciboPersonalizado");
  };

  const openPersonalReceiptFromHome = () => {
    if (!canGeneratePersonalReceipt) {
      setToast("Você não tem permissão para gerar recibo personalizado.");
      return;
    }
    setReceiptEntrySource("home");
    setScreen("reciboPersonalizado");
  };

  const startCollision = (type: CollisionDraft["tipoOcorrencia"]) => {
    setCollisionDraft((current) => ({
      ...current,
      tipoOcorrencia: type,
      houveTerceiro: type === "bateram_em_mim" ? true : current.houveTerceiro,
      veiculoId: current.veiculoId || maintenanceCurrentVehicleId
    }));
    setScreen("colisoes");
  };

  const openCollisionCamera = (kind: CollisionPhotoKind) => {
    setCollisionPhotoKind(kind);
    clearCollisionPhotoDraftState();
    setCollisionPreviewPhotoId("");
    setScreen("fotoColisao");
  };

  const openMaintenanceFinalizeCamera = (kind: MaintenancePhotoKind) => {
    setMaintenancePhotoKind(kind);
    clearMaintenanceFinalizePhotoDraft();
    setMaintenanceExistingPreview(false);
    setScreen("fotoManutencao");
  };

  const openCollisionVideoPreview = (video: CapturedVideoDraft) => {
    setCollisionPhotoDraft("");
    setCollisionPhotoPreviewUrl(video.previewUrl);
    setCollisionPhotoPosterUrl(video.posterUrl ?? "");
    setCollisionPhotoDurationLabel(video.durationLabel ?? "");
    setCollisionPhotoRawBlob(video.rawBlob);
    setCollisionPhotoIsVideo(true);
    setCollisionPreviewPhotoId("");
    setScreen("previewFotoColisao");
  };

  const openCollisionPreview = (photoId: string) => {
    const photo = collisionPhotos.find((item) => item.id === photoId);
    if (!photo) return;
    setCollisionPhotoKind(photo.kind);
    setCollisionPhotoDraft(photo.dataUrl);
    setCollisionPhotoPreviewUrl(photo.previewUrl ?? "");
    setCollisionPhotoPosterUrl(photo.posterUrl ?? "");
    setCollisionPhotoDurationLabel(photo.durationLabel ?? "");
    setCollisionPhotoRawBlob(photo.rawBlob ?? null);
    setCollisionPhotoIsVideo(isVideoMediaDraft(photo.dataUrl, photo.rawBlob));
    setCollisionPreviewPhotoId(photoId);
    setScreen("previewFotoColisao");
  };

  const confirmCollisionPhoto = () => {
    if (!hasMediaDraftContent({ dataUrl: collisionPhotoDraft, rawBlob: collisionPhotoRawBlob, mediaType: collisionPhotoIsVideo ? "video" : "foto" })) {
      return setScreen("colisoes");
    }
    if (collisionPreviewPhotoId) {
      setCollisionPhotos((current) =>
        current.map((photo) => {
          if (photo.id !== collisionPreviewPhotoId) return photo;
          if (photo.previewUrl && photo.previewUrl !== (collisionPhotoPreviewUrl || undefined)) revokePreviewUrl(photo.previewUrl);
          return {
            ...photo,
            dataUrl: collisionPhotoDraft,
            previewUrl: collisionPhotoPreviewUrl || undefined,
            posterUrl: collisionPhotoPosterUrl || undefined,
            durationLabel: collisionPhotoDurationLabel || undefined,
            mediaType: collisionPhotoIsVideo ? "video" : "foto",
            rawBlob: collisionPhotoIsVideo ? collisionPhotoRawBlob ?? undefined : undefined
          };
        })
      );
    } else {
      setCollisionPhotos((current) => {
        return [
          ...current,
          {
            id: `collision-photo-${Date.now()}-${current.length + 1}`,
            kind: collisionPhotoKind,
            dataUrl: collisionPhotoDraft,
            previewUrl: collisionPhotoPreviewUrl || undefined,
            posterUrl: collisionPhotoPosterUrl || undefined,
            durationLabel: collisionPhotoDurationLabel || undefined,
            mediaType: collisionPhotoIsVideo ? "video" : "foto",
            rawBlob: collisionPhotoIsVideo ? collisionPhotoRawBlob ?? undefined : undefined
          }
        ];
      });
    }
    clearCollisionPhotoDraftState(true);
    setCollisionPreviewPhotoId("");
    setScreen("colisoes");
  };

  const deleteCollisionPhoto = () => {
    if (collisionPreviewPhotoId) {
      setCollisionPhotos((current) => {
        const removed = current.find((photo) => photo.id === collisionPreviewPhotoId);
        revokePreviewUrl(removed?.previewUrl);
        return current.filter((photo) => photo.id !== collisionPreviewPhotoId);
      });
    }
    clearCollisionPhotoDraftState();
    setCollisionPreviewPhotoId("");
    setScreen("colisoes");
  };

  if (screen === "canceladoLocal" && selectedDetail) {
    return show(
      <LocalCancelScreen
        detail={selectedDetail}
        onBack={() => setScreen("detalhes")}
        onWrongClick={() => setScreen("detalhes")}
        onSubmit={cancelSelected}
        submitState={remoteOperation?.phase ?? "idle"}
      />
    );
  }

  if (screen === "fotoSolicitacaoManutencao") {
    return show(
      <MediaCaptureScreen
        kind="FOTO1"
        title="Manutenção"
        onBack={() => setScreen("solicitarManutencao")}
        onCapture={(photoDataUrl) => {
          setMaintenanceRequestPhotoDraft(photoDataUrl);
          setMaintenanceRequestPhotoPreviewUrl("");
          setMaintenanceRequestPhotoPosterUrl("");
          setMaintenanceRequestPhotoDurationLabel("");
          setMaintenanceRequestPhotoRawBlob(null);
          setMaintenanceRequestPhotoIsVideo(false);
          setScreen("previewFotoSolicitacaoManutencao");
        }}
        onCaptureVideo={openMaintenanceRequestVideoPreview}
        onSwitchCamera={() => setToast("Câmera alternada localmente.")}
      />
    );
  }

  if (screen === "previewFotoSolicitacaoManutencao") {
    return show(
      <MaintenancePhotoPreviewScreen
        kind="FOTO1"
        title="Foto da manutenção"
        prompt={maintenanceRequestPhotoIsVideo ? "O vídeo está correto?" : "A foto está legível?"}
        photoDataUrl={maintenanceRequestPhotoDraft}
        isVideo={maintenanceRequestPhotoIsVideo}
        videoPreviewUrl={maintenanceRequestPhotoPreviewUrl}
        onBack={() => {
          clearMaintenanceRequestPhotoDraftState();
          setMaintenanceRequestPreviewPhotoId("");
          setScreen("solicitarManutencao");
        }}
        onRetake={openMaintenanceRequestCamera}
        onDelete={maintenanceRequestPreviewPhotoId ? deleteMaintenanceRequestPhoto : undefined}
        onConfirm={confirmMaintenanceRequestPhoto}
        confirmLabel={maintenanceRequestPreviewPhotoId ? "Voltar" : "Confirmar"}
        deleteOnly={Boolean(maintenanceRequestPreviewPhotoId)}
      />
    );
  }

  if (screen === "fotoColisao") {
    return show(
      <MediaCaptureScreen
        kind="NOTAFISCAL"
        title={`Capturar: ${getCollisionPhotoLabel(collisionPhotoKind)}`}
        onBack={() => setScreen("colisoes")}
        onCapture={(photoDataUrl) => {
          setCollisionPhotoDraft(photoDataUrl);
          setCollisionPhotoPreviewUrl("");
          setCollisionPhotoPosterUrl("");
          setCollisionPhotoDurationLabel("");
          setCollisionPhotoRawBlob(null);
          setCollisionPhotoIsVideo(false);
          setCollisionPreviewPhotoId("");
          setScreen("previewFotoColisao");
        }}
        onCaptureVideo={openCollisionVideoPreview}
        onSwitchCamera={() => setToast("Câmera alternada localmente.")}
      />
    );
  }

  if (screen === "previewFotoColisao") {
    return show(
      <MaintenancePhotoPreviewScreen
        kind="NOTAFISCAL"
        title={getCollisionPhotoLabel(collisionPhotoKind)}
        prompt={collisionPhotoIsVideo ? "O vídeo está correto?" : "A foto está legível?"}
        photoDataUrl={collisionPhotoDraft}
        isVideo={collisionPhotoIsVideo}
        videoPreviewUrl={collisionPhotoPreviewUrl}
        onBack={() => {
          clearCollisionPhotoDraftState();
          setCollisionPreviewPhotoId("");
          setScreen("colisoes");
        }}
        onRetake={() => openCollisionCamera(collisionPhotoKind)}
        onDelete={collisionPreviewPhotoId ? deleteCollisionPhoto : undefined}
        onConfirm={confirmCollisionPhoto}
        confirmLabel={collisionPreviewPhotoId ? "Voltar" : "Confirmar"}
        deleteOnly={Boolean(collisionPreviewPhotoId)}
      />
    );
  }

  if (screen === "fotoGasto") {
    return show(
      <MediaCaptureScreen
        kind="NOTAFISCAL"
        title="Comprovante"
        onBack={() => setScreen("gastos")}
        onCapture={(photoDataUrl) => {
          setExpensePhotoDraft(photoDataUrl);
          setExpensePhotoPreviewUrl("");
          setExpensePhotoPosterUrl("");
          setExpensePhotoDurationLabel("");
          setExpensePhotoRawBlob(null);
          setExpensePhotoIsVideo(false);
          setExpensePreviewPhotoId("");
          setScreen("previewFotoGasto");
        }}
        onCaptureVideo={openExpenseVideoPreview}
        onSwitchCamera={() => setToast("Câmera alternada localmente.")}
      />
    );
  }

  if (screen === "previewFotoGasto") {
    return show(
      <MaintenancePhotoPreviewScreen
        kind="NOTAFISCAL"
        title="Comprovante"
        prompt={expensePhotoIsVideo ? "O vídeo está correto?" : "O comprovante está inteiro e legível?"}
        photoDataUrl={expensePhotoDraft}
        isVideo={expensePhotoIsVideo}
        videoPreviewUrl={expensePhotoPreviewUrl}
        onBack={() => {
          clearExpensePhotoDraftState();
          setExpensePreviewPhotoId("");
          setScreen("gastos");
        }}
        onRetake={openExpenseCamera}
        onDelete={expensePreviewPhotoId ? deleteExpensePhoto : undefined}
        onConfirm={confirmExpensePhoto}
        confirmLabel={expensePreviewPhotoId ? "Voltar" : expensePhotoIsVideo ? "Confirmar" : "Usar esta foto"}
        retakeLabel={expensePhotoIsVideo ? undefined : "Tirar outra"}
        deleteOnly={Boolean(expensePreviewPhotoId)}
      />
    );
  }

  if (screen === "solicitarManutencao") {
    return show(
      <MaintenanceRequestScreen
        draft={maintenanceRequestDraft}
        photos={maintenanceRequestPhotos}
        onDraftChange={setMaintenanceRequestDraft}
        onAddPhoto={openMaintenanceRequestCamera}
        onPreviewPhoto={openMaintenanceRequestPreview}
        onBack={() => setScreen("inicio")}
        onSubmit={submitMaintenanceRequest}
        submitState={remoteOperation?.phase ?? "idle"}
        vehicles={maintenanceVehicles}
        initialVehicleId={maintenanceCurrentVehicleId}
        vehiclesLoading={maintenanceVehiclesLoading}
      />
    );
  }

  if (screen === "gastos" && expenseFlowView(expenseQuickRead) === "leitura") {
    return show(
      <ReceiptReadingScreen photoDataUrl={expenseQuickReadPhoto} filling={expenseQuickReadFilling} onCancel={cancelExpenseQuickRead} />
    );
  }

  if (screen === "gastos" && expenseFlowView(expenseQuickRead) === "ilegivel") {
    return show(
      <ReceiptIllegibleScreen photoDataUrl={expenseQuickReadPhoto} onRetake={retakeQuickReadPhoto} onBack={cancelExpenseQuickRead} />
    );
  }

  if (screen === "gastos") {
    return show(
      <ExpenseScreen
        uploads={expenseUploadStatuses.map(({ submission, status }) => ({ id: submission.expenseId, draft: submission.draft, status }))}
        onUploadAction={handleExpenseUploadAction}
        submitDisabled={remoteMode && (expenseUploadMode === "pending" || (expenseUploadMode === "async" && !expenseUploadReady))}
        draft={expenseDraft}
        photos={expensePhotos}
        referenceData={expenseReferenceData}
        referenceLoading={expenseReferenceLoading}
        referenceError={!remoteMode ? "Visualização local. Para gravar, abra o app publicado no Model-driven." : expenseReferenceError}
        onDraftChange={(draft) => {
          if (draft.dataGasto !== expenseDraft.dataGasto) expenseDateTouchedRef.current = true;
          setExpenseDraft(draft);
        }}
        onAddPhoto={openExpenseCamera}
        onPreviewPhoto={openExpensePreview}
        onBack={() => setScreen("inicio")}
        onSubmit={submitExpense}
        submitState={expenseSend && expenseSend.phase !== "error" ? "loading" : remoteOperation?.phase ?? "idle"}
        vehicles={maintenanceVehicles}
        vehiclesLoading={maintenanceVehiclesLoading}
        currentVehicleId={maintenanceCurrentVehicleId}
        quickRead={expenseQuickRead}
        quickReadFilled={expenseQuickReadFilled}
      />
    );
  }

  if (screen === "boasIdeias") {
    return show(
      <IdeasScreen
        onBack={() => setScreen("inicio")}
        loadIdeas={ideasGateway.load}
        createIdea={ideasGateway.create}
        localNotice={remoteMode ? undefined : "Visualização local. Para enviar à equipe, abra o app publicado no Model-driven."}
      />
    );
  }

  if (screen === "meuCarro") {
    return show(
      <MyVehicleScreen
        onBack={() => setScreen("inicio")}
        currentVehicleId={getDriverCurrentVehicleId(driverContext)}
        loadVehicles={async () => (remoteMode ? loadMyVehiclesRemote(driverContext ?? await getDriverContext()) : MOCK_FLEET.slice(0, 2))}
        saveVehicle={async (id) => {
          const driver = driverContext ?? await getDriverContext();
          if (remoteMode) await setMyCurrentVehicleRemote(driver, id);
          setDriverContext({ ...driver, funcionario: { ...(driver.funcionario ?? {}), _cr40f_veiculoatual_value: id } });
        }}
      />
    );
  }

  if (screen === "colisoesInicio") {
    return show(
      <CollisionStartScreen
        onBack={() => setScreen("inicio")}
        onSelect={startCollision}
      />
    );
  }

  if (screen === "colisoes") {
    return show(
      <CollisionScreen
        draft={collisionDraft}
        photos={collisionPhotos}
        onDraftChange={setCollisionDraft}
        onAddPhoto={openCollisionCamera}
        onPreviewPhoto={openCollisionPreview}
        onBack={() => setScreen("colisoesInicio")}
        onSubmit={submitCollision}
        submitState={remoteOperation?.phase ?? "idle"}
        vehicles={maintenanceVehicles}
        vehiclesLoading={maintenanceVehiclesLoading}
        currentVehicleId={maintenanceCurrentVehicleId}
        driverName={driverContext?.fullName}
      />
    );
  }

  if (screen === "fotoManutencao" && selectedDetail) {
    return show(
      <MediaCaptureScreen
        kind={maintenancePhotoKind}
        onBack={() => setScreen("finalizar")}
        onCapture={(photoDataUrl) => {
          setPhotoDraft(photoDataUrl);
          setPhotoDraftPreviewUrl("");
          setPhotoDraftRawBlob(null);
          setPhotoDraftIsVideo(false);
          setMaintenanceExistingPreview(false);
          setScreen("previewFotoManutencao");
        }}
        onCaptureVideo={(video) => {
          setPhotoDraft("");
          setPhotoDraftPreviewUrl(video.previewUrl);
          setPhotoDraftRawBlob(video.rawBlob);
          setPhotoDraftIsVideo(true);
          setMaintenanceExistingPreview(false);
          setScreen("previewFotoManutencao");
        }}
        onSwitchCamera={() => setToast("Câmera alternada localmente.")}
      />
    );
  }

  if (screen === "previewFotoManutencao" && selectedDetail) {
    return show(
      <MaintenancePhotoPreviewScreen
        kind={maintenancePhotoKind}
        photoDataUrl={photoDraft}
        isVideo={photoDraftIsVideo}
        videoPreviewUrl={photoDraftPreviewUrl}
        onBack={() => {
          clearMaintenanceFinalizePhotoDraft();
          setMaintenanceExistingPreview(false);
          setScreen("finalizar");
        }}
        onRetake={() => openMaintenanceFinalizeCamera(maintenancePhotoKind)}
        onConfirm={() => {
          void (async () => {
            try {
              const savedPhotoDataUrl =
                photoDraftIsVideo && photoDraftRawBlob && !photoDraft
                  ? (await prepareVideoBlobForUpload(photoDraftRawBlob)).dataUrl
                  : photoDraft ?? "";
              setStore((current) => saveMaintenancePhoto(current, selectedDetail.id, maintenancePhotoKind, savedPhotoDataUrl));
              setToast("Foto salva localmente.");
              clearMaintenanceFinalizePhotoDraft();
              setMaintenanceExistingPreview(false);
              setScreen("finalizar");
            } catch (error) {
              logAppError(error, "confirmMaintenancePhoto", "local-save");
              setCriticalError(error instanceof Error ? error.message : "Falha ao preparar mídia local.");
            }
          })();
        }}
        onDelete={maintenanceExistingPreview ? () => {
          setStore((current) => deleteFinalizationMaintenancePhoto(current, selectedDetail.id, maintenancePhotoKind));
          setToast("Foto apagada.");
          clearMaintenanceFinalizePhotoDraft();
          setMaintenanceExistingPreview(false);
          setScreen("finalizar");
        } : undefined}
        deleteOnly={maintenanceExistingPreview}
      />
    );
  }

  if (screen === "receber" && selectedDetail) {
    return show(
      <ReceiveScreen
        detail={selectedDetail}
        photos={receiveProofs[selectedDetail.id] ?? []}
        onAddPhoto={openReceiveCamera}
        onPreviewPhoto={openReceivePreview}
        onBack={() => setScreen("detalhes")}
        onContinue={continueAfterReceive}
        onGeneratePersonalReceipt={openPersonalReceipt}
        canGeneratePersonalReceipt={canGeneratePersonalReceipt}
        submitState={remoteOperation?.phase ?? "idle"}
        {...getQrChargeProps(selectedDetail)}
      />
    );
  }

  if (screen === "cobrancaQr" && selectedDetail) {
    return show(
      <QrChargeScreen
        key={selectedDetail.id}
        detail={selectedDetail}
        maxCents={getReceivableCents(selectedDetail)}
        onBack={() => setScreen("receber")}
        onPaid={(charge) => {
          setQrChargesPaid((current) => ({ ...current, [selectedDetail.id]: charge }));
          setScreen("receber");
        }}
        createCharge={(valorCentavos, pagante, idioma) =>
          createQrChargeRemote({ reservaId: selectedDetail.dataverse?.id ?? selectedDetail.id, valorCentavos, pagante, idioma })
        }
        updateCharge={updateQrChargeRemote}
      />
    );
  }

  if (screen === "reciboPersonalizado") {
    return show(
      <ReceiptScreen
        detail={receiptDetail}
        onBack={() => setScreen(receiptEntrySource === "service" && selectedDetail ? "receber" : "inicio")}
        clienteOptions={receiptClienteOptions}
        onProgress={(progress) => {
          if (!progress) {
            setRemoteOperation(null);
            return;
          }
          const flowPhase = progress.phase === "success" ? "success" : "loading";
          setRemoteOperation({
            title: "Gerando recibo personalizado",
            message: progress.message,
            detailId: receiptDetail?.id,
            phase: flowPhase
          });
        }}
      />
    );
  }

  if (screen === "fotoReceber") {
    return show(
      <MediaCaptureScreen
        kind="NOTAFISCAL"
        title="Comprovante"
        onBack={() => setScreen("receber")}
        onCapture={(photoDataUrl) => {
          setReceivePhotoDraft(photoDataUrl);
          setReceivePhotoPreviewUrl("");
          setReceivePhotoPosterUrl("");
          setReceivePhotoDurationLabel("");
          setReceivePhotoRawBlob(null);
          setReceivePhotoIsVideo(false);
          setReceivePreviewPhotoId("");
          setScreen("previewFotoReceber");
        }}
        onCaptureVideo={openReceiveVideoPreview}
        onSwitchCamera={() => setToast("Câmera alternada localmente.")}
      />
    );
  }

  if (screen === "previewFotoReceber") {
    return show(
      <MaintenancePhotoPreviewScreen
        kind="NOTAFISCAL"
        title="Comprovante"
        prompt={receivePhotoIsVideo ? "O vídeo está correto?" : "O comprovante está legível?"}
        photoDataUrl={receivePhotoDraft}
        isVideo={receivePhotoIsVideo}
        videoPreviewUrl={receivePhotoPreviewUrl}
        onBack={() => {
          clearReceivePhotoDraftState();
          setReceivePreviewPhotoId("");
          setScreen("receber");
        }}
        onRetake={openReceiveCamera}
        onDelete={receivePreviewPhotoId ? deleteReceivePhoto : undefined}
        onConfirm={confirmReceivePhoto}
        confirmLabel={receivePreviewPhotoId ? "Voltar" : "Confirmar"}
        deleteOnly={Boolean(receivePreviewPhotoId)}
      />
    );
  }

  if (screen === "finalizar" && selectedDetail) {
    if (receiveStepPending(selectedDetail)) {
      return show(
        <ReceiveScreen
          detail={selectedDetail}
          photos={receiveProofs[selectedDetail.id] ?? []}
          onAddPhoto={openReceiveCamera}
          onPreviewPhoto={openReceivePreview}
          onBack={() => setScreen("detalhes")}
          onContinue={continueAfterReceive}
          onGeneratePersonalReceipt={openPersonalReceipt}
          canGeneratePersonalReceipt={canGeneratePersonalReceipt}
          submitState={remoteOperation?.phase ?? "idle"}
          {...getQrChargeProps(selectedDetail)}
        />
      );
    }
    return show(
      <FinalizeScreen
        detail={selectedDetail}
        onBack={() => setScreen(getServiceTaskBackScreen(selectedDetail))}
        onDone={finalizeSelected}
        confirmedPhotos={confirmedMaintenancePhotos}
        maintenancePhotos={store.photos[selectedDetail.id] ?? {}}
        maintenanceDraft={maintenanceFinalizeDraft}
        onMaintenanceDraftChange={setMaintenanceFinalizeDraft}
        expenseReferenceData={expenseReferenceData}
        expenseReferenceLoading={expenseReferenceLoading}
        expenseReferenceError={expenseReferenceError}
        submitState={remoteOperation?.phase ?? "idle"}
        initialServiceObservation={getServiceObservationDraft(selectedDetail)}
        onClearPhotos={() => {
          setStore((current) => clearMaintenancePhotos(current, selectedDetail.id));
          setToast("Fotos locais limpas.");
        }}
        onPreviewMaintenancePhoto={(kind) => {
          setMaintenancePhotoKind(kind);
          const existingPhoto = store.photos[selectedDetail.id]?.[kind];
          if (existingPhoto) {
            setPhotoDraft(existingPhoto);
            setPhotoDraftPreviewUrl("");
            setPhotoDraftRawBlob(null);
            setPhotoDraftIsVideo(existingPhoto.startsWith("data:video/"));
            setMaintenanceExistingPreview(true);
            setScreen("previewFotoManutencao");
            return;
          }
          openMaintenanceFinalizeCamera(kind);
        }}
      />
    );
  }

  if (screen === "assinatura" && selectedDetail) {
    return show(
      <SignatureScreen
        detail={selectedDetail}
        onBack={() => setScreen("voucher")}
        onConfirm={(signatureDataUrl) => {
          if (signatureDataUrl) {
            setStore((current) => saveSignatureLocally(current, selectedDetail.id, signatureDataUrl));
            setToast("Assinatura salva localmente.");
          }
          setScreen("voucher");
        }}
      />
    );
  }

  if (screen === "voucher" && selectedDetail) {
    if (receiveStepPending(selectedDetail)) {
      return show(
        <ReceiveScreen
          detail={selectedDetail}
          photos={receiveProofs[selectedDetail.id] ?? []}
          onAddPhoto={openReceiveCamera}
          onPreviewPhoto={openReceivePreview}
          onBack={() => setScreen("detalhes")}
          onContinue={continueAfterReceive}
          onGeneratePersonalReceipt={openPersonalReceipt}
          canGeneratePersonalReceipt={canGeneratePersonalReceipt}
          submitState={remoteOperation?.phase ?? "idle"}
          {...getQrChargeProps(selectedDetail)}
        />
      );
    }
    return show(
      <VoucherScreen
        detail={selectedDetail}
        hasSignature={Boolean(store.signatures[selectedDetail.id])}
        initialDraft={voucherDrafts[getVoucherDraftKey(selectedDetail)]}
        onBack={() => setScreen(getServiceTaskBackScreen(selectedDetail))}
        onOpenSignature={() => setScreen("assinatura")}
        onFinalize={finalizeSelected}
        onDraftChange={saveVoucherDraft}
        submitState={remoteOperation?.phase ?? "idle"}
      />
    );
  }

  if (screen === "detalhes" && selectedDetail) {
    return show(
      <DetailsScreen
        detail={selectedDetail}
        onBack={() => setScreen("servicos")}
        onOpenReceive={openReceiveFlow}
        onOpenVoucher={openVoucherFlow}
        onOpenFinalize={openFinalizeFlow}
        onServiceObservationChange={saveSelectedServiceObservation}
        serviceObservationDraft={getServiceObservationDraft(selectedDetail)}
        onCancelLocal={openLocalCancelFlow}
        onRefresh={() => refreshLocal(selectedDetail)}
        onCopy={() => {
          void navigator.clipboard?.writeText(detailsToClipboardText(selectedDetail));
          setToast("Informações copiadas.");
        }}
      />
    );
  }

  if (screen === "detalhesHistorico" && selectedDetail) {
    return show(<HistoryDetailsScreen detail={selectedDetail} onBack={() => setScreen("historico")} onRefresh={() => refreshLocal(selectedDetail)} />);
  }

  if (screen === "historico") {
    return show(
      <HistoryScreen
        items={store.history}
        onHome={() => setScreen("inicio")}
        onRefresh={refreshLocal}
        onOpenDetails={(detail) => {
          setSelectedDetail(detail);
          setScreen("detalhesHistorico");
        }}
      />
    );
  }

  if (screen === "servicos") {
    return show(
      <ServicesScreen
        items={store.agenda}
        pendingComunicados={comunicados.filter(isComunicadoPending)}
        onOpenComunicado={(id) => { setSelectedComunicadoId(id); setComunicadoOrigin("servicos"); setScreen("comunicados"); }}
        pendingChecklists={checklists.filter(isChecklistPending)}
        onOpenChecklist={(id) => { setSelectedChecklistId(id); setChecklistOrigin("servicos"); setScreen("checklists"); }}
        onHome={() => setScreen("inicio")}
        onRefresh={refreshLocal}
        completingDetailKey={completingDetailKey}
        queueHighlightDetailKey={queueHighlightDetailKey}
        onOpenDetails={(detail) => {
          if (remoteMode) {
            markDetailViewedRemote(detail).catch((error) => {
              reportAppError(error, {
                severity: "error",
                source: "app",
                action: "markDetailViewedRemote",
                phase: "open-details",
                screen: "servicos",
                detailId: detail.id,
                detailType: detail.type
              });
              setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
            });
          }
          setSelectedDetail(detail);
          setScreen("detalhes");
        }}
      />
    );
  }

  if (screen === "comunicados") {
    return show(
      <ComunicadosScreen
        items={comunicados}
        selectedId={selectedComunicadoId}
        onSelectedIdChange={setSelectedComunicadoId}
        onBack={() => { setComunicadoOrigin(""); setScreen("inicio"); }}
        onCloseDetail={comunicadoOrigin === "servicos" ? () => { setSelectedComunicadoId(""); setComunicadoOrigin(""); setScreen("servicos"); } : undefined}
        onReload={reloadComunicados}
        loadStatus={comunicadosStatus}
        driverName={driverContext?.fullName ?? (isMockComunicados() ? "Renan" : "")}
      />
    );
  }

  if (screen === "checklists") {
    return show(
      <ChecklistsScreen
        items={checklists}
        selectedId={selectedChecklistId}
        onSelectedIdChange={setSelectedChecklistId}
        onBack={() => { setChecklistOrigin(""); setScreen("inicio"); }}
        onCloseDetail={checklistOrigin === "servicos" ? () => { setSelectedChecklistId(""); setChecklistOrigin(""); setScreen("servicos"); } : undefined}
        onReload={reloadChecklists}
        loadStatus={checklistsStatus}
      />
    );
  }

  return show(
    <InitialScreen
      onNavigate={navigateFromInitial}
      onOpenPersonalReceipt={openPersonalReceiptFromHome}
      onPersonalReceipt={openPersonalReceiptFromHome}
      openPersonalReceipt={openPersonalReceiptFromHome}
      onRefresh={refreshLocal}
      canGeneratePersonalReceipt={canGeneratePersonalReceipt}
      isThirdParty={isThirdPartyDriver(driverContext?.funcionario)}
      services={store.agenda}
      pendingComunicados={comunicados.filter(isComunicadoPending).length}
      pendingChecklists={checklists.filter(isChecklistPending).length}
      driverName={driverContext?.fullName}
      showLocalReset={isLocalhostRuntime && !remoteMode}
      onResetLocalData={resetLocalData}
    />
  );
}

export default App;





