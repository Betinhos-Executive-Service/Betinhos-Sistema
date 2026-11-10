// Arquivos: data URLs, pastas e upload de fotos pelo Flow, com o vínculo da foto no Dataverse.
import { cleanGuid, cleanODataGuid, createOne, dataverseError, getWindowXrm, retrieveOne, type DataverseRecord } from "./cliente.ts";
import { DATAVERSE } from "./entidades.ts";
import { FLOW_URLS, assertFlowSuccess, requireFlowLink, runHttpFlow } from "./flow.ts";
import { bind } from "./registros.ts";

const DEV_DATAVERSE_URL = "https://org23b93544.crm2.dynamics.com/";

export function dataUrlToBase64(value = "") {
  const marker = ";base64,";
  const markerIndex = value.toLowerCase().indexOf(marker);
  const raw = markerIndex >= 0
    ? value.slice(markerIndex + marker.length)
    : value.slice(value.lastIndexOf(",") + 1);
  return raw.replace(/\s/g, "");
}

export function assertValidBase64Payload(base64: string, context: Record<string, unknown>) {
  if (!base64 || base64.includes("data:") || base64.includes(",")) {
    dataverseError("Conteudo base64 invalido antes de chamar Flow.", {
      ...context,
      base64Chars: base64.length,
      startsWith: base64.slice(0, 48),
      endsWith: base64.slice(-48)
    });
    throw new Error("Arquivo invalido para envio: base64 veio com prefixo ou vazio.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    dataverseError("Conteudo base64 malformado antes de chamar Flow.", {
      ...context,
      base64Chars: base64.length,
      startsWith: base64.slice(0, 24),
      endsWith: base64.slice(-24)
    });
    throw new Error("Arquivo invalido para envio: base64 malformado.");
  }
}

export function getDataUrlMimeType(value = "") {
  const match = /^data:([^;,]+)[;,]/i.exec(value);
  return match?.[1]?.trim().toLowerCase() || "application/octet-stream";
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Falha ao preparar arquivo para envio ao Flow."));
    reader.readAsDataURL(blob);
  });
}

export function getFileExtensionFromMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/heic") return "heic";
  if (normalized === "image/heif") return "heif";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "video/webm") return "webm";
  if (normalized === "video/quicktime") return "mov";
  const subtype = normalized.split("/")[1] ?? "";
  return subtype.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
}

export function sanitizePathSegment(value: unknown, fallback: string) {
  const sanitized = String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "");
  return sanitized || fallback;
}

export function shouldUseDevFolderPrefix() {
  const clientUrl = getWindowXrm()?.Utility?.getGlobalContext?.().getClientUrl?.() ?? "";
  return clientUrl.replace(/\/+$/, "").toLowerCase() === DEV_DATAVERSE_URL.replace(/\/+$/, "").toLowerCase();
}

export async function buildMaintenancePhotoFolder(record: DataverseRecord) {
  const geral = (record.__geral as DataverseRecord | undefined) ?? {};
  const vehicleId = cleanODataGuid(record._cr40f_placa_carro_value) || cleanODataGuid(geral._cr40f_veiculo_value);
  let vehicleLabel = "Sem modelo - Sem placa";
  if (vehicleId) {
    const vehicle = await retrieveOne(DATAVERSE.veiculos, vehicleId, "$select=cr40f_modelo,cr40f_placa");
    vehicleLabel = `${String(vehicle.cr40f_modelo ?? "Sem modelo").trim() || "Sem modelo"} - ${
      String(vehicle.cr40f_placa ?? "Sem placa").trim() || "Sem placa"
    }`;
  }
  const maintenanceBusinessId = sanitizePathSegment(record.cr40f_id, "Sem ID");
  const devPrefix = shouldUseDevFolderPrefix() ? "DEV/" : "";
  return `Manutenções/${devPrefix}${sanitizePathSegment(vehicleLabel, "Sem modelo - Sem placa")}/${maintenanceBusinessId}`;
}

export async function uploadMaintenancePhoto(
  path: string,
  photoDataUrl: string,
  fileNameBase: string,
  metadata: Record<string, unknown>
) {
  const mimeType = getDataUrlMimeType(photoDataUrl);
  const extension = getFileExtensionFromMimeType(mimeType);
  const base64 = dataUrlToBase64(photoDataUrl);
  const fileName = `${sanitizePathSegment(fileNameBase, "arquivo")}.${extension}`;
  assertValidBase64Payload(base64, { path, fileName, mimeType, metadata });
  const flowResult = await runHttpFlow(FLOW_URLS.salvarFotosManutencao, {
    caminhoCompleto: path,
    nomeArquivo: fileName,
    conteudoBase64: base64,
    mimeType,
    metadados: metadata
  });
  assertFlowSuccess(flowResult, "FlowSalvarArquivosOnedrive");
  return requireFlowLink(flowResult, {
    path,
    fileName,
    mimeType,
    metadata
  });
}

type MaintenancePhotoOrigin = "PRE_MANUTENCAO" | "POS_MANUTENCAO" | "NOTA_FISCAL";

export async function createMaintenancePhotoLinkRecord({
  maintenanceId,
  maintenanceBusinessId,
  origin,
  photoType,
  link,
  path,
  fileName,
  order
}: {
  maintenanceId: string;
  maintenanceBusinessId: string;
  origin: MaintenancePhotoOrigin;
  photoType: string;
  link: string;
  path: string;
  fileName: string;
  order: number;
}) {
  if (!link.trim()) return;
  await createOne(DATAVERSE.fotosManutencao, {
    new_name: `${maintenanceBusinessId || cleanGuid(maintenanceId)} - ${origin} - ${order}`,
    new_tipofoto: photoType,
    new_origem: origin,
    new_link: link,
    new_caminho: path,
    new_nomearquivo: fileName,
    new_ordem: order,
    "new_Manutencao@odata.bind": bind(DATAVERSE.manutencoes, maintenanceId)
  });
}
