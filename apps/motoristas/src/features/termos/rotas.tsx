import type { MinhaMulta, CargaStatus } from "./minhasMultas";
import { declararAceite } from "./minhasMultas";
import { MinhasMultasScreen } from "./MinhasMultasScreen";
import type { TermoMulta } from "./termosMulta";
import type { Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  reloadTermosMulta: () => Promise<void>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setTourTermoId: (id: string) => void;
  termosMulta: TermoMulta[];
  termosStatus: CargaStatus;
  minhasMultas: MinhaMulta[];
  minhasMultasOfflineEm: string | null;
  minhasMultasLidoEm: string | null;
};

// Tela Multas: o que precisa do motorista, o que está em andamento e as encerradas.
export function rotasTermos(screen: Screen, {
  reloadTermosMulta,
  setScreen,
  setTourTermoId,
  termosMulta,
  termosStatus,
  minhasMultas,
  minhasMultasOfflineEm,
  minhasMultasLidoEm
}: Props): ReactNode | null {
  if (screen === "multas") {
    return (
      <MinhasMultasScreen items={minhasMultas} termos={termosMulta} loadStatus={termosStatus} offlineEm={minhasMultasOfflineEm} lidoEm={minhasMultasLidoEm} onBack={() => setScreen("inicio")} onReload={reloadTermosMulta} onDeclarar={declararAceite} onSelectedChange={setTourTermoId} />
    );
  }
  return null;
}
