import { TreinamentosScreen } from "./TreinamentosScreen";
import { isMockTreinamentos } from "./treinamentos";
import type { DriverContext } from "../../data/dataverse/cliente";
import type { Screen } from "../../types";
import type { ReactNode } from "react";
import type { useTreinamentos } from "./useTreinamentos";

type Props = ReturnType<typeof useTreinamentos> & {
  driverContext: DriverContext | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela de treinamentos.
export function rotasTreinamentos(screen: Screen, {
  driverContext,
  reloadTreinamentos,
  selectedTreinamentoId,
  setScreen,
  setSelectedTreinamentoId,
  treinamentos,
  treinamentosStatus,
  updateTreinamentoParticipacao
}: Props): ReactNode | null {
  if (screen === "treinamentos") {
    return (
      <TreinamentosScreen
        items={treinamentos}
        loadStatus={treinamentosStatus}
        selectedId={selectedTreinamentoId}
        onSelectedIdChange={setSelectedTreinamentoId}
        onBack={() => setScreen("inicio")}
        onReload={reloadTreinamentos}
        onParticipacaoChange={updateTreinamentoParticipacao}
        driverName={driverContext?.fullName ?? (isMockTreinamentos() ? "Renan" : "")}
      />
    );
  }
  return null;
}
