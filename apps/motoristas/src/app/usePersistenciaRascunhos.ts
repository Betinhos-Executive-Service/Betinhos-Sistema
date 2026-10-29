import type { ExpensePhoto } from "../features/despesas/expenses.types";
import { useEffect } from "react";
import { STORAGE_KEY } from "./bootstrap";
import { reportAppError } from "../lib/appErrorLogger";
import { saveMediaDraft, touchMediaDraft } from "../features/fotos/mediaDraftStore";
import type { LocalStore } from "../lib/localWorkflow";
import type { ToastTone } from "../components/common/LocalToast";
import type { Screen } from "../types";
import { exchangeUserError } from "../features/servicos/trocaErros";
import {
  serializeReceiveProofs,
  FINALIZE_DRAFT_ASSETS_STORAGE_KEY,
  VOUCHER_DRAFTS_STORAGE_KEY,
  type PersistedFinalizeDraftAssets
} from "../features/finalizar/rascunhos";

type Options = {
  isButtonPreviewMode: boolean;
  isReceiptPreviewMode: boolean;
  lastMediaScreenRef: React.MutableRefObject<Screen>;
  mediaDraftLoaded: boolean;
  receiveProofs: Record<string, ExpensePhoto[]>;
  remoteMode: boolean;
  screen: Screen;
  setToast: (message: string, tone?: ToastTone) => void;
  store: LocalStore;
  voucherDrafts: Record<string, Record<string, string>>;
};

// Grava no aparelho o que não pode se perder ao fechar o app: agenda local (modo mock), rascunhos de voucher e fotos/assinaturas/comprovantes da finalização.
export function usePersistenciaRascunhos({ isButtonPreviewMode, isReceiptPreviewMode, lastMediaScreenRef, mediaDraftLoaded, receiveProofs, remoteMode, screen, setToast, store, voucherDrafts }: Options) {
  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    if (remoteMode) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, photos: {}, signatures: {} }));
    } catch (error) {
      reportAppError(error, {
        severity: "warning",
        source: "app",
        action: "persistLocalStore",
        phase: "localStorage",
        screen
      });
    }
  }, [isButtonPreviewMode, isReceiptPreviewMode, remoteMode, screen, store]);

  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode) return;
    try {
      localStorage.setItem(VOUCHER_DRAFTS_STORAGE_KEY, JSON.stringify(voucherDrafts));
    } catch (error) {
      reportAppError(error, {
        severity: "warning",
        source: "app",
        action: "persistVoucherDrafts",
        phase: "localStorage",
        screen
      });
    }
  }, [isButtonPreviewMode, isReceiptPreviewMode, screen, voucherDrafts]);

  useEffect(() => {
    if (isButtonPreviewMode || isReceiptPreviewMode || !mediaDraftLoaded) return;
    const payload = {
        signatures: store.signatures,
        photos: store.photos,
        receiveProofs: serializeReceiveProofs(receiveProofs)
      } satisfies PersistedFinalizeDraftAssets;
    void saveMediaDraft(payload).then(() => localStorage.removeItem(FINALIZE_DRAFT_ASSETS_STORAGE_KEY)).catch((error) => {
      reportAppError(error, {
        severity: "warning",
        source: "app",
        action: "persistFinalizeDraftAssets",
        phase: "indexedDB",
        screen
      });
      setToast(exchangeUserError(error), "warning");
    });
  }, [isButtonPreviewMode, isReceiptPreviewMode, mediaDraftLoaded, store.photos, store.signatures, receiveProofs]);

  useEffect(() => {
    if (lastMediaScreenRef.current === screen) return;
    lastMediaScreenRef.current = screen;
    if (isButtonPreviewMode || isReceiptPreviewMode || !mediaDraftLoaded) return;
    void touchMediaDraft().catch((error) => {
      reportAppError(error, { severity: "warning", source: "app", action: "touchFinalizeDraftAssets", phase: "indexedDB", screen });
      setToast(exchangeUserError(error), "warning");
    });
  }, [isButtonPreviewMode, isReceiptPreviewMode, mediaDraftLoaded, screen]);

}
