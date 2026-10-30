// Solicitação de manutenção no Dataverse: veículos do motorista e criação com fotos.
import { cleanGuid, cleanODataGuid, createOne, dataverseError, dataverseLog, dataverseWarn, getDriverCurrentVehicleId, retrieveMultiple, retrieveOne, updateOne, type DataverseRecord, type DriverContext } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { ACTIVE_VEHICLE_FILTERS, MAINTENANCE_SELECT, VEHICLE_CATEGORY, VEHICLE_STATUS, bind, getVehicleLabel } from "../../data/dataverse/registros.ts";
import { buildMaintenancePhotoFolder, createMaintenancePhotoLinkRecord, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";

export type MaintenanceRequestPayload = {
  descricao: string;
  kmAtual: number;
  veiculoId: string;
  motoristaId: string;
  gravidade: number;
  agendarPara?: string;
  comentario?: string;
  photos?: string[];
  onProgress?: (message: string) => void;
};

export type MaintenanceRequestVehicleOption = {
  id: string;
  label: string;
  isCurrent: boolean;
};

const ACTIVE_OWN_VEHICLE_FILTER = [
  ...ACTIVE_VEHICLE_FILTERS,
  `new_categoriadoveiculo eq ${VEHICLE_CATEGORY.proprio}`
].join(" and ");

const MAINTENANCE_REQUEST_PHOTO_FIELDS = ["cr40f_foto01", "cr40f_linkdaevidencia", "cr40f_foto03"] as const;

export function buildMaintenanceRequestVehiclesQuery(options: { onlyOwnCategory?: boolean; activeOnly?: boolean } = {}) {
  const query = [
    "$select=cr40f_veiculosid,cr40f_placa,cr40f_marca,cr40f_modelo,cr40f_cor,_cr40f_motoristaatual_value,cr40f_statusdoveiculo,new_categoriadoveiculo,statecode,statuscode"
  ];
  if (options.onlyOwnCategory) {
    query.push(`$filter=${ACTIVE_OWN_VEHICLE_FILTER}`);
  } else if (options.activeOnly) {
    query.push(`$filter=${ACTIVE_VEHICLE_FILTERS.join(" and ")}`);
  }
  query.push("$orderby=cr40f_placa asc", "$top=200");
  return query.join("&");
}

export function buildMaintenanceRequestAssignedVehiclesQuery(driver: DriverContext) {
  const currentVehicleId = getDriverCurrentVehicleId(driver);
  const driverFilter = `_cr40f_motoristaatual_value eq ${cleanGuid(driver.id)}`;
  const currentVehicleFilter = currentVehicleId ? ` or cr40f_veiculosid eq ${currentVehicleId}` : "";
  return [
    "$select=cr40f_veiculosid,cr40f_placa,cr40f_marca,cr40f_modelo,cr40f_cor,_cr40f_motoristaatual_value,cr40f_statusdoveiculo,new_categoriadoveiculo,statecode,statuscode",
    `$filter=statecode eq 0 and statuscode eq 1 and cr40f_statusdoveiculo eq ${VEHICLE_STATUS.ativo} and (${driverFilter}${currentVehicleFilter})`,
    "$orderby=cr40f_placa asc",
    "$top=20"
  ].join("&");
}

function mapMaintenanceRequestVehicles(records: DataverseRecord[], currentVehicleId: string): MaintenanceRequestVehicleOption[] {
  return records
    .map((record): MaintenanceRequestVehicleOption => {
      const id = cleanODataGuid(record.cr40f_veiculosid);
      return {
        id,
        label: getVehicleLabel(record),
        isCurrent: Boolean(currentVehicleId && id === currentVehicleId)
      };
    })
    .filter((vehicle) => Boolean(vehicle.id && vehicle.label));
}

export async function loadMaintenanceRequestVehiclesRemote(driver: DriverContext, options: { onlyOwnCategory?: boolean; activeOnly?: boolean } = {}) {
  const currentVehicleId = getDriverCurrentVehicleId(driver);
  const result = await retrieveMultiple(DATAVERSE.veiculos, buildMaintenanceRequestVehiclesQuery(options));
  const vehicles = mapMaintenanceRequestVehicles(result.entities, currentVehicleId);
  if (vehicles.length || !options.onlyOwnCategory) return vehicles;

  dataverseWarn("Consulta de veiculos proprios ativos vazia. Tentando veiculo atual/atribuido ao motorista.", {
    driverId: driver.id,
    currentVehicleId
  });
  const fallbackResult = await retrieveMultiple(DATAVERSE.veiculos, buildMaintenanceRequestAssignedVehiclesQuery(driver));
  return mapMaintenanceRequestVehicles(fallbackResult.entities, currentVehicleId);
}

export function buildMaintenanceRequestRecord(payload: MaintenanceRequestPayload) {
  const descricao = payload.descricao.trim();
  const kmAtual = Number(payload.kmAtual);
  const veiculoId = cleanGuid(payload.veiculoId);
  const motoristaId = cleanGuid(payload.motoristaId);
  const gravidade = Number(payload.gravidade);
  const agendarPara = payload.agendarPara?.trim();
  const comentario = payload.comentario?.trim();

  if (!descricao) throw new Error("Descricao da manutencao e obrigatoria.");
  if (!Number.isFinite(kmAtual) || kmAtual <= 0) throw new Error("Km atual deve ser maior que zero.");
  if (!veiculoId) throw new Error("Veiculo atual nao encontrado para solicitar manutencao.");
  if (!motoristaId) throw new Error("Motorista logado nao encontrado para solicitar manutencao.");
  if (!Number.isFinite(gravidade) || gravidade <= 0) throw new Error("Gravidade da manutencao e obrigatoria.");

  const data: Record<string, unknown> = {
    cr40f_descricao: descricao,
    cr40f_kmatual: Math.trunc(kmAtual),
    cr40f_graudamanutencao: Math.trunc(gravidade),
    "cr40f_Placa_Carro@odata.bind": bind(DATAVERSE.veiculos, veiculoId),
    "cr40f_Solicitado_por@odata.bind": bind(DATAVERSE.funcionarios, motoristaId)
  };

  if (agendarPara) data.cr40f_agendarpara = new Date(agendarPara).toISOString();
  if (comentario) data.cr40f_comentariosaomotorista = comentario;

  return data;
}

export async function createMaintenanceRequestRemote(payload: MaintenanceRequestPayload) {
  const photos = payload.photos?.filter(Boolean) ?? [];
  if (!photos.length) throw new Error("Adicione ao menos uma foto do pedido de manutencao.");

  dataverseLog("Solicitacao de manutencao iniciada.", {
    kmAtual: payload.kmAtual,
    hasAgendarPara: Boolean(payload.agendarPara),
    photoCount: photos.length
  });
  const result = await createOne(DATAVERSE.manutencoes, buildMaintenanceRequestRecord(payload));

  payload.onProgress?.("Preparando pasta das fotos.");
  const maintenance = await retrieveOne(DATAVERSE.manutencoes, result.id, MAINTENANCE_SELECT);
  const photoFolderPath = `${await buildMaintenancePhotoFolder(maintenance)}/Solicitação`;

  payload.onProgress?.(`Enviando ${photos.length} arquivo(s) em paralelo.`);
  let completedRequestUploads = 0;
  const uploadResults = await Promise.allSettled(photos.map(async (photoDataUrl, index) => {
    const fileName = `foto-solicitacao-${index + 1}`;
    payload.onProgress?.(`Uploads paralelos: enviando arquivo ${index + 1}/${photos.length}.`);
    const link = await uploadMaintenancePhoto(photoFolderPath, photoDataUrl, fileName, {
      manutencaoId: maintenance.cr40f_id ?? "",
      manutencaoGuid: result.id,
      tipoFoto: "SOLICITACAO",
      indice: index + 1
    });
    completedRequestUploads += 1;
    payload.onProgress?.(`Uploads paralelos concluídos (${completedRequestUploads}/${photos.length}).`);
    return { fileName, link, order: index + 1 };
  }));
  const uploadedRequestLinks = uploadResults.flatMap((uploadResult) => uploadResult.status === "fulfilled" ? [uploadResult.value] : []);
  const failedUploads = uploadResults.length - uploadedRequestLinks.length;

  if (uploadedRequestLinks.length) {
    await Promise.all(uploadedRequestLinks.map((item) =>
      createMaintenancePhotoLinkRecord({
        maintenanceId: result.id,
        maintenanceBusinessId: String(maintenance.cr40f_id ?? ""),
        origin: "PRE_MANUTENCAO",
        photoType: "SOLICITACAO",
        link: item.link,
        path: photoFolderPath,
        fileName: item.fileName,
        order: item.order
      })
    ));
  }

  const firstThreeLinks = uploadedRequestLinks
    .map((item) => item.link)
    .filter(Boolean)
    .slice(0, 3);
  const photoPatch: Record<string, unknown> = {};
  MAINTENANCE_REQUEST_PHOTO_FIELDS.forEach((field, index) => {
    if (firstThreeLinks[index]) photoPatch[field] = firstThreeLinks[index];
  });
  if (Object.keys(photoPatch).length) {
    payload.onProgress?.("Gravando links das fotos no Dataverse.");
    await updateOne(DATAVERSE.manutencoes, result.id, photoPatch);
    const verified = await retrieveOne(
      DATAVERSE.manutencoes,
      result.id,
      `$select=${MAINTENANCE_REQUEST_PHOTO_FIELDS.join(",")}`
    );
    const missingFields = MAINTENANCE_REQUEST_PHOTO_FIELDS
      .slice(0, firstThreeLinks.length)
      .filter((field, index) => String(verified[field] ?? "") !== firstThreeLinks[index]);
    if (missingFields.length) {
      dataverseError("Links das fotos de solicitacao nao foram confirmados no Dataverse.", {
        maintenanceId: result.id,
        missingFields,
        expectedFields: Object.keys(photoPatch)
      });
      throw new Error("Fotos salvas no OneDrive, mas os links nao foram confirmados na manutencao.");
    }
  }
  if (failedUploads) {
    throw new Error(`Solicitação criada, mas ${failedUploads} de ${photos.length} foto(s) falharam no upload.`);
  }

  return result;
}
