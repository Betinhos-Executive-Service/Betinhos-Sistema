import { useEffect } from "react";
import { getQrChargeSummaryRemote } from "./remoto";
import { getReceivableCents } from "./qrCharge";
import type { useReceiveFlow } from "./useReceiveFlow";

type Options = {
  logAppError: (error: unknown, action: string, phase?: string) => void;
  recebimento: ReturnType<typeof useReceiveFlow>;
};

// Busca o resumo da cobrança por QR do serviço aberto no recebimento quando ainda não tem (ou ficou velho).
export function useQrChargeSummary({ logAppError, recebimento }: Options) {
  const { qrChargeSummaryInFlightRef, qrChargeSummaryNeeded, qrChargeSummaryRequest, setQrChargeSummaries } = recebimento;
  useEffect(() => {
    const detail = qrChargeSummaryRequest;
    if (!detail || !qrChargeSummaryNeeded) return;
    const detailId = detail.id;
    const inFlight = qrChargeSummaryInFlightRef.current;
    if (inFlight.has(detailId)) return;
    inFlight.add(detailId);
    setQrChargeSummaries((current) => ({ ...current, [detailId]: { ...current[detailId], status: "loading", stale: false } }));
    getQrChargeSummaryRemote(detail.dataverse?.id ?? detail.id, getReceivableCents(detail))
      .then((summary) => setQrChargeSummaries((current) => ({ ...current, [detailId]: { status: "ready", summary } })))
      .catch((error) => {
        // Sem resumo o fluxo segue como antes (foto obrigatória); a tela mostra um aviso discreto.
        logAppError(error, "qrChargeSummary", detail.type);
        setQrChargeSummaries((current) => ({ ...current, [detailId]: { ...current[detailId], status: "error" } }));
      })
      .finally(() => inFlight.delete(detailId));
    // A requisição depende só do serviço e de precisar (re)carregar.
  }, [qrChargeSummaryRequest?.id, qrChargeSummaryNeeded]);
}
