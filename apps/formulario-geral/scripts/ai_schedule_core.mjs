import { readFile } from "node:fs/promises";

export const AI_DRAFT_STATUSES = Object.freeze({
  PENDING: "Pendente",
  READY: "Pronto",
  BLOCKED: "Bloqueado",
  SCHEDULED: "Agendado",
  DISCARDED: "Descartado",
  ERROR: "Erro"
});

const ENTITY_RE = /<[^>]+>/g;
const SCRIPT_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_ENTITIES = Object.freeze({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" });

export function normalizeEmailBody(value) {
  return String(value ?? "")
    .replace(SCRIPT_RE, " ")
    .replace(ENTITY_RE, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] || " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeText(value, maxLength = 4000) {
  return normalizeEmailBody(value).slice(0, maxLength);
}

export function normalizeExtraction(input) {
  const source = input && typeof input === "object" ? input : {};
  const legs = Array.isArray(source.legs) ? source.legs : [];
  const missingFields = Array.isArray(source.missingFields) ? source.missingFields.map(String) : [];
  const warnings = Array.isArray(source.warnings) ? source.warnings.map(String) : [];
  return {
    isServiceRequest: source.isServiceRequest !== false,
    client: String(source.client || "").trim(),
    clientId: String(source.clientId || "").trim(),
    clientEmail: String(source.clientEmail || "").trim(),
    requester: String(source.requester || "").trim(),
    requesterId: String(source.requesterId || "").trim(),
    requesterEmail: String(source.requesterEmail || "").trim(),
    requesterPhone: String(source.requesterPhone || "").trim(),
    serviceType: String(source.serviceType || "").trim(),
    vehicleType: String(source.vehicleType || "").trim(),
    passengers: Array.isArray(source.passengers) ? source.passengers.map((passenger) => typeof passenger === "string" ? { name: passenger } : ({ ...passenger, id: String(passenger?.id || "").trim(), name: String(passenger?.name || passenger?.fullName || "").trim() })) : [],
    legs: legs.map((leg, index) => ({
      ordinal: Number(leg?.ordinal || index + 1),
      type: String(leg?.type || "ida").trim(),
      date: String(leg?.date || "").trim(),
      time: String(leg?.time || "").trim(),
      origin: String(leg?.origin || "").trim(),
      destination: String(leg?.destination || "").trim(),
      notes: String(leg?.notes || "").trim(),
      serviceType: String(leg?.serviceType || "").trim(),
      serviceTypeValue: leg?.serviceTypeValue ?? "",
      vehicleType: String(leg?.vehicleType || "").trim(),
      vehicleTypeValue: leg?.vehicleTypeValue ?? "",
      route: String(leg?.route || "").trim(),
      vagueDate: Boolean(leg?.vagueDate),
      vagueTime: Boolean(leg?.vagueTime),
      clientId: String(leg?.clientId || source.clientId || "").trim(),
      requesterId: String(leg?.requesterId || source.requesterId || "").trim()
    })),
    vehicle: String(source.vehicle || "").trim(),
    language: String(source.language || "").trim(),
    observations: String(source.observations || "").trim(),
    missingFields,
    warnings,
    matchCandidates: source.matchCandidates && typeof source.matchCandidates === "object" ? source.matchCandidates : {},
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : null,
    extractorVersion: String(source.extractorVersion || "1.0.0")
  };
}

export function validateExtraction(extraction) {
  const value = normalizeExtraction(extraction);
  const errors = [];
  if (!value.isServiceRequest) errors.push("E-mail não classificado como solicitação de serviço.");
  if (!value.client) errors.push("Cliente não identificado.");
  if (!value.requester) errors.push("Solicitante não identificado.");
  if (!value.passengers.length) errors.push("Nenhum passageiro identificado.");
  if (!value.legs.length) errors.push("Nenhum trecho identificado.");
  value.legs.forEach((leg, index) => {
    const prefix = `Trecho ${index + 1}`;
    if (!leg.date || leg.vagueDate) errors.push(`${prefix}: data ausente ou vaga.`);
    if (!leg.time || leg.vagueTime) errors.push(`${prefix}: horário ausente ou vago.`);
    if (!leg.origin) errors.push(`${prefix}: origem ausente.`);
    if (!leg.destination) errors.push(`${prefix}: destino ausente.`);
  });
  return { ok: errors.length === 0, errors, extraction: value };
}

export function buildDraftRecords({ message, extraction, receivedAt = message?.receivedDateTime }) {
  const normalized = normalizeExtraction(extraction);
  const checked = validateExtraction(normalized);
  const base = {
    messageId: String(message?.id || "").trim(),
    conversationId: String(message?.conversationId || "").trim(),
    subject: normalizeText(message?.subject || "", 500),
    sender: String(message?.from?.emailAddress?.address || message?.sender?.emailAddress?.address || "").trim(),
    receivedAt: receivedAt || null,
    body: normalizeText(message?.body?.content || message?.bodyPreview || "", 12000),
    extractionJson: JSON.stringify(normalized),
    matchCandidates: JSON.stringify(normalized.matchCandidates || {}),
    missingFields: [...normalized.missingFields, ...checked.errors].join("\n"),
    warnings: [...normalized.warnings, ...checked.errors],
    confidence: normalized.confidence,
    extractorVersion: normalized.extractorVersion,
    hasAttachments: Boolean(message?.hasAttachments),
    processedAt: new Date().toISOString()
  };
  if (!normalized.legs.length) {
    return [{ ...base, ordinal: 1, legType: "", status: AI_DRAFT_STATUSES.BLOCKED }];
  }
  return normalized.legs.map((leg, index) => ({
    ...base,
    ordinal: leg.ordinal || index + 1,
    legType: leg.type,
    legJson: JSON.stringify(leg),
    status: checked.ok ? AI_DRAFT_STATUSES.READY : AI_DRAFT_STATUSES.BLOCKED
  }));
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

if (process.argv[1]?.endsWith("ai_schedule_core.mjs")) {
  const file = process.argv[2];
  if (!file) throw new Error("Informe arquivo JSON");
  const input = await readJsonFile(file);
  console.log(JSON.stringify(normalizeExtraction(input), null, 2));
}
