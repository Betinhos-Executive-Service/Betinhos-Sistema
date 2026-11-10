// Finalizar no Dataverse: serviço, manutenção (com gasto) e troca; observação, cancelamento e carro do serviço.
import type { DetailData, MaintenancePhotoKind } from "../../types";
import { buildExpenseCreatePayload, findMaintenanceExpenseCategory, findExpensePaymentMethodByName, mapMaintenancePaymentToExpensePaymentNames, shouldUploadMaintenanceExpenseInvoices, type ExpenseDraft, type ExpensePhoto } from "../despesas/expenses.ts";
import { getFieldValue } from "../detalhe/fieldLookup.ts";
import { buildInfleetServiceVehiclePatch, parseInfleetVehicleResolution, unavailableResolution, type DriverVehicleChoice, type InfleetVehicleResolution } from "../../lib/serviceVehicleInfleet.ts";
import { cleanGuid, cleanODataGuid, createOne, dataverseLog, dataverseWarn, getDriverContext, getWebApi, hasDataverseRuntime, retrieveMultiple, retrieveOne, updateOne, type DataverseRecord } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { mockOrganizeObservation } from "./observacaoOrganizada.ts";
import { OPERATION_STATUS, bind, normalizeText, parseCurrencyNumber } from "../../data/dataverse/registros.ts";
import { assertExpenseSchemaReadyRemote, loadExpenseLookupNavigationNamesRemote, loadExpenseReferenceDataRemote, uploadExpenseInvoiceRemote } from "../despesas/remoto.ts";
import { buildMaintenancePhotoFolder, createMaintenancePhotoLinkRecord, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";
import { EXCHANGE_SELECT, getExchangeCompletionState } from "../servicos/trocas.ts";

export type FinalizePayload = {
  detail: DetailData;
  fields: Record<string, string>;
  signatureDataUrl?: string;
  photos?: Partial<Record<MaintenancePhotoKind, string>>;
  onProgress?: (message: string) => void;
  // Carro do serviço decidido pela Infleet antes de finalizar (somente SERVICO).
  vehicleResolution?: InfleetVehicleResolution;
  vehicleChoice?: DriverVehicleChoice | null;
  // Motorista terceiro: a finalização não grava o carro do serviço.
  skipVehicle?: boolean;
};

export const SERVICE_VEHICLE_ORIGIN = {
  automatico: 100000000,
  manual: 100000001
} as const;

const MAINTENANCE_PAYMENT: Record<string, number> = {
  cartao: 202410000,
  "cartao de credito": 202410000,
  "pedido de compra": 202410001,
  dinheiro: 202410001,
  pix: 202410002
};

const MAINTENANCE_STATUS = {
  realizado: 202410002
} as const;

const MOTORIST_OBSERVATION_PREFIX = "OBS do motorista:";
const MOTORIST_OBSERVATION_PATTERN = /(?:\r?\n){0,2}OBS do motorista:\s*[\s\S]*$/i;

function cleanMotoristObservation(value: string) {
  return String(value ?? "")
    .replace(/^\s*OBS do motorista:\s*/i, "")
    .trim();
}

function mergeMotoristObservation(existingValue: unknown, observation: string) {
  const existing = String(existingValue ?? "").trim();
  const managerText = existing.replace(MOTORIST_OBSERVATION_PATTERN, "").trim();
  const cleanObservation = cleanMotoristObservation(observation);
  const motoristText = cleanObservation ? `${MOTORIST_OBSERVATION_PREFIX} ${cleanObservation}` : "";
  return [managerText, motoristText].filter(Boolean).join("\n");
}

export function buildAutomaticServiceVehiclePatch(record: DataverseRecord | undefined, currentVehicleId: string) {
  const vehicleId = cleanODataGuid(currentVehicleId);
  if (!vehicleId || Number(record?.new_origemveiculo) === SERVICE_VEHICLE_ORIGIN.manual) return {};

  const patch: Record<string, unknown> = {
    new_origemveiculo: SERVICE_VEHICLE_ORIGIN.automatico
  };
  if (cleanODataGuid(record?._cr40f_veiculo_value) !== vehicleId) {
    patch["cr40f_Veiculo@odata.bind"] = bind(DATAVERSE.veiculos, vehicleId);
  }
  return patch;
}

// Infleet decide o carro ou o motorista escolhe; a posse não entra na finalização.
export function buildFinalizeServiceVehiclePatch(payload: FinalizePayload) {
  if (payload.skipVehicle) return {};
  const resolution = payload.vehicleResolution;
  if (!resolution) throw new Error("Carro do serviço não conferido. Tente finalizar novamente.");
  const patch = buildInfleetServiceVehiclePatch(resolution, payload.vehicleChoice ?? null, (vehicleId) => bind(DATAVERSE.veiculos, vehicleId));
  if (!patch.new_origemveiculo) throw new Error("Escolha o carro usado no serviço antes de finalizar.");
  return patch;
}

export async function resolveServiceVehicleRemote(serviceDataverseId: string): Promise<InfleetVehicleResolution> {
  try {
    const online = getWebApi().online;
    // O Xrm depende do `this`; extrair o método solto quebra com "reading '_execute'".
    const execute = online?.execute?.bind(online);
    if (!execute) return unavailableResolution("api-indisponivel");
    const response = (await execute({
      new_ReservaId: cleanGuid(serviceDataverseId),
      getMetadata: () => ({
        boundParameter: null,
        operationType: 0,
        operationName: "new_ResolverVeiculoDoServico",
        // Com "Edm.Guid" o Xrm serializa a string como 'undefined'; o servidor converte o texto para Guid.
        parameterTypes: { new_ReservaId: { typeName: "Edm.String", structuralProperty: 1 } }
      })
    })) as Response;
    if (!response.ok) {
      dataverseWarn("Resolvedor de veiculo da Infleet respondeu com erro.", { status: response.status });
      return unavailableResolution(`erro-http-${response.status}`);
    }
    const body = await response.json();
    return parseInfleetVehicleResolution(body?.new_ResultadoJson);
  } catch (error) {
    dataverseWarn("Resolvedor de veiculo da Infleet indisponivel.", { message: error instanceof Error ? error.message : String(error) });
    return unavailableResolution("erro-ao-consultar");
  }
}

// Custom API new_OrganizarObservacao: devolve o JSON cru ({ ok, topicos, ... }). Sem Xrm usa o mock local.
export async function organizeObservationRemote(text: string): Promise<string> {
  if (!hasDataverseRuntime()) return mockOrganizeObservation(text);
  const online = getWebApi().online;
  // O Xrm depende do `this`; extrair o método solto quebra com "reading '_execute'".
  const execute = online?.execute?.bind(online);
  if (!execute) throw new Error("api-indisponivel");
  const response = (await execute({
    new_Texto: text,
    getMetadata: () => ({
      boundParameter: null,
      operationType: 0,
      operationName: "new_OrganizarObservacao",
      parameterTypes: { new_Texto: { typeName: "Edm.String", structuralProperty: 1 } }
    })
  })) as Response;
  if (!response.ok) {
    dataverseWarn("Organizador de observacao respondeu com erro.", { status: response.status });
    throw new Error(`erro-http-${response.status}`);
  }
  const body = await response.json();
  const result = String(body?.new_ResultadoJson ?? "");
  try {
    const parsed = JSON.parse(result);
    dataverseLog("Observacao organizada.", { ok: parsed?.ok, motivo: parsed?.motivo, ms: parsed?.ms, topicos: parsed?.topicos?.length ?? 0 });
  } catch {
    dataverseWarn("Organizador de observacao devolveu JSON invalido.");
  }
  return result;
}

export async function finalizeServiceRemote(payload: FinalizePayload) {
  const dv = payload.detail.dataverse;
  if (!dv?.id) throw new Error("Serviço sem referência Dataverse.");
  dataverseLog("Finalização simples de serviço iniciada.", { detailId: payload.detail.id, dataverseId: dv.id });
  payload.onProgress?.("Atualizando serviço no Dataverse.");
  const vehiclePatch = buildFinalizeServiceVehiclePatch(payload);
  await updateOne(DATAVERSE.geral, dv.id, {
    ...vehiclePatch,
    new_observacaofinal: mergeMotoristObservation(dv.record?.new_observacaofinal, getFieldValue(payload.fields, "Observação Final", "Observacao Final")),
    cr40f_status: OPERATION_STATUS.concluido,
    new_datadefinalizacao: new Date().toISOString()
  });
}

export async function saveServiceObservationRemote(detail: DetailData, observation: string) {
  const dv = detail.dataverse;
  if (!dv?.id) throw new Error("Serviço sem referência Dataverse.");
  await updateOne(DATAVERSE.geral, dv.id, {
    new_observacaofinal: mergeMotoristObservation(dv.record?.new_observacaofinal, observation)
  });
}

export async function cancelServiceRemote(detail: DetailData, reason: string) {
  const dv = detail.dataverse;
  if (!dv?.id) throw new Error("Serviço sem referência Dataverse.");
  const record = dv.record ?? {};
  const geralId = detail.type === "SERVICO" ? dv.id : cleanODataGuid(record.__geralId);
  if (!geralId) throw new Error("Registro Geral vinculado não encontrado para cancelamento.");
  dataverseLog("Cancelamento/finalização local remota iniciado.", {
    detailId: detail.id,
    dataverseId: dv.id,
    geralId,
    hasReason: Boolean(reason)
  });
  await updateOne(DATAVERSE.geral, geralId, {
    new_observacaofinal: `Obs do Motorista: ${reason || "Cancelado no local."}`,
    cr40f_status: OPERATION_STATUS.requerAnalise,
    new_datadefinalizacao: new Date().toISOString()
  });
}

function getRequiredMaintenanceExpenseOptionId(value: string, label: string) {
  if (!value) throw new Error(`${label} obrigatorio para registrar gasto da manutencao.`);
  return value;
}

async function findExistingMaintenanceExpense(maintenanceId: string) {
  const filter = `_cr40f_manutencao_value eq ${cleanGuid(maintenanceId)}`;
  const result = await retrieveMultiple(
    DATAVERSE.despesasOperacionais,
    `$select=cr40f_despesaoperacionalid,cr40f_nome,cr40f_statusanexo&$filter=${filter}&$orderby=modifiedon desc&$top=1`
  );
  return result.entities[0] ?? null;
}

async function upsertMaintenanceExpense({
  fields,
  maintenanceId,
  motoristaId,
  vehicleId,
  invoicePhotos,
  finalizedAt,
  onProgress
}: {
  fields: Record<string, string>;
  maintenanceId: string;
  motoristaId: string;
  vehicleId: string;
  invoicePhotos: ExpensePhoto[];
  finalizedAt: string;
  onProgress?: (message: string) => void;
}) {
  const cityId = getRequiredMaintenanceExpenseOptionId(getFieldValue(fields, "Cidade"), "Cidade");
  if (!invoicePhotos.length) throw new Error("Adicione a foto da nota fiscal para registrar o gasto da manutencao.");

  onProgress?.("Conferindo schema de despesas.");
  await assertExpenseSchemaReadyRemote({ includeManutencao: true });
  const [referenceData, lookupNavigationNames] = await Promise.all([
    loadExpenseReferenceDataRemote(),
    loadExpenseLookupNavigationNamesRemote({ includeVeiculo: true, includeManutencao: true })
  ]);

  const category = findMaintenanceExpenseCategory(referenceData);
  const paymentMethod = findExpensePaymentMethodByName(
    referenceData,
    mapMaintenancePaymentToExpensePaymentNames(getFieldValue(fields, "Forma de Pagamento"))
  );
  const categoryId = getRequiredMaintenanceExpenseOptionId(category?.id ?? "", "Categoria Manutencao");
  const paymentMethodId = getRequiredMaintenanceExpenseOptionId(paymentMethod?.id ?? "", "Forma de pagamento do gasto");

  const motoristObservation =
    getFieldValue(
      fields,
      "Comentários do Colaborador",
      "Comentarios do Colaborador",
      "Comentários do Motorista",
      "Comentarios do Motorista",
      "Observações da Manutenção",
      "Observacoes da Manutencao"
    ) ||
    "Sem comentarios.";
  const draft: ExpenseDraft = {
    categoriaId: categoryId,
    veiculoId: vehicleId,
    valor: getFieldValue(fields, "Valor") || "0",
    dataGasto: finalizedAt.slice(0, 10),
    formaPagamentoId: paymentMethodId,
    cidadeId: cityId,
    estabelecimento: getFieldValue(fields, "Estabelecimento"),
    descricao: motoristObservation,
    kmInformado: "",
    litros: ""
  };
  const expensePayload = buildExpenseCreatePayload({
    draft,
    photos: invoicePhotos,
    referenceData,
    motoristaId,
    veiculoId: vehicleId,
    manutencaoId: maintenanceId,
    dataGastoIso: finalizedAt,
    categoryEntitySet: DATAVERSE.categoriasDespesasOperacionais,
    paymentMethodEntitySet: DATAVERSE.formasPagamentoDespesas,
    cityEntitySet: DATAVERSE.cidades,
    motoristaEntitySet: DATAVERSE.funcionarios,
    veiculoEntitySet: DATAVERSE.veiculos,
    reservaEntitySet: DATAVERSE.geral,
    maintenanceEntitySet: DATAVERSE.manutencoes,
    lookupNavigationNames
  });

  onProgress?.("Criando ou atualizando gasto da manutencao.");
  const existingExpense = await findExistingMaintenanceExpense(maintenanceId);
  const existingExpenseId = cleanODataGuid(existingExpense?.cr40f_despesaoperacionalid);
  const expenseId = existingExpenseId || cleanODataGuid((await createOne(DATAVERSE.despesasOperacionais, expensePayload)).id);
  if (existingExpenseId) await updateOne(DATAVERSE.despesasOperacionais, existingExpenseId, expensePayload);

  const shouldUploadInvoices = shouldUploadMaintenanceExpenseInvoices(existingExpense?.cr40f_statusanexo);
  if (shouldUploadInvoices) {
    try {
      await Promise.all(invoicePhotos.map((photo, index) => uploadExpenseInvoiceRemote({
        expenseId,
        expenseName: String(expensePayload.cr40f_nome ?? "Manutencao"),
        motoristaId,
        dataUrl: photo.dataUrl,
        fileName: `nota-fiscal-manutencao-${index + 1}`,
        order: index + 1,
        onProgress
      })));
      await updateOne(DATAVERSE.despesasOperacionais, expenseId, { cr40f_statusanexo: 100000002 });
    } catch (error) {
      await updateOne(DATAVERSE.despesasOperacionais, expenseId, { cr40f_statusanexo: 100000003 });
      throw error;
    }
  } else {
    await updateOne(DATAVERSE.despesasOperacionais, expenseId, { cr40f_statusanexo: 100000002 });
  }

  return expenseId;
}

export async function finalizeMaintenanceRemote(payload: FinalizePayload) {
  const dv = payload.detail.dataverse;
  if (!dv?.id) throw new Error("Manutenção sem referência Dataverse.");
  const record = dv.record ?? {};
  const geralId = cleanODataGuid(record.__geralId);
  const finalizedAt = new Date().toISOString();
  const paymentKey = normalizeText(getFieldValue(payload.fields, "Forma de Pagamento"));
  const paymentValue = MAINTENANCE_PAYMENT[paymentKey];
  dataverseLog("Finalização de manutenção iniciada.", {
    detailId: payload.detail.id,
    dataverseId: dv.id,
    photoKinds: Object.keys(payload.photos ?? {})
  });
  const maintenancePatch: Record<string, unknown> = {
    cr40f_datamanutencao: finalizedAt,
    cr40f_estabelecimento: getFieldValue(payload.fields, "Estabelecimento"),
    cr40f_valor: parseCurrencyNumber(getFieldValue(payload.fields, "Valor") || "0"),
    new_comentariosdocolaborador: getFieldValue(payload.fields, "Comentários do Colaborador", "Comentarios do Colaborador", "Comentários do Motorista", "Comentarios do Motorista"),
    cr40f_servicorealizado: getFieldValue(payload.fields, "Serviço Realizado", "Servico Realizado")
  };
  if (paymentValue !== undefined) maintenancePatch.cr40f_pagamento = paymentValue;
  const motoristaId = cleanODataGuid((record.__geral as DataverseRecord | undefined)?._cr40f_motorista_value);
  const vehicleId = cleanODataGuid(record._cr40f_placa_carro_value);
  if (!motoristaId) throw new Error("Motorista da manutencao nao encontrado para registrar gasto.");
  if (!vehicleId) throw new Error("Veiculo da manutencao nao encontrado para registrar gasto.");
  if (motoristaId) maintenancePatch["cr40f_Realizado_por_nome@odata.bind"] = bind(DATAVERSE.funcionarios, motoristaId);

  payload.onProgress?.("Salvando dados da manutenção.");
  await updateOne(DATAVERSE.manutencoes, dv.id, maintenancePatch);
  const photoPatch: Record<string, unknown> = {};
  const photos = payload.photos ?? {};
  const invoiceEntries = Object.entries(photos)
    .filter(([kind, dataUrl]) => kind.startsWith("NOTAFISCAL") && Boolean(dataUrl))
    .sort(([left], [right]) => {
      const leftIndex = left === "NOTAFISCAL" ? 1 : Number(left.replace("NOTAFISCAL_", ""));
      const rightIndex = right === "NOTAFISCAL" ? 1 : Number(right.replace("NOTAFISCAL_", ""));
      return leftIndex - rightIndex;
    })
    .map(([kind, dataUrl], index) => ({
      kind: kind as MaintenancePhotoKind,
      dataUrl: dataUrl ?? "",
      fileName: `nota-fiscal-${index + 1}`,
      targetField: "new_linkdanotafiscal"
    }));
  const photoEntries = [
    ...invoiceEntries,
    { kind: "FOTO1", fileName: "foto-1", targetField: "new_linkdafotofinal1" },
    { kind: "FOTO2", fileName: "foto-2", targetField: "new_linkdafotofinal2" },
    { kind: "FOTO3", fileName: "foto-3", targetField: "new_linkdafotofinal3" }
  ] as const;
  const photoFolderPath = await buildMaintenancePhotoFolder(record);

  const uploadEntries = photoEntries.filter((entry) => Boolean(photos[entry.kind]));
  if (uploadEntries.length) payload.onProgress?.(`Enviando ${uploadEntries.length} arquivo(s) em paralelo.`);
  let completedMaintenanceUploads = 0;
  const uploadResults = await Promise.allSettled(uploadEntries.map(async (entry) => ({
    targetField: entry.targetField,
    kind: entry.kind,
    fileName: entry.fileName,
    link: await uploadMaintenancePhoto(photoFolderPath, photos[entry.kind] ?? "", entry.fileName, {
      manutencaoId: record.cr40f_id ?? "",
      manutencaoGuid: dv.id,
      geralId,
      tipoFoto: entry.kind
    }).then((link) => {
      completedMaintenanceUploads += 1;
      payload.onProgress?.(`Uploads paralelos concluídos (${completedMaintenanceUploads}/${uploadEntries.length}).`);
      return link;
    })
  })));
  const uploadedLinks = uploadResults.flatMap((uploadResult) => uploadResult.status === "fulfilled" ? [uploadResult.value] : []);
  const failedUploads = uploadResults.length - uploadedLinks.length;

  const linksByField = uploadedLinks.reduce<Record<string, string[]>>((current, item) => {
    if (!item.link) return current;
    current[item.targetField] = [...(current[item.targetField] ?? []), item.link];
    return current;
  }, {});
  Object.entries(linksByField).forEach(([field, links]) => {
    photoPatch[field] = links.join("\n");
  });

  if (uploadedLinks.length) {
    await Promise.all(uploadedLinks.map((item, index) => createMaintenancePhotoLinkRecord({
      maintenanceId: dv.id,
      maintenanceBusinessId: String(record.cr40f_id ?? ""),
      origin: item.kind.startsWith("NOTAFISCAL") ? "NOTA_FISCAL" : "POS_MANUTENCAO",
      photoType: item.kind,
      link: item.link,
      path: photoFolderPath,
      fileName: item.fileName,
      order: index + 1
    })));
  }

  if (failedUploads) {
    if (Object.keys(photoPatch).length) {
      payload.onProgress?.("Gravando links enviados no Dataverse.");
      await updateOne(DATAVERSE.manutencoes, dv.id, photoPatch);
    }
    throw new Error(`Manutenção salva, mas ${failedUploads} de ${uploadEntries.length} arquivo(s) falharam no upload.`);
  }

  await upsertMaintenanceExpense({
    fields: payload.fields,
    maintenanceId: dv.id,
    motoristaId,
    vehicleId,
    invoicePhotos: invoiceEntries.map((entry, index) => ({
      id: `${entry.kind}-${index + 1}`,
      dataUrl: entry.dataUrl
    })),
    finalizedAt,
    onProgress: payload.onProgress
  });

  photoPatch.cr40f_status = MAINTENANCE_STATUS.realizado;
  payload.onProgress?.("Gravando links das fotos no Dataverse.");
  await updateOne(DATAVERSE.manutencoes, dv.id, photoPatch);
  if (geralId) {
    payload.onProgress?.("Concluindo item da agenda.");
    await updateOne(DATAVERSE.geral, geralId, {
      new_observacaofinal: getFieldValue(payload.fields, "Comentários do Colaborador", "Comentarios do Colaborador", "Comentários do Motorista", "Comentarios do Motorista", "Observações", "Observacoes"),
      cr40f_status: OPERATION_STATUS.concluido,
      new_datadefinalizacao: finalizedAt
    });
  }
}

export async function finalizeExchangeRemote(payload: FinalizePayload) {
  const dv = payload.detail.dataverse;
  if (!dv?.id) throw new Error("Troca sem referência Dataverse.");
  const driver = await getDriverContext();
  const record = await retrieveOne(DATAVERSE.trocas, dv.id, EXCHANGE_SELECT);
  const isDriver1 = cleanODataGuid(record._cr40f_motorista1_value) === cleanGuid(driver.id);
  const isDriver2 = cleanODataGuid(record._cr40f_motorista2_value) === cleanGuid(driver.id);
  if (!isDriver1 && !isDriver2) throw new Error("Motorista atual não pertence a esta troca.");

  const observation = getFieldValue(payload.fields, "Observações", "Observacoes", "Observação da Troca", "Observacao da Troca") || "Sem observação.";
  const completion = getExchangeCompletionState(record, isDriver1, isDriver2);
  dataverseLog("Confirmação de troca iniciada.", {
    detailId: payload.detail.id,
    dataverseId: dv.id,
    isDriver1,
    isDriver2,
    baseExchange: completion.baseExchange,
    closesExchange: completion.closesExchange
  });

  payload.onProgress?.(
    completion.closesExchange
      ? "Confirmando e aplicando a troca no servidor."
      : "Registrando sua confirmação da troca."
  );
  const webApi = getWebApi();
  if (!webApi.online?.execute) throw new Error("[FORBIDDEN_LIFECYCLE] API de confirmação indisponível neste contexto.");
  const outOfWindowReason = getFieldValue(payload.fields, "Motivo fora da janela").trim();
  const request: Record<string, unknown> = {
    entity: { entityType: "cr40f_trocasdecarro", id: cleanGuid(dv.id) },
    new_Motivo: observation,
    new_VersaoEsperada: String(record["@odata.etag"] ?? "").replace(/^W\/\"|\"$/g, ""),
    ...(outOfWindowReason ? { new_MotivoForaDaJanela: outOfWindowReason } : {}),
    getMetadata: () => ({
      boundParameter: "entity",
      operationType: 0,
      operationName: "new_ConfirmarTrocaMotorista",
      parameterTypes: {
        entity: { typeName: "mscrm.cr40f_trocasdecarro", structuralProperty: 5 },
        new_Motivo: { typeName: "Edm.String", structuralProperty: 1 },
        new_VersaoEsperada: { typeName: "Edm.String", structuralProperty: 1 },
        new_MotivoForaDaJanela: { typeName: "Edm.String", structuralProperty: 1 }
      }
    })
  };
  await webApi.online.execute(request);
}
