// Colisões no Dataverse: fotos, schema e nomes de navegação.
import type { CollisionLookupNavigationNames, CollisionPhotoKind } from "./collisions";
import { createOne } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { getDataUrlMimeType, getFileExtensionFromMimeType, sanitizePathSegment, shouldUseDevFolderPrefix, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";
import { bind } from "../../data/dataverse/registros.ts";
import { type LookupNavigationRequest, assertEntityHasAttributes, resolveLookupNavigationName } from "../../data/dataverse/metadados.ts";

const COLLISION_DATAVERSE_ATTACHMENT_TYPE: Record<CollisionPhotoKind, number> = {
  cena: 100000000,
  danoBetinhos: 100000001,
  danoTerceiro: 100000002,
  documentoTerceiro: 100000003,
  extra: 100000004,
  video: 100000004
};

function getCollisionAttachmentLabel(kind: CollisionPhotoKind) {
  if (kind === "cena") return "Local";
  if (kind === "danoBetinhos") return "Veiculos";
  if (kind === "danoTerceiro") return "CNH da pessoa";
  if (kind === "documentoTerceiro") return "Documento do veiculo da pessoa";
  if (kind === "video") return "Video";
  return "Extra";
}

export async function uploadCollisionPhotoRemote({
  collisionId,
  collisionName,
  motoristaId,
  dataUrl,
  kind,
  order = 1,
  onProgress
}: {
  collisionId: string;
  collisionName: string;
  motoristaId?: string;
  dataUrl: string;
  kind: CollisionPhotoKind;
  order?: number;
  onProgress?: (message: string) => void;
}) {
  if (!dataUrl) return "";
  const devPrefix = shouldUseDevFolderPrefix() ? "DEV/" : "";
  const isVideo = getDataUrlMimeType(dataUrl).startsWith("video/");
  const extension = getFileExtensionFromMimeType(getDataUrlMimeType(dataUrl));
  const label = kind === "video" ? `Video ${order}` : kind === "extra" ? `Extra ${order}` : getCollisionAttachmentLabel(kind);
  const baseName = sanitizePathSegment(`colisao-${label}-${order}`, `colisao-${order}`);
  const path = `Colisões/${devPrefix}${sanitizePathSegment(collisionName, "Sem nome")}`;
  const lookupNavigationNames = await loadCollisionAttachmentLookupNavigationNamesRemote();

  onProgress?.(`Enviando ${isVideo ? "video" : "foto"} ${order}.`);
  const link = await uploadMaintenancePhoto(path, dataUrl, baseName, {
    colisaoGuid: collisionId,
    colisaoNome: collisionName,
    tipo: kind,
    tipoMidia: isVideo ? "video" : "foto",
    indice: order
  });

  onProgress?.(`Vinculando ${isVideo ? "video" : "foto"} ${order} à colisão.`);
  const recordName = `${label} ${order} - ${collisionName}`.slice(0, 100);
  const record: Record<string, unknown> = {
    cr40f_name: recordName,
    cr40f_nome: recordName,
    cr40f_nomearquivo: `${baseName}.${extension}`,
    cr40f_urlsharepoint: link,
    cr40f_sharelink: link,
    cr40f_dataenvio: new Date().toISOString(),
    cr40f_ordem: order,
    cr40f_status: 100000001,
    cr40f_tipo: COLLISION_DATAVERSE_ATTACHMENT_TYPE[kind],
    cr40f_tipomidia: isVideo ? 100000001 : 100000000,
    [`${lookupNavigationNames.colisao}@odata.bind`]: bind(DATAVERSE.colisoes, collisionId)
  };
  if (motoristaId) record[`${lookupNavigationNames.enviadoPor}@odata.bind`] = bind(DATAVERSE.funcionarios, motoristaId);
  await createOne(DATAVERSE.anexosColisoes, record);
  return link;
}

type CollisionAttachmentLookupNavigationNames = {
  colisao: string;
  enviadoPor: string;
};

export async function assertCollisionSchemaReadyRemote() {
  await Promise.all([
    assertEntityHasAttributes(DATAVERSE.colisoes, "Colisoes", [
      "cr40f_nome",
      "cr40f_name",
      "cr40f_tipoocorrencia",
      "cr40f_datahora",
      "cr40f_local",
      "cr40f_descricao",
      "cr40f_houveterceiro",
      "cr40f_terceironome",
      "cr40f_terceirotelefone",
      "cr40f_terceiroplaca",
      "cr40f_terceiroveiculo",
      "cr40f_terceirodocumento",
      "cr40f_terceiroseguradora",
      "cr40f_terceiroobservacao",
      "cr40f_statusoperacional",
      "cr40f_statusanexo"
    ]),
    assertEntityHasAttributes(DATAVERSE.anexosColisoes, "Anexos de Colisoes", [
      "cr40f_nome",
      "cr40f_name",
      "cr40f_nomearquivo",
      "cr40f_urlsharepoint",
      "cr40f_sharelink",
      "cr40f_dataenvio",
      "cr40f_ordem",
      "cr40f_status",
      "cr40f_tipo",
      "cr40f_tipomidia"
    ])
  ]);
}

export async function loadCollisionLookupNavigationNamesRemote(): Promise<CollisionLookupNavigationNames> {
  const requests: Array<LookupNavigationRequest & { key: keyof CollisionLookupNavigationNames }> = [
    {
      key: "motorista",
      referencingEntitySetName: DATAVERSE.colisoes,
      referencedEntitySetName: DATAVERSE.funcionarios,
      referencingAttribute: "cr40f_motorista",
      label: "Colisao.Motorista",
      required: true
    },
    {
      key: "veiculo",
      referencingEntitySetName: DATAVERSE.colisoes,
      referencedEntitySetName: DATAVERSE.veiculos,
      referencingAttribute: "cr40f_veiculo",
      label: "Colisao.Veiculo",
      required: true
    }
  ];

  const settled = await Promise.allSettled(requests.map((request) => resolveLookupNavigationName(request)));
  const names: Partial<CollisionLookupNavigationNames> = {};
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      names[request.key] = result.value;
      return;
    }
    failures.push(`${request.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (failures.length || !names.motorista || !names.veiculo) {
    throw new Error(`Schema de Colisoes incompleto. Falhas: ${failures.join(" | ")}`);
  }
  return { motorista: names.motorista, veiculo: names.veiculo };
}

async function loadCollisionAttachmentLookupNavigationNamesRemote(): Promise<CollisionAttachmentLookupNavigationNames> {
  const requests: Array<LookupNavigationRequest & { key: keyof CollisionAttachmentLookupNavigationNames }> = [
    {
      key: "colisao",
      referencingEntitySetName: DATAVERSE.anexosColisoes,
      referencedEntitySetName: DATAVERSE.colisoes,
      referencingAttribute: "cr40f_colisao",
      label: "AnexoColisao.Colisao"
    },
    {
      key: "enviadoPor",
      referencingEntitySetName: DATAVERSE.anexosColisoes,
      referencedEntitySetName: DATAVERSE.funcionarios,
      referencingAttribute: "cr40f_enviadopor",
      label: "AnexoColisao.EnviadoPor"
    }
  ];

  const settled = await Promise.allSettled(requests.map((request) => resolveLookupNavigationName(request)));
  const names: Partial<CollisionAttachmentLookupNavigationNames> = {};
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      names[request.key] = result.value;
      return;
    }
    failures.push(`${request.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (failures.length || !names.colisao || !names.enviadoPor) {
    throw new Error(`Schema de Anexos de Colisoes incompleto. Falhas: ${failures.join(" | ")}`);
  }
  return { colisao: names.colisao, enviadoPor: names.enviadoPor };
}
