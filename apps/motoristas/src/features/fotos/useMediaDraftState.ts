import { useState } from "react";
import { revokePreviewUrl } from "./mediaDrafts";

// Foto ou vídeo recém-capturado que ainda não entrou na lista (prévia, pôster e duração do vídeo).
// clear(true) mantém a URL de prévia quando ela passa a pertencer ao item salvo.
export function useMediaDraftState() {
  const [draft, setDraft] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [rawBlob, setRawBlob] = useState<Blob | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const clear = (keepPreviewUrl = false) => {
    if (!keepPreviewUrl) revokePreviewUrl(previewUrl);
    setDraft("");
    setPreviewUrl("");
    setPosterUrl("");
    setDurationLabel("");
    setRawBlob(null);
    setIsVideo(false);
  };
  return { draft, setDraft, previewUrl, setPreviewUrl, posterUrl, setPosterUrl, durationLabel, setDurationLabel, rawBlob, setRawBlob, isVideo, setIsVideo, clear };
}
