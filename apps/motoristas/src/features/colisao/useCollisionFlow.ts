import { useState } from "react";
import { assertCollisionSchemaReadyRemote, loadCollisionLookupNavigationNamesRemote, uploadCollisionPhotoRemote } from "./remoto";
import { createOne, getDriverContext, getDriverCurrentVehicleId, updateOne, type DriverContext } from "../../data/dataverse/cliente";
import { DATAVERSE } from "../../data/dataverse/entidades";
import type { ToastTone } from "../../shared/ui/LocalToast";
import {
  COLLISION_ATTACHMENT_STATUS,
  buildCollisionCreatePayload,
  createEmptyCollisionDraft,
  hasCollisionThirdParty,
  type CollisionDraft,
  type CollisionPhoto,
  type CollisionPhotoKind
} from "./collisions";
import { hasMediaDraftContent, revokePreviewUrl } from "../fotos/mediaDrafts";
import type { CapturedVideoDraft, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import { wait } from "../../shared/wait";
import { isVideoMediaDraft, prepareMediaDraftForUpload, revokePhotoPreviewUrls } from "../fotos/envioMidia";
import { useMediaDraftState } from "../fotos/useMediaDraftState";

type Options = {
  driverContext: DriverContext | null;
  logAppError: (error: unknown, action: string, phase?: string) => void;
  maintenanceCurrentVehicleId: string;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  setCriticalError: (message: string) => void;
  setRemoteOperation: (operation: RemoteOperation | null) => void;
  setScreen: (screen: Screen) => void;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Fluxo de colisão: rascunho, fotos por tipo (cena, veículos, documentos) e registro no Dataverse com os anexos.
export function useCollisionFlow({ driverContext, logAppError, maintenanceCurrentVehicleId, remoteMode, remoteOperation, setCriticalError, setRemoteOperation, setScreen, setToast }: Options) {
  const [collisionDraft, setCollisionDraft] = useState<CollisionDraft>(() => createEmptyCollisionDraft());
  const [collisionPhotos, setCollisionPhotos] = useState<CollisionPhoto[]>([]);
  const {
    draft: collisionPhotoDraft, setDraft: setCollisionPhotoDraft,
    previewUrl: collisionPhotoPreviewUrl, setPreviewUrl: setCollisionPhotoPreviewUrl,
    posterUrl: collisionPhotoPosterUrl, setPosterUrl: setCollisionPhotoPosterUrl,
    durationLabel: collisionPhotoDurationLabel, setDurationLabel: setCollisionPhotoDurationLabel,
    rawBlob: collisionPhotoRawBlob, setRawBlob: setCollisionPhotoRawBlob,
    isVideo: collisionPhotoIsVideo, setIsVideo: setCollisionPhotoIsVideo,
    clear: clearCollisionPhotoDraftState
  } = useMediaDraftState();
  const [collisionPhotoKind, setCollisionPhotoKind] = useState<CollisionPhotoKind>("cena");
  const [collisionPreviewPhotoId, setCollisionPreviewPhotoId] = useState("");

  const submitCollision = async (draft: CollisionDraft) => {
    if (remoteOperation) return;
    if (!remoteMode) {
      setToast("Abra no Power Apps para registrar no Dataverse.");
      return;
    }

    let createdCollisionId = "";
    let uploadedCount = 0;
    try {
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Identificando motorista.",
        phase: "loading"
      });
      const driver = driverContext ?? await getDriverContext();
      const veiculoId = draft.veiculoId || getDriverCurrentVehicleId(driver);
      const collisionHasThirdParty = hasCollisionThirdParty(draft);
      const photosToSubmit = collisionPhotos.filter((photo) =>
        hasMediaDraftContent(photo) &&
        (collisionHasThirdParty || (photo.kind !== "danoTerceiro" && photo.kind !== "documentoTerceiro"))
      );
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Conferindo schema do Dataverse.",
        phase: "loading"
      });
      await assertCollisionSchemaReadyRemote();
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Preparando evidências.",
        phase: "loading"
      });
      const preparedPhotosToSubmit = await Promise.all(photosToSubmit.map((photo) => prepareMediaDraftForUpload(photo)));
      const lookupNavigationNames = await loadCollisionLookupNavigationNamesRemote();
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Criando ocorrência.",
        phase: "loading"
      });
      const payload = buildCollisionCreatePayload({
        draft,
        photos: preparedPhotosToSubmit,
        motoristaId: driver.id,
        veiculoId,
        motoristaEntitySet: DATAVERSE.funcionarios,
        veiculoEntitySet: DATAVERSE.veiculos,
        lookupNavigationNames
      });
      const result = await createOne(DATAVERSE.colisoes, payload);
      createdCollisionId = result.id;
      const collisionName = String(payload.cr40f_nome ?? "Colisão");
      if (preparedPhotosToSubmit.length) {
        setRemoteOperation({
          title: "Registrando colisão",
          message: `Enviando ${preparedPhotosToSubmit.length} arquivo(s) em paralelo (0/${preparedPhotosToSubmit.length}).`,
          detailId: result.id,
          phase: "loading"
        });
        const uploadResults = await Promise.allSettled(preparedPhotosToSubmit.map(async (photo, index) => {
          const link = await uploadCollisionPhotoRemote({
            collisionId: result.id,
            collisionName,
            motoristaId: driver.id,
            dataUrl: photo.dataUrl,
            kind: photo.kind,
            order: index + 1,
            onProgress: (message) => setRemoteOperation({
              title: "Registrando colisão",
              message: `Uploads paralelos: ${message}`,
              detailId: result.id,
              phase: "loading"
            })
          });
          uploadedCount += 1;
          setRemoteOperation({
            title: "Registrando colisão",
            message: `Uploads paralelos concluídos (${uploadedCount}/${preparedPhotosToSubmit.length}).`,
            detailId: result.id,
            phase: "loading"
          });
          return link;
        }));
        const failedUploads = uploadResults.filter((uploadResult) => uploadResult.status === "rejected").length;
        if (failedUploads) {
          throw new Error(`Colisão criada, mas ${failedUploads} de ${preparedPhotosToSubmit.length} arquivo(s) falharam no upload.`);
        }
      }
      if (preparedPhotosToSubmit.length) {
        await updateOne(DATAVERSE.colisoes, result.id, { cr40f_statusanexo: COLLISION_ATTACHMENT_STATUS.completo });
      }
      setRemoteOperation({
        title: "Registrando colisão",
        message: "Colisão registrada.",
        detailId: result.id,
        phase: "success"
      });
      await wait(720);
      setRemoteOperation(null);
      revokePhotoPreviewUrls(collisionPhotos);
      setCollisionDraft(createEmptyCollisionDraft());
      setCollisionPhotos([]);
      clearCollisionPhotoDraftState();
      setCollisionPreviewPhotoId("");
      setScreen("inicio");
      setToast("Colisão registrada.");
    } catch (error) {
      if (createdCollisionId) {
        try {
          await updateOne(DATAVERSE.colisoes, createdCollisionId, {
            cr40f_statusanexo: uploadedCount > 0 ? COLLISION_ATTACHMENT_STATUS.parcial : COLLISION_ATTACHMENT_STATUS.falhou
          });
        } catch (statusError) {
          logAppError(statusError, "submitCollision", "statusanexo");
        }
      }
      logAppError(error, "submitCollision", "create");
      setRemoteOperation(null);
      setCriticalError(error instanceof Error ? error.message : "Falha ao registrar colisão.");
    }
  };

  const startCollision = (type: CollisionDraft["tipoOcorrencia"]) => {
    setCollisionDraft((current) => ({
      ...current,
      tipoOcorrencia: type,
      houveTerceiro: type === "bateram_em_mim" ? true : current.houveTerceiro,
      veiculoId: current.veiculoId || maintenanceCurrentVehicleId
    }));
    setScreen("colisoes");
  };

  const openCollisionCamera = (kind: CollisionPhotoKind) => {
    setCollisionPhotoKind(kind);
    clearCollisionPhotoDraftState();
    setCollisionPreviewPhotoId("");
    setScreen("fotoColisao");
  };

  const openCollisionVideoPreview = (video: CapturedVideoDraft) => {
    setCollisionPhotoDraft("");
    setCollisionPhotoPreviewUrl(video.previewUrl);
    setCollisionPhotoPosterUrl(video.posterUrl ?? "");
    setCollisionPhotoDurationLabel(video.durationLabel ?? "");
    setCollisionPhotoRawBlob(video.rawBlob);
    setCollisionPhotoIsVideo(true);
    setCollisionPreviewPhotoId("");
    setScreen("previewFotoColisao");
  };

  const openCollisionPreview = (photoId: string) => {
    const photo = collisionPhotos.find((item) => item.id === photoId);
    if (!photo) return;
    setCollisionPhotoKind(photo.kind);
    setCollisionPhotoDraft(photo.dataUrl);
    setCollisionPhotoPreviewUrl(photo.previewUrl ?? "");
    setCollisionPhotoPosterUrl(photo.posterUrl ?? "");
    setCollisionPhotoDurationLabel(photo.durationLabel ?? "");
    setCollisionPhotoRawBlob(photo.rawBlob ?? null);
    setCollisionPhotoIsVideo(isVideoMediaDraft(photo.dataUrl, photo.rawBlob));
    setCollisionPreviewPhotoId(photoId);
    setScreen("previewFotoColisao");
  };

  const confirmCollisionPhoto = () => {
    if (!hasMediaDraftContent({ dataUrl: collisionPhotoDraft, rawBlob: collisionPhotoRawBlob, mediaType: collisionPhotoIsVideo ? "video" : "foto" })) {
      return setScreen("colisoes");
    }
    if (collisionPreviewPhotoId) {
      setCollisionPhotos((current) =>
        current.map((photo) => {
          if (photo.id !== collisionPreviewPhotoId) return photo;
          if (photo.previewUrl && photo.previewUrl !== (collisionPhotoPreviewUrl || undefined)) revokePreviewUrl(photo.previewUrl);
          return {
            ...photo,
            dataUrl: collisionPhotoDraft,
            previewUrl: collisionPhotoPreviewUrl || undefined,
            posterUrl: collisionPhotoPosterUrl || undefined,
            durationLabel: collisionPhotoDurationLabel || undefined,
            mediaType: collisionPhotoIsVideo ? "video" : "foto",
            rawBlob: collisionPhotoIsVideo ? collisionPhotoRawBlob ?? undefined : undefined
          };
        })
      );
    } else {
      setCollisionPhotos((current) => {
        return [
          ...current,
          {
            id: `collision-photo-${Date.now()}-${current.length + 1}`,
            kind: collisionPhotoKind,
            dataUrl: collisionPhotoDraft,
            previewUrl: collisionPhotoPreviewUrl || undefined,
            posterUrl: collisionPhotoPosterUrl || undefined,
            durationLabel: collisionPhotoDurationLabel || undefined,
            mediaType: collisionPhotoIsVideo ? "video" : "foto",
            rawBlob: collisionPhotoIsVideo ? collisionPhotoRawBlob ?? undefined : undefined
          }
        ];
      });
    }
    clearCollisionPhotoDraftState(true);
    setCollisionPreviewPhotoId("");
    setScreen("colisoes");
  };

  const deleteCollisionPhoto = () => {
    if (collisionPreviewPhotoId) {
      setCollisionPhotos((current) => {
        const removed = current.find((photo) => photo.id === collisionPreviewPhotoId);
        revokePreviewUrl(removed?.previewUrl);
        return current.filter((photo) => photo.id !== collisionPreviewPhotoId);
      });
    }
    clearCollisionPhotoDraftState();
    setCollisionPreviewPhotoId("");
    setScreen("colisoes");
  };

  return {
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
    openCollisionCamera,
    openCollisionPreview,
    openCollisionVideoPreview,
    setCollisionDraft,
    setCollisionPhotoDraft,
    setCollisionPhotoDurationLabel,
    setCollisionPhotoIsVideo,
    setCollisionPhotoPosterUrl,
    setCollisionPhotoPreviewUrl,
    setCollisionPhotoRawBlob,
    setCollisionPhotos,
    setCollisionPreviewPhotoId,
    startCollision,
    submitCollision
  };
}
