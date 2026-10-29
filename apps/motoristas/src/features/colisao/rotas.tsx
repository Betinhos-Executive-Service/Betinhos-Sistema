import type { MaintenanceRequestVehicleOption } from "../../lib/dataverse";
import type { DriverContext } from "../../data/dataverse/cliente";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { CollisionScreen } from "./CollisionScreen";
import { CollisionStartScreen } from "./CollisionStartScreen";
import { MediaCaptureScreen } from "../fotos/MediaCaptureScreen";
import { MaintenancePhotoPreviewScreen } from "../fotos/MaintenancePhotoPreviewScreen";
import { getCollisionPhotoLabel } from "./collisions";
import type { Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import type { ReactNode } from "react";
import type { useCollisionFlow } from "./useCollisionFlow";

type Props = ReturnType<typeof useCollisionFlow> & {
  driverContext: DriverContext | null;
  maintenanceCurrentVehicleId: string;
  maintenanceVehicles: MaintenanceRequestVehicleOption[];
  maintenanceVehiclesLoading: boolean;
  remoteOperation: RemoteOperation | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Telas de colisão: início, formulário e câmera/prévia das fotos.
export function rotasColisao(screen: Screen, {
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
  driverContext,
  maintenanceCurrentVehicleId,
  maintenanceVehicles,
  maintenanceVehiclesLoading,
  openCollisionCamera,
  openCollisionPreview,
  openCollisionVideoPreview,
  remoteOperation,
  setCollisionDraft,
  setCollisionPhotoDraft,
  setCollisionPhotoDurationLabel,
  setCollisionPhotoIsVideo,
  setCollisionPhotoPosterUrl,
  setCollisionPhotoPreviewUrl,
  setCollisionPhotoRawBlob,
  setCollisionPreviewPhotoId,
  setScreen,
  setToast,
  startCollision,
  submitCollision
}: Props): ReactNode | null {
  if (screen === "fotoColisao") {
    return (
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
    return (
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

  if (screen === "colisoesInicio") {
    return (
      <CollisionStartScreen
        onBack={() => setScreen("inicio")}
        onSelect={startCollision}
      />
    );
  }

  if (screen === "colisoes") {
    return (
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
  return null;
}
