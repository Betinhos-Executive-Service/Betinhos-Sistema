import type { MaintenanceRequestVehicleOption } from "../../lib/dataverse";
import type { ToastTone } from "../../components/common/LocalToast";
import { MediaCaptureScreen } from "../fotos/MediaCaptureScreen";
import { MaintenancePhotoPreviewScreen } from "../fotos/MaintenancePhotoPreviewScreen";
import { MaintenanceRequestScreen } from "./MaintenanceRequestScreen";
import type { Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import type { ReactNode } from "react";
import type { useMaintenanceRequestFlow } from "./useMaintenanceRequestFlow";

type Props = ReturnType<typeof useMaintenanceRequestFlow> & {
  maintenanceCurrentVehicleId: string;
  maintenanceVehicles: MaintenanceRequestVehicleOption[];
  maintenanceVehiclesLoading: boolean;
  remoteOperation: RemoteOperation | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Telas de "Solicitar manutenção": formulário e câmera/prévia das fotos.
export function rotasManutencao(screen: Screen, {
  clearMaintenanceRequestPhotoDraftState,
  confirmMaintenanceRequestPhoto,
  deleteMaintenanceRequestPhoto,
  maintenanceCurrentVehicleId,
  maintenanceRequestDraft,
  maintenanceRequestPhotoDraft,
  maintenanceRequestPhotoIsVideo,
  maintenanceRequestPhotoPreviewUrl,
  maintenanceRequestPhotos,
  maintenanceRequestPreviewPhotoId,
  maintenanceVehicles,
  maintenanceVehiclesLoading,
  openMaintenanceRequestCamera,
  openMaintenanceRequestPreview,
  openMaintenanceRequestVideoPreview,
  remoteOperation,
  setMaintenanceRequestDraft,
  setMaintenanceRequestPhotoDraft,
  setMaintenanceRequestPhotoDurationLabel,
  setMaintenanceRequestPhotoIsVideo,
  setMaintenanceRequestPhotoPosterUrl,
  setMaintenanceRequestPhotoPreviewUrl,
  setMaintenanceRequestPhotoRawBlob,
  setMaintenanceRequestPreviewPhotoId,
  setScreen,
  setToast,
  submitMaintenanceRequest
}: Props): ReactNode | null {
  if (screen === "fotoSolicitacaoManutencao") {
    return (
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
    return (
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

  if (screen === "solicitarManutencao") {
    return (
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
  return null;
}
