import { useMemo, useRef } from "react";
import { IDEA_STATUS, type Idea, type IdeaDraft } from "./ideas";
import type { PortaDados } from "../../data/porta";

// Ideias pela porta de dados no modo remoto; no mock ficam só na memória da sessão.
export function useIdeasGateway(dados: PortaDados, remoteMode: boolean) {
  const localIdeasRef = useRef<Idea[]>([]);
  return useMemo(() => {
    if (remoteMode) return { load: dados.carregarIdeias, create: dados.criarIdeia };
    return {
      load: async () => [...localIdeasRef.current],
      create: async (draft: IdeaDraft) => {
        const idea: Idea = { id: `local-idea-${Date.now()}`, title: draft.title.trim(), details: draft.details.trim(), status: IDEA_STATUS.nova, createdAt: new Date().toISOString() };
        localIdeasRef.current = [idea, ...localIdeasRef.current];
        return idea;
      }
    };
  }, [remoteMode]);
}
