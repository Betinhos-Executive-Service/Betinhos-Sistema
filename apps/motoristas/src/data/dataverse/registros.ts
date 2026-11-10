// Leitura de registros do Dataverse (valores formatados, lookups, datas, texto, números, bind de lookup) e constantes comuns: status de operação, veículos e $select de manutenção.
import { cleanGuid, cleanODataGuid, getWindowXrm, type DataverseRecord } from "./cliente.ts";

export const OPERATION_STATUS = {
  requerAnalise: 100000001,
  concluido: 202410008
} as const;

export const VEHICLE_CATEGORY = {
  proprio: 100000000,
  aluguel: 100000002
} as const;

export const VEHICLE_STATUS = {
  ativo: 202410001
} as const;

export const ACTIVE_VEHICLE_FILTERS = [
  `cr40f_statusdoveiculo eq ${VEHICLE_STATUS.ativo}`
];

export const MAINTENANCE_SELECT =
  "$select=cr40f_manutencoesid,cr40f_id,cr40f_descricao,cr40f_comentariosaomotorista,cr40f_graudamanutencao,cr40f_tipodoreparo,cr40f_status,cr40f_servicorealizado,cr40f_estabelecimento,cr40f_valor,cr40f_pagamento,_cr40f_placa_carro_value,_cr40f_realizado_por_nome_value,new_comentariosdocolaborador,cr40f_foto01,cr40f_linkdaevidencia,cr40f_foto03,new_linkdanotafiscal,new_linkdafotofinal1,new_linkdafotofinal2,new_linkdafotofinal3";

export function getVehicleLabel(record: DataverseRecord) {
  const placa = String(record.cr40f_placa ?? "").trim();
  const modelo = String(record.cr40f_modelo ?? "").trim();
  const cor = String(record.cr40f_cor ?? "").trim();
  const identity = [modelo, cor].filter(Boolean).join(" ");
  return [identity, placa].filter(Boolean).join(" - ") || cleanODataGuid(record.cr40f_veiculosid);
}

export function getBooleanValue(record: DataverseRecord, logicalName: string) {
  const value = record[logicalName];
  return value === true || value === 1 || value === "true";
}

export function toDate(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function getLookupName(record: DataverseRecord, baseName: string) {
  return String(record[`_${baseName}_value@OData.Community.Display.V1.FormattedValue`] ?? record[`${baseName}@OData.Community.Display.V1.FormattedValue`] ?? "");
}

export function getFormatted(record: DataverseRecord, logicalName: string) {
  return String(record[`${logicalName}@OData.Community.Display.V1.FormattedValue`] ?? record[logicalName] ?? "");
}

export function getRecordId(record: DataverseRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = cleanODataGuid(record[key]);
    if (value) return value;
  }
  return "";
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseCurrencyNumber(value: string) {
  return Number(
    String(value ?? "")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim() || "0"
  );
}

export function truncateDataverseText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function bind(entitySetName: string, id: string) {
  return `/${entitySetName}(${cleanGuid(id)})`;
}

export function getClientUrl() {
  const clientUrl = getWindowXrm()?.Utility?.getGlobalContext?.().getClientUrl?.();
  if (!clientUrl) throw new Error("URL do Dataverse nao encontrada no runtime Xrm.");
  return clientUrl.replace(/\/$/, "");
}

export function getLookupId(record: DataverseRecord, logicalName: string) {
  return cleanODataGuid(record[`_${logicalName}_value`]);
}
