import type { IdeasGateway } from "./useIdeasGateway";
import { IdeasScreen } from "./IdeasScreen";
import type { Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  ideasGateway: IdeasGateway;
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
        uploadAttachment={ideasGateway.uploadAttachment}
        localNotice={remoteMode ? undefined : "Visualização local. Para enviar à equipe, abra o app publicado no Model-driven."}
      />
    );
  }
  return null;
}
