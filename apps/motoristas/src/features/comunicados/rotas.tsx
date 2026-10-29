import type { DriverContext } from "../../data/dataverse/cliente";
import { isMockComunicados } from "./comunicados";
import { ComunicadosScreen } from "./ComunicadosScreen";
import type { Screen } from "../../types";
import type { ReactNode } from "react";
import type { useComunicados } from "./useComunicados";

type Props = ReturnType<typeof useComunicados> & {
  driverContext: DriverContext | null;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela de comunicados.
export function rotasComunicados(screen: Screen, {
  comunicadoOrigin,
  comunicados,
  comunicadosStatus,
  driverContext,
  reloadComunicados,
  selectedComunicadoId,
  setComunicadoOrigin,
  setScreen,
  setSelectedComunicadoId
}: Props): ReactNode | null {
  if (screen === "comunicados") {
    return (
      <ComunicadosScreen
        items={comunicados}
        selectedId={selectedComunicadoId}
        onSelectedIdChange={setSelectedComunicadoId}
        onBack={() => { setComunicadoOrigin(""); setScreen("inicio"); }}
        onCloseDetail={comunicadoOrigin === "servicos" ? () => { setSelectedComunicadoId(""); setComunicadoOrigin(""); setScreen("servicos"); } : undefined}
        onReload={reloadComunicados}
        loadStatus={comunicadosStatus}
        driverName={driverContext?.fullName ?? (isMockComunicados() ? "Renan" : "")}
      />
    );
  }
  return null;
}
