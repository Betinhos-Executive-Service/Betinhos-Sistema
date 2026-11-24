import { useMemo, useRef } from "react";
import { IDEA_STATUS, ideaAttachmentLabel, type Idea, type IdeaAttachment, type IdeaDraft, type IdeaMediaFile } from "./ideas";
import type { PortaDados } from "../../data/porta";
import { readBlobAsDataUrl } from "../../shared/camera/photoOrientation";

export type IdeasGateway = {
  load: () => Promise<Idea[]>;
  create: (draft: IdeaDraft) => Promise<Idea>;
  uploadAttachment: (idea: Pick<Idea, "id" | "title">, media: IdeaMediaFile, order: number) => Promise<IdeaAttachment>;
};

// Falha simulada no mock: `?falharAnexo=1` derruba a 1ª tentativa do 2º arquivo; `?falharAnexo=todos`, a 1ª tentativa de cada arquivo.
function mockFailureMode() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("falharAnexo") ?? "";
}

// Ideias pela porta de dados no modo remoto; no mock ficam só na memória da sessão.
export function useIdeasGateway(dados: PortaDados, remoteMode: boolean): IdeasGateway {
  const localIdeasRef = useRef<Idea[]>([]);
  const failedOnceRef = useRef(new Set<string>());
  return useMemo<IdeasGateway>(() => {
    if (remoteMode) return { load: dados.carregarIdeias, create: dados.criarIdeia, uploadAttachment: dados.enviarAnexoIdeia };
    return {
      load: async () => localIdeasRef.current.map((idea) => ({ ...idea, attachments: [...idea.attachments] })),
      create: async (draft: IdeaDraft) => {
        const idea: Idea = { id: `local-idea-${Date.now()}`, title: draft.title.trim(), details: draft.details.trim(), status: IDEA_STATUS.nova, createdAt: new Date().toISOString(), attachments: [] };
        localIdeasRef.current = [idea, ...localIdeasRef.current];
        return { ...idea };
      },
      uploadAttachment: async (idea, media, order) => {
        const mode = mockFailureMode();
        const key = `${idea.id}:${order}`;
        const shouldFail = (mode === "todos" || (mode !== "" && mode !== "0" && order === 2)) && !failedOnceRef.current.has(key);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        if (shouldFail) {
          failedOnceRef.current.add(key);
          throw new Error("Falha simulada no envio do arquivo.");
        }
        const link = await readBlobAsDataUrl(media.file);
        const attachment: IdeaAttachment = {
          id: `local-anexo-${idea.id}-${order}`,
          kind: media.kind,
          name: `${ideaAttachmentLabel(media.kind)} ${order} - ${idea.title}`.slice(0, 100),
          fileName: media.file.name,
          link,
          order,
          sizeBytes: media.file.size
        };
        localIdeasRef.current = localIdeasRef.current.map((item) =>
          item.id === idea.id ? { ...item, attachments: [...item.attachments.filter((existing) => existing.order !== order), attachment].sort((a, b) => a.order - b.order) } : item
        );
        return attachment;
      }
    };
  }, [remoteMode, dados]);
}
