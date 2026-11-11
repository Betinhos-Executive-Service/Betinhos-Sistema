import type { ReactNode } from "react";
import type { Screen } from "../../types";
import { PostosProximosScreen } from "./PostosProximosScreen";

type Props = {
  /** Tela de onde o motorista abriu os postos: o Voltar devolve para lá. */
  origem: Screen;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela de postos próximos (mapa da rede CTF).
export function rotasPostos(screen: Screen, { origem, setScreen }: Props): ReactNode | null {
  if (screen === "postosProximos") return <PostosProximosScreen onBack={() => setScreen(origem)} />;
  return null;
}
