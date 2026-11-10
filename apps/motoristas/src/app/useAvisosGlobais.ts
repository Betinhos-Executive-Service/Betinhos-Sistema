import type { ToastState } from "../shared/ui/LocalToast";
import { useEffect } from "react";
import { SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "../data/dataverse/fetchWebApi";
import { APP_CONNECTION_LOST_MESSAGE, type AppErrorNotice } from "../shared/appErrorLogger";
import type { ToastTone } from "../shared/ui/LocalToast";

type Options = {
  completingClearTimerRef: React.MutableRefObject<number | null>;
  finalizeTimerRef: React.MutableRefObject<number | null>;
  lastGlobalErrorRef: React.MutableRefObject<{ id: string; at: number; }>;
  setCriticalError: (message: string) => void;
  setCriticalErrorState: React.Dispatch<React.SetStateAction<string>>;
  setToastState: React.Dispatch<React.SetStateAction<ToastState | null>>;
  toast: ToastState | null;
  voucherDraftTimerRef: React.MutableRefObject<number | null>;
};

// Avisos globais: fecha o toast sozinho, mostra "conexão perdida", repassa erros globais (logger e sessão expirada) e limpa timers ao sair.
export function useAvisosGlobais({ completingClearTimerRef, finalizeTimerRef, lastGlobalErrorRef, setCriticalError, setCriticalErrorState, setToastState, toast, voucherDraftTimerRef }: Options) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToastState(null), toast.tone === "error" ? 3600 : 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const showConnectionLostPopup = () => setCriticalErrorState(APP_CONNECTION_LOST_MESSAGE);

    const showSessionExpiredPopup = () => setCriticalErrorState(SESSION_EXPIRED_MESSAGE);
    if (navigator.onLine === false) showConnectionLostPopup();
    window.addEventListener("offline", showConnectionLostPopup);
    window.addEventListener(SESSION_EXPIRED_EVENT, showSessionExpiredPopup);
    return () => {
      window.removeEventListener("offline", showConnectionLostPopup);
      window.removeEventListener(SESSION_EXPIRED_EVENT, showSessionExpiredPopup);
    };
  }, []);

  useEffect(() => {
    const onGlobalError = (event: Event) => {
      const detail = (event as CustomEvent<AppErrorNotice>).detail;
      if (!detail?.userMessage) return;

      const now = Date.now();
      if (lastGlobalErrorRef.current.id === detail.id && now - lastGlobalErrorRef.current.at < 4000) return;
      lastGlobalErrorRef.current = { id: detail.id, at: now };

      if (detail.severity === "critical") {
        setCriticalError(detail.userMessage);
        return;
      }

      const tone: ToastTone =
        detail.severity === "warning"
          ? "warning"
          : detail.severity === "info"
            ? "info"
            : "error";

      setToastState({
        id: now + Math.floor(Math.random() * 1000),
        message: detail.userMessage,
        tone
      });
    };

    window.addEventListener("appmotoristas:error", onGlobalError as EventListener);
    return () => window.removeEventListener("appmotoristas:error", onGlobalError as EventListener);
  }, []);

  useEffect(() => {
    return () => {
      if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
      if (completingClearTimerRef.current) window.clearTimeout(completingClearTimerRef.current);
      if (voucherDraftTimerRef.current) window.clearTimeout(voucherDraftTimerRef.current);
    };
  }, []);

}
