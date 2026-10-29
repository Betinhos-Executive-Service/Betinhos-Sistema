import { useRef, useState } from "react";
import { findFirstPendingServiceDetail, isSameDetail } from "../../app/bootstrap";
import type { LocalStore } from "../../lib/localWorkflow";
import type { ToastTone } from "../../components/common/LocalToast";
import type { DetailData, Screen } from "../../types";

type Options = {
  selectedDetail: DetailData | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
  store: LocalStore;
};

// Fila de serviços: só o primeiro pendente pode seguir; os outros voltam para Serviços com o primeiro em destaque.
export function useFilaServicos({ selectedDetail, setScreen, setToast, store }: Options) {
  const [queueHighlightDetailKey, setQueueHighlightDetailKey] = useState("");
  const queueHighlightTimerRef = useRef<number | null>(null);

  const blockIfNotFirstPending = (detail: typeof selectedDetail = selectedDetail) => {
    if (!detail) return true;
    if (detail.type !== "SERVICO") return false;
    const firstPendingDetail = findFirstPendingServiceDetail(store.agenda);
    if (!firstPendingDetail || isSameDetail(firstPendingDetail, detail)) return false;
    const firstPendingKey = `${firstPendingDetail.type}:${firstPendingDetail.id}`;
    if (queueHighlightTimerRef.current) window.clearTimeout(queueHighlightTimerRef.current);
    setQueueHighlightDetailKey(firstPendingKey);
    queueHighlightTimerRef.current = window.setTimeout(() => {
      setQueueHighlightDetailKey("");
      queueHighlightTimerRef.current = null;
    }, 3600);
    setToast("Conclua os itens anteriores da fila antes de prosseguir.");
    setScreen("servicos");
    return true;
  };

  return { blockIfNotFirstPending, queueHighlightDetailKey, queueHighlightTimerRef, setQueueHighlightDetailKey };
}
