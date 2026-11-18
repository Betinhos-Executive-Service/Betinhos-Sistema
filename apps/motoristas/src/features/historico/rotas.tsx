import type { RefreshOptions } from "../servicos/useAgendaLoad";
import type { LocalStore } from "../../lib/localWorkflow";
import { HistoryDetailsScreen } from "./HistoryDetailsScreen";
import { HistoryScreen } from "./HistoryScreen";
import type { DetailData, Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  agendaCarregando: boolean;
  refreshLocal: (detailToRefresh?: DetailData, options?: RefreshOptions) => Promise<void>;
  selectedDetail: DetailData | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setSelectedDetail: React.Dispatch<React.SetStateAction<DetailData | null>>;
  store: LocalStore;
};

// Telas do histórico: lista e detalhe.
export function rotasHistorico(screen: Screen, {
  agendaCarregando,
  refreshLocal,
  selectedDetail,
  setScreen,
  setSelectedDetail,
  store
}: Props): ReactNode | null {
  if (screen === "detalhesHistorico" && selectedDetail) {
    return (<HistoryDetailsScreen detail={selectedDetail} onBack={() => setScreen("historico")} onRefresh={() => refreshLocal(selectedDetail)} />);
  }

  if (screen === "historico") {
    return (
      <HistoryScreen
        items={store.history}
        loading={agendaCarregando}
        onHome={() => setScreen("inicio")}
        onRefresh={refreshLocal}
        onOpenDetails={(detail) => {
          setSelectedDetail(detail);
          setScreen("detalhesHistorico");
        }}
      />
    );
  }
  return null;
}
