import type { ReceiptEntrySource } from "./origem";
import { ReceiptScreen } from "./ReceiptScreen";
import type { DetailData, Screen } from "../../types";
import type { RemoteOperation } from "../../shared/ui/FlowProgressOverlay";
import type { ReactNode } from "react";

type Props = {
  receiptClienteOptions: string[];
  receiptDetail: DetailData | undefined;
  receiptEntrySource: ReceiptEntrySource;
  selectedDetail: DetailData | null;
  setRemoteOperation: React.Dispatch<React.SetStateAction<RemoteOperation | null>>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela do recibo personalizado.
export function rotasRecibo(screen: Screen, {
  receiptClienteOptions,
  receiptDetail,
  receiptEntrySource,
  selectedDetail,
  setRemoteOperation,
  setScreen
}: Props): ReactNode | null {
  if (screen === "reciboPersonalizado") {
    return (
      <ReceiptScreen
        detail={receiptDetail}
        onBack={() => setScreen(receiptEntrySource === "service" && selectedDetail ? "receber" : "inicio")}
        clienteOptions={receiptClienteOptions}
        onProgress={(progress) => {
          if (!progress) {
            setRemoteOperation(null);
            return;
          }
          const flowPhase = progress.phase === "success" ? "success" : "loading";
          setRemoteOperation({
            title: "Gerando recibo personalizado",
            message: progress.message,
            detailId: receiptDetail?.id,
            phase: flowPhase
          });
        }}
      />
    );
  }
  return null;
}
