import { useMemo, useRef, useState } from "react";
import { getInitialParams } from "./app/bootstrap";
import { isHashRoutingEnabled } from "./app/navigation";
import type { MaintenanceRequestVehicleOption } from "./features/manutencao/remoto";
import type { DriverContext } from "./data/dataverse/cliente";
import { useDados } from "./app/DataProvider";
import { AppShell } from "./app/AppShell";
import { resetDadosLocais } from "./app/resetDadosLocais";
import { useEstadoInicial } from "./app/useEstadoInicial";
import { useCarregarRascunhoMidia } from "./app/useCarregarRascunhoMidia";
import { useAvisosGlobais } from "./app/useAvisosGlobais";
import { useNavegacao } from "./app/useNavegacao";
import { useDadosFormularios } from "./app/useDadosFormularios";
import { useAutoRefreshAgenda } from "./features/servicos/useAutoRefreshAgenda";
import { usePersistenciaRascunhos } from "./app/usePersistenciaRascunhos";
import { useAvisos } from "./app/useAvisos";
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
import { rotasPostos } from "./features/postos/rotas";
import { expenseFlowView } from "./features/despesas/receiptQuickRead";
import { useServiceDeepLink } from "./features/servicos/useServiceDeepLink";
import { useAgendaLoad } from "./features/servicos/useAgendaLoad";
import { useFilaServicos } from "./features/servicos/useFilaServicos";
import { useFinalizeFlow } from "./features/finalizar/useFinalizeFlow";
import { useMaintenanceFinalizePhoto } from "./features/finalizar/useMaintenanceFinalizePhoto";
import { useReceiveFlow } from "./features/recebimento/useReceiveFlow";
import { useQrChargeSummary } from "./features/recebimento/useQrChargeSummary";
import { useReciboPersonalizado } from "./features/recibo/useReciboPersonalizado";
import { useMaintenanceRequestFlow } from "./features/manutencao/useMaintenanceRequestFlow";
import { useCollisionFlow } from "./features/colisao/useCollisionFlow";
import { useComunicados } from "./features/comunicados/useComunicados";
import { useComunicadoDeepLink } from "./features/comunicados/useComunicadoDeepLink";
import { useChecklists } from "./features/checklist/useChecklists";
import { useTermosMulta } from "./features/termos/useTermosMulta";
import { useTreinamentos } from "./features/treinamentos/useTreinamentos";
import { isTreinamentoPendente } from "./features/treinamentos/treinamentos";
import { rotasTreinamentos } from "./features/treinamentos/rotas";
import { useGastosCartao } from "./features/despesas/useGastosCartao";
import type { GastoCartao } from "./features/despesas/gastosCartao";
import { useTour } from "./app/useTour";
import { useIdeasGateway } from "./features/ideias/useIdeasGateway";
import { isComunicadoPending } from "./features/comunicados/comunicados";
import { isChecklistPending } from "./features/checklist/checklists";
import { useExpenseFlow } from "./features/despesas/useExpenseFlow";
import { resumoPendentes, separarTermos } from "./features/termos/termosMulta";
import { ButtonPreviewScreen } from "./app/ButtonPreviewScreen";
import { InitialScreen } from "./features/servicos/InitialScreen";
import { ReceiptPreviewScreen } from "./features/recibo/ReceiptScreen";
import { isThirdPartyDriver } from "./features/meu-carro/myVehicle";
import type { DetailData, MaintenancePhotoKind, Screen } from "./types";
import type { RemoteOperation } from "./shared/ui/FlowProgressOverlay";

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
  const { initialDetailRef, initialHashDetail, initialHashRouteRef, initialScreen, setStore, store } = useEstadoInicial(hashRoutingActive);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  // Tela de onde os postos foram abertos (início ou registrar gasto): o Voltar devolve para lá.
  const [postosOrigem, setPostosOrigem] = useState<Screen>("inicio");
  const previousScreenRef = useRef<Screen>(initialScreen);
  const lastMediaScreenRef = useRef<Screen>(initialScreen);
  const [selectedDetail, setSelectedDetail] = useState<DetailData | null>(() => initialDetailRef.current);
  const fotoManutencao = useMaintenanceFinalizePhoto({ setScreen });
  const avisos = useAvisos({ screen, selectedDetail });
  const { logAppError, setCriticalError, setDataLoadingState, setToast } = avisos;
  const [completingDetailKey, setCompletingDetailKey] = useState("");
  const fila = useFilaServicos({ selectedDetail, setScreen, setToast, store });
  const { blockIfNotFirstPending } = fila;
  const [remoteOperation, setRemoteOperation] = useState<RemoteOperation | null>(null);
  const [remoteMode, setRemoteMode] = useState(false);
  const [driverContext, setDriverContext] = useState<DriverContext | null>(null);
  const recibo = useReciboPersonalizado({
    driverContext,
    inicial: initialScreen === "reciboPersonalizado" && initialHashDetail ? "service" : "home",
    isLocalhostRuntime,
    selectedDetail,
    setScreen,
    setToast
  });
  const { canGeneratePersonalReceipt, openPersonalReceipt, openPersonalReceiptFromHome } = recibo;
  const pendingServiceDeepLinkRef = useRef(getInitialParams());
  // true quando o deep link de serviço já abriu a tela; o fluxo pós-carga não deve sobrescrever a navegação.
  const serviceDeepLinkHandledRef = useRef(false);
  const [maintenanceVehicles, setMaintenanceVehicles] = useState<MaintenanceRequestVehicleOption[]>([]);
  const [maintenanceCurrentVehicleId, setMaintenanceCurrentVehicleId] = useState("");
  const [maintenanceVehiclesLoading, setMaintenanceVehiclesLoading] = useState(false);
  const veiculos = { maintenanceCurrentVehicleId, maintenanceVehicles, maintenanceVehiclesLoading };
  const manutencao = useMaintenanceRequestFlow({
    logAppError,
    maintenanceCurrentVehicleId,
    remoteMode,
    remoteOperation,
    setCriticalError,
    setRemoteOperation,
    setScreen,
    setToast
  });
  // Guarda o motorista logado para recarregar comunicados sem depender do estado ainda não aplicado.
  const comunicadosDriverIdRef = useRef("");
  const gastoCartaoAtualRef = useRef<GastoCartao | null>(null);
  const despesas = useExpenseFlow({
    remoteMode,
    driverContext,
    remoteOperation,
    setRemoteOperation,
    setScreen,
    setToast,
    setCriticalError,
    logAppError,
    // Funções intermediárias para o hook do cartão, chamado mais abaixo; só rodam nos handlers.
    gastoCartaoAtualRef,
    concluirGastoCartao: (...args) => cartao.concluirGastoCartao(...args),
    gastosCartaoPendentes: () => cartao.gastosCartaoPendentes,
    setDuplicidadeCartao: (...args) => cartao.setDuplicidadeCartao(...args),
    relatorioDespesas: () => cartao.relatorioDespesas,
    comunicadosDriverIdRef
  });
  const { expenseReferenceData, expenseReferenceError, expenseReferenceLoading } = despesas;
  const [receiptClienteOptions, setReceiptClienteOptions] = useState<string[]>([]);
  const recebimento = useReceiveFlow({
    blockIfNotFirstPending,
    checkReceiveProof: despesas.checkReceiveProof,
    driverContext,
    isLocalhostRuntime,
    logAppError,
    remoteMode,
    remoteOperation,
    screen,
    selectedDetail,
    setCriticalError,
    setRemoteOperation,
    setScreen
  });
  const { continueAfterReceive, getQrChargeProps, openReceiveCamera, openReceivePreview, receiveProofs, receiveStepPending } = recebimento;
  const colisao = useCollisionFlow({
    driverContext,
    logAppError,
    maintenanceCurrentVehicleId,
    remoteMode,
    remoteOperation,
    setCriticalError,
    setRemoteOperation,
    setScreen,
    setToast
  });
  const mediaDraftLoaded = useCarregarRascunhoMidia({
    isButtonPreviewMode,
    isReceiptPreviewMode,
    screen,
    setReceiveProofs: recebimento.setReceiveProofs,
    setStore
  });
  const completingClearTimerRef = useRef<number | null>(null);
  const finalizar = useFinalizeFlow({
    blockIfNotFirstPending,
    completingClearTimerRef,
    dados,
    driverContext,
    logAppError,
    receiveProofs,
    receiveStepPending,
    remoteMode,
    remoteOperation,
    selectedDetail,
    setCompletingDetailKey,
    setCriticalError,
    setReceiveProofs: recebimento.setReceiveProofs,
    setReceiveUploadedCounts: recebimento.setReceiveUploadedCounts,
    setRemoteOperation,
    setScreen,
    setSelectedDetail,
    setStore,
    setToast,
    store
  });
  const { finalizeSelected, getServiceObservationDraft, openFinalizeFlow, openLocalCancelFlow, openVoucherFlow, saveSelectedServiceObservation, saveVoucherDraft, voucherDrafts } = finalizar;
  const lastGlobalErrorRef = useRef<{ id: string; at: number }>({ id: "", at: 0 });

  usePersistenciaRascunhos({
    isButtonPreviewMode,
    isReceiptPreviewMode,
    lastMediaScreenRef,
    mediaDraftLoaded,
    receiveProofs,
    remoteMode,
    screen,
    setToast,
    store,
    voucherDrafts
  });

  const { termosMulta, termosStatus, reloadTermosMulta } = useTermosMulta(comunicadosDriverIdRef, driverContext?.id);
  const treinamentosLista = useTreinamentos({ comunicadosDriverIdRef, driverContextId: driverContext?.id, setScreen });
  const { setSelectedTreinamentoId, treinamentos } = treinamentosLista;
  const cartao = useGastosCartao({ comunicadosDriverIdRef, despesas, driverContextId: driverContext?.id, gastoCartaoAtualRef, remoteMode, screen, setScreen });
  const checklistsLista = useChecklists({ dados, driverIdRef: comunicadosDriverIdRef, previewMode: isButtonPreviewMode || isReceiptPreviewMode, setScreen, setToast, setDataLoadingState });
  const { checklists, setChecklistOrigin, setSelectedChecklistId } = checklistsLista;
  const comunicadosLista = useComunicados({ dados, driverIdRef: comunicadosDriverIdRef, previewMode: isButtonPreviewMode || isReceiptPreviewMode, setScreen, setDataLoadingState });
  const { comunicados, setComunicadoOrigin } = comunicadosLista;

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

  useComunicadoDeepLink({ comunicadosLista, setScreen, setToast });

  const { refreshLocal } = useAgendaLoad({
    completeDataLoadingState: avisos.completeDataLoadingState,
    comunicadosDriverIdRef,
    dados,
    initialHashRouteRef,
    isButtonPreviewMode,
    isReceiptPreviewMode,
    logAppError,
    reloadChecklists: checklistsLista.reloadChecklists,
    reloadComunicados: comunicadosLista.reloadComunicados,
    remoteMode,
    screen,
    selectedChecklistId: checklistsLista.selectedChecklistId,
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
  useAvisosGlobais({
    completingClearTimerRef,
    finalizeTimerRef: finalizar.finalizeTimerRef,
    lastGlobalErrorRef,
    setCriticalError,
    setCriticalErrorState: avisos.setCriticalErrorState,
    setToastState: avisos.setToastState,
    toast: avisos.toast,
    voucherDraftTimerRef: finalizar.voucherDraftTimerRef
  });

  const confirmedMaintenancePhotos = useMemo(() => {
    if (!selectedDetail) return [];
    return Object.keys(store.photos[selectedDetail.id] ?? {}) as MaintenancePhotoKind[];
  }, [selectedDetail, store.photos]);

  useQrChargeSummary({ logAppError, recebimento });

  useNavegacao({
    hashRoutingActive,
    previousScreenRef,
    receiptDetail: recibo.receiptDetail,
    screen,
    selectedDetail
  });

  const tour = useTour({
    blocked: Boolean(finalizar.vehicleChoiceRequest || remoteOperation || despesas.expenseSend),
    criticalError: avisos.criticalError,
    dataLoading: avisos.dataLoading,
    driverContextId: driverContext?.id,
    expenseReading: screen === "gastos" && expenseFlowView(despesas.expenseQuickRead) === "leitura",
    screen,
    selectedChecklistId: checklistsLista.selectedChecklistId,
    selectedComunicadoId: comunicadosLista.selectedComunicadoId,
    selectedTreinamentoId: treinamentosLista.selectedTreinamentoId,
    setToast
  });

  const ideasGateway = useIdeasGateway(dados, remoteMode);

  useDadosFormularios({
    driverContext,
    expenseReferenceData,
    isLocalhostRuntime,
    remoteMode,
    screen,
    selectedDetail,
    setDataLoadingState,
    setDriverContext,
    setExpenseReferenceData: despesas.setExpenseReferenceData,
    setExpenseReferenceError: despesas.setExpenseReferenceError,
    setExpenseReferenceLoading: despesas.setExpenseReferenceLoading,
    setMaintenanceCurrentVehicleId,
    setMaintenanceRequestDraft: manutencao.setMaintenanceRequestDraft,
    setMaintenanceVehicles,
    setMaintenanceVehiclesLoading,
    setReceiptClienteOptions,
    setToast
  });

  const show = (node: React.ReactNode) => (
    <AppShell
      abrirAvisoTreinamentos={treinamentosLista.abrirAvisoTreinamentos}
      avisoTreinamentos={treinamentosLista.avisoTreinamentos}
      cancelVehicleChoice={finalizar.cancelVehicleChoice}
      closeExpenseSendError={despesas.closeExpenseSendError}
      closeTour={tour.closeTour}
      closeVehicleChoice={finalizar.closeVehicleChoice}
      criticalError={avisos.criticalError}
      dataLoading={avisos.dataLoading}
      duvidaConferencia={despesas.duvidaConferencia}
      expenseSend={despesas.expenseSend}
      previousScreen={previousScreenRef.current}
      remoteMode={remoteMode}
      openTourHelp={tour.openTourHelp}
      remoteOperation={remoteOperation}
      screen={screen}
      setAvisoTreinamentos={treinamentosLista.setAvisoTreinamentos}
      setCriticalError={setCriticalError}
      setToastState={avisos.setToastState}
      toast={avisos.toast}
      tourCandidates={tour.tourCandidates}
      tourChapter={tour.tourChapter}
      vehicleChoiceRequest={finalizar.vehicleChoiceRequest}
    >
      {node}
    </AppShell>
  );

  if (isButtonPreviewMode) {
    return show(<ButtonPreviewScreen onShowToast={setToast} />);
  }

  if (isReceiptPreviewMode) {
    return show(<ReceiptPreviewScreen />);
  }

  const resetLocalData = () => resetDadosLocais({
    colisao,
    completingClearTimerRef,
    despesas,
    fila,
    finalizar,
    fotoManutencao,
    isLocalhostRuntime,
    manutencao,
    recebimento,
    remoteMode,
    setCompletingDetailKey,
    setCriticalError,
    setReceiptEntrySource: recibo.setReceiptEntrySource,
    setRemoteOperation,
    setScreen,
    setSelectedDetail,
    setStore,
    setToast,
    tourDriverId: tour.tourDriverId
  });

  useAutoRefreshAgenda({
    refreshLocal,
    remoteMode,
    remoteOperation,
    screen,
    selectedDetail
  });

  const navigateFromInitial = (screenName: string) => {
    // Gastos abre o relatório do motorista; a lista do cartão fica em "Completar" e a câmera no CTA "Anexar despesa".
    if (screenName === "gastos") {
      setComunicadoOrigin("");
      setScreen("gastosRelatorio");
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
    if (screenName === "treinamentos") setSelectedTreinamentoId("");
    if (screenName === "gastosCartao") {
      setComunicadoOrigin("");
      setScreen("gastosCartao");
      return;
    }
    if (screenName === "postosProximos") {
      setComunicadoOrigin("");
      setPostosOrigem("inicio");
      setScreen("postosProximos");
      return;
    }
    if (screenName === "servicos" || screenName === "comunicados" || screenName === "historico" || screenName === "solicitarManutencao" || screenName === "gastos" || screenName === "colisoesInicio" || screenName === "boasIdeias" || screenName === "meuCarro" || screenName === "multas" || screenName === "treinamentos") {
      setComunicadoOrigin("");
      setScreen(screenName);
    }
  };

  const telaFinalizar = rotasFinalizar(screen, {
    ...finalizar,
    ...fotoManutencao,
    canGeneratePersonalReceipt,
    confirmedMaintenancePhotos,
    continueAfterReceive,
    expenseReferenceData,
    expenseReferenceError,
    expenseReferenceLoading,
    getQrChargeProps,
    logAppError,
    openPersonalReceipt,
    openReceiveCamera,
    openReceivePreview,
    receiveProofs,
    receiveStepPending,
    remoteOperation,
    selectedDetail,
    setCriticalError,
    setScreen,
    setStore,
    setToast,
    store
  });
  if (telaFinalizar) return show(telaFinalizar);

  const telaManutencao = rotasManutencao(screen, { ...manutencao, ...veiculos, remoteOperation, setScreen, setToast });
  if (telaManutencao) return show(telaManutencao);

  const telaColisao = rotasColisao(screen, { ...colisao, ...veiculos, driverContext, remoteOperation, setScreen, setToast });
  if (telaColisao) return show(telaColisao);

  const abrirPostosDoGasto = (origem: Screen) => { setPostosOrigem(origem); setScreen("postosProximos"); };
  const telaDespesas = rotasDespesas(screen, { ...despesas, ...cartao, ...veiculos, abrirPostosProximos: abrirPostosDoGasto, remoteMode, remoteOperation, setScreen, setToast });
  if (telaDespesas) return show(telaDespesas);

  const telaPostos = rotasPostos(screen, { origem: postosOrigem, setScreen, motoristaId: driverContext?.id ?? "" });
  if (telaPostos) return show(telaPostos);

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
    receiptDetail: recibo.receiptDetail,
    receiptEntrySource: recibo.receiptEntrySource,
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
    openReceiveFlow: recebimento.openReceiveFlow,
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
    queueHighlightDetailKey: fila.queueHighlightDetailKey,
    refreshLocal,
    remoteMode,
    setChecklistOrigin,
    setComunicadoOrigin,
    setScreen,
    setSelectedChecklistId,
    setSelectedComunicadoId: comunicadosLista.setSelectedComunicadoId,
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
    setTourTermoId: tour.setTourTermoId,
    termosMulta,
    termosStatus
  });
  if (telaTermos) return show(telaTermos);

  const telaTreinamentos = rotasTreinamentos(screen, { ...treinamentosLista, driverContext, setScreen });
  if (telaTreinamentos) return show(telaTreinamentos);

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
      pendingTreinamentos={treinamentos.filter(isTreinamentoPendente).length}
      pendingGastosCartao={cartao.gastosCartaoPendentes.length}
      multasBanner={resumoPendentes(termosMulta)}
      driverId={driverContext?.id}
      driverName={driverContext?.fullName}
      showLocalReset={isLocalhostRuntime && !remoteMode}
      onResetLocalData={resetLocalData}
      onShowTour={tour.restartTour}
    />
  );
}

export default App;
