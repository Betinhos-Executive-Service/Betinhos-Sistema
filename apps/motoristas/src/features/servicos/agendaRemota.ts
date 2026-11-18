// Agenda e detalhe vindos do Dataverse: consultas de serviços, manutenções e trocas do motorista e o mapeamento para a agenda.
import type { AgendaItem, DetailAction, DetailData, DetailField, DetailPassenger } from "../../types";
import { createRemoteReadBatch, mapWithLimit } from "../../data/dataverse/remoteReadBatch.ts";
import { cleanGuid, cleanODataGuid, dataverseLog, dataverseWarn, getBusinessId, getDriverContext, retrieveMultiple, retrieveMultipleAll, retrieveOne, updateOne, type DataverseRecord, type DriverContext } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { buildPassengerMessage } from "./passengerMessage.ts";
import { MAINTENANCE_SELECT, OPERATION_STATUS, getBooleanValue, getFormatted, getLookupName, getRecordId, normalizeText, toDate } from "../../data/dataverse/registros.ts";
import { EXCHANGE_SELECT, EXCHANGE_STATUS, buildExchangeDisplay, buildExchangeWindowInfo, getExchangeIdFromGeral, hydrateExchangeAnchors, hydrateExchangeDetails, hydrateExchangeDriverContactPhones, shouldShowOpenExchangeForDriver } from "./trocas.ts";

export type RemoteStore = {
  agenda: AgendaItem[];
  history: AgendaItem[];
  driver: DriverContext | null;
};

const CATEGORY = {
  servico: 100000000,
  manutencao: 100000001,
  troca: 100000002
} as const;

const DRIVER_LINK_TYPE = {
  colaborador: 0,
  terceiro: 1
} as const;

const GERAL_SELECT =
  "$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada,cr40f_horrioprevistoderetorno,cr40f_trajeto,cr40f_passageirosetelefonedecontato,cr40f_endereodesada,cr40f_destino,cr40f_obsdeoperao,cr40f_perfildopassageiro,cr40f_receber,_cr40f_cliente_value,_cr40f_solicitante_value,_cr40f_veiculo_value,_cr40f_motorista_value,_cr40f_om_value,_cr40f_ot_value,cr40f_status,new_categoriadoitem,new_foiprogramado,new_datadefinalizacao,new_visualizacaodomotorista,new_rascunhovoucher,new_observacaofinal,new_origemveiculo,modifiedon";

const GERAL_SERVICE_SELECT = `${GERAL_SELECT},cr40f_valor_a_receber`;

function formatAgendaTime(date: Date | null) {
  if (!date) return "";
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = date.toDateString() === today.toDateString();
  const nextDay = date.toDateString() === tomorrow.toDateString();
  const previousDay = date.toDateString() === yesterday.toDateString();
  const prefix = sameDay ? "HOJE" : previousDay ? "ONTEM" : nextDay ? "AMANHÃ" : date.toLocaleDateString("pt-BR");
  return `${prefix} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function isMaintenanceDoneStatus(record: DataverseRecord) {
  const statusLabel = normalizeText(getFormatted(record, "cr40f_status"));
  return statusLabel === "realizado" || statusLabel === "realizada";
}

function shouldShowCanceledOverlay(record: DataverseRecord) {
  if (!getBooleanValue(record, "new_foiprogramado")) return false;
  const statusLabel = normalizeText(getFormatted(record, "cr40f_status"));
  const statusValue = Number(record.cr40f_status);
  return statusValue === OPERATION_STATUS.requerAnalise || statusLabel.includes("cancel") || statusLabel.includes("requer analise");
}

function getGeralId(record: DataverseRecord) {
  return getRecordId(record, "cr40f_reservadeveculosid", "cr40f_reservadeveiculosid");
}

function getMaintenanceIdFromGeral(record: DataverseRecord) {
  return cleanODataGuid(record._cr40f_om_value);
}

function cleanPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsAppPhone(value: string) {
  const digits = cleanPhoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("00") && digits.length > 10) return digits.slice(2);
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 10 && digits[2] !== "9") return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  return digits.length >= 10 ? digits : "";
}


function formatDetailDateTime(date: Date | null) {
  if (!date) return "";
  const day = date.toLocaleDateString("pt-BR");
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// cr40f_idioma (cr40f_bancodedados): 202410000 Português, 202410001 Inglês; Espanhol pelo rótulo.
export function getPassengerLanguageCode(passenger: DataverseRecord) {
  const code = Number(passenger.cr40f_idioma);
  const label = getFormatted(passenger, "cr40f_idioma")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (code === 202410000 || label.startsWith("portug")) return "BR";
  if (code === 202410001 || label.startsWith("ingl") || label.startsWith("english")) return "US";
  if (label.startsWith("espanh") || label.startsWith("spanish")) return "ES";
  return "";
}

const PASSENGER_LANGUAGE_LABELS: Record<string, string> = { BR: "Português", US: "Inglês", ES: "Espanhol" };

// Marcador lido por parseSafeDetailHtml e renderizado como SVG (emoji de bandeira não aparece no Windows).
export function buildLanguageFlagHtml(code: string) {
  return code ? `<span data-flag="${code}"></span>` : "";
}

async function buildPassengersHtml(geralId: string, serviceDate: Date | null, driverName: string, readMultiple = retrieveMultiple, readOne = retrieveOne): Promise<{ html: string; passengers: DetailPassenger[] }> {
  if (!geralId) return { html: "", passengers: [] };
  const rows = await readMultiple(
    DATAVERSE.servicosPorPassageiro,
    [
      "$select=cr40f_servicosporpassageiroid,cr40f_ordemdeselecao,_cr40f_bancodedados_value,_cr40f_geral_value,new_enderecodesaidacolunaservicosporpassageiro",
      `$filter=_cr40f_geral_value eq ${cleanGuid(geralId)}`,
      "$orderby=cr40f_ordemdeselecao asc",
      "$top=20"
    ].join("&")
  );
  if (!rows.entities.length) return { html: "", passengers: [] };

  const passengers = await Promise.all(
    rows.entities.map(async (row) => {
      const passengerId = cleanODataGuid(row._cr40f_bancodedados_value);
      if (!passengerId) return null;
      const passenger = await readOne(
        DATAVERSE.bancoDeDados,
        passengerId,
        "$select=cr40f_bancodedadosid,cr40f_nomedopassageiro,cr40f_telefone,cr40f_idioma"
      );
      const name = String(passenger.cr40f_nomedopassageiro ?? getLookupName(row, "cr40f_bancodedados") ?? "");
      const phoneRaw = String(passenger.cr40f_telefone ?? "");
      const phone = normalizeWhatsAppPhone(phoneRaw);
      const languageCode = getPassengerLanguageCode(passenger);
      const message = buildPassengerMessage({ passengerName: name, driverName, serviceDate, languageCode });
      const phoneText = escapeHtml(phoneRaw || "Sem telefone");
      const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "";
      const phoneHtml = phone
        ? `<a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer">${phoneText}</a>`
        : `<span style="color:#8a8a8a">${phoneText}</span>`;
      const flagHtml = buildLanguageFlagHtml(languageCode);
      const language = PASSENGER_LANGUAGE_LABELS[languageCode] ?? getFormatted(passenger, "cr40f_idioma");
      return { id: passengerId, name, phone: phoneRaw, whatsappUrl, language, html: `<span>${flagHtml}${escapeHtml(name)}${name ? " - " : ""}${phoneHtml}</span>` };
    })
  );

  const valid = passengers.filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    html: valid.map((item) => item.html).join("<br>"),
    passengers: valid.map(({ id, name, phone, whatsappUrl, language }) => ({
      id,
      name,
      ...(phone ? { phone } : {}),
      ...(whatsappUrl ? { whatsappUrl } : {}),
      ...(language ? { language } : {})
    }))
  };
}

async function buildSolicitanteHtml(record: DataverseRecord, serviceDate: Date | null, driverName: string, readOne = retrieveOne) {
  const solicitanteId = cleanODataGuid(record._cr40f_solicitante_value);
  const solicitanteName = getLookupName(record, "cr40f_solicitante");
  const solicitanteType = String(record["_cr40f_solicitante_value@Microsoft.Dynamics.CRM.lookuplogicalname"] ?? "");
  if (!solicitanteId || solicitanteType !== "cr40f_bancodedados") return solicitanteName;

  try {
    const solicitante = await readOne(
      DATAVERSE.bancoDeDados,
      solicitanteId,
      "$select=cr40f_bancodedadosid,cr40f_nomedopassageiro,cr40f_telefone,cr40f_idioma"
    );
    const phoneRaw = String(solicitante.cr40f_telefone ?? "");
    if (!phoneRaw) return solicitanteName;

    const phone = normalizeWhatsAppPhone(phoneRaw);
    const phoneText = escapeHtml(phoneRaw || "Sem telefone");
    const message = buildPassengerMessage({
      passengerName: solicitanteName,
      driverName,
      serviceDate,
      languageCode: getPassengerLanguageCode(solicitante)
    });
    const phoneHtml = phone
      ? `<a href="https://wa.me/${phone}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">${phoneText}</a>`
      : `<span style="color:#8a8a8a">${phoneText}</span>`;

    return `${escapeHtml(solicitanteName)}${solicitanteName && phoneRaw ? " - " : ""}${phoneHtml}`;
  } catch (error) {
    dataverseWarn("Falha ao enriquecer telefone da solicitante. Usando apenas nome.", {
      solicitanteId,
      solicitanteType,
      error
    });
    return solicitanteName;
  }
}

export function formatReceiveDetailValue(record: DataverseRecord) {
  const receiveValue = getFormatted(record, "cr40f_receber");
  const amount = record.cr40f_valor_a_receber;
  if (!getBooleanValue(record, "cr40f_receber") || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return receiveValue;
  }

  const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(amount)
    .replace(/\u00a0/g, " ");
  return `Sim - ${formattedAmount}`;
}

function buildFields(record: DataverseRecord, passengerHtml = "", solicitanteHtml = ""): DetailField[] {
  const date = toDate(record.cr40f_dataehorriodesada);
  const returnForecast = toDate(record.cr40f_horrioprevistoderetorno);
  const finalizedAt = toDate(record.new_datadefinalizacao);
  return [
    { label: "Data e Horário de Saída", value: formatDetailDateTime(date) },
    { label: "Previsão de retorno", value: formatDetailDateTime(returnForecast) },
    { label: "Cliente", value: getLookupName(record, "cr40f_cliente") || getFormatted(record, "cr40f_cliente") },
    { label: "Receber", value: formatReceiveDetailValue(record) },
    { label: "Trajeto", value: String(record.cr40f_trajeto ?? "") },
    { label: "Passageiros e Telefones de Contato", value: passengerHtml || String(record.cr40f_passageirosetelefonedecontato ?? ""), html: true },
    { label: "Endereço de Saída", value: String(record.cr40f_endereodesada ?? "") },
    { label: "Destino", value: String(record.cr40f_destino ?? "") },
    { label: "Obs de Operação", value: String(record.cr40f_obsdeoperao ?? "") },
    { label: "Data de Finalização", value: formatDetailDateTime(finalizedAt) },
    { label: "Perfil do Passageiro", value: String(record.cr40f_perfildopassageiro ?? "") },
    { label: "Solicitante", value: solicitanteHtml || getLookupName(record, "cr40f_solicitante"), html: Boolean(solicitanteHtml) },
    { label: "Veículo", value: getLookupName(record, "cr40f_veiculo") }
  ].filter((field) => field.value);
}

function serviceActions(record: DataverseRecord): DetailAction[] {
  const cliente = getLookupName(record, "cr40f_cliente");
  const isReceber = getBooleanValue(record, "cr40f_receber");
  if (isReceber) return ["cancel", "receber"];
  return /tenn?aris/i.test(cliente) ? ["cancel", "voucher"] : ["cancel", "finalizar"];
}

function mapGeralService(record: DataverseRecord, passengerHtml = "", solicitanteHtml = "", passengers: DetailPassenger[] = []): AgendaItem {
  const date = toDate(record.cr40f_dataehorriodesada);
  const id = getGeralId(record);
  const businessId = getBusinessId(record, id);
  const trajectory = String(record.cr40f_trajeto ?? record.cr40f_id ?? "Serviço");
  const minutesUntilStart = date ? (date.getTime() - Date.now()) / 60000 : Number.POSITIVE_INFINITY;
  const viewedAt = toDate(record.new_visualizacaodomotorista);
  const modifiedAt = toDate(record.modifiedon);
  const wasEditedAfterView = viewedAt && modifiedAt ? (modifiedAt.getTime() - viewedAt.getTime()) / 1000 > 10 : !viewedAt;
  const isReceber = getBooleanValue(record, "cr40f_receber");
  const detail: DetailData = {
    type: "SERVICO",
    id: businessId,
    title: "Detalhes do Serviço",
    actions: serviceActions(record),
    fields: buildFields(record, passengerHtml, solicitanteHtml),
    ...(passengers.length ? { passengers } : {}),
    dataverse: { entitySetName: DATAVERSE.geral, id, record }
  };

  return {
    id: `srv-${id}`,
    tipo: "SERVICO",
    label: "Serviço",
    time: formatAgendaTime(date),
    description: trajectory,
    priority: isReceber ? 10 : minutesUntilStart >= 0 && minutesUntilStart <= 30 && wasEditedAfterView ? 1 : wasEditedAfterView ? 3 : 0,
    canceled: shouldShowCanceledOverlay(record),
    searchText: `${businessId} ${id} ${trajectory}`.toLowerCase(),
    detail
  };
}

/** Serviços enriquecidos ao mesmo tempo na agenda (passageiros e solicitante); evita rajada de leituras e de logs quando a rede cai. */
const ENRICH_SERVICES_CONCURRENCY = 3;

async function mapGeralServiceWithPassengers(record: DataverseRecord, driver: DriverContext, readMultiple = retrieveMultiple, readOne = retrieveOne) {
  const serviceId = getGeralId(record);
  let passengerHtml = "";
  let passengers: DetailPassenger[] = [];
  let solicitanteHtml = "";
  try {
    ({ html: passengerHtml, passengers } = await buildPassengersHtml(serviceId, toDate(record.cr40f_dataehorriodesada), driver.fullName, readMultiple, readOne));
  } catch (error) {
    dataverseWarn("Falha ao enriquecer passageiros. Usando Pax - VIEW do Geral.", { serviceId, error });
  }
  solicitanteHtml = await buildSolicitanteHtml(record, toDate(record.cr40f_dataehorriodesada), driver.fullName, readOne);
  return mapGeralService(record, passengerHtml || "", solicitanteHtml, passengers);
}

function buildMaintenanceFields(geral: DataverseRecord, maintenance: DataverseRecord): DetailField[] {
  const date = toDate(geral.cr40f_dataehorriodesada);
  return [
    { label: "Data e Horário de Saída", value: formatDetailDateTime(date) },
    { label: "ID Manutenção", value: String(maintenance.cr40f_id ?? "") },
    { label: "Veículo", value: getLookupName(maintenance, "cr40f_placa_carro") || getLookupName(geral, "cr40f_veiculo") },
    { label: "Descrição", value: String(maintenance.cr40f_descricao ?? "") },
    { label: "Grau da Manutenção", value: getFormatted(maintenance, "cr40f_graudamanutencao") },
    { label: "Tipo do Reparo", value: getFormatted(maintenance, "cr40f_tipodoreparo") },
    { label: "Comentários ao Motorista", value: String(maintenance.cr40f_comentariosaomotorista ?? "") },
    { label: "Obs de Operação", value: String(geral.cr40f_obsdeoperao ?? "") },
    { label: "Link Foto Solicitação 1", value: String(maintenance.cr40f_foto01 ?? "") },
    { label: "Link Foto Solicitação 2", value: String(maintenance.cr40f_linkdaevidencia ?? "") },
    { label: "Link Foto Solicitação 3", value: String(maintenance.cr40f_foto03 ?? "") },
    { label: "Link Nota Fiscal", value: String(maintenance.new_linkdanotafiscal ?? "") },
    { label: "Link Foto Final 1", value: String(maintenance.new_linkdafotofinal1 ?? "") },
    { label: "Link Foto Final 2", value: String(maintenance.new_linkdafotofinal2 ?? "") },
    { label: "Link Foto Final 3", value: String(maintenance.new_linkdafotofinal3 ?? "") }
  ].filter((field) => field.value);
}

function mapMaintenance(geral: DataverseRecord, maintenance: DataverseRecord): AgendaItem {
  const date = toDate(geral.cr40f_dataehorriodesada);
  const geralId = getGeralId(geral);
  const maintenanceId = getRecordId(maintenance, "cr40f_manutencoesid");
  const businessId = getBusinessId(maintenance, maintenanceId || geralId);
  const description = String(maintenance.cr40f_descricao ?? geral.cr40f_trajeto ?? "Manutenção");
  const detail: DetailData = {
    type: "MANUTENCAO",
    id: businessId,
    title: "Detalhes da Manutenção",
    actions: ["finalizar"],
    fields: buildMaintenanceFields(geral, maintenance),
    dataverse: {
      entitySetName: DATAVERSE.manutencoes,
      id: maintenanceId,
      record: { ...maintenance, __geralId: geralId, __geral: geral }
    }
  };

  return {
    id: `mnt-${maintenanceId || geralId}`,
    tipo: "MANUTENCAO",
    label: "Manutenção",
    time: formatAgendaTime(date),
    description,
    priority: 0,
    searchText: `${businessId} ${maintenanceId} ${geralId} ${description} ${getLookupName(maintenance, "cr40f_placa_carro")}`.toLowerCase(),
    detail
  };
}

function buildExchangeFields(exchange: DataverseRecord, geral?: DataverseRecord, driver?: DriverContext | null): DetailField[] {
  const display = buildExchangeDisplay(exchange, driver);
  const windowInfo = buildExchangeWindowInfo(exchange, driver);
  return [
    { label: windowInfo.mode === "between" ? "Quando trocar · Entre serviços" : "Quando trocar · Horário marcado", value: windowInfo.phrase, strong: true },
    ...(windowInfo.location ? [{ label: "Local da troca", value: windowInfo.location }] : []),
    { label: "Resumo", value: display.summary, strong: true },
    ...display.fields,
    { label: "Tipo de Troca", value: getFormatted(exchange, "new_tipodetroca") },
    { label: "Observação", value: String(exchange.cr40f_observacao ?? "") },
    { label: "Obs de Operação", value: String(geral?.cr40f_obsdeoperao ?? "") }
  ].filter((field) => field.value);
}

function mapExchange(exchange: DataverseRecord, geral: DataverseRecord | undefined, driver?: DriverContext | null): AgendaItem {
  const start = toDate(exchange.cr40f_iniciodajaneladetroca);
  const exchangeId = getRecordId(exchange, "cr40f_trocasdecarroid");
  const businessId = getBusinessId(exchange, exchangeId);
  const geralId = geral ? getGeralId(geral) : "";
  const display = buildExchangeDisplay(exchange, driver);
  const windowInfo = buildExchangeWindowInfo(exchange, driver);
  const detail: DetailData = {
    type: "TROCA",
    id: businessId,
    title: display.title,
    actions: ["finalizar"],
    fields: buildExchangeFields(exchange, geral, driver),
    dataverse: {
      entitySetName: DATAVERSE.trocas,
      id: exchangeId,
      record: { ...exchange, __geralId: geralId, __geral: geral, __windowCheck: windowInfo.check }
    }
  };

  return {
    id: `trc-${exchangeId}`,
    tipo: "TROCA",
    label: display.label,
    // Entre serviços não tem horário fixo: a agenda mostra "Livre" em vez da janela técnica.
    time: windowInfo.mode === "between" ? "Livre" : formatAgendaTime(start),
    description: display.description,
    priority: 0,
    searchText: `${businessId} ${exchangeId} ${display.label} ${display.description} ${display.summary} ${getLookupName(exchange, "cr40f_motorista1")} ${getLookupName(exchange, "cr40f_motorista2")}`.toLowerCase(),
    detail
  };
}

function asHistoryItem(item: AgendaItem): AgendaItem {
  if (!item.detail) return item;
  return {
    ...item,
    id: `hist-${item.id}`,
    priority: 0,
    detail: {
      ...item.detail,
      actions: []
    }
  };
}

function getItemDateMs(item: AgendaItem) {
  const record = item.detail?.dataverse?.record as DataverseRecord | undefined;
  if (!record) return 0;
  if (item.tipo === "TROCA") return toDate(record.cr40f_iniciodajaneladetroca)?.getTime() ?? 0;
  const geral = (record.__geral as DataverseRecord | undefined) ?? record;
  return toDate(geral.cr40f_dataehorriodesada)?.getTime() ?? 0;
}

function shouldKeepCanceledAgendaItem(item: AgendaItem, nowMs: number) {
  if (item.tipo !== "SERVICO" || !item.canceled) return true;
  const scheduledAtMs = getItemDateMs(item);
  if (!scheduledAtMs) return true;
  return nowMs <= scheduledAtMs + 60 * 60 * 1000;
}

function addDateHeaders(items: AgendaItem[]) {
  const result: AgendaItem[] = [];
  let lastKey = "";
  for (const item of items) {
    const date = item.time?.split(" ")[0] ?? "";
    if (date && date !== lastKey) {
      lastKey = date;
      result.push({ id: `h-${date}-${result.length}`, tipo: "HEADER", tituloData: date, seta: "" });
    }
    result.push(item);
  }
  return result;
}

function addHistoryDateHeaders(items: AgendaItem[]) {
  const result: AgendaItem[] = [];
  let lastKey = "";
  for (const item of items) {
    const date = item.time?.split(" ")[0] ?? "";
    if (date && date !== lastKey) {
      lastKey = date;
      result.push({ id: `hh-${date}-${result.length}`, tipo: "HEADER", tituloData: date, seta: "" });
    }
    result.push(item);
  }
  return result;
}

export async function loadRemoteStore(): Promise<RemoteStore> {
  dataverseLog("Carga remota iniciada.");
  const driver = await getDriverContext();
  const now = new Date();
  const isThirdPartyDriver = Number(driver.funcionario?.cr40f_tipodevinculo) === DRIVER_LINK_TYPE.terceiro;
  const historyLookbackDays = isThirdPartyDriver ? 45 : 5;
  const end = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const historyStart = new Date(now.getTime() - historyLookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const historyEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  dataverseLog("Janela da agenda calculada.", { end, historyStart, historyEnd, historyLookbackDays, driverId: driver.id });

  const geralSelect =
    "$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada,cr40f_horrioprevistoderetorno,cr40f_trajeto,cr40f_passageirosetelefonedecontato,cr40f_endereodesada,cr40f_destino,cr40f_obsdeoperao,cr40f_perfildopassageiro,cr40f_receber,_cr40f_cliente_value,_cr40f_solicitante_value,_cr40f_veiculo_value,_cr40f_motorista_value,_cr40f_om_value,_cr40f_ot_value,cr40f_status,new_categoriadoitem,new_foiprogramado,new_datadefinalizacao,new_visualizacaodomotorista,new_rascunhovoucher,new_observacaofinal,new_origemveiculo,modifiedon";
  const batch = createRemoteReadBatch();
  const readMultiple = (entity: string, options = "") =>
    batch.once(JSON.stringify(["multiple", entity, options]), () => retrieveMultiple(entity, options));
  const readOne = (entity: string, id: string, options = "") =>
    batch.once(JSON.stringify(["one", entity, cleanGuid(id), options]), () => retrieveOne(entity, id, options));
  const readAll = (entity: string, options: string) => retrieveMultipleAll(entity, options, batch.run);

  const [servicesResult, maintenanceGeralResult, exchangeResult,
    historyServiceResult, historyMaintenanceGeralResult, historyExchangeResult] = await Promise.all([
    readAll(DATAVERSE.geral, [
      GERAL_SERVICE_SELECT,
      `$filter=cr40f_dataehorriodesada le ${end} and _cr40f_motorista_value eq ${driver.id} and new_foiprogramado eq true and new_categoriadoitem eq ${CATEGORY.servico} and cr40f_status ne ${OPERATION_STATUS.concluido} and _cr40f_om_value eq null and _cr40f_ot_value eq null`,
      "$orderby=cr40f_dataehorriodesada asc"
    ].join("&")),
    readAll(DATAVERSE.geral, [
      geralSelect,
      `$filter=cr40f_dataehorriodesada le ${end} and _cr40f_motorista_value eq ${driver.id} and new_foiprogramado eq true and new_categoriadoitem eq ${CATEGORY.manutencao} and cr40f_status ne ${OPERATION_STATUS.concluido} and _cr40f_om_value ne null and _cr40f_ot_value eq null`,
      "$orderby=cr40f_dataehorriodesada asc"
    ].join("&")),
    readAll(DATAVERSE.trocas, [
      EXCHANGE_SELECT,
      `$filter=cr40f_iniciodajaneladetroca le ${end} and (_cr40f_motorista1_value eq ${driver.id} or _cr40f_motorista2_value eq ${driver.id}) and cr40f_statusdatroca eq ${EXCHANGE_STATUS.programada}`,
      "$orderby=cr40f_iniciodajaneladetroca asc"
    ].join("&")),
    readAll(DATAVERSE.geral, [
      GERAL_SERVICE_SELECT,
      `$filter=cr40f_dataehorriodesada ge ${historyStart} and cr40f_dataehorriodesada lt ${historyEnd} and _cr40f_motorista_value eq ${driver.id} and cr40f_status eq ${OPERATION_STATUS.concluido} and new_categoriadoitem eq ${CATEGORY.servico} and _cr40f_om_value eq null and _cr40f_ot_value eq null`,
      "$orderby=cr40f_dataehorriodesada desc"
    ].join("&")),
    readAll(DATAVERSE.geral, [
      geralSelect,
      `$filter=cr40f_dataehorriodesada ge ${historyStart} and cr40f_dataehorriodesada lt ${historyEnd} and _cr40f_motorista_value eq ${driver.id} and cr40f_status eq ${OPERATION_STATUS.concluido} and new_categoriadoitem eq ${CATEGORY.manutencao} and _cr40f_om_value ne null and _cr40f_ot_value eq null`,
      "$orderby=cr40f_dataehorriodesada desc"
    ].join("&")),
    readAll(DATAVERSE.trocas, [
      EXCHANGE_SELECT,
      `$filter=cr40f_iniciodajaneladetroca le ${historyEnd} and cr40f_fimdajaneladetroca ge ${historyStart} and (_cr40f_motorista1_value eq ${driver.id} or _cr40f_motorista2_value eq ${driver.id}) and cr40f_statusdatroca eq ${EXCHANGE_STATUS.concluida}`,
      "$orderby=cr40f_iniciodajaneladetroca desc"
    ].join("&"))
  ]);

  const maintenanceRows = await Promise.all(
    maintenanceGeralResult.entities.map(async (geral) => {
      const maintenanceId = getMaintenanceIdFromGeral(geral);
      if (!maintenanceId) return null;
      const maintenance = await readOne(
        DATAVERSE.manutencoes,
        maintenanceId,
        MAINTENANCE_SELECT
      );
      if (isMaintenanceDoneStatus(maintenance)) return null;
      return mapMaintenance(geral, maintenance);
    })
  );

  // Só os Gerais das trocas do motorista: sem o filtro, a carga trazia as trocas de todos e passava do prazo de 8 s.
  const readExchangeGerals = (exchanges: DataverseRecord[], extraFilter: string, orderBy: string) => {
    const ids = exchanges.map((exchange) => getRecordId(exchange, "cr40f_trocasdecarroid")).filter(Boolean);
    if (!ids.length) return Promise.resolve({ entities: [] as DataverseRecord[] });
    return readAll(DATAVERSE.geral, [
      geralSelect,
      `$filter=${extraFilter}new_categoriadoitem eq ${CATEGORY.troca} and (${ids.map((id) => `_cr40f_ot_value eq ${id}`).join(" or ")})`,
      `$orderby=cr40f_dataehorriodesada ${orderBy}`
    ].join("&"));
  };
  const [programmedExchangeGeralResult, historyExchangeGeralResult] = await Promise.all([
    readExchangeGerals(exchangeResult.entities, "new_foiprogramado eq true and ", "asc"),
    readExchangeGerals(historyExchangeResult.entities, "", "desc")
  ]);

  const exchangeGeralById = new Map(
    programmedExchangeGeralResult.entities.map((geral) => [getExchangeIdFromGeral(geral), geral] as const).filter(([id]) => Boolean(id))
  );

  const exchangeRows = await hydrateExchangeAnchors(await hydrateExchangeDriverContactPhones(await hydrateExchangeDetails(exchangeResult.entities, readMultiple), driver, readMultiple), readMultiple);

  const exchangeItems = exchangeRows
    .filter((exchange) => shouldShowOpenExchangeForDriver(exchange, driver.id))
    .map((exchange) => mapExchange(exchange, exchangeGeralById.get(getRecordId(exchange, "cr40f_trocasdecarroid")), driver));

  const serviceItems = (await mapWithLimit(servicesResult.entities, ENRICH_SERVICES_CONCURRENCY, (record) => mapGeralServiceWithPassengers(record, driver, readMultiple, readOne)))
    .filter((item) => shouldKeepCanceledAgendaItem(item, now.getTime()));

  const items = [
    ...serviceItems,
    ...maintenanceRows.filter((item): item is AgendaItem => Boolean(item)),
    ...exchangeItems
  ].sort((a, b) => getItemDateMs(a) - getItemDateMs(b));

  const agenda = addDateHeaders(items);
  const historyMaintenanceRows = await Promise.all(
    historyMaintenanceGeralResult.entities.map(async (geral) => {
      const maintenanceId = getMaintenanceIdFromGeral(geral);
      if (!maintenanceId) return null;
      const maintenance = await readOne(
        DATAVERSE.manutencoes,
        maintenanceId,
        MAINTENANCE_SELECT
      );
      if (!isMaintenanceDoneStatus(maintenance)) return null;
      return mapMaintenance(geral, maintenance);
    })
  );

  const historyExchangeGeralById = new Map(
    historyExchangeGeralResult.entities.map((geral) => [getExchangeIdFromGeral(geral), geral] as const).filter(([id]) => Boolean(id))
  );
  const historyServiceItems = await mapWithLimit(historyServiceResult.entities, ENRICH_SERVICES_CONCURRENCY, (record) => mapGeralServiceWithPassengers(record, driver, readMultiple, readOne));

  const historyItems = [
    ...historyServiceItems,
    ...historyMaintenanceRows.filter((item): item is AgendaItem => Boolean(item)),
    ...(await hydrateExchangeAnchors(await hydrateExchangeDriverContactPhones(await hydrateExchangeDetails(historyExchangeResult.entities, readMultiple), driver, readMultiple), readMultiple))
      .map((exchange) => mapExchange(exchange, historyExchangeGeralById.get(getRecordId(exchange, "cr40f_trocasdecarroid")), driver))
  ].sort((a, b) => getItemDateMs(b) - getItemDateMs(a)).map(asHistoryItem);
  const history = addHistoryDateHeaders(historyItems);

  dataverseLog("Carga remota concluida.", {
    servicos: servicesResult.entities.length,
    manutencoes: maintenanceRows.filter(Boolean).length,
    trocas: exchangeItems.length,
    agendaComHeaders: agenda.length,
    historico: historyItems.length,
    historicoComHeaders: history.length
  });
  return { agenda, history, driver };
}

export async function loadRemoteDetailByParams(servicoId: string, tipo = ""): Promise<DetailData | null> {
  const id = cleanGuid(servicoId);
  const normalizedType = tipo.trim().toUpperCase();
  if (!id) return null;

  const driver = await getDriverContext();
  dataverseLog("Busca direta por parametro iniciada.", { id, tipo: normalizedType || "AUTO" });

  if (!normalizedType || normalizedType === "SERVICO") {
    try {
      const geral = await retrieveOne(DATAVERSE.geral, id, GERAL_SERVICE_SELECT);
      if (getGeralId(geral)) return (await mapGeralServiceWithPassengers(geral, driver)).detail ?? null;
    } catch (error) {
      dataverseWarn("Busca direta como SERVICO falhou.", { id, error });
    }
  }

  if (!normalizedType || normalizedType === "MANUTENCAO") {
    try {
      const maintenance = await retrieveOne(DATAVERSE.manutencoes, id, MAINTENANCE_SELECT);
      const linkedGeral = await retrieveMultiple(
        DATAVERSE.geral,
        [
          GERAL_SELECT,
          `$filter=_cr40f_om_value eq ${id}`,
          "$top=1"
        ].join("&")
      );
      const geral = linkedGeral.entities[0];
      if (geral) return mapMaintenance(geral, maintenance).detail ?? null;
    } catch (error) {
      dataverseWarn("Busca direta como MANUTENCAO falhou.", { id, error });
    }
  }

  if (!normalizedType || normalizedType === "TROCA") {
    try {
      const [exchange] = await hydrateExchangeAnchors(await hydrateExchangeDriverContactPhones(
        await hydrateExchangeDetails([await retrieveOne(DATAVERSE.trocas, id, EXCHANGE_SELECT)]),
        driver
      ));
      const linkedGeral = await retrieveMultiple(
        DATAVERSE.geral,
        [
          GERAL_SELECT,
          `$filter=_cr40f_ot_value eq ${id}`,
          "$top=1"
        ].join("&")
      );
      return mapExchange(exchange, linkedGeral.entities[0], driver).detail ?? null;
    } catch (error) {
      dataverseWarn("Busca direta como TROCA falhou.", { id, error });
    }
  }

  dataverseWarn("Busca direta por parametro nao encontrou registro.", { id, tipo: normalizedType || "AUTO" });
  return null;
}

export async function markDetailViewedRemote(detail: DetailData) {
  const dv = detail.dataverse;
  if (!dv?.id) return;
  const record = dv.record ?? {};
  const geralId = detail.type === "SERVICO" ? dv.id : cleanODataGuid(record.__geralId);
  if (!geralId) return;
  dataverseLog("Marcando visualizacao do motorista.", { detailId: detail.id, type: detail.type, geralId });
  await updateOne(DATAVERSE.geral, geralId, {
    new_visualizacaodomotorista: new Date().toISOString()
  });
}
