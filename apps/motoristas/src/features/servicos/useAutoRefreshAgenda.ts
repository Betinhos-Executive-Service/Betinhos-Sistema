import type { RefreshOptions } from "./useAgendaLoad";
import { useEffect } from "react";
import { AUTO_REFRESH_INTERVAL_MS, shouldAutoRefreshScreen } from "../../app/navigation";
import type { DetailData, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";

type Options = {
  refreshLocal: (detailToRefresh?: DetailData, options?: RefreshOptions) => Promise<void>;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  screen: Screen;
  selectedDetail: DetailData | null;
};

// Atualiza a agenda sozinha (intervalo, foco, volta à aba) nas telas que pedem isso, sem atrapalhar uma operação remota em andamento.
export function useAutoRefreshAgenda({ refreshLocal, remoteMode, remoteOperation, screen, selectedDetail }: Options) {
  useEffect(() => {
    if (!remoteMode || remoteOperation || !shouldAutoRefreshScreen(screen)) return;

    let refreshing = false;
    const autoRefresh = () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      void refreshLocal(selectedDetail ?? undefined, { silent: true }).finally(() => { refreshing = false; });
    };

    const timer = window.setInterval(autoRefresh, AUTO_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", autoRefresh);
    window.addEventListener("pageshow", autoRefresh);
    document.addEventListener("visibilitychange", autoRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", autoRefresh);
      window.removeEventListener("pageshow", autoRefresh);
      document.removeEventListener("visibilitychange", autoRefresh);
    };
  }, [remoteMode, remoteOperation, screen, selectedDetail]);

}
