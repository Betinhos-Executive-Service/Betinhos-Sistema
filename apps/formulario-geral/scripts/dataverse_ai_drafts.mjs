import { getDelegatedAccessToken } from "./outlook_graph.mjs";
import { buildDraftRecords, normalizeExtraction, validateExtraction } from "./ai_schedule_core.mjs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`);
  return value.replace(/\/$/, "");
}

function draftTable(target = {}) {
  return target.table || process.env.AI_DRAFT_TABLE || "";
}

function draftFields() {
  const raw = process.env.AI_DRAFT_FIELDS_JSON;
  if (!raw) throw new Error("AI_DRAFT_FIELDS_JSON ausente. Informe o mapeamento lógico dos campos da tabela de rascunhos.");
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("AI_DRAFT_FIELDS_JSON inválido."); }
  const requiredFields = ["id", "stableMessageId", "ordinal"];
  for (const field of requiredFields) if (!value[field]) throw new Error(`Campo obrigatório ausente no mapeamento: ${field}`);
  return value;
}

function draftStatusValues() {
  const raw = process.env.AI_DRAFT_STATUS_VALUES_JSON;
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    throw new Error("AI_DRAFT_STATUS_VALUES_JSON inválido.");
  }
}

function assertDraftTable(target = {}) {
  if (!draftTable(target)) throw new Error("AI_DRAFT_TABLE ausente. Configure o nome lógico criado na solução do Dataverse.");
  return draftTable(target);
}

// Dataverse Web API uses the entity set (collection) name, which can differ
// from the logical table name.  The current publisher convention is plural-
// by-suffix, but allow an explicit value whenever metadata reports another
// collection name.
function draftEntitySet(target = {}) {
  const table = assertDraftTable(target);
  return String(target.entitySet || process.env.AI_DRAFT_ENTITY_SET || `${table}s`).trim();
}

async function dataverseToken(baseUrl, targetName = "dataverse") {
  const cacheKey = `dataverse-${String(targetName).toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
  return getDelegatedAccessToken({ scope: `${baseUrl}/user_impersonation`, cacheKey, tenantEnv: "OUTLOOK_TENANT_ID", clientEnv: "OUTLOOK_CLIENT_ID" });
}

function targetFields(target = {}) {
  if (!target.fields) return draftFields();
  const requiredFields = ["id", "stableMessageId", "ordinal"];
  for (const field of requiredFields) if (!target.fields[field]) throw new Error(`Campo obrigatório ausente no destino ${target.name || "Dataverse"}: ${field}`);
  return target.fields;
}

function targetStatusValues(target = {}) {
  return target.statusValues && typeof target.statusValues === "object" ? target.statusValues : draftStatusValues();
}

export function draftTargets() {
  const raw = process.env.AI_DRAFT_TARGETS_JSON;
  if (!raw) {
    const url = required("DATAVERSE_URL");
    return [{ name: "Dataverse", url, table: draftTable(), entitySet: draftEntitySet(), fields: draftFields(), statusValues: draftStatusValues() }];
  }
  let targets;
  try { targets = JSON.parse(raw); } catch { throw new Error("AI_DRAFT_TARGETS_JSON inválido."); }
  if (!Array.isArray(targets) || !targets.length) throw new Error("AI_DRAFT_TARGETS_JSON deve conter pelo menos um destino.");
  return targets.map((target, index) => {
    const value = target && typeof target === "object" ? target : {};
    const url = String(value.url || "").replace(/\/$/, "");
    const name = String(value.name || `Dataverse ${index + 1}`).trim();
    if (!url) throw new Error(`URL ausente no destino ${name}.`);
    const table = assertDraftTable(value);
    return { ...value, name, url, table, entitySet: draftEntitySet(value), fields: targetFields(value), statusValues: targetStatusValues(value) };
  });
}

export async function upsertDraft(record, target = {}) {
  const table = assertDraftTable(target);
  const entitySet = draftEntitySet(target);
  const fields = targetFields(target);
  const statusValues = targetStatusValues(target);
  const baseUrl = String(target.url || required("DATAVERSE_URL")).replace(/\/$/, "");
  const token = await dataverseToken(baseUrl, target.name || "dataverse");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", Accept: "application/json" };
  const stableValue = String(record.messageId || "").replace(/'/g, "''");
  const lookupFields = [fields.id || fields.stableMessageId, fields.status].filter(Boolean).join(",");
  const lookupUrl = `${baseUrl}/api/data/v9.2/${entitySet}?$select=${encodeURIComponent(lookupFields)}&$filter=${encodeURIComponent(`${fields.stableMessageId} eq '${stableValue}' and ${fields.ordinal} eq ${Number(record.ordinal) || 0}`)}`;
  const existingResponse = await fetch(lookupUrl, { headers });
  if (!existingResponse.ok) throw new Error(`Dataverse respondeu ${existingResponse.status} na busca de idempotência.`);
  const existing = await existingResponse.json();
  const existingRow = existing.value?.[0];
  const entityId = existingRow?.[fields.id || ""];
  const scheduledValue = Number(statusValues.Agendado ?? statusValues.scheduled);
  if (entityId && Number.isFinite(scheduledValue) && Number(existingRow?.[fields.status]) === scheduledValue) return entityId;
  const payload = {};
  const put = (name, value) => { if (fields[name] && value !== undefined && value !== null) payload[fields[name]] = value; };
  put("stableMessageId", record.messageId);
  put("conversationId", record.conversationId);
  put("subject", record.subject);
  put("sender", record.sender);
  put("receivedAt", record.receivedAt);
  put("body", record.body);
  put("extractionJson", record.extractionJson);
  put("matchCandidates", record.matchCandidates);
  put("missingFields", record.missingFields);
  put("ordinal", record.ordinal);
  put("legType", record.legType);
  put("legJson", record.legJson);
  put("status", statusValues[record.status] ?? record.status);
  put("warnings", record.warnings?.join("\n"));
  put("confidence", record.confidence);
  put("extractorVersion", record.extractorVersion);
  put("hasAttachments", record.hasAttachments);
  put("processedAt", record.processedAt);
  const response = await fetch(entityId ? `${baseUrl}/api/data/v9.2/${entitySet}(${entityId})` : `${baseUrl}/api/data/v9.2/${entitySet}`, {
    method: entityId ? "PATCH" : "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Dataverse respondeu ${response.status}: ${await response.text()}`);
  return entityId || response.headers.get("odata-entityid") || "";
}

export function prepareDrafts(message, extraction) {
  const checked = validateExtraction(normalizeExtraction(extraction));
  return buildDraftRecords({ message, extraction: checked.extraction });
}

if (process.argv[1]?.endsWith("dataverse_ai_drafts.mjs")) {
  const [messageFile, extractionFile] = process.argv.slice(2);
  if (!messageFile || !extractionFile) throw new Error("Uso: node scripts/dataverse_ai_drafts.mjs <message.json> <extraction.json>");
  const [message, extraction] = await Promise.all([import(messageFile, { with: { type: "json" } }), import(extractionFile, { with: { type: "json" } })]);
  console.log(JSON.stringify(prepareDrafts(message.default, extraction.default), null, 2));
}
