import { useState } from "react";
import { createMaintenanceRequestRemote } from "../../lib/dataverse";
import { getDriverContext } from "../../data/dataverse/cliente";
import type { ToastTone } from "../../shared/ui/LocalToast";
import type { MaintenanceRequestDraft, MaintenanceRequestFields, MaintenanceRequestPhoto } from "./MaintenanceRequestScreen";
import { hasMediaDraftContent, revokePreviewUrl } from "../fotos/mediaDrafts";
import type { CapturedVideoDraft, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import { wait } from "../../shared/wait";
import { isVideoMediaDraft, prepareMediaDraftForUpload, revokePhotoPreviewUrls } from "../fotos/envioMidia";
import { useMediaDraftState } from "../fotos/useMediaDraftState";
import { EMPTY_MAINTENANCE_REQUEST_DRAFT } from "./rascunho";

type Options = {
  logAppError: (error: unknown, action: string, phase?: string) => void;
  maintenanceCurrentVehicleId: string;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  setCriticalError: (message: string) => void;
  setRemoteOperation: (operation: RemoteOperation | null) => void;
  setScreen: (screen: Screen) => void;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Fluxo de "Solicitar manutenção": rascunho, fotos/vídeos do problema e criação da solicitação no Dataverse.
export function useMaintenanceRequestFlow({ logAppError, maintenanceCurrentVehicleId, remoteMode, remoteOperation, setCriticalError, setRemoteOperation, setScreen, setToast }: Options) {
  const [maintenanceRequestDraft, setMaintenanceRequestDraft] = useState<MaintenanceRequestDraft>({ ...EMPTY_MAINTENANCE_REQUEST_DRAFT });
  const [maintenanceRequestPhotos, setMaintenanceRequestPhotos] = useState<MaintenanceRequestPhoto[]>([]);
  const {
    draft: maintenanceRequestPhotoDraft, setDraft: setMaintenanceRequestPhotoDraft,
    previewUrl: maintenanceRequestPhotoPreviewUrl, setPreviewUrl: setMaintenanceRequestPhotoPreviewUrl,
    posterUrl: maintenanceRequestPhotoPosterUrl, setPosterUrl: setMaintenanceRequestPhotoPosterUrl,
    durationLabel: maintenanceRequestPhotoDurationLabel, setDurationLabel: setMaintenanceRequestPhotoDurationLabel,
    rawBlob: maintenanceRequestPhotoRawBlob, setRawBlob: setMaintenanceRequestPhotoRawBlob,
    isVideo: maintenanceRequestPhotoIsVideo, setIsVideo: setMaintenanceRequestPhotoIsVideo,
    clear: clearMaintenanceRequestPhotoDraftState
  } = useMediaDraftState();
  const [maintenanceRequestPreviewPhotoId, setMaintenanceRequestPreviewPhotoId] = useState("");

  const submitMaintenanceRequest = async (fields: MaintenanceRequestFields) => {
    if (remoteOperation) return;
    if (!remoteMode) {
      setToast("Abra no Power Apps para enviar ao Dataverse.");
      return;
    }

    try {
      setRemoteOperation({
        title: "Solicitando manutenção",
        message: "Identificando motorista.",
        phase: "loading"
      });
      const driver = await getDriverContext();
      setRemoteOperation({
        title: "Solicitando manutenção",
        message: "Criando ordem de manutenção.",
        phase: "loading"
      });
      const preparedPhotos = await Promise.all(
        maintenanceRequestPhotos.filter((photo) => hasMediaDraftContent(photo)).map((photo) => prepareMediaDraftForUpload(photo))
      );
      const result = await createMaintenanceRequestRemote({
        descricao: fields.descricao,
        kmAtual: fields.kmAtual,
        veiculoId: fields.veiculoId,
        motoristaId: driver.id,
        gravidade: fields.gravidade,
        photos: preparedPhotos.map((photo) => photo.dataUrl),
        onProgress: (message) => setRemoteOperation({
          title: "Solicitando manutenção",
          message,
          phase: "loading"
        })
      });
      setRemoteOperation({
        title: "Solicitando manutenção",
        message: "Solicitação enviada.",
        detailId: result.id,
        phase: "success"
      });
      await wait(720);
      setRemoteOperation(null);
      revokePhotoPreviewUrls(maintenanceRequestPhotos);
      setMaintenanceRequestDraft({ descricao: "", kmAtual: "", veiculoId: maintenanceCurrentVehicleId, gravidade: "" });
      setMaintenanceRequestPhotos([]);
      clearMaintenanceRequestPhotoDraftState();
      setScreen("inicio");
      setToast("Solicitação enviada para aprovação.");
    } catch (error) {
      logAppError(error, "submitMaintenanceRequest", "create");
      setRemoteOperation(null);
      setCriticalError(error instanceof Error ? error.message : "Falha ao solicitar manutenção.");
    }
  };

  const openMaintenanceRequestCamera = () => {
    clearMaintenanceRequestPhotoDraftState();
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("fotoSolicitacaoManutencao");
  };

  const openMaintenanceRequestVideoPreview = (video: CapturedVideoDraft) => {
    setMaintenanceRequestPhotoDraft("");
    setMaintenanceRequestPhotoPreviewUrl(video.previewUrl);
    setMaintenanceRequestPhotoPosterUrl(video.posterUrl ?? "");
    setMaintenanceRequestPhotoDurationLabel(video.durationLabel ?? "");
    setMaintenanceRequestPhotoRawBlob(video.rawBlob);
    setMaintenanceRequestPhotoIsVideo(true);
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("previewFotoSolicitacaoManutencao");
  };

  const openMaintenanceRequestPreview = (photoId: string) => {
    const photo = maintenanceRequestPhotos.find((item) => item.id === photoId);
    if (!photo) return;
    setMaintenanceRequestPhotoDraft(photo.dataUrl);
    setMaintenanceRequestPhotoPreviewUrl(photo.previewUrl ?? "");
    setMaintenanceRequestPhotoPosterUrl(photo.posterUrl ?? "");
    setMaintenanceRequestPhotoDurationLabel(photo.durationLabel ?? "");
    setMaintenanceRequestPhotoRawBlob(photo.rawBlob ?? null);
    setMaintenanceRequestPhotoIsVideo(isVideoMediaDraft(photo.dataUrl, photo.rawBlob));
    setMaintenanceRequestPreviewPhotoId(photoId);
    setScreen("previewFotoSolicitacaoManutencao");
  };

  const confirmMaintenanceRequestPhoto = () => {
    if (!hasMediaDraftContent({ dataUrl: maintenanceRequestPhotoDraft, rawBlob: maintenanceRequestPhotoRawBlob, mediaType: maintenanceRequestPhotoIsVideo ? "video" : "foto" })) {
      return setScreen("solicitarManutencao");
    }
    if (maintenanceRequestPreviewPhotoId) {
      setMaintenanceRequestPhotos((current) =>
        current.map((photo) => {
          if (photo.id !== maintenanceRequestPreviewPhotoId) return photo;
          if (photo.previewUrl && photo.previewUrl !== (maintenanceRequestPhotoPreviewUrl || undefined)) revokePreviewUrl(photo.previewUrl);
          return {
            ...photo,
            dataUrl: maintenanceRequestPhotoDraft,
            previewUrl: maintenanceRequestPhotoPreviewUrl || undefined,
            posterUrl: maintenanceRequestPhotoPosterUrl || undefined,
            durationLabel: maintenanceRequestPhotoDurationLabel || undefined,
            mediaType: maintenanceRequestPhotoIsVideo ? "video" : "foto",
            rawBlob: maintenanceRequestPhotoIsVideo ? maintenanceRequestPhotoRawBlob ?? undefined : undefined
          };
        })
      );
    } else {
      setMaintenanceRequestPhotos((current) => [
        ...current,
        {
          id: `request-photo-${Date.now()}-${current.length + 1}`,
          dataUrl: maintenanceRequestPhotoDraft,
          previewUrl: maintenanceRequestPhotoPreviewUrl || undefined,
          posterUrl: maintenanceRequestPhotoPosterUrl || undefined,
          durationLabel: maintenanceRequestPhotoDurationLabel || undefined,
          mediaType: maintenanceRequestPhotoIsVideo ? "video" : "foto",
          rawBlob: maintenanceRequestPhotoIsVideo ? maintenanceRequestPhotoRawBlob ?? undefined : undefined
        }
      ]);
    }
    clearMaintenanceRequestPhotoDraftState(true);
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("solicitarManutencao");
  };

  const deleteMaintenanceRequestPhoto = () => {
    if (maintenanceRequestPreviewPhotoId) {
      setMaintenanceRequestPhotos((current) => {
        const removed = current.find((photo) => photo.id === maintenanceRequestPreviewPhotoId);
        revokePreviewUrl(removed?.previewUrl);
        return current.filter((photo) => photo.id !== maintenanceRequestPreviewPhotoId);
      });
    }
    clearMaintenanceRequestPhotoDraftState();
    setMaintenanceRequestPreviewPhotoId("");
    setScreen("solicitarManutencao");
  };

  return {
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
  };
}
