import type { ExpensePhoto } from "../despesas/expenses.types";
import type { ExpenseReferenceData } from "../despesas/expenses.types";
import { getServiceTaskBackScreen } from "../../app/detailFlow";
import {
  clearMaintenancePhotos,
  deleteMaintenancePhoto as deleteFinalizationMaintenancePhoto,
  saveMaintenancePhoto,
  type LocalStore
} from "../../lib/localWorkflow";
import type { ToastTone } from "../../components/common/LocalToast";
import { FinalizeScreen } from "./FinalizeScreen";
import { LocalCancelScreen } from "./LocalCancelScreen";
import { MediaCaptureScreen } from "../fotos/MediaCaptureScreen";
import { MaintenancePhotoPreviewScreen } from "../fotos/MaintenancePhotoPreviewScreen";
import { ReceiveScreen } from "../recebimento/ReceiveScreen";
import { prepareVideoBlobForUpload } from "../fotos/mediaDrafts";
import type { DetailData, MaintenancePhotoKind, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import type { ReactNode } from "react";
import type { useFinalizeFlow } from "./useFinalizeFlow";

type Props = ReturnType<typeof useFinalizeFlow> & {
  canGeneratePersonalReceipt: boolean;
  clearMaintenanceFinalizePhotoDraft: (keepPreviewUrl?: boolean) => void;
  confirmedMaintenancePhotos: MaintenancePhotoKind[];
  continueAfterReceive: () => Promise<void>;
  expenseReferenceData: ExpenseReferenceData;
  expenseReferenceError: string;
  expenseReferenceLoading: boolean;
  getQrChargeProps: (detail: DetailData) => { qrCharge: { receivableCents: number; paidCents: number; paidByName: string; balanceCents: number; loading: boolean; failed: boolean; resumable: boolean; onOpen: (() => void) | undefined; }; proofWaived: boolean; checkProof: ((photo: ExpensePhoto) => Promise<number | null>) | undefined; };
  logAppError: (error: unknown, action: string, phase?: string) => void;
  maintenanceExistingPreview: boolean;
  maintenancePhotoKind: MaintenancePhotoKind;
  openMaintenanceFinalizeCamera: (kind: MaintenancePhotoKind) => void;
  openPersonalReceipt: () => void;
  openReceiveCamera: () => void;
  openReceivePreview: (photoId: string) => void;
  photoDraft: string | null;
  photoDraftIsVideo: boolean;
  photoDraftPreviewUrl: string;
  photoDraftRawBlob: Blob | null;
  receiveProofs: Record<string, ExpensePhoto[]>;
  receiveStepPending: (detail: DetailData) => boolean;
  remoteOperation: RemoteOperation | null;
  selectedDetail: DetailData | null;
  setCriticalError: (message: string) => void;
  setMaintenanceExistingPreview: React.Dispatch<React.SetStateAction<boolean>>;
  setMaintenancePhotoKind: React.Dispatch<React.SetStateAction<MaintenancePhotoKind>>;
  setPhotoDraft: React.Dispatch<React.SetStateAction<string | null>>;
  setPhotoDraftIsVideo: React.Dispatch<React.SetStateAction<boolean>>;
  setPhotoDraftPreviewUrl: React.Dispatch<React.SetStateAction<string>>;
  setPhotoDraftRawBlob: React.Dispatch<React.SetStateAction<Blob | null>>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setStore: React.Dispatch<React.SetStateAction<LocalStore>>;
  setToast: (message: string, tone?: ToastTone) => void;
  store: LocalStore;
};

// Telas de finalização: observação final, cancelado no local e fotos da manutenção (câmera/prévia).
export function rotasFinalizar(screen: Screen, {
  canGeneratePersonalReceipt,
  cancelSelected,
  clearMaintenanceFinalizePhotoDraft,
  confirmedMaintenancePhotos,
  continueAfterReceive,
  expenseReferenceData,
  expenseReferenceError,
  expenseReferenceLoading,
  finalizeSelected,
  getQrChargeProps,
  getServiceObservationDraft,
  logAppError,
  maintenanceExistingPreview,
  maintenanceFinalizeDraft,
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
  setMaintenanceFinalizeDraft,
  setMaintenancePhotoKind,
  setPhotoDraft,
  setPhotoDraftIsVideo,
  setPhotoDraftPreviewUrl,
  setPhotoDraftRawBlob,
  setScreen,
  setStore,
  setToast,
  store
}: Props): ReactNode | null {
  if (screen === "canceladoLocal" && selectedDetail) {
    return (
      <LocalCancelScreen
        detail={selectedDetail}
        onBack={() => setScreen("detalhes")}
        onWrongClick={() => setScreen("detalhes")}
        onSubmit={cancelSelected}
        submitState={remoteOperation?.phase ?? "idle"}
      />
    );
  }

  if (screen === "fotoManutencao" && selectedDetail) {
    return (
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
    return (
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

  if (screen === "finalizar" && selectedDetail) {
    if (receiveStepPending(selectedDetail)) {
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
    return (
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
  return null;
}
