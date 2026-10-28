import { cleanGuid, createOne, getCurrentUserId, retrieveMultipleAll, retrieveOne } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { buildIdeaRecord, normalizeIdeaRecord, validateIdeaDraft, type Idea, type IdeaDraft } from "./ideas.ts";

// Leitura e gravação das "Boas ideias" do motorista logado no Dataverse.
const IDEA_SELECT = "$select=cr40f_boasideiasid,cr40f_name,cr40f_detalhes,cr40f_status,createdon";

export async function loadMyIdeasRemote(): Promise<Idea[]> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("Usuário atual não identificado no Dataverse.");
  const result = await retrieveMultipleAll(
    DATAVERSE.boasIdeias,
    `${IDEA_SELECT}&$filter=statecode eq 0 and _createdby_value eq ${userId}&$orderby=createdon desc`
  );
  return result.entities.map(normalizeIdeaRecord);
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
