import type { RefreshOptions } from "../servicos/useAgendaLoad";
import { detailsToClipboardText } from "../../lib/localWorkflow";
import type { ToastTone } from "../../components/common/LocalToast";
import { DetailsScreen } from "./DetailsScreen";
import type { DetailData, Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  getServiceObservationDraft: (detail: DetailData | null) => string;
  openFinalizeFlow: (serviceObservation?: string) => void;
  openLocalCancelFlow: () => void;
  openReceiveFlow: () => void;
  openVoucherFlow: () => void;
  refreshLocal: (detailToRefresh?: DetailData, options?: RefreshOptions) => Promise<void>;
  saveSelectedServiceObservation: (observation: string) => Promise<void>;
  selectedDetail: DetailData | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Tela de detalhe do serviço, manutenção ou troca.
export function rotasDetalhe(screen: Screen, {
  getServiceObservationDraft,
  openFinalizeFlow,
  openLocalCancelFlow,
  openReceiveFlow,
  openVoucherFlow,
  refreshLocal,
  saveSelectedServiceObservation,
  selectedDetail,
  setScreen,
  setToast
}: Props): ReactNode | null {
  if (screen === "detalhes" && selectedDetail) {
    return (
      <DetailsScreen
        detail={selectedDetail}
        onBack={() => setScreen("servicos")}
        onOpenReceive={openReceiveFlow}
        onOpenVoucher={openVoucherFlow}
        onOpenFinalize={openFinalizeFlow}
        onServiceObservationChange={saveSelectedServiceObservation}
        serviceObservationDraft={getServiceObservationDraft(selectedDetail)}
        onCancelLocal={openLocalCancelFlow}
        onRefresh={() => refreshLocal(selectedDetail)}
        onCopy={() => {
          void navigator.clipboard?.writeText(detailsToClipboardText(selectedDetail));
          setToast("Informações copiadas.");
        }}
      />
    );
  }
  return null;
}
