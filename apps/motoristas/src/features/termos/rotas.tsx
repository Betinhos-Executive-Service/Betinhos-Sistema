import type { TermoMulta } from "./termosMulta";
import type { TermosLoadStatus } from "./TermosMultaScreen";
import { TermosMultaScreen } from "./TermosMultaScreen";
import type { Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  reloadTermosMulta: () => Promise<void>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  termosMulta: TermoMulta[];
  termosStatus: TermosLoadStatus;
};

// Tela de termos de multa.
export function rotasTermos(screen: Screen, {
  reloadTermosMulta,
  setScreen,
  termosMulta,
  termosStatus
}: Props): ReactNode | null {
  if (screen === "multas") {
    return (
      <TermosMultaScreen items={termosMulta} loadStatus={termosStatus} onBack={() => setScreen("inicio")} onReload={reloadTermosMulta} />
    );
  }
  return null;
}
