import { useState } from "react";
import { revokePreviewUrl } from "../fotos/mediaDrafts";
import type { MaintenancePhotoKind, Screen } from "../../types";

type Options = {
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Foto da finalização de manutenção: tipo escolhido, rascunho da câmera e prévia de foto já salva.
export function useMaintenanceFinalizePhoto({ setScreen }: Options) {
  const [maintenancePhotoKind, setMaintenancePhotoKind] = useState<MaintenancePhotoKind>("NOTAFISCAL");
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const [photoDraftPreviewUrl, setPhotoDraftPreviewUrl] = useState("");
  const [photoDraftRawBlob, setPhotoDraftRawBlob] = useState<Blob | null>(null);
  const [photoDraftIsVideo, setPhotoDraftIsVideo] = useState(false);
  const [maintenanceExistingPreview, setMaintenanceExistingPreview] = useState(false);

  const clearMaintenanceFinalizePhotoDraft = (keepPreviewUrl = false) => {
    if (!keepPreviewUrl) revokePreviewUrl(photoDraftPreviewUrl);
    setPhotoDraft(null);
    setPhotoDraftPreviewUrl("");
    setPhotoDraftRawBlob(null);
    setPhotoDraftIsVideo(false);
  };

  const openMaintenanceFinalizeCamera = (kind: MaintenancePhotoKind) => {
    setMaintenancePhotoKind(kind);
    clearMaintenanceFinalizePhotoDraft();
    setMaintenanceExistingPreview(false);
    setScreen("fotoManutencao");
  };

  return {
    clearMaintenanceFinalizePhotoDraft,
    maintenanceExistingPreview,
    maintenancePhotoKind,
    openMaintenanceFinalizeCamera,
    photoDraft,
    photoDraftIsVideo,
    photoDraftPreviewUrl,
    photoDraftRawBlob,
    setMaintenanceExistingPreview,
    setMaintenancePhotoKind,
    setPhotoDraft,
    setPhotoDraftIsVideo,
    setPhotoDraftPreviewUrl,
    setPhotoDraftRawBlob
  };
}
