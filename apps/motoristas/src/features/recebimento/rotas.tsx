import { getScreenAfterQrPayment } from "../../app/detailFlow";
import { createQrChargeRemote, updateQrChargeRemote } from "./remoto";
import { QrChargeScreen } from "./QrChargeScreen";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { MediaCaptureScreen } from "../fotos/MediaCaptureScreen";
import { MaintenancePhotoPreviewScreen } from "../fotos/MaintenancePhotoPreviewScreen";
import { ReceiveScreen } from "./ReceiveScreen";
import type { DetailData, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import type { ReactNode } from "react";
import type { useReceiveFlow } from "./useReceiveFlow";

type Props = ReturnType<typeof useReceiveFlow> & {
  blockIfNotFirstPending: (detail?: DetailData | null) => boolean;
  canGeneratePersonalReceipt: boolean;
  openPersonalReceipt: () => void;
  remoteOperation: RemoteOperation | null;
  selectedDetail: DetailData | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Telas de recebimento: comprovantes (câmera/prévia), recebimento e cobrança por QR.
export function rotasRecebimento(screen: Screen, {
  blockIfNotFirstPending,
  canGeneratePersonalReceipt,
  clearReceivePhotoDraftState,
  confirmReceivePhoto,
  continueAfterReceive,
  deleteReceivePhoto,
  getQrChargeProps,
  invalidateQrChargeSummary,
  openPersonalReceipt,
  openReceiveCamera,
  openReceivePreview,
  openReceiveVideoPreview,
  qrChargeState,
  qrChargesPaid,
  receivePhotoDraft,
  receivePhotoIsVideo,
  receivePhotoPreviewUrl,
  receivePreviewPhotoId,
  receiveProofs,
  remoteOperation,
  selectedDetail,
  setQrChargesPaid,
  setReceivePhotoDraft,
  setReceivePhotoDurationLabel,
  setReceivePhotoIsVideo,
  setReceivePhotoPosterUrl,
  setReceivePhotoPreviewUrl,
  setReceivePhotoRawBlob,
  setReceivePreviewPhotoId,
  setScreen,
  setToast
}: Props): ReactNode | null {
  if (screen === "receber" && selectedDetail) {
    return (
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
    return (
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

  if (screen === "fotoReceber") {
    return (
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
    return (
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
  return null;
}
