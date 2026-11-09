import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MANIFEST = path.join(ROOT, "docs", "power-platform", "ai_schedule_solution_manifest.json");
const PLACEHOLDER_PATTERN = /PREENCHER|pendente|requires_metadata_review|create_after_metadata_review/i;

const TYPE_ALIASES = new Map([
  ["WholeNumber", new Set(["Integer", "BigInt"])],
  ["MultilineText", new Set(["Memo", "String"])],
  ["DateTime", new Set(["DateTime"])],
  ["Text", new Set(["String"])],
  ["Choice", new Set(["Picklist", "State", "Status"])],
  ["YesNo", new Set(["Boolean"])],
  ["Lookup", new Set(["Lookup", "Customer", "Owner"]) ]
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getPath(source, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value == null ? undefined : value[key], source);
}

function findPlaceholderStrings(value, location = "$", output = []) {
  if (typeof value === "string") {
    if (PLACEHOLDER_PATTERN.test(value)) output.push(`${location}=${value}`);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findPlaceholderStrings(item, `${location}[${index}]`, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => findPlaceholderStrings(item, `${location}.${key}`, output));
  }
  return output;
}

function metadataTableIndex(metadata) {
  const tables = Array.isArray(metadata?.tables) ? metadata.tables : [];
  return new Map(tables.map((table) => [String(table.logicalName || "").toLowerCase(), table]));
}

function metadataAttributeIndex(table) {
  return new Map((Array.isArray(table?.attributes) ? table.attributes : [])
    .map((attribute) => [String(attribute.logicalName || "").toLowerCase(), attribute]));
}

function validateMetadata(manifest, metadata, errors) {
  if (!metadata || typeof metadata !== "object") return;
  const tables = metadataTableIndex(metadata);
  const session = manifest.sessionTable || {};
  const reservation = manifest.reservationTable || {};
  const sessionTable = tables.get(String(session.logicalName || "").toLowerCase());
  const reservationTable = tables.get(String(reservation.logicalName || "").toLowerCase());

  if (!sessionTable) errors.push(`metadata.tables não contém ${session.logicalName}.`);
  if (!reservationTable) errors.push(`metadata.tables não contém ${reservation.logicalName}.`);
  if (sessionTable) {
    if (sessionTable.entitySetName !== session.entitySetName) errors.push(`entitySetName divergente para ${session.logicalName}: esperado ${session.entitySetName}, recebido ${sessionTable.entitySetName || "vazio"}.`);
    if (sessionTable.primaryNameAttribute !== session.primaryNameAttribute) errors.push(`primaryNameAttribute divergente para ${session.logicalName}: esperado ${session.primaryNameAttribute}, recebido ${sessionTable.primaryNameAttribute || "vazio"}.`);
    const attributes = metadataAttributeIndex(sessionTable);
    for (const column of session.columns || []) {
      const actual = attributes.get(String(column.logicalName || "").toLowerCase());
      if (!actual) {
        errors.push(`metadata não contém a coluna da sessão ${column.logicalName}.`);
        continue;
      }
      const allowedTypes = TYPE_ALIASES.get(column.type);
      if (allowedTypes && actual.type && !allowedTypes.has(actual.type)) {
        errors.push(`tipo divergente em ${column.logicalName}: manifesto ${column.type}, metadata ${actual.type}.`);
      }
    }
  }
  if (reservationTable) {
    if (reservationTable.entitySetName !== reservation.entitySetName) errors.push(`entitySetName divergente para ${reservation.logicalName}: esperado ${reservation.entitySetName}, recebido ${reservationTable.entitySetName || "vazio"}.`);
    if (reservationTable.primaryNameAttribute !== reservation.primaryNameAttribute) errors.push(`primaryNameAttribute divergente para ${reservation.logicalName}: esperado ${reservation.primaryNameAttribute}, recebido ${reservationTable.primaryNameAttribute || "vazio"}.`);
    const attributes = metadataAttributeIndex(reservationTable);
    for (const column of reservation.requiredAdditions || []) {
      const actual = attributes.get(String(column.logicalName || "").toLowerCase());
      if (!actual) {
        errors.push(`metadata não contém a coluna de reserva ${column.logicalName}.`);
        continue;
      }
      const allowedTypes = TYPE_ALIASES.get(column.type);
      if (allowedTypes && actual.type && !allowedTypes.has(actual.type)) {
        errors.push(`tipo divergente em ${column.logicalName}: manifesto ${column.type}, metadata ${actual.type}.`);
      }
      if (column.type === "Lookup" && Array.isArray(actual.targets) && !actual.targets.includes(session.logicalName)) {
        errors.push(`lookup ${column.logicalName} não aponta para ${session.logicalName}.`);
      }
    }
  }
}

export function validateManifest(manifest, metadata = null) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return { ok: false, errors: ["manifesto JSON inválido."] };
  for (const requiredPath of [
    "solution.name",
    "solution.publisher",
    "sessionTable.logicalName",
    "sessionTable.entitySetName",
    "sessionTable.primaryNameAttribute",
    "reservationTable.logicalName",
    "reservationTable.entitySetName",
    "reservationTable.primaryNameAttribute",
    "connector.name",
    "connector.connectionReference"
  ]) {
    if (!String(getPath(manifest, requiredPath) || "").trim()) errors.push(`campo obrigatório ausente: ${requiredPath}.`);
  }
  const placeholders = findPlaceholderStrings(manifest);
  for (const placeholder of placeholders) errors.push(`valor ainda não resolvido: ${placeholder}.`);
  const sessionColumns = manifest.sessionTable?.columns;
  if (!Array.isArray(sessionColumns) || !sessionColumns.length) errors.push("sessionTable.columns deve conter as colunas da sessão.");
  const reservationAdditions = manifest.reservationTable?.requiredAdditions;
  if (!Array.isArray(reservationAdditions) || !reservationAdditions.length) errors.push("reservationTable.requiredAdditions deve conter lookup, ordinal e idempotência.");
  const keyColumns = manifest.reservationTable?.alternateKey?.columns;
  if (!Array.isArray(keyColumns) || keyColumns.length < 2) errors.push("alternateKey.columns deve garantir sessão + ordinal.");
  validateMetadata(manifest, metadata, errors);
  return { ok: errors.length === 0, errors };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestPath = path.resolve(argument("--manifest") || DEFAULT_MANIFEST);
  const metadataPath = argument("--metadata") ? path.resolve(argument("--metadata")) : "";
  let result;
  try {
    if (!fs.existsSync(manifestPath)) throw new Error(`manifesto não encontrado: ${manifestPath}.`);
    if (metadataPath && !fs.existsSync(metadataPath)) {
      result = {
        ok: false,
        errors: [`arquivo de metadata não encontrado: ${metadataPath}. Execute scripts/coletar_metadata_dataverse_console.js no ambiente DEV e informe o caminho real do JSON baixado.`]
      };
    } else {
      const manifest = readJson(manifestPath);
      const metadata = metadataPath ? readJson(metadataPath) : null;
      result = validateManifest(manifest, metadata);
    }
  } catch (error) {
    result = { ok: false, errors: [error.message || "não foi possível ler os arquivos de configuração."] };
  }
  console.log(JSON.stringify({ manifest: manifestPath, metadata: metadataPath || null, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}
