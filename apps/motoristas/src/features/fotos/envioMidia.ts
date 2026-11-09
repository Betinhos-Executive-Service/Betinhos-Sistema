import { prepareVideoBlobForUpload, revokePreviewUrl } from "./mediaDrafts";

// Preparação de fotos e vídeos capturados antes do envio, e limpeza das prévias em memória.
export function isVideoMediaDraft(dataUrl?: string | null, rawBlob?: Blob | null) {
  return Boolean(rawBlob) || String(dataUrl ?? "").startsWith("data:video/");
}

export type UploadableMediaDraft = {
  dataUrl: string;
  rawBlob?: Blob;
  posterUrl?: string;
  durationLabel?: string;
  mediaType?: "foto" | "video";
};

export async function prepareMediaDraftForUpload<T extends UploadableMediaDraft>(photo: T): Promise<T> {
  if (!photo.rawBlob || photo.dataUrl) return photo;
  const prepared = await prepareVideoBlobForUpload(photo.rawBlob);
  return {
    ...photo,
    dataUrl: prepared.dataUrl,
    posterUrl: photo.posterUrl ?? prepared.posterUrl,
    durationLabel: photo.durationLabel ?? prepared.durationLabel,
    mediaType: "video"
  };
}

export function revokePhotoPreviewUrls(photos: Array<{ previewUrl?: string }>) {
  photos.forEach((photo) => revokePreviewUrl(photo.previewUrl));
}
