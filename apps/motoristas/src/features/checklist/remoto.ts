// Checklist no Dataverse: foto do item.
import { cleanODataGuid } from "../../data/dataverse/cliente.ts";
import { getDataUrlMimeType, getFileExtensionFromMimeType, sanitizePathSegment, shouldUseDevFolderPrefix, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";

// Checklist de vistoria: sobe a foto pelo mesmo Flow do OneDrive e devolve o link. A linha de foto
// no Dataverse é criada pelo plugin na conclusão (new_ConcluirChecklistVeiculo), não pelo app.
export async function uploadChecklistPhotoRemote({
  checklistId,
  placa,
  solicitadoEm,
  itemLabel,
  order,
  dataUrl
}: {
  checklistId: string;
  placa: string;
  solicitadoEm: string;
  itemLabel: string;
  order: number;
  dataUrl: string;
}) {
  const day = /^\d{4}-\d{2}-\d{2}/.test(solicitadoEm) ? solicitadoEm.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const devPrefix = shouldUseDevFolderPrefix() ? "DEV/" : "";
  const caminho = `Checklists/${devPrefix}${sanitizePathSegment(placa, "Sem placa")}/${day} ${cleanODataGuid(checklistId).slice(0, 8)}`;
  const fileNameBase = `${sanitizePathSegment(itemLabel, "foto")}-${order}`;
  const nomeArquivo = `${sanitizePathSegment(fileNameBase, "arquivo")}.${getFileExtensionFromMimeType(getDataUrlMimeType(dataUrl))}`;
  const link = await uploadMaintenancePhoto(caminho, dataUrl, fileNameBase, {
    origem: "checklist-veiculo",
    checklistId: cleanODataGuid(checklistId),
    item: itemLabel,
    ordem: order
  });
  return { link, caminho, nomeArquivo };
}
