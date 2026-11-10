import type { Idea, IdeaDraft } from "./ideas";
import { IdeasScreen } from "./IdeasScreen";
import type { Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  ideasGateway: { load: () => Promise<Idea[]>; create: (draft: IdeaDraft) => Promise<Idea>; };
  remoteMode: boolean;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela de boas ideias.
export function rotasIdeias(screen: Screen, { ideasGateway, remoteMode, setScreen }: Props): ReactNode | null {
  if (screen === "boasIdeias") {
    return (
      <IdeasScreen
        onBack={() => setScreen("inicio")}
        loadIdeas={ideasGateway.load}
        createIdea={ideasGateway.create}
        localNotice={remoteMode ? undefined : "Visualização local. Para enviar à equipe, abra o app publicado no Model-driven."}
      />
    );
  }
  return null;
}
