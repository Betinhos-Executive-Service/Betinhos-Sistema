import { useRef, useState } from "react";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { assertExpenseSchemaReadyRemote, conferirDespesaRemote, createExpenseUploadItem, dispatchExpenseUploadRemote, ensureExpenseSubmissionRemote, loadExpenseLookupNavigationNamesRemote, loadExpenseReferenceDataRemote, loadExpenseUploadRowsRemote, readReceiptQuick, transitionExpenseUploadRemote, uploadExpenseInvoiceRemote } from "./remoto";
import { createOne, getDriverContext, getDriverCurrentVehicleId, updateOne, type DriverContext } from "../../data/dataverse/cliente";
import { DATAVERSE } from "../../data/dataverse/entidades";
import { reportAppError } from "../../shared/appErrorLogger";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import { wait } from "../../shared/wait";
import type { CapturedVideoDraft, Screen } from "../../types";
import { isVideoMediaDraft, prepareMediaDraftForUpload, revokePhotoPreviewUrls } from "../fotos/envioMidia";
import { hasMediaDraftContent, revokePreviewUrl } from "../fotos/mediaDrafts";
import { useMediaDraftState } from "../fotos/useMediaDraftState";
import { quickReadValueCents } from "../recebimento/receiveProofCheck";
import { resumeExpenseSubmission, type ExpenseSubmissionProgress } from "./expenseSubmission";
import { describeExpenseSubmission, type ExpenseSubmission, type ExpenseUploadRow } from "./expenseUploadState";
import { DEFAULT_EXPENSE_REFERENCE_DATA, buildExpenseCreatePayload, parseCurrencyInput, type ExpenseDraft, type ExpensePhoto, type ExpenseReferenceData } from "./expenses";
import {
  INITIAL_QUICK_READ,
  QUICK_READ_FILL_STEP_MS,
  applyQuickRead,
  downscaleForQuickRead,
  hasRemoteReferenceData,
  nextQuickReadState,
  quickReadFilledFields,
  reabrirLeitura,
  runQuickReadPipeline,
  shouldRunQuickRead,
  startQuickReadState,
  type QuickReadFilledFields,
  type QuickReadState
} from "./receiptQuickRead";
import { getQuickReadMockMode, readReceiptQuickMock } from "./receiptQuickReadMock";
import { EMPTY_EXPENSE_DRAFT } from "./rascunho";
import { useExpenseUploads } from "./useExpenseUploads";
import { TIMEOUT_CONFERENCIA_MS, calcularSinais, camposConferencia, carregarServicosConferencia, lerRespostaConferencia, montarCorpoConferencia, respostaConferenciaMock, type ConferenciaEnvio, type GastoConferido } from "./conferenciaEnvio";
import { STATUS_OPERACIONAL, acharGastoCartaoDuplicado, aplicarLeituraNoGastoCartao, buildGastoCartaoCompletarPayload, concluirGastoCartaoMock, conferirLeituraComCartao, isMockGastosCartao, type ConferenciaCartao, type GastoCartao } from "./gastosCartao";
import { carregarDespesasRelatorio, type DespesaRelatorio } from "./gastosRelatorio";

type Options = {
  remoteMode: boolean;
  driverContext: DriverContext | null;
  remoteOperation: RemoteOperation | null;
  setRemoteOperation: (operation: RemoteOperation | null) => void;
  setScreen: (screen: Screen) => void;
  setToast: (message: string, tone?: ToastTone) => void;
  setCriticalError: (message: string) => void;
  logAppError: (error: unknown, action: string, phase?: string) => void;
  // Gasto do cartão em preenchimento e o que o hook do cartão (chamado mais abaixo no App) oferece.
  gastoCartaoAtualRef: React.MutableRefObject<GastoCartao | null>;
  concluirGastoCartao: (id: string) => Screen;
  gastosCartaoPendentes: () => GastoCartao[];
  setDuplicidadeCartao: (gasto: GastoCartao | null) => void;
  relatorioDespesas: () => DespesaRelatorio[] | null;
  comunicadosDriverIdRef: React.MutableRefObject<string>;
};

// Fluxo de "Registrar gasto": rascunho, fotos do comprovante, leitura rápida e envio
// (assíncrono pelo diário de despesas ou síncrono com o overlay de processo remoto).
export function useExpenseFlow({ remoteMode, driverContext, remoteOperation, setRemoteOperation, setScreen, setToast, setCriticalError, logAppError, gastoCartaoAtualRef, concluirGastoCartao, gastosCartaoPendentes, setDuplicidadeCartao, relatorioDespesas, comunicadosDriverIdRef }: Options) {
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({ ...EMPTY_EXPENSE_DRAFT });
  const [expenseQuickRead, setExpenseQuickRead] = useState<QuickReadState>(INITIAL_QUICK_READ);
  const expenseQuickReadSeqRef = useRef(0);
  const [expenseQuickReadPhoto, setExpenseQuickReadPhoto] = useState("");
  const [expenseQuickReadFilling, setExpenseQuickReadFilling] = useState(false);
  const [expenseQuickReadFilled, setExpenseQuickReadFilled] = useState<QuickReadFilledFields>({});
  const [conferenciaCartao, setConferenciaCartao] = useState<ConferenciaCartao | null>(null);
  const expenseDraftRef = useRef(expenseDraft);
  expenseDraftRef.current = expenseDraft;
  const expenseRetakeTargetIdRef = useRef("");
  const expenseDateTouchedRef = useRef(false);
  const [expenseReferenceData, setExpenseReferenceData] = useState<ExpenseReferenceData>(DEFAULT_EXPENSE_REFERENCE_DATA);
  const [expenseReferenceLoading, setExpenseReferenceLoading] = useState(false);
  const [expenseReferenceError, setExpenseReferenceError] = useState("");
  const [expensePhotos, setExpensePhotos] = useState<ExpensePhoto[]>([]);
  // Conferência no envio: data/hora lidas no cupom, resultado da última conferência e o popup "Dúvida" aberto.
  const expenseQuickReadLeituraRef = useRef<{ data: string | null; hora: string | null } | null>(null);
  const conferenciaRef = useRef<ConferenciaEnvio | null>(null);
  const [duvidaConferencia, setDuvidaConferencia] = useState<{ pergunta: string; responder: (justificativa: string | null) => void } | null>(null);
  const {
    expenseSubmissions,
    expenseAutoResumeAtRef,
    expenseNoticeRef,
    expenseRunningRef,
    expenseSend,
    setExpenseSend,
    expenseSubmissionsRef,
    expenseSubmitBusyRef,
    expenseUploadMode,
    expenseUploadReady,
    expenseUploadRows,
    setExpenseUploadRows,
    expenseUploadStatuses,
    expenseWorkerRef,
    setExpenseRunningIds,
    upsertExpenseSubmission
  } = useExpenseUploads({
    remoteMode,
    driverContext,
    // Funções intermediárias: setToast e setCriticalError são declarados mais abaixo e só rodam nos efeitos.
    notify: (message, tone) => setToast(message, tone),
    onCriticalError: (message) => setCriticalError(message)
  });
  const {
    draft: expensePhotoDraft, setDraft: setExpensePhotoDraft,
    previewUrl: expensePhotoPreviewUrl, setPreviewUrl: setExpensePhotoPreviewUrl,
    posterUrl: expensePhotoPosterUrl, setPosterUrl: setExpensePhotoPosterUrl,
    durationLabel: expensePhotoDurationLabel, setDurationLabel: setExpensePhotoDurationLabel,
    rawBlob: expensePhotoRawBlob, setRawBlob: setExpensePhotoRawBlob,
    isVideo: expensePhotoIsVideo, setIsVideo: setExpensePhotoIsVideo,
    clear: clearExpensePhotoDraftState
  } = useMediaDraftState();
  const [expensePreviewPhotoId, setExpensePreviewPhotoId] = useState("");

  const isExpenseDraftBlank = (draft: ExpenseDraft) =>
    !draft.categoriaId && !draft.veiculoId && !draft.valor && !draft.formaPagamentoId && !draft.cidadeId &&
    !draft.estabelecimento && !draft.descricao && !draft.kmInformado && !draft.litros && !expenseDateTouchedRef.current;

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
        const referenceData = await loadExpenseReferenceDataRemote();
        const photos = submission.items.map(item => ({ id: item.id, dataUrl: item.dataUrl, mediaType: item.mimeType.startsWith("video/") ? "video" as const : "foto" as const }));
        submission.payload = submission.existing
          ? buildGastoCartaoCompletarPayload({
            draft: submission.draft, photos, referenceData, veiculoId: submission.vehicleId ?? "", categoryEntitySet: DATAVERSE.categoriasDespesasOperacionais,
            cityEntitySet: DATAVERSE.cidades, veiculoEntitySet: DATAVERSE.veiculos, lookupNavigationNames: names
          })
          : buildExpenseCreatePayload({
            draft: submission.draft, referenceData, motoristaId, veiculoId: submission.vehicleId ?? "", photos,
            categoryEntitySet: DATAVERSE.categoriasDespesasOperacionais, paymentMethodEntitySet: DATAVERSE.formasPagamentoDespesas,
            cityEntitySet: DATAVERSE.cidades, motoristaEntitySet: DATAVERSE.funcionarios, veiculoEntitySet: DATAVERSE.veiculos,
            reservaEntitySet: DATAVERSE.geral, lookupNavigationNames: names
          });
        submission.payload = { ...submission.payload, ...(submission.conferencia ?? {}) };
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
      const completing = gastoCartaoAtualRef.current;
      const submission: ExpenseSubmission = {
        expenseId: completing?.id ?? crypto.randomUUID(), existing: Boolean(completing), expenseConfirmed: false, draft: { ...draft }, payload: {}, motoristaId: driverContext.id,
        vehicleId: draft.veiculoId || getDriverCurrentVehicleId(driverContext),
        items: photos.map((photo, index) => createExpenseUploadItem(photo.dataUrl, index + 1)),
        conferencia: conferenciaRef.current ? camposConferencia(conferenciaRef.current) : undefined
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
      let destino: Screen = "inicio";
      const clearForm = () => {
        if (completing) {
          destino = concluirGastoCartao(completing.id);
          return;
        }
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
      setScreen(destino);
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
    const completing = gastoCartaoAtualRef.current;
    if (!remoteMode && completing && isMockGastosCartao()) {
      setRemoteOperation({ title: "Enviando gasto", message: "Completando gasto do cartão.", phase: "loading" });
      await wait(700);
      concluirGastoCartaoMock(completing.id);
      setRemoteOperation({ title: "Enviando gasto", message: "Gasto enviado.", detailId: completing.id, phase: "success" });
      await wait(720);
      setRemoteOperation(null);
      setScreen(concluirGastoCartao(completing.id));
      setToast("Gasto enviado.");
      return;
    }
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
      const payload = completing
        ? buildGastoCartaoCompletarPayload({
          draft,
          photos: preparedPhotosToSubmit,
          referenceData: expenseReferenceData,
          veiculoId,
          categoryEntitySet: DATAVERSE.categoriasDespesasOperacionais,
          cityEntitySet: DATAVERSE.cidades,
          veiculoEntitySet: DATAVERSE.veiculos,
          lookupNavigationNames
        })
        : buildExpenseCreatePayload({
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
      if (conferenciaRef.current) Object.assign(payload, camposConferencia(conferenciaRef.current));
      if (completing) await updateOne(DATAVERSE.despesasOperacionais, completing.id, payload);
      const result = completing ? { id: completing.id } : await createOne(DATAVERSE.despesasOperacionais, payload);
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
            expenseName: completing?.nome ?? String(payload.cr40f_nome ?? "Despesa"),
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
      if (completing) {
        setScreen(concluirGastoCartao(completing.id));
        setToast("Gasto enviado.");
        return;
      }
      setScreen("inicio");
      setToast("Gasto registrado.");
    } catch (error) {
      if (createdExpenseId) {
        try {
          // Gasto do cartão volta para "Precisa corrigir" e continua na lista para o motorista tentar de novo.
          await updateOne(DATAVERSE.despesasOperacionais, createdExpenseId, completing
            ? { cr40f_statusanexo: 100000003, cr40f_statusoperacional: STATUS_OPERACIONAL.precisaCorrigir }
            : { cr40f_statusanexo: 100000003 });
        } catch (statusError) {
          logAppError(statusError, "submitExpense", "statusanexo");
        }
      }
      logAppError(error, "submitExpense", "create");
      setRemoteOperation(null);
      setCriticalError(error instanceof Error ? error.message : "Falha ao registrar gasto.");
    }
  };

  // Gasto novo pago no cartão que já existe pendente (mesmo valor e data próxima): avisa antes de duplicar.
  // Conferência no envio: calcula os sinais no app; só chama a IA quando há algum. Devolve null se o motorista
  // escolher "Voltar e corrigir". Qualquer falha vira "indisponível" e o envio segue (o motorista nunca fica travado).
  const conferirAntesDeEnviar = async (draft: ExpenseDraft): Promise<ConferenciaEnvio | null> => {
    const leitura = expenseQuickReadLeituraRef.current;
    const hora = leitura?.hora && leitura.data === draft.dataGasto ? leitura.hora : null;
    const horaAgora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const completing = gastoCartaoAtualRef.current;
    const numero = (texto: string) => { const n = parseCurrencyInput(texto); return Number.isFinite(n) && n > 0 ? n : null; };
    const gasto: GastoConferido = {
      id: completing?.id,
      categoria: expenseReferenceData.categories.find((c) => c.id === draft.categoriaId)?.name ?? "",
      valor: parseCurrencyInput(draft.valor) || 0,
      data: draft.dataGasto,
      hora: hora ?? horaAgora,
      litros: numero(draft.litros),
      km: numero(draft.kmInformado),
      veiculoId: draft.veiculoId
    };
    const motoristaId = driverContext?.id ?? comunicadosDriverIdRef.current;
    try {
      const relatorio = relatorioDespesas();
      const [recentes, servicos] = await Promise.all([
        relatorio ? Promise.resolve(relatorio) : carregarDespesasRelatorio(motoristaId).catch(() => []),
        carregarServicosConferencia(motoristaId, draft.dataGasto).catch(() => null)
      ]);
      const { sinais, servicoDiaVizinho } = calcularSinais({ gasto, leituraData: leitura?.data ?? null, recentes, servicos });
      const motivos = sinais.map((s) => s.tipo);
      if (!sinais.length) return { resultado: "sem_sinal", motivos, hora };
      setRemoteOperation({ title: "Enviando gasto", message: "Conferindo o gasto...", phase: "loading" });
      const corpo = montarCorpoConferencia({ gasto, descricao: draft.descricao, leituraData: leitura?.data ?? null, sinais, servicoDiaVizinho, recentes });
      const resposta = lerRespostaConferencia(isMockGastosCartao() ? await respostaConferenciaMock(sinais) : await conferirDespesaRemote(corpo, TIMEOUT_CONFERENCIA_MS));
      setRemoteOperation(null);
      if (!resposta) return { resultado: "indisponivel", motivos, hora };
      if (resposta.resultado === "sem_duvida") return { resultado: "sem_duvida", motivos, hora };
      const justificativa = await new Promise<string | null>((resolve) => setDuvidaConferencia({ pergunta: resposta.pergunta, responder: resolve }));
      setDuvidaConferencia(null);
      if (justificativa == null) return null;
      return { resultado: "duvida_respondida", motivos: resposta.motivos.length ? resposta.motivos : motivos, pergunta: resposta.pergunta, justificativa, hora };
    } catch (error) {
      setRemoteOperation(null);
      reportAppError(error, { severity: "warning", source: "app", action: "conferenciaEnvio", notifyUser: false });
      return { resultado: "indisponivel", motivos: [], hora };
    }
  };

  const submitExpenseChecked = async (draft: ExpenseDraft) => {
    if (!gastoCartaoAtualRef.current) {
      const duplicado = acharGastoCartaoDuplicado(gastosCartaoPendentes(), draft.formaPagamentoId, parseCurrencyInput(draft.valor), draft.dataGasto);
      if (duplicado) {
        setDuplicidadeCartao(duplicado);
        return;
      }
    }
    if (expenseSubmitBusyRef.current || remoteOperation) return;
    const conferencia = await conferirAntesDeEnviar(draft);
    if (!conferencia) return;
    conferenciaRef.current = conferencia;
    try {
      return await submitExpense(draft);
    } finally {
      conferenciaRef.current = null;
    }
  };


  function resetExpenseQuickRead() {
    expenseQuickReadSeqRef.current++;
    expenseQuickReadLeituraRef.current = null;
    expenseRetakeTargetIdRef.current = "";
    expenseDateTouchedRef.current = false;
    setExpenseQuickRead(INITIAL_QUICK_READ);
    setExpenseQuickReadPhoto("");
    setExpenseQuickReadFilling(false);
    setExpenseQuickReadFilled({});
    setConferenciaCartao(null);
  }

  // Conferência do comprovante de recebimento pela mesma leitura rápida dos gastos: só o valor importa.
  const checkReceiveProof = async (photo: ExpensePhoto) => {
    const mockMode = remoteMode ? null : getQuickReadMockMode();
    const { outcome, referenceData } = await runQuickReadPipeline({
      referenceData: expenseReferenceData,
      isReferenceReady: mockMode ? (data) => data.categories.length > 0 && data.paymentMethods.length > 0 : hasRemoteReferenceData,
      loadReferenceData: mockMode ? async () => DEFAULT_EXPENSE_REFERENCE_DATA : loadExpenseReferenceDataRemote,
      prepareImage: () => downscaleForQuickRead(photo.dataUrl),
      read: mockMode ? (_base64, categorias, formas, timeoutMs) => readReceiptQuickMock(mockMode, categorias, formas, timeoutMs) : readReceiptQuick
    });
    if (referenceData && referenceData !== expenseReferenceData) setExpenseReferenceData(referenceData);
    return quickReadValueCents(outcome);
  };

  const runExpenseQuickRead = async (dataUrl: string) => {
    const mockMode = remoteMode ? null : getQuickReadMockMode();
    if ((!remoteMode && !mockMode) || !shouldRunQuickRead(expenseQuickRead)) return;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const started = startQuickReadState(expenseQuickRead, { online });
    setExpenseQuickRead(started);
    if (started.status !== "lendo") return;
    const seq = ++expenseQuickReadSeqRef.current;
    const gastoCartao = gastoCartaoAtualRef.current;
    setConferenciaCartao(null);
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
      if (gastoCartao) {
        // Valor, data e forma vêm do banco: a leitura só confere e completa categoria, cidade e litros vazios.
        const after = aplicarLeituraNoGastoCartao(before, outcome.leitura, referenceData);
        setExpenseDraft(after);
        setExpenseQuickReadFilled(quickReadFilledFields(before, after));
        setConferenciaCartao(conferirLeituraComCartao(gastoCartao, outcome.leitura));
      } else {
        const { draft: after, filled } = applyQuickRead(before, outcome.leitura, referenceData, { replaceAutoDate: !expenseDateTouchedRef.current });
        expenseQuickReadLeituraRef.current = { data: outcome.leitura.data ?? null, hora: outcome.leitura.hora ?? null };
        setExpenseDraft(after);
        setExpenseQuickReadFilled(filled);
      }
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

  /** "Trocar foto" na folha de conferência do cartão: a foto nova é lida de novo. */
  const refazerLeituraCartao = () => {
    setConferenciaCartao(null);
    setExpenseQuickRead(reabrirLeitura);
    retakeQuickReadPhoto();
  };

  const isExpenseIdle = () => !expenseUploadStatuses.length && expensePhotos.length === 0 && isExpenseDraftBlank(expenseDraft);

  // Envios pendentes ou rascunho em andamento vão para o formulário; senão abre a câmera direto.
  const anexarDespesa = () => {
    if (isExpenseIdle()) openExpenseCamera(); else setScreen("gastos");
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

  return {
    anexarDespesa,
    cancelExpenseQuickRead,
    checkReceiveProof,
    clearExpensePhotoDraftState,
    closeExpenseSendError,
    conferenciaCartao,
    confirmExpensePhoto,
    deleteExpensePhoto,
    duvidaConferencia,
    expenseDateTouchedRef,
    expenseDraft,
    expenseDraftRef,
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
    expenseSubmissions,
    expenseUploadMode,
    expenseUploadReady,
    expenseUploadStatuses,
    handleExpenseUploadAction,
    isExpenseDraftBlank,
    isExpenseIdle,
    openExpenseCamera,
    openExpensePreview,
    openExpenseVideoPreview,
    refazerLeituraCartao,
    resetExpenseQuickRead,
    retakeQuickReadPhoto,
    setConferenciaCartao,
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
    submitExpense,
    submitExpenseChecked
  };
}
