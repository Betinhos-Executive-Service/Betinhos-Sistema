import { AnimatePresence, motion } from "motion/react";
import { BuildStamp } from "../components/layout/BuildStamp";
import { LocalToast, type ToastState } from "../components/common/LocalToast";
import { LoadingOverlay, type LoadingOverlayState } from "../components/common/LoadingOverlay";
import { getVisibleLoadingOverlay } from "./overlayLayering";
import { getScreenMotion } from "./navigation";
import { loadActiveFleetRemote } from "../lib/dataverse";
import { SESSION_EXPIRED_MESSAGE } from "../data/dataverse/fetchWebApi";
import { MOCK_FLEET } from "../lib/serviceVehicleInfleetMock";
import { ExpenseSendOverlay, type ExpenseSendState } from "../features/despesas/ExpenseSendOverlay";
import { VehicleChoiceDialog } from "../features/detalhe/VehicleChoiceDialog";
import { FlowProgressOverlay, type RemoteOperation } from "../shared/ui/FlowProgressOverlay";
import type { useFinalizeFlow } from "../features/finalizar/useFinalizeFlow";
import type { Screen } from "../types";

// Referência estável: o diálogo compara com a lista exibida para saber se oferece "Nenhuma das opções".
const loadMockAllFleet = async () => MOCK_FLEET;

type Finalizar = ReturnType<typeof useFinalizeFlow>;

type Props = {
  cancelVehicleChoice: Finalizar["cancelVehicleChoice"];
  children: React.ReactNode;
  closeExpenseSendError: () => void;
  closeVehicleChoice: Finalizar["closeVehicleChoice"];
  criticalError: string;
  dataLoading: LoadingOverlayState | null;
  expenseSend: ExpenseSendState | null;
  previousScreen: Screen;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  screen: Screen;
  setCriticalError: (message: string) => void;
  setToastState: React.Dispatch<React.SetStateAction<ToastState | null>>;
  toast: ToastState | null;
  vehicleChoiceRequest: Finalizar["vehicleChoiceRequest"];
};

// Moldura de toda tela: animação de troca, toast, carregamento, progresso de envio, escolha do carro, erro crítico e selo de build.
export function AppShell({
  cancelVehicleChoice,
  children,
  closeExpenseSendError,
  closeVehicleChoice,
  criticalError,
  dataLoading,
  expenseSend,
  previousScreen,
  remoteMode,
  remoteOperation,
  screen,
  setCriticalError,
  setToastState,
  toast,
  vehicleChoiceRequest
}: Props) {
  const screenMotion = getScreenMotion(screen, previousScreen);
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          className={`screen-motion screen-motion--${screenMotion.kind}`}
          style={{ transformOrigin: screenMotion.origin }}
          initial={screenMotion.initial}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={screenMotion.exit}
          transition={screenMotion.transition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
      <LocalToast toast={dataLoading ? null : toast} onDismiss={() => setToastState(null)} />
      <LoadingOverlay loading={getVisibleLoadingOverlay(dataLoading, criticalError)} />
      {remoteOperation ? <FlowProgressOverlay operation={remoteOperation} /> : null}
      {expenseSend ? <ExpenseSendOverlay state={expenseSend} onClose={closeExpenseSendError} /> : null}
      {vehicleChoiceRequest ? (
        <VehicleChoiceDialog
          resolution={vehicleChoiceRequest.resolution}
          loadFleet={vehicleChoiceRequest.loadFleet}
          loadAllVehicles={remoteMode ? loadActiveFleetRemote : loadMockAllFleet}
          onChoose={closeVehicleChoice}
          onCancel={cancelVehicleChoice}
        />
      ) : null}
      {criticalError ? (
        <div className="critical-error-overlay" role="dialog" aria-modal="true" aria-labelledby="critical-error-title">
          <div className="critical-error-card">
            <div className="critical-error-kicker">Atenção</div>
            <h2 id="critical-error-title">Processo não foi concluído</h2>
            <p>{criticalError}</p>
            <div className="critical-error-actions">
              {criticalError === SESSION_EXPIRED_MESSAGE ? (
                <button type="button" onClick={() => window.location.reload()}>Entrar de novo</button>
              ) : (
                <button type="button" onClick={() => setCriticalError("")}>Entendi</button>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <BuildStamp />
    </>
  );
}
