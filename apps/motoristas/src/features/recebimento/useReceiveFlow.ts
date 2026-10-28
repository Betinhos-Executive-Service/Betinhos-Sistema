import { useRef, useState } from "react";
import { hasUploadedReceiveProofs, isReceiveStepPending, shouldRouteServiceToVoucher } from "../../app/detailFlow";
import { uploadReceiveProofRemote, type DriverContext } from "../../lib/dataverse";
import { getQrChargeReceiveState, getReceivableCents, type QrChargeSummary } from "./qrCharge";
import { getQuickReadMockMode } from "../despesas/receiptQuickReadMock";
import type { ExpensePhoto } from "../despesas/expenses";
import { hasMediaDraftContent, revokePreviewUrl } from "../fotos/mediaDrafts";
import type { CapturedVideoDraft, DetailData, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import { wait } from "../../shared/wait";
import { isTrueLike } from "../../shared/isTrueLike";
import { loadFinalizeDraftAssets } from "../finalizar/rascunhos";
import { isVideoMediaDraft, prepareMediaDraftForUpload } from "../fotos/envioMidia";
import { useMediaDraftState } from "../fotos/useMediaDraftState";

type Options = {
  blockIfNotFirstPending: (detail?: DetailData | null) => boolean;
  checkReceiveProof: (photo: ExpensePhoto) => Promise<number | null>;
  driverContext: DriverContext | null;
  isLocalhostRuntime: boolean;
  logAppError: (error: unknown, action: string, phase?: string) => void;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  screen: Screen;
  selectedDetail: DetailData | null;
  setCriticalError: (message: string) => void;
  setRemoteOperation: (operation: RemoteOperation | null) => void;
  setScreen: (screen: Screen) => void;
};

// Recebimento do serviço: comprovantes (fotos/vídeos), cobrança por QR (pagos nesta sessão e resumo do plugin) e passo seguinte do fluxo.
export function useReceiveFlow({ blockIfNotFirstPending, checkReceiveProof, driverContext, isLocalhostRuntime, logAppError, remoteMode, remoteOperation, screen, selectedDetail, setCriticalError, setRemoteOperation, setScreen }: Options) {
  const [receiveProofs, setReceiveProofs] = useState<Record<string, ExpensePhoto[]>>(() => loadFinalizeDraftAssets().receiveProofs);
  // Cobranças pagas por QR nesta sessão (serviço → sessão do Stripe → centavos). O registro definitivo fica no
  // Dataverse (cr40f_cobrancastripe) e volta pelo resumo do plugin, que sobrevive a recarregar a página.
  const [qrChargesPaid, setQrChargesPaid] = useState<Record<string, Record<string, number>>>({});
  const [qrChargeSummaries, setQrChargeSummaries] = useState<
    Record<string, { status: "loading" | "ready" | "error"; summary?: QrChargeSummary; stale?: boolean }>
  >({});
  const qrChargeSummaryInFlightRef = useRef(new Set<string>());
  const [receiveUploadedCounts, setReceiveUploadedCounts] = useState<Record<string, number>>({});
  const {
    draft: receivePhotoDraft, setDraft: setReceivePhotoDraft,
    previewUrl: receivePhotoPreviewUrl, setPreviewUrl: setReceivePhotoPreviewUrl,
    posterUrl: receivePhotoPosterUrl, setPosterUrl: setReceivePhotoPosterUrl,
    durationLabel: receivePhotoDurationLabel, setDurationLabel: setReceivePhotoDurationLabel,
    rawBlob: receivePhotoRawBlob, setRawBlob: setReceivePhotoRawBlob,
    isVideo: receivePhotoIsVideo, setIsVideo: setReceivePhotoIsVideo,
    clear: clearReceivePhotoDraftState
  } = useMediaDraftState();
  const [receivePreviewPhotoId, setReceivePreviewPhotoId] = useState("");
  const canChargeByQr = isTrueLike(driverContext?.funcionario?.cr40f_podecobrarqrcode) || isLocalhostRuntime;
  const sumQrChargesPaid = (paid: Record<string, number> | undefined) => Object.values(paid ?? {}).reduce((total, cents) => total + cents, 0);
  const qrChargeState = (detail: DetailData, localPaid = qrChargesPaid[detail.id]) =>
    getQrChargeReceiveState(getReceivableCents(detail), qrChargeSummaries[detail.id]?.summary, sumQrChargesPaid(localPaid));
  const qrChargeCovers = (detail: DetailData) => qrChargeState(detail).covers;
  // Resumo só para quem pode cobrar ou já cobrou nesta sessão: os demais nem chamam a Custom API.
  const shouldLoadQrChargeSummary = (detail: DetailData) =>
    detail.type === "SERVICO" && getReceivableCents(detail) > 0 && (canChargeByQr || sumQrChargesPaid(qrChargesPaid[detail.id]) > 0);
  const receiveStepPending = (detail: DetailData) =>
    isReceiveStepPending(detail, { receiveProofs, receiveUploadedCounts, remoteMode, proofWaived: qrChargeCovers(detail) });
  const getQrChargeProps = (detail: DetailData) => {
    const entry = qrChargeSummaries[detail.id];
    const state = qrChargeState(detail);
    const canOpen = state.receivableCents > 0 && ((canChargeByQr && state.balanceCents > 0) || Boolean(state.open));
    return {
      qrCharge: {
        receivableCents: state.receivableCents,
        paidCents: state.paidCents,
        paidByName: entry?.summary?.ultimaPaga?.paganteNome.trim() ?? "",
        balanceCents: state.balanceCents,
        // Só a primeira carga segura o botão; a revalidação usa o resumo anterior.
        loading: entry?.status === "loading" && !entry.summary,
        failed: entry?.status === "error",
        resumable: Boolean(state.open),
        onOpen: canOpen ? () => setScreen("cobrancaQr") : undefined
      },
      proofWaived: state.covers,
      checkProof: remoteMode || getQuickReadMockMode() ? checkReceiveProof : undefined
    };
  };
  const invalidateQrChargeSummary = (detailId: string) =>
    setQrChargeSummaries((current) => (current[detailId] ? { ...current, [detailId]: { ...current[detailId], stale: true } } : current));

  // Recebimento aberto (tela própria ou dentro de finalizar/voucher): consulta o resumo uma vez por serviço.
  const receiveScreenDetail =
    selectedDetail && (screen === "receber" || ((screen === "finalizar" || screen === "voucher") && receiveStepPending(selectedDetail)))
      ? selectedDetail
      : null;
  const qrChargeSummaryRequest = receiveScreenDetail && shouldLoadQrChargeSummary(receiveScreenDetail) ? receiveScreenDetail : null;
  const qrChargeSummaryEntry = qrChargeSummaryRequest ? qrChargeSummaries[qrChargeSummaryRequest.id] : undefined;
  const qrChargeSummaryNeeded = Boolean(qrChargeSummaryRequest && (!qrChargeSummaryEntry || qrChargeSummaryEntry.stale));

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

  const openReceiveFlow = () => {
    if (!selectedDetail) return;
    if (blockIfNotFirstPending(selectedDetail)) return;
    setScreen("receber");
  };

  return {
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
  };
}
