import { cleanGuid, createOne, getCurrentUserId, retrieveMultiple, retrieveMultipleAll, retrieveOne } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { getDataUrlMimeType, getFileExtensionFromMimeType, sanitizePathSegment, shouldUseDevFolderPrefix, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";
import { bind } from "../../data/dataverse/registros.ts";
import { readBlobAsDataUrl } from "../../shared/camera/photoOrientation.ts";
import {
  IdeaAttachmentsUnavailableError,
  buildIdeaAttachmentRecord,
  buildIdeaRecord,
  ideaFileMimeType,
  isMissingEntityError,
  normalizeIdeaAttachmentRecord,
  normalizeIdeaRecord,
  validateIdeaDraft,
  type Idea,
  type IdeaAttachment,
  type IdeaDraft,
  type IdeaMediaFile
} from "./ideas.ts";

// Leitura e gravação das "Boas ideias" do motorista logado no Dataverse.
const IDEA_SELECT = "$select=cr40f_boasideiasid,cr40f_name,cr40f_detalhes,cr40f_status,createdon";
const ATTACHMENT_SELECT = "$select=cr40f_boasideiaanexoid,cr40f_name,cr40f_link,cr40f_nomearquivo,cr40f_tipomidia,cr40f_ordem,cr40f_tamanhobytes,_cr40f_ideia_value";
const ATTACHMENT_QUERY_CHUNK = 25;

let attachmentsTableProbe: Promise<boolean> | null = null;

// Uma consulta por sessão: a tabela existe? Evita subir arquivo ao SharePoint quando não há onde registrar o link.
function attachmentsTableExists() {
  attachmentsTableProbe ??= retrieveMultiple(DATAVERSE.boasIdeiaAnexos, "$select=cr40f_boasideiaanexoid&$top=1")
    .then(() => true)
    .catch((error) => {
      if (isMissingEntityError(error)) return false;
      attachmentsTableProbe = null;
      throw error;
    });
  return attachmentsTableProbe;
}

async function loadAttachmentsByIdea(ideaIds: string[]) {
  const byIdea = new Map<string, IdeaAttachment[]>();
  if (!ideaIds.length) return byIdea;
  try {
    const chunks: string[][] = [];
    for (let index = 0; index < ideaIds.length; index += ATTACHMENT_QUERY_CHUNK) chunks.push(ideaIds.slice(index, index + ATTACHMENT_QUERY_CHUNK));
    const results = await Promise.all(
      chunks.map((chunk) => {
        const filter = chunk.map((id) => `_cr40f_ideia_value eq ${cleanGuid(id)}`).join(" or ");
        return retrieveMultipleAll(DATAVERSE.boasIdeiaAnexos, `${ATTACHMENT_SELECT}&$filter=statecode eq 0 and (${filter})&$orderby=cr40f_ordem asc`);
      })
    );
    for (const result of results) {
      for (const record of result.entities) {
        const ideaId = cleanGuid(String(record._cr40f_ideia_value ?? ""));
        if (!ideaId) continue;
        const attachment = normalizeIdeaAttachmentRecord(record);
        if (!attachment.link) continue;
        byIdea.set(ideaId, [...(byIdea.get(ideaId) ?? []), attachment]);
      }
    }
  } catch (error) {
    // Anexos são complemento: tabela ausente ou sem permissão não pode derrubar a lista de ideias.
    if (!isMissingEntityError(error)) console.warn("[Boas ideias] anexos indisponíveis; ideias sem anexos", error);
    return new Map<string, IdeaAttachment[]>();
  }
  return byIdea;
}

export async function loadMyIdeasRemote(): Promise<Idea[]> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Usuário atual não identificado no Dataverse.");
  const result = await retrieveMultipleAll(
    DATAVERSE.boasIdeias,
    `${IDEA_SELECT}&$filter=statecode eq 0 and _createdby_value eq ${userId}&$orderby=createdon desc`
  );
  const ideas = result.entities.map(normalizeIdeaRecord);
  const attachments = await loadAttachmentsByIdea(ideas.map((idea) => idea.id));
  return ideas.map((idea) => ({ ...idea, attachments: attachments.get(cleanGuid(idea.id)) ?? [] }));
}

export async function createIdeaRemote(draft: IdeaDraft): Promise<Idea> {
  const errors = validateIdeaDraft(draft);
  const firstError = errors.title ?? errors.details;
  if (firstError) throw new Error(firstError);
  const record = buildIdeaRecord(draft);
  const created = await createOne(DATAVERSE.boasIdeias, record);
  const id = cleanGuid(String(created?.id ?? ""));
  if (!id) throw new Error("Dataverse criou a ideia sem retornar o ID.");
  const saved = await retrieveOne(DATAVERSE.boasIdeias, id, IDEA_SELECT);
  return normalizeIdeaRecord(saved);
}

// Sobe o arquivo (SharePoint, sem carimbo de prova) e registra o link em cr40f_boasideiaanexos.
export async function uploadIdeaAttachmentRemote(idea: Pick<Idea, "id" | "title">, media: IdeaMediaFile, order: number): Promise<IdeaAttachment> {
  if (!(await attachmentsTableExists())) throw new IdeaAttachmentsUnavailableError();
  const rawDataUrl = await readBlobAsDataUrl(media.file);
  const dataUrl = media.file.type ? rawDataUrl : rawDataUrl.replace(/^data:[^;,]+/, `data:${ideaFileMimeType(media.file, media.kind)}`);
  const extension = getFileExtensionFromMimeType(getDataUrlMimeType(dataUrl));
  const baseName = sanitizePathSegment(`ideia-${media.kind}-${order}`, `ideia-${order}`);
  const fileName = `${baseName}.${extension}`;
  const devPrefix = shouldUseDevFolderPrefix() ? "DEV/" : "";
  const path = `Boas ideias/${devPrefix}${sanitizePathSegment(idea.title, "Sem título")} - ${cleanGuid(idea.id).slice(0, 8)}`;
  const link = await uploadMaintenancePhoto(path, dataUrl, baseName, {
    ideiaGuid: idea.id,
    ideiaTitulo: idea.title,
    tipoMidia: media.kind,
    indice: order
  });
  const record = {
    ...buildIdeaAttachmentRecord({ ideaTitle: idea.title, kind: media.kind, order, fileName, link, sizeBytes: media.file.size }),
    "cr40f_ideia@odata.bind": bind(DATAVERSE.boasIdeias, idea.id)
  };
  const created = await createOne(DATAVERSE.boasIdeiaAnexos, record);
  return {
    id: cleanGuid(String(created?.id ?? "")),
    kind: media.kind,
    name: String(record.cr40f_name),
    fileName,
    link,
    order,
    sizeBytes: media.file.size
  };
}
