import { useState } from "react";
import { APP_OPERATION_ERROR_MESSAGE, reportAppError } from "../lib/appErrorLogger";
import type { ToastState, ToastTone } from "../components/common/LocalToast";
import type { LoadingOverlayState } from "../components/common/LoadingOverlay";
import type { DetailData, Screen } from "../types";
import { inferToastTone } from "../shared/ui/toastTone";
import { wait } from "../shared/wait";

const DATA_LOADING_SUCCESS_DURATION_MS = 420;

type Options = {
  screen: Screen;
  selectedDetail: DetailData | null;
};

// Avisos do app: toast, carregamento de dados (com o "sucesso" breve), erro crítico e log de erros com a tela atual.
export function useAvisos({ screen, selectedDetail }: Options) {
  const [toast, setToastState] = useState<ToastState | null>(null);
  const [dataLoading, setDataLoading] = useState<LoadingOverlayState | null>(null);
  const [criticalError, setCriticalErrorState] = useState("");

  const logAppError = (error: unknown, action: string, phase = "") => {
    reportAppError(error, {
      severity: "error",
      source: "app",
      action,
      phase,
      screen,
      detailId: selectedDetail?.id,
      detailType: selectedDetail?.type
    });
  };

  const setToast = (message: string, tone?: ToastTone) => {
    const trimmed = /failed to fetch|não foi possível conectar ao servidor|nao foi possivel conectar ao servidor|offline/i.test(message)
      ? APP_OPERATION_ERROR_MESSAGE
      : message.trim();
    if (!trimmed) {
      setToastState(null);
      return;
    }

    setToastState({
      id: Date.now() + Math.floor(Math.random() * 1000),
      message: trimmed,
      tone: tone ?? inferToastTone(trimmed)
    });
  };

  const setCriticalError = (message: string) => setCriticalErrorState(message ? APP_OPERATION_ERROR_MESSAGE : "");

  const setDataLoadingState = (loading: LoadingOverlayState | null) => {
    if (loading) setToastState(null);
    setDataLoading(loading);
  };

  const completeDataLoadingState = async (title: string, message?: string) => {
    setDataLoadingState({
      phase: "success",
      title,
      message
    });
    await wait(DATA_LOADING_SUCCESS_DURATION_MS);
    setDataLoadingState(null);
  };

  return {
    completeDataLoadingState,
    criticalError,
    dataLoading,
    logAppError,
    setCriticalError,
    setCriticalErrorState,
    setDataLoadingState,
    setToast,
    setToastState,
    toast
  };
}
