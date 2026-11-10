// Recibo personalizado no Dataverse: registro, PDF, e-mail e clientes.
import type { DetailData } from "../../types";
import type { PersonalReceiptModel } from "./personalReceipt";
import { normalizeReceiptLanguage, RECEIPT_LANGUAGE } from "./receiptLanguage.ts";
import { cleanGuid, cleanODataGuid, createOne, dataverseError, dataverseWarn, describeDataverseError, getDriverContext, retrieveMultiple, retrieveMultipleAll, retrieveOne, updateOne, type DataverseRecord } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { bind, parseCurrencyNumber, truncateDataverseText } from "../../data/dataverse/registros.ts";
import { assertValidBase64Payload, blobToDataUrl, dataUrlToBase64, sanitizePathSegment, shouldUseDevFolderPrefix, uploadMaintenancePhoto } from "../../data/dataverse/arquivos.ts";
import { FLOW_URLS, assertFlowSuccess, runHttpFlow } from "../../data/dataverse/flow.ts";
import { type LookupNavigationRequest, resolveLookupNavigationName } from "../../data/dataverse/metadados.ts";

const RECEIPT_STATUS = {
  gerado: 100000000,
  salvoNoOneDrive: 100000001,
  falha: 100000002
} as const;

const RECEIPT_LANGUAGE_VALUE: Record<string, number> = {
  [RECEIPT_LANGUAGE.portuguese]: 100000000,
  [RECEIPT_LANGUAGE.english]: 100000001,
  [RECEIPT_LANGUAGE.spanish]: 100000002
};
const RECEIPT_CLIENT_QUERY =
  "$select=cr40f_clientes1id,cr40f_nomedocliente&$filter=statecode eq 0&$orderby=cr40f_nomedocliente asc";
const RECEIPT_CLIENT_ALL_QUERY =
  "$select=cr40f_clientes1id,cr40f_nomedocliente&$orderby=cr40f_nomedocliente asc";

export async function loadReceiptClienteOptionsRemote(): Promise<string[]> {
  let activeError: unknown = null;
  let result: { entities: DataverseRecord[] };

  try {
    const activeClients = await retrieveMultiple(DATAVERSE.clientes, RECEIPT_CLIENT_QUERY);
    if (activeClients.entities.length) {
      return activeClients.entities
        .map((record) => String(record.cr40f_nomedocliente ?? "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    dataverseWarn("Nenhum cliente ativo encontrado para recibo. Tentando consulta sem filtro de ativo.");
  } catch (error) {
    activeError = error;
    dataverseWarn(
      "Consulta ativa de clientes para recibo falhou. Tentando consulta sem filtro de ativo.",
      describeDataverseError(error)
    );
  }

  try {
    result = await retrieveMultipleAll(DATAVERSE.clientes, RECEIPT_CLIENT_ALL_QUERY);
  } catch (error) {
    throw activeError ?? error;
  }

  return result.entities
    .map((record) => String(record.cr40f_nomedocliente ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function parseReceiptDate(value: string) {
  const trimmed = value.trim();
  const brDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (brDate) {
    const [, day, month, year] = brDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const date = trimmed ? new Date(trimmed) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

export type ReceiptPdfUploadResult = {
  recordId: string;
  link: string;
  fileName: string;
  path: string;
};

function getReceiptMotoristaId(detail: DetailData) {
  const record = (detail.dataverse?.record as DataverseRecord | undefined) ?? {};
  return cleanODataGuid(record._cr40f_motorista_value);
}

async function resolveReceiptMotoristaId(detail?: DetailData) {
  const motoristaFromDetail = detail ? getReceiptMotoristaId(detail) : "";
  if (motoristaFromDetail) return motoristaFromDetail;
  const driver = await getDriverContext();
  return cleanGuid(driver.id || driver.funcionario?.cr40f_funcionariosid || "");
}

function buildReceiptRecordName(model: PersonalReceiptModel) {
  return truncateDataverseText(model.idPag || "Recibo", 100);
}

function buildReceiptPendingRecordName(model: PersonalReceiptModel) {
  return truncateDataverseText([model.cliente, model.idOp].filter(Boolean).join(" - ") || "Recibo em geração", 100);
}

export function buildReceiptEmailContent(model: PersonalReceiptModel, receiptIdentifier?: string) {
  const companyName = "Betinhos Executive Service";
  const reviewUrl = "https://g.page/r/CQfpe-Ywr1wmEAI/review";
  const idPagamento = receiptIdentifier || model.idPag;
  const pagante = model.nomePagante.trim() || "Cliente";
  const language = normalizeReceiptLanguage(model.idioma);

  if (language === RECEIPT_LANGUAGE.english) {
    return {
      subject: `Receipt - ${idPagamento} | ${companyName}`,
      body: [
        `Dear ${pagante},`,
        "",
        "Attached is the receipt for executive transportation services provided in Brazil.",
        "",
        "To help us evaluate and improve our services, we invite you to review us:",
        reviewUrl,
        "",
        "We remain available for any further information.",
        "",
        "Thank you for your preference.",
        "",
        "Sincerely,",
        companyName
      ].join("\n")
    };
  }

  if (language === RECEIPT_LANGUAGE.spanish) {
    return {
      subject: `Recibo - ${idPagamento} | ${companyName}`,
      body: [
        `Estimado(a) ${pagante},`,
        "",
        "Adjunto, enviamos el recibo correspondiente a los servicios prestados de transporte ejecutivo en Brasil.",
        "",
        "Para evaluar y mejorar nuestros servicios, le invitamos a calificarnos:",
        reviewUrl,
        "",
        "Quedamos a su disposición para cualquier aclaración.",
        "",
        "Agradecemos su preferencia.",
        "",
        "Atentamente,",
        companyName
      ].join("\n")
    };
  }

  return {
    subject: `Recibo - ${idPagamento} | ${companyName}`,
    body: [
      `Prezado(a) ${pagante},`,
      "",
      "Em anexo, segue o recibo referente aos serviços prestados de transporte executivo no Brasil.",
      "",
      "Para avaliarmos e aprimorarmos nossos serviços, convidamos você a nos avaliar:",
      reviewUrl,
      "",
      "Ficamos à disposição para quaisquer esclarecimentos.",
      "",
      "Agradecemos pela preferência.",
      "",
      "Atenciosamente,",
      companyName
    ].join("\n")
  };
}

export function normalizeReceiptIdentifier(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^R\s*-\s*-*\s*(\d+)$/i) ?? trimmed.match(/^(\d+)$/);
  if (match?.[1]) return `R-${match[1].padStart(4, "0")}`;
  return /^R-/i.test(trimmed) ? trimmed.replace(/^r-/i, "R-") : trimmed;
}

export type PreparedReceiptUpload = {
  recordId: string;
  identifier: string;
  fileName: string;
  fileNameBase: string;
  path: string;
  model: PersonalReceiptModel;
  motoristaId: string;
  reservaId: string;
};

export async function createReceiptRecordRemote({
  detail,
  model,
  onProgress
}: {
  detail?: DetailData;
  model: PersonalReceiptModel;
  onProgress?: (message: string) => void;
}): Promise<PreparedReceiptUpload> {
  const reservaId = cleanGuid(detail?.dataverse?.id ?? "");
  const motoristaId = await resolveReceiptMotoristaId(detail);
  if (!motoristaId) throw new Error("Motorista atual nao foi encontrado para registrar o recibo.");
  const lookupNavigationNames = await loadReceiptLookupNavigationNamesRemote();
  const emittedAt = new Date().toISOString();
  const numericValue = parseCurrencyNumber(model.valorTotal);
  const dataEmissao = parseReceiptDate(model.dataEmissao);
  const baseRecord: Record<string, unknown> = {
    cr40f_name: buildReceiptPendingRecordName(model),
    cr40f_id_operacao: truncateDataverseText(model.idOp, 1000),
    cr40f_pagante: truncateDataverseText(model.nomePagante, 1000),
    cr40f_cliente: truncateDataverseText(model.cliente, 1000),
    new_idioma: RECEIPT_LANGUAGE_VALUE[model.idioma] ?? RECEIPT_LANGUAGE_VALUE[RECEIPT_LANGUAGE.portuguese],
    cr40f_valor_total_texto: truncateDataverseText(model.valorTotal, 1000),
    cr40f_metodo_pagamento: truncateDataverseText(model.metodoPagamento, 1000),
    cr40f_periodo: truncateDataverseText(model.periodo, 1000),
    cr40f_trajetos: model.trajetos,
    cr40f_observacoes: model.observacoes.trim() || "-",
    cr40f_mime_type: "application/pdf",
    cr40f_status_geracao: RECEIPT_STATUS.gerado,
    cr40f_modelo_json: JSON.stringify(model),
    cr40f_gerado_em: emittedAt
  };
  if (reservaId) baseRecord[`${lookupNavigationNames.reserva}@odata.bind`] = bind(DATAVERSE.geral, reservaId);
  baseRecord[`${lookupNavigationNames.motorista}@odata.bind`] = bind(DATAVERSE.funcionarios, motoristaId);
  if (Number.isFinite(numericValue) && numericValue > 0) baseRecord.cr40f_valor_total = numericValue;
  if (dataEmissao) baseRecord.cr40f_data_emissao = dataEmissao;

  onProgress?.("Registrando recibo no Dataverse.");
  const created = await createOne(DATAVERSE.recibos, baseRecord);
  const receiptId = cleanGuid(created.id);
  try {
    const createdRecord = await retrieveOne(DATAVERSE.recibos, receiptId, "$select=new_id");
    const identifier = normalizeReceiptIdentifier(createdRecord.new_id);
    if (!identifier) {
      throw new Error("Recibo criado, mas o Dataverse nao retornou new_id. Confirme o identificador automatico da tabela.");
    }
    const finalModel: PersonalReceiptModel = { ...model, idPag: identifier };
    const fileNameBase = sanitizePathSegment(identifier, "recibo");
    const storedFileName = `${fileNameBase}.pdf`;
    const devPrefix = shouldUseDevFolderPrefix() ? "DEV/" : "";
    const path = `Recibos/${devPrefix}${sanitizePathSegment(finalModel.cliente, "Sem cliente")}/${sanitizePathSegment(identifier, "Sem identificação")}`;
    await updateOne(DATAVERSE.recibos, receiptId, {
      cr40f_name: buildReceiptRecordName(finalModel),
      cr40f_id_pagamento: truncateDataverseText(identifier, 1000),
      cr40f_nome_arquivo: storedFileName,
      cr40f_caminho_onedrive: path,
      cr40f_modelo_json: JSON.stringify(finalModel)
    });

    return {
      recordId: receiptId,
      identifier,
      fileName: storedFileName,
      fileNameBase,
      path,
      model: finalModel,
      motoristaId,
      reservaId
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateOne(DATAVERSE.recibos, receiptId, {
      cr40f_status_geracao: RECEIPT_STATUS.falha,
      cr40f_erro: message
    }).catch((updateError) => {
      dataverseWarn("Falha ao marcar recibo como Falha na preparacao.", {
        receiptId,
        originalError: message,
        updateError: describeDataverseError(updateError)
      });
    });
    throw error;
  }
}

export async function uploadReceiptPdfRemote({
  prepared,
  pdfBlob,
  onProgress
}: {
  prepared: PreparedReceiptUpload;
  pdfBlob: Blob;
  onProgress?: (message: string) => void;
}): Promise<ReceiptPdfUploadResult> {
  const { recordId, fileName, fileNameBase, path, model, motoristaId, reservaId } = prepared;
  try {
    onProgress?.("Enviando PDF para o Flow.");
    const dataUrl = await blobToDataUrl(pdfBlob);
    const uploadMetadata: Record<string, unknown> = {
      reciboGuid: recordId,
      motoristaGuid: motoristaId,
      idPagamento: model.idPag,
      idOperacao: model.idOp,
      tipo: "RECIBO",
      mimeType: "application/pdf"
    };
    if (reservaId) uploadMetadata.reservaGuid = reservaId;
    const link = await uploadMaintenancePhoto(path, dataUrl, fileNameBase, uploadMetadata);

    onProgress?.("Gravando link do PDF em Recibos.");
    await updateOne(DATAVERSE.recibos, recordId, {
      cr40f_link_pdf: link,
      cr40f_share_link: link,
      cr40f_status_geracao: RECEIPT_STATUS.salvoNoOneDrive,
      cr40f_tamanho_bytes: Math.max(0, Math.trunc(pdfBlob.size)),
      cr40f_erro: null
    });

    const verified = await retrieveOne(
      DATAVERSE.recibos,
      recordId,
      "$select=cr40f_link_pdf,cr40f_share_link,cr40f_status_geracao"
    );
    const verifiedLink = String(verified.cr40f_link_pdf ?? verified.cr40f_share_link ?? "").trim();
    if (verifiedLink !== link || Number(verified.cr40f_status_geracao) !== RECEIPT_STATUS.salvoNoOneDrive) {
      dataverseError("Recibo salvo no Flow, mas link/status nao foram confirmados no Dataverse.", {
        receiptId: recordId,
        expectedLink: link,
        verifiedLink,
        verifiedStatus: verified.cr40f_status_geracao
      });
      throw new Error("PDF salvo no OneDrive, mas o registro em Recibos nao confirmou link/status.");
    }

    return {
      recordId,
      link,
      fileName,
      path
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateOne(DATAVERSE.recibos, recordId, {
      cr40f_status_geracao: RECEIPT_STATUS.falha,
      cr40f_erro: message
    }).catch((updateError) => {
      dataverseWarn("Falha ao marcar recibo como Falha.", {
        receiptId: recordId,
        originalError: message,
        updateError: describeDataverseError(updateError)
      });
    });
    throw error;
  }
}

export async function sendReceiptEmailRemote({
  email,
  receiptLink,
  pdfBlob,
  fileName,
  receiptRecordId,
  receiptIdentifier,
  model,
  detailId,
  onProgress
}: {
  email: string;
  receiptLink: string;
  pdfBlob: Blob;
  fileName?: string;
  receiptRecordId?: string;
  receiptIdentifier?: string;
  model: PersonalReceiptModel;
  detailId?: string;
  onProgress?: (message: string) => void;
}) {
  const targetEmail = email.trim();
  if (!targetEmail) throw new Error("Informe o email do cliente.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) throw new Error("Informe um email válido.");
  if (!receiptLink.trim()) throw new Error("Link do recibo não encontrado.");
  const dataUrl = await blobToDataUrl(pdfBlob);
  const conteudoBase64 = dataUrlToBase64(dataUrl);
  assertValidBase64Payload(conteudoBase64, {
    context: "sendReceiptEmailRemote",
    receiptIdentifier: receiptIdentifier || model.idPag,
    email: targetEmail
  });
  const emailContent = buildReceiptEmailContent(model, receiptIdentifier);

  onProgress?.("Enviando recibo para o cliente.");
  const flowResult = await runHttpFlow(FLOW_URLS.enviarReciboCliente, {
    emailCliente: targetEmail,
    assuntoEmail: emailContent.subject,
    corpoEmail: emailContent.body,
    emailSubject: emailContent.subject,
    emailBody: emailContent.body,
    linkRecibo: receiptLink,
    nomeArquivo: fileName || `${sanitizePathSegment(receiptIdentifier || model.idPag, "recibo")}.pdf`,
    mimeType: "application/pdf",
    conteudoBase64,
    reciboGuid: receiptRecordId ?? "",
    idPagamento: receiptIdentifier || model.idPag,
    idOperacao: model.idOp,
    cliente: model.cliente,
    pagante: model.nomePagante,
    valorTotal: model.valorTotal,
    dataEmissao: model.dataEmissao,
    metodoPagamento: model.metodoPagamento,
    detailId: detailId ?? "",
    modelo: model
  });
  assertFlowSuccess(flowResult, "FlowEnviarReciboCliente");
  return flowResult;
}

type ReceiptLookupNavigationNames = {
  reserva: string;
  motorista: string;
};

async function loadReceiptLookupNavigationNamesRemote(): Promise<ReceiptLookupNavigationNames> {
  const requests: Array<LookupNavigationRequest & { key: keyof ReceiptLookupNavigationNames }> = [
    {
      key: "reserva",
      referencingEntitySetName: DATAVERSE.recibos,
      referencedEntitySetName: DATAVERSE.geral,
      referencingAttribute: "cr40f_reserva",
      label: "Recibos.Reserva"
    },
    {
      key: "motorista",
      referencingEntitySetName: DATAVERSE.recibos,
      referencedEntitySetName: DATAVERSE.funcionarios,
      referencingAttribute: "cr40f_motorista",
      label: "Recibos.Motorista"
    }
  ];

  const settled = await Promise.allSettled(requests.map((request) => resolveLookupNavigationName(request)));
  const names: Partial<ReceiptLookupNavigationNames> = {};
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      names[request.key] = result.value;
      return;
    }
    failures.push(`${request.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (failures.length || !names.reserva || !names.motorista) {
    throw new Error(`Schema de Recibos incompleto. Falhas: ${failures.join(" | ")}`);
  }
  return { reserva: names.reserva, motorista: names.motorista };
}
