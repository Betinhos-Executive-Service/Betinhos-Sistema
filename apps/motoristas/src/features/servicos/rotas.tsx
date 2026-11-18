import type { RefreshOptions } from "./useAgendaLoad";
import type { ChecklistVeiculo } from "../checklist/checklists";
import type { ComunicadoDestinatario } from "../comunicados/comunicados";
import type { PortaDados } from "../../data/porta";
import { reportAppError } from "../../shared/appErrorLogger";
import { isComunicadoPending } from "../comunicados/comunicados";
import { isChecklistPending } from "../checklist/checklists";
import type { LocalStore } from "../../lib/localWorkflow";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { ServicesScreen } from "./ServicesScreen";
import type { DetailData, Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  agendaCarregando: boolean;
  checklists: ChecklistVeiculo[];
  completingDetailKey: string;
  comunicados: ComunicadoDestinatario[];
  dados: PortaDados;
  queueHighlightDetailKey: string;
  refreshLocal: (detailToRefresh?: DetailData, options?: RefreshOptions) => Promise<void>;
  remoteMode: boolean;
  setChecklistOrigin: React.Dispatch<React.SetStateAction<"" | "servicos">>;
  setComunicadoOrigin: React.Dispatch<React.SetStateAction<"" | "servicos">>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setSelectedChecklistId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedComunicadoId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedDetail: React.Dispatch<React.SetStateAction<DetailData | null>>;
  setToast: (message: string, tone?: ToastTone) => void;
  store: LocalStore;
};

// Tela de serviços (agenda).
export function rotasServicos(screen: Screen, {
  agendaCarregando,
  checklists,
  completingDetailKey,
  comunicados,
  dados,
  queueHighlightDetailKey,
  refreshLocal,
  remoteMode,
  setChecklistOrigin,
  setComunicadoOrigin,
  setScreen,
  setSelectedChecklistId,
  setSelectedComunicadoId,
  setSelectedDetail,
  setToast,
  store
}: Props): ReactNode | null {
  if (screen === "servicos") {
    return (
      <ServicesScreen
        items={store.agenda}
        loading={agendaCarregando}
        pendingComunicados={comunicados.filter(isComunicadoPending)}
        onOpenComunicado={(id) => { setSelectedComunicadoId(id); setComunicadoOrigin("servicos"); setScreen("comunicados"); }}
        pendingChecklists={checklists.filter(isChecklistPending)}
        onOpenChecklist={(id) => { setSelectedChecklistId(id); setChecklistOrigin("servicos"); setScreen("checklists"); }}
        onHome={() => setScreen("inicio")}
        onRefresh={refreshLocal}
        completingDetailKey={completingDetailKey}
        queueHighlightDetailKey={queueHighlightDetailKey}
        onOpenDetails={(detail) => {
          if (remoteMode) {
            dados.marcarVisto(detail).catch((error) => {
              reportAppError(error, {
                severity: "error",
                source: "app",
                action: "markDetailViewedRemote",
                phase: "open-details",
                screen: "servicos",
                detailId: detail.id,
                detailType: detail.type
              });
              setToast(error instanceof Error ? error.message : "Falha ao marcar visualização.");
            });
          }
          setSelectedDetail(detail);
          setScreen("detalhes");
        }}
      />
    );
  }
  return null;
}
