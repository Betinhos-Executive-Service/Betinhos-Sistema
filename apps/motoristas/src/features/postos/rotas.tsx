import type { ReactNode } from "react";
import type { Screen } from "../../types";
import { PostosProximosScreen } from "./PostosProximosScreen";

type Props = {
  /** Tela de onde o motorista abriu os postos: o Voltar devolve para lá. */
  origem: Screen;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  /** Id do motorista logado (vazio enquanto o contexto não carregou). */
  motoristaId: string;
};

// Tela de postos próximos (mapa da rede CTF).
export function rotasPostos(screen: Screen, { origem, setScreen, motoristaId }: Props): ReactNode | null {
  if (screen === "postosProximos") return <PostosProximosScreen onBack={() => setScreen(origem)} motoristaId={motoristaId} />;
  return null;
}
