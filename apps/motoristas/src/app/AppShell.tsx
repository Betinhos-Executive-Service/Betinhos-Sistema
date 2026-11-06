import { AnimatePresence, motion } from "motion/react";
import { BuildStamp } from "../shared/ui/layout/BuildStamp";
import { LocalToast, type ToastState } from "../shared/ui/LocalToast";
import { LoadingOverlay, type LoadingOverlayState } from "../shared/ui/LoadingOverlay";
import { getVisibleLoadingOverlay } from "./overlayLayering";
import { getScreenMotion } from "./navigation";
import { loadActiveFleetRemote } from "../features/meu-carro/remoto";
import { SESSION_EXPIRED_MESSAGE } from "../data/dataverse/fetchWebApi";
import { MOCK_FLEET } from "../lib/serviceVehicleInfleetMock";
import { ExpenseSendOverlay, type ExpenseSendState } from "../features/despesas/ExpenseSendOverlay";
import { VehicleChoiceDialog } from "../features/detalhe/VehicleChoiceDialog";
import { FlowProgressOverlay, type RemoteOperation } from "../shared/ui/FlowProgressOverlay";
import type { useFinalizeFlow } from "../features/finalizar/useFinalizeFlow";
import type { useExpenseFlow } from "../features/despesas/useExpenseFlow";
import type { useTreinamentos } from "../features/treinamentos/useTreinamentos";
import { ConferenciaDuvidaDialog } from "../features/despesas/ConferenciaDuvidaDialog";
import { TourHelpContext } from "../shared/ui/TourHelp";
import { TourOverlay } from "./TourOverlay";
import type { useTour } from "./useTour";
import type { Screen } from "../types";

// Referência estável: o diálogo compara com a lista exibida para saber se oferece "Nenhuma das opções".
const loadMockAllFleet = async () => MOCK_FLEET;

type Finalizar = ReturnType<typeof useFinalizeFlow>;
type Treinamentos = ReturnType<typeof useTreinamentos>;
type Tour = ReturnType<typeof useTour>;

type Props = {
  abrirAvisoTreinamentos: Treinamentos["abrirAvisoTreinamentos"];
  avisoTreinamentos: Treinamentos["avisoTreinamentos"];
  cancelVehicleChoice: Finalizar["cancelVehicleChoice"];
  children: React.ReactNode;
  closeExpenseSendError: () => void;
  closeVehicleChoice: Finalizar["closeVehicleChoice"];
  closeTour: Tour["closeTour"];
  criticalError: string;
  dataLoading: LoadingOverlayState | null;
  duvidaConferencia: ReturnType<typeof useExpenseFlow>["duvidaConferencia"];
  expenseSend: ExpenseSendState | null;
  previousScreen: Screen;
  remoteMode: boolean;
  remoteOperation: RemoteOperation | null;
  screen: Screen;
  openTourHelp: Tour["openTourHelp"];
  setAvisoTreinamentos: Treinamentos["setAvisoTreinamentos"];
  setCriticalError: (message: string) => void;
  setToastState: React.Dispatch<React.SetStateAction<ToastState | null>>;
  toast: ToastState | null;
  tourCandidates: Tour["tourCandidates"];
  tourChapter: Tour["tourChapter"];
  vehicleChoiceRequest: Finalizar["vehicleChoiceRequest"];
};

// Moldura de toda tela: animação de troca, toast, aviso de treinamento novo, carregamento, progresso de envio, dúvida da conferência,
// tour, escolha do carro, erro crítico e selo de build. O botão "?" dos cabeçalhos abre o tour pelo contexto.
export function AppShell({
  abrirAvisoTreinamentos,
  avisoTreinamentos,
  cancelVehicleChoice,
  children,
  closeExpenseSendError,
  closeTour,
  closeVehicleChoice,
  criticalError,
  dataLoading,
  duvidaConferencia,
  expenseSend,
  previousScreen,
  remoteMode,
  openTourHelp,
  remoteOperation,
  screen,
  setAvisoTreinamentos,
  setCriticalError,
  setToastState,
  toast,
  tourCandidates,
  tourChapter,
  vehicleChoiceRequest
}: Props) {
  const screenMotion = getScreenMotion(screen, previousScreen);
  return (
    <TourHelpContext.Provider value={tourCandidates.length ? openTourHelp : null}>
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
      {avisoTreinamentos && screen !== "treinamentos" && !dataLoading ? (
        <div className="local-toast-layer">
          <div className="local-toast local-toast--info trn-aviso" role="status" aria-live="polite" aria-atomic="true">
            <div className="local-toast-copy">
              <span className="local-toast-label">Treinamento</span>
              <span className="local-toast-message">{avisoTreinamentos.message}</span>
              <div className="trn-aviso-acoes">
                <button type="button" onClick={abrirAvisoTreinamentos}>Ver treinamento</button>
                <button type="button" onClick={() => setAvisoTreinamentos(null)}>Dispensar</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <LoadingOverlay loading={getVisibleLoadingOverlay(dataLoading, criticalError)} />
      {remoteOperation ? <FlowProgressOverlay operation={remoteOperation} /> : null}
      {expenseSend ? <ExpenseSendOverlay state={expenseSend} onClose={closeExpenseSendError} /> : null}
      {duvidaConferencia ? <ConferenciaDuvidaDialog pergunta={duvidaConferencia.pergunta} onResponder={(texto) => duvidaConferencia.responder(texto)} onVoltar={() => duvidaConferencia.responder(null)} /> : null}
      {tourChapter ? <TourOverlay key={tourChapter.id} chapter={tourChapter} onClose={closeTour} /> : null}
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
    </TourHelpContext.Provider>
  );
}
