import { MOCK_ENTITY_SETS, MOCK_LOOKUPS, loadMockDatabase, saveMockDatabase } from "./mockData.js";
import { CHOICE_FIELDS, OPTIONS, defaultChoiceDefinitions } from "./domain.js";
import { reportAppError, reportDataverseFailure } from "./appErrorLogger.js";
import { getDataverseContext } from "./dataverseContext.js";

const API_VERSION = "v9.2";
const FLOW_URL_ENV_KEY = "VITE_FLOW_SALVAR_ANEXOS_ONEDRIVE_URL";
const FLOW_URL_SCHEMA = "new_FlowURLFlowSalvarArquivosOnedrive";
const DEV_DATAVERSE_URL = "https://org23b93544.crm2.dynamics.com";
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 10;
export const EVIDENCE_FOLDERS = Object.freeze({
  registration: "Registro",
  solution: "Solucao",
  action: "Acoes",
  history: "Historico",
});

export const TABLES = {
  error: "cr40f_errooperacional",
  action: "cr40f_acaooperacional",
  reservation: "cr40f_reservadeveculos",
  employee: "cr40f_funcionarios",
  vehicle: "cr40f_veiculos",
  note: "annotation",
  evidence: "cr40f_errooperacionalarquivo",
};

function cleanGuid(value) {
  return String(value || "").replace(/[{}]/g, "");
}

function escapeODataString(value) {
  return String(value || "").replaceAll("'", "''");
}

function localHost() {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function getDataUrlMimeType(value = "") {
  const match = /^data:([^;,]+)[;,]/i.exec(value);
  return match?.[1]?.trim().toLowerCase() || "application/octet-stream";
}

export function dataUrlToBase64(value = "") {
  const markerIndex = value.toLowerCase().indexOf(";base64,");
  const raw = markerIndex >= 0 ? value.slice(markerIndex + 8) : value.slice(value.lastIndexOf(",") + 1);
  return raw.replace(/\s/g, "");
}

function sanitizePathSegment(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "");
  return sanitized || fallback;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao preparar arquivo para envio ao OneDrive."));
    reader.readAsDataURL(file);
  });
}

function extractFlowRecord(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function flowText(record, ...keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}

export function getFlowLink(result) {
  const record = result || {};
  for (const key of ["shareLink", "link", "webUrl", "url", "fileLink", "sharedLink"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nestedLink = flowText(value, "shareLink", "webUrl", "url", "href", "link");
      if (nestedLink) return nestedLink;
    }
  }
  const body = extractFlowRecord(record.body || record.Body || record.responseText);
  return body ? getFlowLink(body) : "";
}

export function buildOneDriveFlowPayload({ path, fileName, dataUrl, metadata = {} }) {
  const mimeType = getDataUrlMimeType(dataUrl);
  return {
    caminhoCompleto: path,
    nomeArquivo: fileName,
    conteudoBase64: dataUrlToBase64(dataUrl),
    mimeType,
    metadados: metadata,
  };
}

export function buildOneDriveEvidencePath(error, folder = EVIDENCE_FOLDERS.history, clientUrl = "") {
  const errorKey = sanitizePathSegment(error?.cr40f_codigo || error?.cr40f_errooperacionalid, "sem-codigo");
  const devPrefix = String(clientUrl || "").replace(/\/$/, "").toLowerCase() === DEV_DATAVERSE_URL ? "DEV/" : "";
  return `Erros Operacionais/${devPrefix}${errorKey}/${sanitizePathSegment(folder, EVIDENCE_FOLDERS.history)}`;
}

function localizedLabel(value) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [{
      "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
      Label: value,
      LanguageCode: 1046,
      IsManaged: false,
    }],
    UserLocalizedLabel: {
      "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
      Label: value,
      LanguageCode: 1046,
      IsManaged: false,
    },
  };
}

export function formattedLookup(record, field) {
  return record?.[`${field}@OData.Community.Display.V1.FormattedValue`] || "";
}

class DataverseClient {
  constructor() {
    this.context = getDataverseContext();
    this.xrm = this.context.xrm;
    this.clientUrl = this.context.clientUrl;
    this.apiRoot = this.clientUrl ? `${this.clientUrl}/api/data/${API_VERSION}` : "";
    // Xrm mínimo do shell (URL direta) não tem userSettings: o usuário vem do WhoAmI, como na URL direta antiga.
    this.directWebResource = this.context.isDirectWebResource || Boolean(this.clientUrl && !this.context.globalContext?.userSettings);
    this.identity = null;
    this.identityPromise = null;
    this.mockMode = !this.clientUrl && localHost();
    this.entities = new Map();
    this.mock = this.mockMode ? loadMockDatabase() : null;
  }

  get available() { return Boolean(this.clientUrl || this.mockMode); }

  async ensureDirectIdentity() {
    if (!this.directWebResource || this.identity) return this.identity;
    if (!this.identityPromise) {
      this.identityPromise = fetch(`${this.apiRoot}/WhoAmI`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      })
        .then(async (response) => {
          const text = await response.text();
          const data = text ? JSON.parse(text) : null;
          if (!response.ok || !data?.OrganizationId || !data?.UserId)
            throw new Error(data?.error?.message || "Sessao Dataverse nao confirmada na URL direta.");
          this.identity = {
            organizationId: cleanGuid(data.OrganizationId).toLowerCase(),
            userId: cleanGuid(data.UserId).toLowerCase(),
          };
          return this.identity;
        })
        .catch((error) => {
          this.identityPromise = null;
          throw error;
        });
    }
    return this.identityPromise;
  }

  async request(method, path, body) {
    try {
      if (!this.clientUrl) throw new Error("Contexto Dataverse nao encontrado.");
      await this.ensureDirectIdentity();
      const url = path.startsWith("http") ? path : `${this.apiRoot}${path}`;
      let response;
      try {
        response = await fetch(url, {
          method,
          credentials: this.directWebResource ? "same-origin" : undefined,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            Prefer: 'return=representation,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        reportDataverseFailure(error, { method, path, error, detailType: "dataverse" });
        throw error;
      }
      if (response.status === 204) return null;
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const error = new Error(data?.error?.message || `${response.status} ${response.statusText}`);
        reportDataverseFailure(error, { method, path, status: response.status, body: data, detailType: "dataverse" });
        throw error;
      }
      return data;
    } catch (error) {
      reportAppError(error, { severity: "error", source: "dataverse.request", action: `${method} ${path}`, phase: "reject", detailType: "dataverse", payload: { method, path, body } });
      throw error;
    }
  }

  async entity(logicalName) {
    if (this.entities.has(logicalName)) return this.entities.get(logicalName);
    if (this.mockMode) {
      const info = { logicalName, entitySet: MOCK_ENTITY_SETS[logicalName] || `${logicalName}s`, id: `${logicalName}id`, primaryName: "name" };
      this.entities.set(logicalName, info);
      return info;
    }
    const data = await this.request("GET", `/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`);
    const info = { logicalName, entitySet: data.EntitySetName, id: data.PrimaryIdAttribute, primaryName: data.PrimaryNameAttribute };
    this.entities.set(logicalName, info);
    return info;
  }

  async entitySet(logicalName) { return (await this.entity(logicalName)).entitySet; }

  async listPage(logicalName, query = "") {
    if (this.mockMode) return { items: [...(this.mock[logicalName] || [])], nextLink: null };
    const entitySet = await this.entitySet(logicalName);
    const data = await this.request("GET", query.startsWith("http") ? query : `/${entitySet}${query}`);
    return { items: data?.value || [], nextLink: data?.["@odata.nextLink"] || null };
  }

  async listAll(logicalName, query = "", maxPages = 10) {
    const items = [];
    let next = query;
    for (let page = 0; page < maxPages && next !== null; page += 1) {
      const result = await this.listPage(logicalName, next);
      items.push(...result.items);
      next = result.nextLink;
    }
    return items;
  }

  async listLookupOptions(logicalName, filter = "") {
    if (this.mockMode) return MOCK_LOOKUPS[logicalName] || [];
    const info = await this.entity(logicalName);
    const filterQuery = filter ? `&$filter=${filter}` : "";
    const rows = await this.listAll(logicalName, `?$select=${info.id},${info.primaryName}&$orderby=${info.primaryName} asc${filterQuery}&$top=250`);
    return rows.map((row) => ({ id: cleanGuid(row[info.id]), name: row[info.primaryName] || "Sem nome" }));
  }

  async searchLookupOptions(logicalName, query, limit = 25) {
    const text = String(query || "").trim();
    if (text.length < 2) return [];
    if (this.mockMode) {
      const normalized = text.toLocaleLowerCase("pt-BR");
      return (MOCK_LOOKUPS[logicalName] || []).filter((item) => String(item.name || "").toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, limit);
    }
    const info = await this.entity(logicalName);
    const filter = `&$filter=contains(${info.primaryName},'${escapeODataString(text)}')`;
    const options = `?$select=${info.id},${info.primaryName}&$orderby=${info.primaryName} asc${filter}`;
    const result = this.xrm?.WebApi?.retrieveMultipleRecords
      ? await this.xrm.WebApi.retrieveMultipleRecords(logicalName, options, limit)
      : await this.listPage(logicalName, options);
    return (result.entities || result.items || []).map((row) => ({ id: cleanGuid(row[info.id]), name: row[info.primaryName] || "Sem nome" }));
  }

  async getLookupOption(logicalName, id) {
    const cleanId = cleanGuid(id);
    if (!cleanId) return null;
    if (this.mockMode) return (MOCK_LOOKUPS[logicalName] || []).find((item) => cleanGuid(item.id) === cleanId) || null;
    const info = await this.entity(logicalName);
    if (this.xrm?.WebApi?.retrieveRecord) {
      const row = await this.xrm.WebApi.retrieveRecord(logicalName, cleanId, `?$select=${info.id},${info.primaryName}`);
      return row ? { id: cleanGuid(row[info.id]), name: row[info.primaryName] || "Sem nome" } : null;
    }
    const set = await this.entitySet(logicalName);
    const row = await this.request("GET", `/${set}(${cleanId})?$select=${info.id},${info.primaryName}`);
    return row ? { id: cleanGuid(row[info.id]), name: row[info.primaryName] || "Sem nome" } : null;
  }

  async create(logicalName, payload, mockFields = {}) {
    if (this.mockMode) {
      const idField = `${logicalName}id`;
      const created = { ...payload, ...mockFields, [idField]: crypto.randomUUID(), createdon: new Date().toISOString(), modifiedon: new Date().toISOString() };
      if (logicalName === TABLES.error && !created.cr40f_codigo) {
        const count = (this.mock[TABLES.error] || []).length + 42;
        created.cr40f_codigo = `ERR-${String(count).padStart(6, "0")}`;
      }
      this.mock[logicalName] = [created, ...(this.mock[logicalName] || [])];
      saveMockDatabase(this.mock);
      return created;
    }
    const set = await this.entitySet(logicalName);
    return this.request("POST", `/${set}`, payload);
  }

  async update(logicalName, id, payload, mockFields = {}) {
    if (this.mockMode) {
      let updated = null;
      const idField = `${logicalName}id`;
      this.mock[logicalName] = (this.mock[logicalName] || []).map((item) => {
        if (cleanGuid(item[idField]) !== cleanGuid(id)) return item;
        updated = { ...item, ...payload, ...mockFields, modifiedon: new Date().toISOString() };
        return updated;
      });
      saveMockDatabase(this.mock);
      return updated;
    }
    const set = await this.entitySet(logicalName);
    await this.request("PATCH", `/${set}(${cleanGuid(id)})`, payload);
    return { ...payload, [`${logicalName}id`]: cleanGuid(id) };
  }

  async addLookup(payload, field, targetLogicalName, id) {
    if (!id) return payload;
    const set = await this.entitySet(targetLogicalName);
    payload[`${field}@odata.bind`] = `/${set}(${cleanGuid(id)})`;
    return payload;
  }

  async listNotes(errorId) {
    if (this.mockMode) return (this.mock.annotation || []).filter((item) => item.objectid === errorId);
    return this.listAll(TABLES.note, `?$select=annotationid,notetext,filename,mimetype,createdon&$filter=_objectid_value eq ${cleanGuid(errorId)}&$orderby=createdon desc`);
  }

  async listEvidence(errorId) {
    if (this.mockMode) return (this.mock[TABLES.evidence] || []).filter((item) => item.cr40f_erroid === errorId);
    return this.listAll(TABLES.evidence, `?$select=cr40f_errooperacionalarquivoid,cr40f_nomearquivo,cr40f_url,cr40f_mimetype,cr40f_pasta,cr40f_caminho,cr40f_contexto,createdon&$filter=_cr40f_erro_value eq ${cleanGuid(errorId)}&$orderby=createdon desc`);
  }

  async createEvidenceRecord(errorId, evidence) {
    const payload = { cr40f_nome: evidence.fileName, cr40f_nomearquivo: evidence.fileName, cr40f_url: evidence.link, cr40f_mimetype: evidence.mimeType || "application/octet-stream", cr40f_pasta: evidence.folder, cr40f_caminho: evidence.path, cr40f_contexto: evidence.metadata?.contexto || null };
    if (this.mockMode) {
      const created = { ...payload, cr40f_errooperacionalarquivoid: crypto.randomUUID(), cr40f_erroid: errorId, createdon: new Date().toISOString() };
      this.mock[TABLES.evidence] = [created, ...(this.mock[TABLES.evidence] || [])]; saveMockDatabase(this.mock); return created;
    }
    const errorSet = await this.entitySet(TABLES.error);
    payload[`cr40f_erro@odata.bind`] = `/${errorSet}(${cleanGuid(errorId)})`;
    return this.create(TABLES.evidence, payload);
  }

  async createNote(errorId, note) {
    if (this.mockMode) {
      const created = { annotationid: crypto.randomUUID(), objectid: errorId, createdon: new Date().toISOString(), ...note };
      this.mock.annotation = [created, ...(this.mock.annotation || [])];
      saveMockDatabase(this.mock);
      return created;
    }
    const errorsSet = await this.entitySet(TABLES.error);
    return this.create(TABLES.note, {
      notetext: note.notetext || null,
      subject: "Evidência do erro operacional",
      filename: note.filename || null,
      mimetype: note.mimetype || null,
      [`objectid_${TABLES.error}@odata.bind`]: `/${errorsSet}(${cleanGuid(errorId)})`,
    });
  }

  async resolveOneDriveFlowUrl() {
    const inlineUrl = typeof window !== "undefined" ? String(window.__APP_FLOW_ENV?.[FLOW_URL_ENV_KEY] || "").trim() : "";
    if (this.clientUrl) {
      try {
        const definitionResult = await this.request("GET", `/environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname,defaultvalue&$filter=schemaname eq '${FLOW_URL_SCHEMA}'&$top=1`);
        const definition = definitionResult?.value?.[0];
        if (definition?.environmentvariabledefinitionid) {
          const valueResult = await this.request("GET", `/environmentvariablevalues?$select=value&$filter=_environmentvariabledefinitionid_value eq ${cleanGuid(definition.environmentvariabledefinitionid)}&$top=1`);
          const dataverseUrl = String(valueResult?.value?.[0]?.value || definition.defaultvalue || "").trim();
          if (dataverseUrl) return dataverseUrl;
        }
      } catch {
        // Fallback keeps local builds usable when metadata is unavailable.
      }
    }
    if (inlineUrl) return inlineUrl;
    return String(import.meta.env?.VITE_FLOW_SALVAR_ANEXOS_ONEDRIVE_URL || "").trim();
  }

  async uploadEvidence(error, file, folder = EVIDENCE_FOLDERS.history, metadata = {}) {
    if (!file) return null;
    if (file.size > MAX_ATTACHMENT_SIZE) throw new Error("O anexo deve ter no m\u00e1ximo 5 MB.");
    const path = buildOneDriveEvidencePath(error, folder, this.clientUrl);
    const fileName = sanitizePathSegment(file.name, "arquivo");
    if (this.mockMode) { const evidence = { link: `mock://onedrive/${encodeURIComponent(fileName)}`, fileName, path, folder, mimeType: file.type, metadata }; await this.createEvidenceRecord(error?.cr40f_errooperacionalid, evidence); return evidence; }

    const dataUrl = await fileToDataUrl(file);
    const payload = buildOneDriveFlowPayload({
      path,
      fileName,
      dataUrl,
      metadata: {
        erroId: error?.cr40f_errooperacionalid || "",
        erroCodigo: error?.cr40f_codigo || "",
        pasta: folder,
        tipo: "EVIDENCIA_ERRO_OPERACIONAL",
        ...metadata,
      },
    });
    if (!payload.conteudoBase64) throw new Error("Arquivo vazio para envio ao OneDrive.");
    const url = await this.resolveOneDriveFlowUrl();
    if (!url) throw new Error(`URL do Flow não configurada: ${FLOW_URL_SCHEMA}.`);
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Flow OneDrive falhou: HTTP ${response.status}.`);
    const result = responseText ? extractFlowRecord(responseText) || {} : {};
    const status = String(result.status || result.Status || result.resultado || result.Resultado || "").trim().toLowerCase();
    if (status && !["ok", "success", "sucesso"].includes(status)) throw new Error(String(result.message || result.mensagem || "Flow OneDrive retornou falha."));
    const link = getFlowLink(result);
    if (!link) throw new Error("Arquivo salvo no OneDrive, mas o Flow não retornou link.");
    const evidence = { link, fileName, path, folder, mimeType: file.type, metadata }; await this.createEvidenceRecord(error?.cr40f_errooperacionalid, evidence); return evidence;
  }

  async createEvidenceNotes(errorId, error, text, files = [], folder = EVIDENCE_FOLDERS.history, metadata = {}) {
    const evidenceFiles = Array.isArray(files) ? files.filter(Boolean) : files ? [files] : [];
    const noteText = String(text || "").trim();
    if (evidenceFiles.length > MAX_EVIDENCE_FILES) throw new Error(`Cada contexto aceita no máximo ${MAX_EVIDENCE_FILES} anexos.`);
    if (!evidenceFiles.length) return noteText ? [await this.createNote(errorId, { notetext: noteText })] : [];

    const created = [];
    for (const [index, file] of evidenceFiles.entries()) {
      const upload = await this.uploadEvidence(error, file, folder, metadata);
      const notetext = [index === 0 ? noteText : "", `Arquivo salvo no OneDrive: ${upload.link}`].filter(Boolean).join("\n");
      created.push(await this.createNote(errorId, { notetext, filename: upload.fileName, mimetype: file.type || "application/octet-stream" }));
    }
    return created;
  }

  async createEvidenceNote(errorId, error, text, file) {
    return this.createEvidenceNotes(errorId, error, text, file ? [file] : []);
  }

  choiceField(key) {
    const field = CHOICE_FIELDS.find((item) => item.key === key);
    if (!field) throw new Error("Choice não configurado para este módulo.");
    return field;
  }

  mockChoiceDefinitions() {
    const defaults = defaultChoiceDefinitions();
    const saved = new Map((this.mock.choiceDefinitions || []).map((item) => [item.key, item]));
    const definitions = defaults.map((item) => ({ ...item, options: saved.get(item.key)?.options || item.options, isManaged: false }));
    this.mock.choiceDefinitions = definitions;
    saveMockDatabase(this.mock);
    return definitions;
  }

  async listChoiceDefinitions() {
    if (this.mockMode) return this.mockChoiceDefinitions();
    return Promise.all(CHOICE_FIELDS.map(async (field) => {
      const metadata = await this.request("GET", `/EntityDefinitions(LogicalName='${field.entity}')/Attributes(LogicalName='${field.attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName,IsManaged&$expand=OptionSet`);
      const options = (metadata.OptionSet?.Options || []).map((option) => ({
        value: option.Value,
        label: option.Label?.UserLocalizedLabel?.Label || option.Label?.LocalizedLabels?.find((item) => item.LanguageCode === 1046)?.Label || option.Label?.LocalizedLabels?.[0]?.Label || String(option.Value),
        locked: field.mode !== "full" || field.protectedValues.includes(option.Value),
      }));
      return { ...field, options, isManaged: Boolean(metadata.IsManaged || metadata.OptionSet?.IsManaged) };
    }));
  }

  async choiceUsage(key, value) {
    const field = this.choiceField(key);
    if (this.mockMode) return (this.mock[field.entity] || []).filter((row) => Number(row[field.attribute]) === Number(value)).length;
    const entitySet = await this.entitySet(field.entity);
    const data = await this.request("GET", `/${entitySet}?$select=${field.attribute}&$filter=${field.attribute} eq ${Number(value)}&$top=1&$count=true`);
    return Number(data?.["@odata.count"] || data?.value?.length || 0);
  }

  async publishChoiceField(field) {
    if (this.mockMode) return;
    const ParameterXml = `<importexportxml><entities><entity>${field.entity}</entity></entities><nodes/><securityroles/><settings/><workflows/></importexportxml>`;
    await this.request("POST", "/PublishXml", { ParameterXml });
  }

  async createChoiceOption(key, label) {
    const field = this.choiceField(key);
    if (field.mode !== "full") throw new Error("Este choice faz parte do fluxo e permite apenas renomear opções.");
    if (this.mockMode) {
      const definitions = this.mockChoiceDefinitions();
      const definition = definitions.find((item) => item.key === key);
      const maxValue = Math.max(100000999, ...definition.options.map((item) => Number(item.value)));
      const created = { value: maxValue + 1, label, locked: false };
      definition.options.push(created);
      saveMockDatabase(this.mock);
      return created;
    }
    const result = await this.request("POST", "/InsertOptionValue", {
      EntityLogicalName: field.entity,
      AttributeLogicalName: field.attribute,
      Label: localizedLabel(label),
    });
    await this.publishChoiceField(field);
    return { value: result.NewOptionValue, label, locked: false };
  }

  async updateChoiceOption(key, value, label) {
    const field = this.choiceField(key);
    if (this.mockMode) {
      const definition = this.mockChoiceDefinitions().find((item) => item.key === key);
      const option = definition.options.find((item) => Number(item.value) === Number(value));
      if (!option) throw new Error("Opção não encontrada.");
      option.label = label;
      saveMockDatabase(this.mock);
      return option;
    }
    await this.request("POST", "/UpdateOptionValue", {
      EntityLogicalName: field.entity,
      AttributeLogicalName: field.attribute,
      Value: Number(value),
      Label: localizedLabel(label),
      MergeLabels: true,
    });
    await this.publishChoiceField(field);
    return { value: Number(value), label };
  }

  async deleteChoiceOption(key, value) {
    const field = this.choiceField(key);
    if (field.mode !== "full" || field.protectedValues.includes(Number(value))) throw new Error("Esta opção é estrutural e não pode ser excluída.");
    const usage = await this.choiceUsage(key, value);
    if (usage) throw new Error(`Não é possível excluir: ${usage} registro(s) usam esta opção.`);
    if (this.mockMode) {
      const definition = this.mockChoiceDefinitions().find((item) => item.key === key);
      definition.options = definition.options.filter((item) => Number(item.value) !== Number(value));
      saveMockDatabase(this.mock);
      return;
    }
    await this.request("POST", "/DeleteOptionValue", {
      EntityLogicalName: field.entity,
      AttributeLogicalName: field.attribute,
      Value: Number(value),
    });
    await this.publishChoiceField(field);
  }

  getAccessProfile() {
    if (this.mockMode) return { canRegister: true, canManage: true, canConfigure: true, userId: "mock", roles: ["Mock local"] };
    const userSettings = this.context.globalContext?.userSettings;
    const roles = userSettings?.roles?.getAll?.().map((item) => item.name) || [];
    return {
      canRegister: true,
      canManage: true,
      canConfigure: true,
      userId: cleanGuid(userSettings?.userId || this.identity?.userId).toLowerCase(),
      roles,
    };
  }
}

export const dataverse = new DataverseClient();
export { cleanGuid, OPTIONS };
