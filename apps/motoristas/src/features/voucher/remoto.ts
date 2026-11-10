// Voucher no Dataverse: envio pelo Flow e rascunho salvo no serviço.
import type { DetailData } from "../../types";
import { getFieldValue } from "../detalhe/fieldLookup.ts";
import { dataverseLog, retrieveOne, updateOne } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { type FinalizePayload, buildFinalizeServiceVehiclePatch } from "../finalizar/remoto.ts";
import { OPERATION_STATUS } from "../../data/dataverse/registros.ts";
import { FLOW_URLS, HttpFlowError, assertFlowSuccess, formatFlowDecimal, runHttpFlow } from "../../data/dataverse/flow.ts";
import { dataUrlToBase64 } from "../../data/dataverse/arquivos.ts";

export async function saveVoucherRemote(payload: FinalizePayload) {
  const dv = payload.detail.dataverse;
  if (!dv?.id) throw new Error("Serviço sem referência Dataverse.");
  // Valida o carro antes de enviar o voucher, para não gerar voucher de serviço sem carro.
  const vehiclePatch = buildFinalizeServiceVehiclePatch(payload);
  const record = dv.record ?? {};
  dataverseLog("Finalizacao por voucher iniciada.", { detailId: payload.detail.id, dataverseId: dv.id });
  payload.onProgress?.("Preparando dados do voucher.");
  const voucherStateSelect = "$select=cr40f_status,new_linkdovoucher";
  const before = await retrieveOne(DATAVERSE.geral, dv.id, voucherStateSelect);
  const previousLink = String(before.new_linkdovoucher ?? "").trim();
  if (Number(before.cr40f_status) === OPERATION_STATUS.concluido && previousLink) {
    return { id: payload.detail.id };
  }
  payload.onProgress?.("Enviando voucher para o Flow.");
  let flowResult;
  try {
    flowResult = await runHttpFlow(FLOW_URLS.gerarVoucher, {
    text: record.cr40f_reservadeveculosid ?? dv.id,
    text_1: dataUrlToBase64(payload.signatureDataUrl ?? ""),
    text_2: String(payload.fields.Desvio ?? "").trim() || "Não",
    text_5: getFieldValue(payload.fields, "Horário Inicial", "Horario Inicial"),
    text_6: getFieldValue(payload.fields, "Espera Início", "Espera Inicio"),
    text_7: getFieldValue(payload.fields, "Espera Final"),
    text_8: formatFlowDecimal(getFieldValue(payload.fields, "Pedágio", "Pedagio") || "0"),
    text_9: formatFlowDecimal(getFieldValue(payload.fields, "Estacionamento") || "0"),
    text_10: formatFlowDecimal(getFieldValue(payload.fields, "Combustível", "Combustivel") || "0"),
    text_11: formatFlowDecimal(getFieldValue(payload.fields, "Hospedagem") || "0"),
    text_12: formatFlowDecimal(getFieldValue(payload.fields, "Outros") || "0"),
    text_13: getFieldValue(payload.fields, "Observação Voucher", "Observacao Voucher"),
    text_14: getFieldValue(payload.fields, "Horário Final", "Horario Final"),
    text_15: new Date().toISOString()
    });
  } catch (error) {
    if (!(error instanceof HttpFlowError) || error.status !== 504) throw error;
    payload.onProgress?.("O envio demorou. Conferindo se o voucher foi gerado.");
    let voucherConfirmed = false;
    // O timeout HTTP não cancela o Flow. Consulte o resultado sem repetir o POST.
    for (let attempt = 0; attempt < 21; attempt++) {
      if (attempt > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 3000));
      let current;
      try {
        current = await retrieveOne(DATAVERSE.geral, dv.id, voucherStateSelect);
      } catch {
        continue;
      }
      const link = String(current.new_linkdovoucher ?? "").trim();
      if (!link) continue;
      if (Number(current.cr40f_status) === OPERATION_STATUS.concluido) {
        return { id: payload.detail.id };
      }
      if (link !== previousLink) {
        voucherConfirmed = true;
        break;
      }
    }
    if (!voucherConfirmed) throw error;
    flowResult = { id: payload.detail.id };
  }
  payload.onProgress?.("Validando retorno do Flow.");
  assertFlowSuccess(flowResult, "FlowGerarVoucher");
  payload.onProgress?.("Atualizando status no Dataverse.");
  await updateOne(DATAVERSE.geral, dv.id, {
    ...vehiclePatch,
    new_rascunhovoucher: null,
    cr40f_status: OPERATION_STATUS.concluido,
    new_datadefinalizacao: new Date().toISOString()
  });
  return flowResult;
}

export async function saveVoucherDraftRemote(detail: DetailData, fields: Record<string, string>) {
  const dv = detail.dataverse;
  if (!dv?.id || detail.type !== "SERVICO") return;
  if (Object.keys(fields).length === 0) {
    dataverseLog("Limpando rascunho voucher.", { detailId: detail.id, dataverseId: dv.id });
    await updateOne(DATAVERSE.geral, dv.id, { new_rascunhovoucher: null });
    return;
  }
  const [horaSaida = "", minSaida = ""] = String(getFieldValue(fields, "Horário Inicial", "Horario Inicial")).split(":");
  const [esperaIniHora = "", esperaIniMin = ""] = String(getFieldValue(fields, "Espera Início", "Espera Inicio")).split(":");
  const [esperaFimHora = "", esperaFimMin = ""] = String(getFieldValue(fields, "Espera Final")).split(":");
  const draft = {
    hora_saida: horaSaida,
    min_saida: minSaida,
    espera_ini_hora: esperaIniHora,
    espera_ini_min: esperaIniMin,
    espera_fim_hora: esperaFimHora,
    espera_fim_min: esperaFimMin,
    desvio: getFieldValue(fields, "Desvio"),
    obs: getFieldValue(fields, "Observação Voucher", "Observacao Voucher"),
    pedagio: getFieldValue(fields, "Pedágio", "Pedagio"),
    estacionamento: getFieldValue(fields, "Estacionamento"),
    combustivel: getFieldValue(fields, "Combustível", "Combustivel"),
    hospedagem: getFieldValue(fields, "Hospedagem"),
    outros: getFieldValue(fields, "Outros")
  };
  dataverseLog("Salvando rascunho voucher.", { detailId: detail.id, dataverseId: dv.id });
  await updateOne(DATAVERSE.geral, dv.id, {
    new_rascunhovoucher: JSON.stringify(draft)
  });
}
