import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  findFirstPendingServiceDetail,
  getInitialDetail,
  getInitialParams,
  getInitialTermoMultaId,
  getVoucherDraftKey,
  initialStore,
  isSameDetail,
  loadStore,
  STORAGE_KEY
} from "./app/bootstrap";
import { useHardwareBackGuard } from "./app/backGuard";
import { BuildStamp } from "./components/layout/BuildStamp";
import { getScreenAfterQrPayment, getServiceTaskBackScreen } from "./app/detailFlow";
import {
  AUTO_REFRESH_INTERVAL_MS,
  buildHashRoute,
  getHashRouteFallbackScreen,
  getScreenMotion,
  isHashRoutingEnabled,
  parseHashRoute,
  screenNeedsHashDetail,
  shouldAutoRefreshScreen,
  type HashRoute
} from "./app/navigation";
import {
  cancelServiceRemote,
  finalizeExchangeRemote,
  finalizeMaintenanceRemote,
  getDriverContext,
  getDriverCurrentVehicleId,
  hasDataverseRuntime,
  loadExpenseReferenceDataRemote,
  loadMyVehiclesRemote,
  setMyCurrentVehicleRemote,
  loadReceiptClienteOptionsRemote,
  loadMaintenanceRequestVehiclesRemote,
  resolveServiceVehicleRemote,
  loadActiveFleetRemote,
  prefetchExpenseReferenceDataRemote,
  type DriverContext,
  type MaintenanceRequestVehicleOption
} from "./lib/dataverse";
import { isStandaloneWebResourceRuntime } from "./lib/dataverse";
import { SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "./data/dataverse/fetchWebApi";
import { createQrChargeRemote, getQrChargeSummaryRemote, updateQrChargeRemote } from "./lib/dataverse";
import { getReceivableCents } from "./features/recebimento/qrCharge";
import { QrChargeScreen } from "./features/recebimento/QrChargeScreen";
import { expenseFlowView } from "./features/despesas/receiptQuickRead";
import { IDEA_STATUS, type Idea, type IdeaDraft } from "./features/ideias/ideas";
import { APP_CONNECTION_LOST_MESSAGE, APP_OPERATION_ERROR_MESSAGE, reportAppError, type AppErrorNotice } from "./lib/appErrorLogger";
import { useDados } from "./app/DataProvider";
import { useReceiveFlow } from "./features/recebimento/useReceiveFlow";
import { useMaintenanceRequestFlow } from "./features/manutencao/useMaintenanceRequestFlow";
import { useCollisionFlow } from "./features/colisao/useCollisionFlow";
import { useComunicados } from "./features/comunicados/useComunicados";
import { useChecklists } from "./features/checklist/useChecklists";
import { useTermosMulta } from "./features/termos/useTermosMulta";
import { isComunicadoPending, isMockComunicados } from "./features/comunicados/comunicados";
import { isChecklistPending } from "./features/checklist/checklists";
import { clearMediaDraft, loadMediaDraft, saveMediaDraft, touchMediaDraft } from "./features/fotos/mediaDraftStore";
import { ExpenseSendOverlay } from "./features/despesas/ExpenseSendOverlay";
import { useExpenseFlow } from "./features/despesas/useExpenseFlow";

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
import { getVisibleLoadingOverlay } from "./app/overlayLayering";
import { CollisionScreen } from "./features/colisao/CollisionScreen";
import { ComunicadosScreen } from "./features/comunicados/ComunicadosScreen";
import { TermosMultaScreen } from "./features/termos/TermosMultaScreen";
import { resumoPendentes, separarTermos } from "./features/termos/termosMulta";
import { ChecklistsScreen } from "./features/checklist/ChecklistsScreen";
import { ButtonPreviewScreen } from "./screens/ButtonPreviewScreen";
import { CollisionStartScreen } from "./features/colisao/CollisionStartScreen";
import { DetailsScreen } from "./features/detalhe/DetailsScreen";
import { ExpenseScreen } from "./features/despesas/ExpenseScreen";
import { FinalizeScreen, type MaintenanceFinalizeDraft } from "./features/finalizar/FinalizeScreen";
import { HistoryDetailsScreen } from "./features/historico/HistoryDetailsScreen";
import { HistoryScreen } from "./features/historico/HistoryScreen";
import { InitialScreen } from "./features/servicos/InitialScreen";
import { LocalCancelScreen } from "./features/finalizar/LocalCancelScreen";
import { MediaCaptureScreen } from "./features/fotos/MediaCaptureScreen";
import { ReceiptReadingScreen } from "./features/despesas/ReceiptReadingScreen";
import { ReceiptIllegibleScreen } from "./features/despesas/ReceiptIllegibleScreen";
import { MaintenancePhotoPreviewScreen } from "./features/fotos/MaintenancePhotoPreviewScreen";
import { ReceiveScreen } from "./features/recebimento/ReceiveScreen";
import { ReceiptPreviewScreen, ReceiptScreen } from "./features/recibo/ReceiptScreen";
import { MaintenanceRequestScreen } from "./features/manutencao/MaintenanceRequestScreen";
import { IdeasScreen } from "./features/ideias/IdeasScreen";
import { MyVehicleScreen } from "./features/meu-carro/MyVehicleScreen";
import { VehicleChoiceDialog } from "./features/detalhe/VehicleChoiceDialog";
import {
  buildInfleetServiceVehiclePatch,
  needsDriverChoice,
  type DriverVehicleChoice,
  type FleetVehicle,
  type InfleetVehicleResolution
} from "./lib/serviceVehicleInfleet";
import { isThirdPartyDriver } from "./features/meu-carro/myVehicle";
import { createMockFleetLoader, MOCK_FLEET, pickMockInfleetScenario, resolveMockServiceVehicle } from "./lib/serviceVehicleInfleetMock";

// Referência estável: o diálogo compara com a lista exibida para saber se oferece "Nenhuma das opções".
const loadMockAllFleet = async () => MOCK_FLEET;
import { ServicesScreen } from "./features/servicos/ServicesScreen";
import { SignatureScreen } from "./features/voucher/SignatureScreen";
import { VoucherScreen } from "./features/voucher/VoucherScreen";
import { createEmptyCollisionDraft, getCollisionPhotoLabel } from "./features/colisao/collisions";
import { prepareVideoBlobForUpload, revokePreviewUrl } from "./features/fotos/mediaDrafts";
import type { DetailData, MaintenancePhotoKind, Screen } from "./types";
import { exchangeUserError } from "./features/servicos/trocaErros";
import { FlowProgressOverlay, type RemoteOperation } from "./shared/ui/FlowProgressOverlay";
import { findDetailFromHashRoute, getInitialScreenFromHashRoute } from "./app/rotaInicial";
import { inferToastTone } from "./shared/ui/toastTone";
import { wait } from "./shared/wait";
import { isTrueLike } from "./shared/isTrueLike";
import {
  getDetailDraftKey,
  loadFinalizeDraftAssets,
  loadServiceObservationDrafts,
  loadVoucherDrafts,
  serializeReceiveProofs,
  FINALIZE_DRAFT_ASSETS_STORAGE_KEY,
  SERVICE_OBSERVATION_DRAFTS_KEY,
  VOUCHER_DRAFTS_STORAGE_KEY,
  type PersistedFinalizeDraftAssets
} from "./features/finalizar/rascunhos";
import { revokePhotoPreviewUrls } from "./features/fotos/envioMidia";
import { EMPTY_MAINTENANCE_REQUEST_DRAFT } from "./features/manutencao/rascunho";
import { EMPTY_EXPENSE_DRAFT } from "./features/despesas/rascunho";
import { EMPTY_MAINTENANCE_FINALIZE_DRAFT } from "./features/finalizar/rascunhoManutencao";
import { LOCAL_RECEIPT_CLIENT_MOCKS } from "./features/recibo/clientesMock";

type RefreshOptions = {
  silent?: boolean;
};

type ReceiptEntrySource = "home" | "service";

const DATA_LOADING_SUCCESS_DURATION_MS = 420;

function App() {
  // Dados pela porta (src/data/porta.ts): o adaptador vem da entrada do app (main.tsx) e não muda
  // durante a sessão, por isso não entra nas dependências dos hooks.
  const dados = useDados();
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
    : (initialDetailRef.current ? "detalhes" : getInitialTermoMultaId() ? "multas" : "inicio");
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
  const pendingServiceDeepLinkRef = useRef(getInitialParams());
  // true quando o deep link de serviço já abriu a tela; o fluxo pós-carga não deve sobrescrever a navegação.
  const serviceDeepLinkHandledRef = useRef(false);
  const [voucherDrafts, setVoucherDrafts] = useState<Record<string, Record<string, string>>>(() => loadVoucherDrafts());
  const [serviceObservationDrafts, setServiceObservationDrafts] = useState<Record<string, string>>(() => loadServiceObservationDrafts());
  const [maintenanceVehicles, setMaintenanceVehicles] = useState<MaintenanceRequestVehicleOption[]>([]);
  const [maintenanceCurrentVehicleId, setMaintenanceCurrentVehicleId] = useState("");
  const [maintenanceVehiclesLoading, setMaintenanceVehiclesLoading] = useState(false);
  const {
    clearMaintenanceRequestPhotoDraftState,
    confirmMaintenanceRequestPhoto,
    deleteMaintenanceRequestPhoto,
    maintenanceRequestDraft,
    maintenanceRequestPhotoDraft,
    maintenanceRequestPhotoIsVideo,
    maintenanceRequestPhotoPreviewUrl,
    maintenanceRequestPhotos,
    maintenanceRequestPreviewPhotoId,
    openMaintenanceRequestCamera,
    openMaintenanceRequestPreview,
    openMaintenanceRequestVideoPreview,
    setMaintenanceRequestDraft,
    setMaintenanceRequestPhotoDraft,
    setMaintenanceRequestPhotoDurationLabel,
    setMaintenanceRequestPhotoIsVideo,
    setMaintenanceRequestPhotoPosterUrl,
    setMaintenanceRequestPhotoPreviewUrl,
    setMaintenanceRequestPhotoRawBlob,
    setMaintenanceRequestPhotos,
    setMaintenanceRequestPreviewPhotoId,
    submitMaintenanceRequest
  } = useMaintenanceRequestFlow({
    // Funções intermediárias para o que o App declara mais abaixo; só rodam nos handlers.
    logAppError: (...args) => logAppError(...args),
    maintenanceCurrentVehicleId,
    remoteMode,
    remoteOperation,
    setCriticalError: (...args) => setCriticalError(...args),
    setRemoteOperation,
    setScreen,
    setToast: (...args) => setToast(...args)
  });
  const {
    cancelExpenseQuickRead,
    checkReceiveProof,
    clearExpensePhotoDraftState,
    closeExpenseSendError,
    confirmExpensePhoto,
    deleteExpensePhoto,
    expenseDateTouchedRef,
    expenseDraft,
    expensePhotoDraft,
    expensePhotoIsVideo,
    expensePhotoPreviewUrl,
    expensePhotos,
    expensePreviewPhotoId,
    expenseQuickRead,
    expenseQuickReadFilled,
    expenseQuickReadFilling,
    expenseQuickReadPhoto,
    expenseReferenceData,
    expenseReferenceError,
    expenseReferenceLoading,
    expenseSend,
    expenseUploadMode,
    expenseUploadReady,
    expenseUploadStatuses,
    handleExpenseUploadAction,
    isExpenseDraftBlank,
    openExpenseCamera,
    openExpensePreview,
    openExpenseVideoPreview,
    resetExpenseQuickRead,
    retakeQuickReadPhoto,
    setExpenseDraft,
    setExpensePhotoDraft,
    setExpensePhotoDurationLabel,
    setExpensePhotoIsVideo,
    setExpensePhotoPosterUrl,
    setExpensePhotoPreviewUrl,
    setExpensePhotoRawBlob,
    setExpensePhotos,
    setExpensePreviewPhotoId,
    setExpenseReferenceData,
    setExpenseReferenceError,
    setExpenseReferenceLoading,
    submitExpense
  } = useExpenseFlow({
    remoteMode,
    driverContext,
    remoteOperation,
    setRemoteOperation,
    setScreen,
    // Funções intermediárias: declaradas mais abaixo no App, só rodam nos handlers e efeitos.
    setToast: (message, tone) => setToast(message, tone),
    setCriticalError: (message) => setCriticalError(message),
    logAppError: (error, action, phase) => logAppError(error, action, phase)
  });
  const [receiptClienteOptions, setReceiptClienteOptions] = useState<string[]>([]);
  const {
    clearReceivePhotoDraftState,
    confirmReceivePhoto,
    continueAfterReceive,
    deleteReceivePhoto,
    getQrChargeProps,
    invalidateQrChargeSummary,
    openReceiveCamera,
    openReceiveFlow,
    openReceivePreview,
    openReceiveVideoPreview,
    qrChargeState,
    qrChargeSummaryInFlightRef,
    qrChargeSummaryNeeded,
    qrChargeSummaryRequest,
    qrChargesPaid,
    receivePhotoDraft,
    receivePhotoIsVideo,
    receivePhotoPreviewUrl,
    receivePreviewPhotoId,
    receiveProofs,
    receiveStepPending,
    setQrChargeSummaries,
    setQrChargesPaid,
    setReceivePhotoDraft,
    setReceivePhotoDurationLabel,
    setReceivePhotoIsVideo,
    setReceivePhotoPosterUrl,
    setReceivePhotoPreviewUrl,
    setReceivePhotoRawBlob,
    setReceivePreviewPhotoId,
    setReceiveProofs,
    setReceiveUploadedCounts
  } = useReceiveFlow({
    // Funções intermediárias para o que o App declara mais abaixo; só rodam nos handlers.
    blockIfNotFirstPending: (...args) => blockIfNotFirstPending(...args),
    checkReceiveProof,
    driverContext,
    isLocalhostRuntime,
    logAppError: (...args) => logAppError(...args),
    remoteMode,
    remoteOperation,
    screen,
    selectedDetail,
    setCriticalError: (...args) => setCriticalError(...args),
    setRemoteOperation,
    setScreen
  });
  const {
    clearCollisionPhotoDraftState,
    collisionDraft,
    collisionPhotoDraft,
    collisionPhotoIsVideo,
    collisionPhotoKind,
    collisionPhotoPreviewUrl,
    collisionPhotos,
    collisionPreviewPhotoId,
    confirmCollisionPhoto,
    deleteCollisionPhoto,
    openCollisionCamera,
    openCollisionPreview,
    openCollisionVideoPreview,
    setCollisionDraft,
    setCollisionPhotoDraft,
    setCollisionPhotoDurationLabel,
    setCollisionPhotoIsVideo,
    setCollisionPhotoPosterUrl,
    setCollisionPhotoPreviewUrl,
    setCollisionPhotoRawBlob,
    setCollisionPhotos,
    setCollisionPreviewPhotoId,
    startCollision,
    submitCollision
  } = useCollisionFlow({
    // Funções intermediárias para o que o App declara mais abaixo; só rodam nos handlers.
    driverContext,
    logAppError: (...args) => logAppError(...args),
    maintenanceCurrentVehicleId,
    remoteMode,
    remoteOperation,
    setCriticalError: (...args) => setCriticalError(...args),
    setRemoteOperation,
    setScreen,
    setToast: (...args) => setToast(...args)
  });
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
  const { termosMulta, termosStatus, reloadTermosMulta } = useTermosMulta(comunicadosDriverIdRef, driverContext?.id);
  const {
    checklists,
    checklistsStatus,
    selectedChecklistId,
    setSelectedChecklistId,
    checklistOrigin,
    setChecklistOrigin,
    reloadChecklists
  } = useChecklists({ dados, driverIdRef: comunicadosDriverIdRef, previewMode: isButtonPreviewMode || isReceiptPreviewMode, setScreen, setToast, setDataLoadingState });
  const {
    comunicados,
    comunicadosStatus,
    selectedComunicadoId,
    setSelectedComunicadoId,
    comunicadoOrigin,
    setComunicadoOrigin,
    pendingComunicadoDeepLinkRef,
    reloadComunicados
  } = useComunicados({ dados, driverIdRef: comunicadosDriverIdRef, previewMode: isButtonPreviewMode || isReceiptPreviewMode, setScreen, setDataLoadingState });

  // Deep link de serviço vindo do push (form OnLoad -> data=servicoId=...&tipo=...): busca o detalhe
  // em paralelo com loadRemoteStore e abre assim que chega. Se o serviço saiu da agenda do motorista
  // (ex.: "Serviço retirado da agenda"), cai em Serviços em vez de mostrar erro.
  useEffect(() => {
    const { serviceId, type } = pendingServiceDeepLinkRef.current;
    if (!serviceId || isButtonPreviewMode || isReceiptPreviewMode || !hasDataverseRuntime()) return;
    // Detalhe já presente no cache local: a tela inicial já é "detalhes"; o fluxo pós-carga atualiza.
    if (initialDetailRef.current) return;
    let alive = true;
    dados.carregarDetalhe(serviceId, type)
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
        dados.marcarVisto(detail).catch((error) => {
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
    dados.carregarAgenda()
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
              dados.marcarVisto(remoteInitialDetail).catch((error) => {
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
              dados.carregarDetalhe(hashRoute.detailId, hashRoute.detailType)
                .then((detail) => {
                  if (!alive) return;
                  if (!detail) {
                    setSelectedDetail(null);
                    setScreen(getHashRouteFallbackScreen(routedScreen));
                    setToast("Serviço do link não encontrado.");
                    return;
                  }
                  dados.marcarVisto(detail).catch((error) => {
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
          dados.marcarVisto(remoteInitialDetail).catch((error) => {
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
          dados.carregarDetalhe(initialParams.serviceId, initialParams.type)
            .then((detail) => {
              if (!alive) return;
              if (!detail) {
                setScreen("servicos");
                setToast("Este serviço não está mais na sua agenda.", "warning");
                return;
              }
              dados.marcarVisto(detail).catch((error) => {
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
        setDataLoadingState(null);
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

    const showSessionExpiredPopup = () => setCriticalErrorState(SESSION_EXPIRED_MESSAGE);
    if (navigator.onLine === false) showConnectionLostPopup();
    window.addEventListener("offline", showConnectionLostPopup);
    window.addEventListener(SESSION_EXPIRED_EVENT, showSessionExpiredPopup);
    return () => {
      window.removeEventListener("offline", showConnectionLostPopup);
      window.removeEventListener(SESSION_EXPIRED_EVENT, showSessionExpiredPopup);
    };
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
  useEffect(() => {
    const detail = qrChargeSummaryRequest;
    if (!detail || !qrChargeSummaryNeeded) return;
    const detailId = detail.id;
    const inFlight = qrChargeSummaryInFlightRef.current;
    if (inFlight.has(detailId)) return;
    inFlight.add(detailId);
    setQrChargeSummaries((current) => ({ ...current, [detailId]: { ...current[detailId], status: "loading", stale: false } }));
    getQrChargeSummaryRemote(detail.dataverse?.id ?? detail.id, getReceivableCents(detail))
      .then((summary) => setQrChargeSummaries((current) => ({ ...current, [detailId]: { status: "ready", summary } })))
      .catch((error) => {
        // Sem resumo o fluxo segue como antes (foto obrigatória); a tela mostra um aviso discreto.
        logAppError(error, "qrChargeSummary", detail.type);
        setQrChargeSummaries((current) => ({ ...current, [detailId]: { ...current[detailId], status: "error" } }));
      })
      .finally(() => inFlight.delete(detailId));
    // A requisição depende só do serviço e de precisar (re)carregar.
  }, [qrChargeSummaryRequest?.id, qrChargeSummaryNeeded]);

  useEffect(() => {
    previousScreenRef.current = screen;
  }, [screen]);

  // Na URL direta do web resource o gesto Voltar do celular sairia do app.
  useHardwareBackGuard(screen, hashRoutingActive || isStandaloneWebResourceRuntime());

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
    if (remoteMode) return { load: dados.carregarIdeias, create: dados.criarIdeia };
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
      <LoadingOverlay loading={getVisibleLoadingOverlay(dataLoading, criticalError)} />
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
              {criticalError === SESSION_EXPIRED_MESSAGE ? (
                <button type="button" onClick={() => window.location.reload()}>Entrar de novo</button>
              ) : (
                <button type="button" onClick={() => setCriticalError("")}>Entendi</button>
              )}
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
        const remote = await dados.carregarAgenda();
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
            await dados.carregarDetalhe(detailToRefresh.dataverse?.id ?? detailToRefresh.id, detailToRefresh.type);
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
    if (remoteMode) await dados.salvarObservacao(selectedDetail, observation);
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
        const remoteBeforeFinalize = await dados.carregarAgenda();
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
          await dados.salvarVoucher({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress, vehicleResolution, vehicleChoice, skipVehicle });
        } else if (detailToFinalize.type === "SERVICO") {
          await dados.finalizarServico({ detail: detailToFinalize, fields: finalFields, signatureDataUrl, photos, onProgress: setProgress, vehicleResolution, vehicleChoice, skipVehicle });
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
        dados.carregarAgenda(),
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
        dados.carregarAgenda()
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
      dados.salvarRascunhoVoucher(detail, fields).catch((error) => {
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
    if (screenName === "servicos" || screenName === "comunicados" || screenName === "historico" || screenName === "solicitarManutencao" || screenName === "gastos" || screenName === "colisoesInicio" || screenName === "boasIdeias" || screenName === "meuCarro" || screenName === "multas") {
      setComunicadoOrigin("");
      setScreen(screenName);
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

  const openMaintenanceFinalizeCamera = (kind: MaintenancePhotoKind) => {
    setMaintenancePhotoKind(kind);
    clearMaintenanceFinalizePhotoDraft();
    setMaintenanceExistingPreview(false);
    setScreen("fotoManutencao");
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
    const qrState = qrChargeState(selectedDetail);
    return show(
      <QrChargeScreen
        key={selectedDetail.id}
        detail={selectedDetail}
        maxCents={qrState.balanceCents}
        resume={qrState.open}
        onBack={() => {
          invalidateQrChargeSummary(selectedDetail.id);
          setScreen("receber");
        }}
        onPaid={(charge) =>
          setQrChargesPaid((current) => ({ ...current, [selectedDetail.id]: { ...current[selectedDetail.id], [charge.sessionId]: charge.valorCentavos } }))
        }
        onContinue={(charge) => {
          // O estado do onPaid pode não ter chegado neste clique: soma a cobrança confirmada aqui.
          const covers = qrChargeState(selectedDetail, { ...qrChargesPaid[selectedDetail.id], [charge.sessionId]: charge.valorCentavos }).covers;
          invalidateQrChargeSummary(selectedDetail.id);
          // Pago no total: segue para a próxima etapa do serviço sem passar de novo pelo comprovante.
          if (covers && blockIfNotFirstPending(selectedDetail)) return;
          setScreen(getScreenAfterQrPayment(selectedDetail, covers));
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
            dados.marcarVisto(detail).catch((error) => {
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

  if (screen === "multas") {
    return show(
      <TermosMultaScreen items={termosMulta} loadStatus={termosStatus} onBack={() => setScreen("inicio")} onReload={reloadTermosMulta} />
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
      pendingMultas={separarTermos(termosMulta).pendentes.length}
      multasBanner={resumoPendentes(termosMulta)}
      driverName={driverContext?.fullName}
      showLocalReset={isLocalhostRuntime && !remoteMode}
      onResetLocalData={resetLocalData}
    />
  );
}

export default App;





