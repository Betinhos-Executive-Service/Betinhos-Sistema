import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  findFirstPendingServiceDetail,
  getInitialDetail,
  getInitialParams,
  getInitialTermoMultaId,
  initialStore,
  isSameDetail,
  loadStore,
  STORAGE_KEY
} from "./app/bootstrap";
import { useHardwareBackGuard } from "./app/backGuard";
import { BuildStamp } from "./components/layout/BuildStamp";
import {
  AUTO_REFRESH_INTERVAL_MS,
  buildHashRoute,
  getScreenMotion,
  isHashRoutingEnabled,
  parseHashRoute,
  shouldAutoRefreshScreen,
  type HashRoute
} from "./app/navigation";
import {
  getDriverContext,
  getDriverCurrentVehicleId,
  loadExpenseReferenceDataRemote,
  loadReceiptClienteOptionsRemote,
  loadMaintenanceRequestVehiclesRemote,
  loadActiveFleetRemote,
  prefetchExpenseReferenceDataRemote,
  type DriverContext,
  type MaintenanceRequestVehicleOption
} from "./lib/dataverse";
import { isStandaloneWebResourceRuntime } from "./lib/dataverse";
import { SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "./data/dataverse/fetchWebApi";
import { getQrChargeSummaryRemote } from "./lib/dataverse";
import { getReceivableCents } from "./features/recebimento/qrCharge";
import { IDEA_STATUS, type Idea, type IdeaDraft } from "./features/ideias/ideas";
import { APP_CONNECTION_LOST_MESSAGE, APP_OPERATION_ERROR_MESSAGE, reportAppError, type AppErrorNotice } from "./lib/appErrorLogger";
import { useDados } from "./app/DataProvider";
import type { ReceiptEntrySource } from "./features/recibo/origem";
import { rotasMeuCarro } from "./features/meu-carro/rotas";
import { rotasIdeias } from "./features/ideias/rotas";
import { rotasChecklist } from "./features/checklist/rotas";
import { rotasTermos } from "./features/termos/rotas";
import { rotasComunicados } from "./features/comunicados/rotas";
import { rotasServicos } from "./features/servicos/rotas";
import { rotasHistorico } from "./features/historico/rotas";
import { rotasDetalhe } from "./features/detalhe/rotas";
import { rotasRecibo } from "./features/recibo/rotas";
import { rotasVoucher } from "./features/voucher/rotas";
import { rotasFinalizar } from "./features/finalizar/rotas";
import { rotasRecebimento } from "./features/recebimento/rotas";
import { rotasManutencao } from "./features/manutencao/rotas";
import { rotasColisao } from "./features/colisao/rotas";
import { rotasDespesas } from "./features/despesas/rotas";
import { useServiceDeepLink } from "./features/servicos/useServiceDeepLink";
import { useAgendaLoad } from "./features/servicos/useAgendaLoad";
import { useFinalizeFlow } from "./features/finalizar/useFinalizeFlow";
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

import type { LocalStore } from "./lib/localWorkflow";
import { LocalToast, type ToastState, type ToastTone } from "./components/common/LocalToast";
import { LoadingOverlay, type LoadingOverlayState } from "./components/common/LoadingOverlay";
import { getVisibleLoadingOverlay } from "./app/overlayLayering";
import { resumoPendentes, separarTermos } from "./features/termos/termosMulta";
import { ButtonPreviewScreen } from "./screens/ButtonPreviewScreen";
import { InitialScreen } from "./features/servicos/InitialScreen";
import { ReceiptPreviewScreen } from "./features/recibo/ReceiptScreen";
import { VehicleChoiceDialog } from "./features/detalhe/VehicleChoiceDialog";
import { isThirdPartyDriver } from "./features/meu-carro/myVehicle";
import { MOCK_FLEET } from "./lib/serviceVehicleInfleetMock";

// Referência estável: o diálogo compara com a lista exibida para saber se oferece "Nenhuma das opções".
const loadMockAllFleet = async () => MOCK_FLEET;
import { createEmptyCollisionDraft } from "./features/colisao/collisions";
import { revokePreviewUrl } from "./features/fotos/mediaDrafts";
import type { DetailData, MaintenancePhotoKind, Screen } from "./types";
import { exchangeUserError } from "./features/servicos/trocaErros";
import { FlowProgressOverlay, type RemoteOperation } from "./shared/ui/FlowProgressOverlay";
import { findDetailFromHashRoute, getInitialScreenFromHashRoute } from "./app/rotaInicial";
import { inferToastTone } from "./shared/ui/toastTone";
import { wait } from "./shared/wait";
import { isTrueLike } from "./shared/isTrueLike";
import {
  loadFinalizeDraftAssets,
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
  const pendingServiceDeepLinkRef = useRef(getInitialParams());
  // true quando o deep link de serviço já abriu a tela; o fluxo pós-carga não deve sobrescrever a navegação.
  const serviceDeepLinkHandledRef = useRef(false);
  const [maintenanceVehicles, setMaintenanceVehicles] = useState<MaintenanceRequestVehicleOption[]>([]);
  const [maintenanceCurrentVehicleId, setMaintenanceCurrentVehicleId] = useState("");
  const [maintenanceVehiclesLoading, setMaintenanceVehiclesLoading] = useState(false);
  const manutencao = useMaintenanceRequestFlow({
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
    clearMaintenanceRequestPhotoDraftState,
    maintenanceRequestPhotos,
    setMaintenanceRequestDraft,
    setMaintenanceRequestPhotos,
    setMaintenanceRequestPreviewPhotoId
  } = manutencao;
  const despesas = useExpenseFlow({
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
  const {
    checkReceiveProof,
    clearExpensePhotoDraftState,
    closeExpenseSendError,
    expenseDraft,
    expensePhotos,
    expenseReferenceData,
    expenseReferenceError,
    expenseReferenceLoading,
    expenseSend,
    expenseUploadStatuses,
    isExpenseDraftBlank,
    openExpenseCamera,
    resetExpenseQuickRead,
    setExpenseDraft,
    setExpensePhotos,
    setExpensePreviewPhotoId,
    setExpenseReferenceData,
    setExpenseReferenceError,
    setExpenseReferenceLoading
  } = despesas;
  const [receiptClienteOptions, setReceiptClienteOptions] = useState<string[]>([]);
  const recebimento = useReceiveFlow({
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
    clearReceivePhotoDraftState,
    continueAfterReceive,
    getQrChargeProps,
    openReceiveCamera,
    openReceiveFlow,
    openReceivePreview,
    qrChargeSummaryInFlightRef,
    qrChargeSummaryNeeded,
    qrChargeSummaryRequest,
    receiveProofs,
    receiveStepPending,
    setQrChargeSummaries,
    setReceiveProofs,
    setReceiveUploadedCounts
  } = recebimento;
  const colisao = useCollisionFlow({
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
  const {
    clearCollisionPhotoDraftState,
    collisionPhotos,
    setCollisionDraft,
    setCollisionPhotos,
    setCollisionPreviewPhotoId
  } = colisao;
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
  const completingClearTimerRef = useRef<number | null>(null);
  const queueHighlightTimerRef = useRef<number | null>(null);
  const finalizar = useFinalizeFlow({
    // Funções intermediárias para o que o App declara mais abaixo; só rodam nos handlers.
    blockIfNotFirstPending: (...args) => blockIfNotFirstPending(...args),
    completingClearTimerRef,
    dados,
    driverContext,
    logAppError: (...args) => logAppError(...args),
    receiveProofs,
    receiveStepPending,
    remoteMode,
    remoteOperation,
    selectedDetail,
    setCompletingDetailKey,
    setCriticalError: (...args) => setCriticalError(...args),
    setReceiveProofs,
    setReceiveUploadedCounts,
    setRemoteOperation,
    setScreen,
    setSelectedDetail,
    setStore,
    setToast: (...args) => setToast(...args),
    store
  });
  const {
    cancelVehicleChoice,
    closeVehicleChoice,
    finalizeSelected,
    finalizeTimerRef,
    getServiceObservationDraft,
    openFinalizeFlow,
    openLocalCancelFlow,
    openVoucherFlow,
    saveSelectedServiceObservation,
    saveVoucherDraft,
    setMaintenanceFinalizeDraft,
    setServiceObservationDrafts,
    setVoucherDrafts,
    vehicleChoiceRequest,
    voucherDraftTimerRef,
    voucherDrafts
  } = finalizar;
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
  const checklistsLista = useChecklists({ dados, driverIdRef: comunicadosDriverIdRef, previewMode: isButtonPreviewMode || isReceiptPreviewMode, setScreen, setToast, setDataLoadingState });
  const {
    checklists,
    selectedChecklistId,
    setSelectedChecklistId,
    setChecklistOrigin,
    reloadChecklists
  } = checklistsLista;
  const comunicadosLista = useComunicados({ dados, driverIdRef: comunicadosDriverIdRef, previewMode: isButtonPreviewMode || isReceiptPreviewMode, setScreen, setDataLoadingState });
  const {
    comunicados,
    comunicadosStatus,
    setSelectedComunicadoId,
    setComunicadoOrigin,
    pendingComunicadoDeepLinkRef,
    reloadComunicados
  } = comunicadosLista;

  useServiceDeepLink({
    dados,
    initialDetailRef,
    isButtonPreviewMode,
    isReceiptPreviewMode,
    pendingServiceDeepLinkRef,
    serviceDeepLinkHandledRef,
    setDataLoadingState,
    setScreen,
    setSelectedDetail,
    setToast
  });

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

  const {
    refreshLocal
  } = useAgendaLoad({
    completeDataLoadingState,
    comunicadosDriverIdRef,
    dados,
    initialHashRouteRef,
    isButtonPreviewMode,
    isReceiptPreviewMode,
    logAppError,
    reloadChecklists,
    reloadComunicados,
    remoteMode,
    screen,
    selectedChecklistId,
    serviceDeepLinkHandledRef,
    setDataLoadingState,
    setDriverContext,
    setRemoteMode,
    setScreen,
    setSelectedDetail,
    setStore,
    setToast,
    store
  });
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

  const telaFinalizar = rotasFinalizar(screen, {
    ...finalizar,
    canGeneratePersonalReceipt,
    clearMaintenanceFinalizePhotoDraft,
    confirmedMaintenancePhotos,
    continueAfterReceive,
    expenseReferenceData,
    expenseReferenceError,
    expenseReferenceLoading,
    getQrChargeProps,
    logAppError,
    maintenanceExistingPreview,
    maintenancePhotoKind,
    openMaintenanceFinalizeCamera,
    openPersonalReceipt,
    openReceiveCamera,
    openReceivePreview,
    photoDraft,
    photoDraftIsVideo,
    photoDraftPreviewUrl,
    photoDraftRawBlob,
    receiveProofs,
    receiveStepPending,
    remoteOperation,
    selectedDetail,
    setCriticalError,
    setMaintenanceExistingPreview,
    setMaintenancePhotoKind,
    setPhotoDraft,
    setPhotoDraftIsVideo,
    setPhotoDraftPreviewUrl,
    setPhotoDraftRawBlob,
    setScreen,
    setStore,
    setToast,
    store
  });
  if (telaFinalizar) return show(telaFinalizar);

  const telaManutencao = rotasManutencao(screen, {
    ...manutencao,
    maintenanceCurrentVehicleId,
    maintenanceVehicles,
    maintenanceVehiclesLoading,
    remoteOperation,
    setScreen,
    setToast
  });
  if (telaManutencao) return show(telaManutencao);

  const telaColisao = rotasColisao(screen, {
    ...colisao,
    driverContext,
    maintenanceCurrentVehicleId,
    maintenanceVehicles,
    maintenanceVehiclesLoading,
    remoteOperation,
    setScreen,
    setToast
  });
  if (telaColisao) return show(telaColisao);

  const telaDespesas = rotasDespesas(screen, {
    ...despesas,
    maintenanceCurrentVehicleId,
    maintenanceVehicles,
    maintenanceVehiclesLoading,
    remoteMode,
    remoteOperation,
    setScreen,
    setToast
  });
  if (telaDespesas) return show(telaDespesas);

  const telaIdeias = rotasIdeias(screen, { ideasGateway, remoteMode, setScreen });
  if (telaIdeias) return show(telaIdeias);

  const telaMeuCarro = rotasMeuCarro(screen, {
    driverContext,
    remoteMode,
    setDriverContext,
    setScreen
  });
  if (telaMeuCarro) return show(telaMeuCarro);

  const telaRecebimento = rotasRecebimento(screen, {
    ...recebimento,
    blockIfNotFirstPending,
    canGeneratePersonalReceipt,
    openPersonalReceipt,
    remoteOperation,
    selectedDetail,
    setScreen,
    setToast
  });
  if (telaRecebimento) return show(telaRecebimento);

  const telaRecibo = rotasRecibo(screen, {
    receiptClienteOptions,
    receiptDetail,
    receiptEntrySource,
    selectedDetail,
    setRemoteOperation,
    setScreen
  });
  if (telaRecibo) return show(telaRecibo);

  const telaVoucher = rotasVoucher(screen, {
    canGeneratePersonalReceipt,
    continueAfterReceive,
    finalizeSelected,
    getQrChargeProps,
    openPersonalReceipt,
    openReceiveCamera,
    openReceivePreview,
    receiveProofs,
    receiveStepPending,
    remoteOperation,
    saveVoucherDraft,
    selectedDetail,
    setScreen,
    setStore,
    setToast,
    store,
    voucherDrafts
  });
  if (telaVoucher) return show(telaVoucher);

  const telaDetalhe = rotasDetalhe(screen, {
    getServiceObservationDraft,
    openFinalizeFlow,
    openLocalCancelFlow,
    openReceiveFlow,
    openVoucherFlow,
    refreshLocal,
    saveSelectedServiceObservation,
    selectedDetail,
    setScreen,
    setToast
  });
  if (telaDetalhe) return show(telaDetalhe);

  const telaHistorico = rotasHistorico(screen, {
    refreshLocal,
    selectedDetail,
    setScreen,
    setSelectedDetail,
    store
  });
  if (telaHistorico) return show(telaHistorico);

  const telaServicos = rotasServicos(screen, {
    checklists,
    completingDetailKey,
    comunicados,
    dados,
    queueHighlightDetailKey,
    refreshLocal,
    remoteMode,
    setChecklistOrigin,
    setComunicadoOrigin,
    setScreen,
    setSelectedChecklistId,
    setSelectedComunicadoId,
    setSelectedDetail,
    setToast,
    store
  });
  if (telaServicos) return show(telaServicos);

  const telaComunicados = rotasComunicados(screen, {
    ...comunicadosLista,
    driverContext,
    setScreen
  });
  if (telaComunicados) return show(telaComunicados);

  const telaTermos = rotasTermos(screen, {
    reloadTermosMulta,
    setScreen,
    termosMulta,
    termosStatus
  });
  if (telaTermos) return show(telaTermos);

  const telaChecklist = rotasChecklist(screen, { ...checklistsLista, setScreen });
  if (telaChecklist) return show(telaChecklist);

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





