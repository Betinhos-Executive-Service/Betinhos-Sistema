// Recebimento no Dataverse: comprovantes e cobrança por QR.
import { type ReceiptLanguage } from "../recibo/receiptLanguage.ts";
import { parseQrChargeResponse, parseQrChargeSummary, type QrChargePayer } from "./qrCharge.ts";
import { createMockQrCharge, getMockQrChargeSummary, updateMockQrCharge } from "./qrChargeMock.ts";
import { cleanGuid, createOne, isLocalhostRuntime } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { getDataUrlMimeType, getFileExtensionFromMimeType, sanitizePathSegment, shouldUseDevFolderPrefix, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";
import { bind, getClientUrl } from "../../data/dataverse/registros.ts";
import { type LookupNavigationRequest, resolveLookupNavigationName } from "../../data/dataverse/metadados.ts";

export async function uploadReceiveProofRemote({
  reservaId,
  reservaName,
  motoristaId,
  dataUrl,
  fileName,
  order = 1,
  onProgress
}: {
  reservaId: string;
  reservaName: string;
  motoristaId?: string;
  dataUrl: string;
  fileName?: string;
  order?: number;
  onProgress?: (message: string) => void;
}) {
  if (!dataUrl) return "";
  const isVideo = getDataUrlMimeType(dataUrl).startsWith("video/");
  const extension = getFileExtensionFromMimeType(getDataUrlMimeType(dataUrl));
  const baseName = sanitizePathSegment(fileName?.replace(/\.[^.]+$/, ""), `comprovante-recebimento-${order}`);
  const devPrefix = shouldUseDevFolderPrefix() ? "DEV/" : "";
  const path = `Recebimentos/${devPrefix}${sanitizePathSegment(reservaName, "Sem nome")}`;
  const lookupNavigationNames = await loadReceiveAttachmentLookupNavigationNamesRemote();

  onProgress?.(`Enviando comprovante ${order}.`);
  const link = await uploadMaintenancePhoto(path, dataUrl, baseName, {
    reservaGuid: reservaId,
    reservaNome: reservaName,
    tipo: "COMPROVANTE_RECEBIMENTO",
    tipoMidia: isVideo ? "video" : "foto",
    indice: order
  });

  onProgress?.(`Vinculando comprovante ${order} ao serviço.`);
  const recordName = `Comprovante ${order} - ${reservaName}`.slice(0, 100);
  const record: Record<string, unknown> = {
    cr40f_name: recordName,
    cr40f_nome: recordName,
    cr40f_nomearquivo: `${baseName}.${extension}`,
    cr40f_urlsharepoint: link,
    cr40f_sharelink: link,
    cr40f_dataenvio: new Date().toISOString(),
    cr40f_ordem: order,
    cr40f_status: 100000001,
    cr40f_tipo: 100000000,
    cr40f_tipomidia: isVideo ? 100000001 : 100000000,
    [`${lookupNavigationNames.reserva}@odata.bind`]: bind(DATAVERSE.geral, reservaId)
  };
  if (motoristaId) record[`${lookupNavigationNames.enviadoPor}@odata.bind`] = bind(DATAVERSE.funcionarios, motoristaId);
  await createOne(DATAVERSE.anexosRecebimento, record);
  return link;
}

type ReceiveAttachmentLookupNavigationNames = {
  reserva: string;
  enviadoPor: string;
};

async function loadReceiveAttachmentLookupNavigationNamesRemote(): Promise<ReceiveAttachmentLookupNavigationNames> {
  const requests: Array<LookupNavigationRequest & { key: keyof ReceiveAttachmentLookupNavigationNames }> = [
    {
      key: "reserva",
      referencingEntitySetName: DATAVERSE.anexosRecebimento,
      referencedEntitySetName: DATAVERSE.geral,
      referencingAttribute: "cr40f_reserva",
      label: "AnexoRecebimento.Reserva"
    },
    {
      key: "enviadoPor",
      referencingEntitySetName: DATAVERSE.anexosRecebimento,
      referencedEntitySetName: DATAVERSE.funcionarios,
      referencingAttribute: "cr40f_enviadopor",
      label: "AnexoRecebimento.EnviadoPor"
    }
  ];

  const settled = await Promise.allSettled(requests.map((request) => resolveLookupNavigationName(request)));
  const names: Partial<ReceiveAttachmentLookupNavigationNames> = {};
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      names[request.key] = result.value;
      return;
    }
    failures.push(`${request.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (failures.length || !names.reserva || !names.enviadoPor) {
    throw new Error(`Schema de Anexos de Recebimento incompleto. Falhas: ${failures.join(" | ")}`);
  }
  return { reserva: names.reserva, enviadoPor: names.enviadoPor };
}

// Sem motoristaId: o plugin usa o funcionário do usuário logado, então ninguém cobra em nome de outro.
export type QrChargeRequest = {
  reservaId: string;
  valorCentavos: number;
  pagante: QrChargePayer;
  // O plugin converte para o locale do Stripe: pt-BR → pt-BR, en-US → en, es-ES → es.
  idioma: ReceiptLanguage;
};

// Custom API new_CobrancaQR: a chave do Stripe fica na configuração segura do step, fora do alcance do motorista.
async function runQrChargeCommand(command: Record<string, unknown>) {
  const response = await fetch(`${getClientUrl()}/api/data/v9.2/new_CobrancaQR`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ new_Command: JSON.stringify(command) })
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `Cobrança por QR indisponível (HTTP ${response.status}).`;
    try { message = JSON.parse(text)?.error?.message || message; } catch { /* Resposta sem JSON. */ }
    throw new Error(message);
  }
  return JSON.parse(String(JSON.parse(text)?.new_Result ?? "{}"));
}

// Cria a cobrança no Stripe, sempre em reais; o plugin confere de novo permissão, reserva e saldo.
// A cobrança por QR só é simulada em localhost, nunca no fallback sem Xrm.WebApi: um "pago" de mentira no celular
// seria pior que nenhum. Sem Xrm no Dynamics, a Custom API falha e o motorista vê o erro.
export async function createQrChargeRemote(request: QrChargeRequest) {
  if (isLocalhostRuntime()) return createMockQrCharge(request);
  return parseQrChargeResponse(await runQrChargeCommand({ acao: "criar", ...request, reservaId: cleanGuid(request.reservaId) }));
}

export async function updateQrChargeRemote(sessionId: string, acao: "consultar" | "cancelar") {
  if (isLocalhostRuntime()) return updateMockQrCharge(sessionId, acao);
  return parseQrChargeResponse(await runQrChargeCommand({ acao, sessionId }));
}

// Quanto já entrou por QR no serviço, o saldo e a cobrança aberta: reidrata o Recebimento depois de recarregar.
// receivableCents só alimenta o mock; no Dataverse o plugin lê o valor a receber da própria reserva.
export async function getQrChargeSummaryRemote(reservaId: string, receivableCents: number) {
  if (isLocalhostRuntime()) return getMockQrChargeSummary(reservaId, receivableCents);
  return parseQrChargeSummary(await runQrChargeCommand({ acao: "resumo", reservaId: cleanGuid(reservaId) }));
}
