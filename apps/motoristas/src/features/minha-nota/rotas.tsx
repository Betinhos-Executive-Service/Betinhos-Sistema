import { MinhaNotaScreen } from "./MinhaNotaScreen";
import type { Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela da nota de condução (Infleet).
export function rotasMinhaNota(screen: Screen, { setScreen }: Props): ReactNode | null {
  if (screen === "minhaNota") return <MinhaNotaScreen onBack={() => setScreen("inicio")} />;
  return null;
}
