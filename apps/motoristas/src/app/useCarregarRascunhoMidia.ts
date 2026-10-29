import { useEffect, useState } from "react";
import { reportAppError } from "../lib/appErrorLogger";
import { loadMediaDraft } from "../features/fotos/mediaDraftStore";
import type { PersistedFinalizeDraftAssets } from "../features/finalizar/rascunhos";
import type { LocalStore } from "../lib/localWorkflow";
import type { useReceiveFlow } from "../features/recebimento/useReceiveFlow";
import type { Screen } from "../types";

type Options = {
  isButtonPreviewMode: boolean;
  isReceiptPreviewMode: boolean;
  screen: Screen;
  setReceiveProofs: ReturnType<typeof useReceiveFlow>["setReceiveProofs"];
  setStore: React.Dispatch<React.SetStateAction<LocalStore>>;
};

// Na abertura, devolve do IndexedDB as assinaturas, fotos e comprovantes salvos; avisa quando terminou (libera a gravação).
export function useCarregarRascunhoMidia({ isButtonPreviewMode, isReceiptPreviewMode, screen, setReceiveProofs, setStore }: Options) {
  const [mediaDraftLoaded, setMediaDraftLoaded] = useState(false);
  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    let active = true;
    void loadMediaDraft<PersistedFinalizeDraftAssets>().then((saved) => {
      if (!active || !saved) return;
      setStore((current) => ({
        ...current,
        signatures: { ...current.signatures, ...saved.signatures },
        photos: { ...current.photos, ...saved.photos }
      }));
      setReceiveProofs((current) => ({ ...current, ...saved.receiveProofs }));
    }).catch((error) => reportAppError(error, { severity: "warning", source: "app", action: "loadFinalizeDraftAssets", phase: "indexedDB", screen }))
      .finally(() => { if (active) setMediaDraftLoaded(true); });
    return () => { active = false; };
  }, [isButtonPreviewMode, isReceiptPreviewMode]);
  return mediaDraftLoaded;
}
