import { useEffect, useState } from "react";
import { ActionBar, ActionButton } from "../../shared/ui/ActionButton";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { FormMenu } from "../../shared/ui/navigation/FormMenu";
import { reportAppError } from "../../shared/appErrorLogger";
import { dataUrlToObjectUrl } from "../../shared/camera/photoOrientation";
import type { MaintenancePhotoKind } from "../../types";

type MaintenancePhotoPreviewScreenProps = {
  kind: MaintenancePhotoKind;
  title?: string;
  prompt?: string;
  photoDataUrl?: string | null;
  isVideo?: boolean;
  onBack: () => void;
  onRetake: () => void;
  onConfirm: () => void;
  onDelete?: () => void;
  videoPreviewUrl?: string;
  confirmLabel?: string;
  retakeLabel?: string;
  deleteOnly?: boolean;
};

function getTitleByKind(kind: MaintenancePhotoKind) {
  if (kind.startsWith("NOTAFISCAL")) return "Foto da nota fiscal";
  if (kind === "FOTO1") return "Foto 1 de 3";
  if (kind === "FOTO2") return "Foto 2 de 3";
  return "Foto 3 de 3";
}

export function MaintenancePhotoPreviewScreen({
  kind,
  title,
  prompt,
  photoDataUrl,
  isVideo = false,
  onBack,
  onRetake,
  onConfirm,
  onDelete,
  videoPreviewUrl: externalVideoPreviewUrl = "",
  confirmLabel = "Confirmar",
  retakeLabel = "Não, refazer",
  deleteOnly = false
}: MaintenancePhotoPreviewScreenProps) {
  const isInvoice = kind.startsWith("NOTAFISCAL");
  const showVideo = isVideo || Boolean(photoDataUrl?.startsWith("data:video/")) || Boolean(externalVideoPreviewUrl);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [videoPreviewError, setVideoPreviewError] = useState(false);

  useEffect(() => {
    setVideoPreviewError(false);
    if (!showVideo) {
      setVideoPreviewUrl("");
      return;
    }

    if (externalVideoPreviewUrl) {
      setVideoPreviewUrl(externalVideoPreviewUrl);
      return;
    }

    let objectUrl = "";
    try {
      if (!photoDataUrl) {
        setVideoPreviewError(true);
        setVideoPreviewUrl("");
        return;
      }
      objectUrl = dataUrlToObjectUrl(photoDataUrl);
    } catch (error) {
      reportAppError(error, {
        severity: "error",
        source: "maintenance-photo-preview",
        action: "build-video-preview",
        component: "MaintenancePhotoPreviewScreen",
        screen: "TelaPreviewFotoManutencao"
      });
      setVideoPreviewError(true);
      setVideoPreviewUrl("");
      return;
    }
    setVideoPreviewUrl(objectUrl);
    return () => {
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [externalVideoPreviewUrl, showVideo, photoDataUrl]);

  const requestDelete = () => {
    if (!onDelete) return;
    setConfirmDelete(true);
  };

  const confirmDeletePhoto = () => {
    setConfirmDelete(false);
    onDelete?.();
  };

  return (
    <AppShell screenLabel="TelaPreviewFotoManutencao">
      <FormMenu title={title ?? getTitleByKind(kind)} onBack={onBack} />
      <section className="main-panel maintenance-preview-main">
        <article className={`maintenance-preview-card ${deleteOnly ? "is-delete-only" : ""}`}>
          {deleteOnly ? null : <div className="maintenance-preview-title">{prompt ?? "A foto está legível?"}</div>}
          <div className="maintenance-preview-body">
            <div className={`maintenance-preview-image ${isInvoice ? "invoice" : "vehicle"}`} aria-label="Preview da foto">
              {showVideo ? (
                <>
                  {videoPreviewUrl ? (
                    <video key={videoPreviewUrl} className="maintenance-preview-real-image" src={videoPreviewUrl} controls playsInline preload="auto" muted onCanPlay={() => setVideoPreviewError(false)} onLoadedMetadata={() => setVideoPreviewError(false)} onError={() => {
                      reportAppError(new Error("Falha ao carregar preview de video."), {
                        severity: "warning",
                        source: "maintenance-photo-preview",
                        action: "video-element-error",
                        component: "MaintenancePhotoPreviewScreen",
                        screen: "TelaPreviewFotoManutencao",
                        payload: { videoPreviewUrl }
                      });
                      setVideoPreviewError(true);
                    }} />
                  ) : (
                    <div className="camera-loading">Preparando previa...</div>
                  )}
                  {videoPreviewError ? (
                    <div className="video-preview-fallback">
                      <strong>Vídeo anexado</strong>
                      <span>Prévia indisponível neste navegador. Pode confirmar e enviar.</span>
                    </div>
                  ) : null}
                </>
              ) : photoDataUrl ? (
                <img className="maintenance-preview-real-image" src={photoDataUrl} alt="Foto capturada" />
              ) : isInvoice ? (
                <div className="mock-invoice">
                  <div />
                  <span />
                  <span />
                  <span />
                  <strong>R$ 480,00</strong>
                </div>
              ) : (
                <div className="mock-maintenance-photo">
                  <span />
                  <strong>MANUTENÇÃO</strong>
                </div>
              )}
            </div>
            <ActionBar className={`maintenance-preview-actions ${deleteOnly ? "is-delete-only" : ""}`}>
              {deleteOnly && onDelete ? (
                <ActionButton className="maintenance-preview-delete" variant="danger" label="Apagar foto" icon={<SystemIcon name="trash" />} onClick={requestDelete} />
              ) : (
                <>
                  {onDelete ? <ActionButton className="maintenance-preview-secondary" variant="danger" label="Apagar foto" onClick={requestDelete} /> : null}
                  <ActionButton className="maintenance-preview-secondary" label={retakeLabel} onClick={onRetake} />
                  <ActionButton className="maintenance-preview-primary" variant="primary" label={confirmLabel} onClick={onConfirm} />
                </>
              )}
            </ActionBar>
          </div>
        </article>
      </section>
      {confirmDelete ? (
        <ConfirmDialog
          title="Apagar foto?"
          message="Esta foto será removida da solicitação."
          confirmLabel="Apagar"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={confirmDeletePhoto}
        />
      ) : null}
    </AppShell>
  );
}
