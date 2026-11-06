import { createFetchWebApi } from "./fetchWebApi.ts";
import { DATAVERSE, ENTITY_COLLECTION_ALIASES, ENTITY_SET_TO_ENTITY_NAME } from "./entidades.ts";

// Cliente do Dataverse no web resource: escolhe o runtime (Xrm.WebApi da janela/parent,
// WebApi por fetch na URL direta ou nenhum em localhost/mock), faz o CRUD com log e
// resolve o motorista logado. Regras de negócio ficam fora daqui.
export type XrmLike = {
  Utility?: {
    getGlobalContext?: () => {
      userSettings?: { userId?: string };
      getClientUrl?: () => string;
    };
  };
  WebApi?: {
    retrieveMultipleRecords: (entitySetName: string, options?: string) => Promise<{ entities: DataverseRecord[]; nextLink?: string }>;
    retrieveRecord: (entitySetName: string, id: string, options?: string) => Promise<DataverseRecord>;
    updateRecord: (entitySetName: string, id: string, data: Record<string, unknown>) => Promise<unknown>;
    createRecord: (entitySetName: string, data: Record<string, unknown>) => Promise<{ id: string }>;
    deleteRecord?: (entitySetName: string, id: string) => Promise<unknown>;
    online?: { execute: (request: Record<string, unknown>) => Promise<unknown> };
  };
};

export type DataverseRecord = Record<string, any>;
export type AppResourceFlowEnv = Record<string, string | undefined>;
export type WindowWithFlowEnv = Window & {
  __APP_FLOW_ENV?: AppResourceFlowEnv;
  __APP_REPORT_ERROR?: (error: unknown, context?: Record<string, unknown>) => void;
};

export type DriverContext = {
  id: string;
  email: string;
  fullName: string;
  funcionario: DataverseRecord | null;
};

const DV_LOG_PREFIX = "[AppMotoristas:Dataverse]";
let lastRuntimeLogKey = "";

export function isLocalhostRuntime() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

// Mock só em localhost. Fora dele, sem Xrm.WebApi o app abre pela URL direta do
// web resource (sem model-driven) e usa o WebApi sobre fetch com o cookie da sessão.
function shouldUseLocalFrontendFallback() {
  return isLocalhostRuntime();
}

export function isDataverseHostRuntime() {
  if (typeof window === "undefined") return false;
  return /\.dynamics\.com$/i.test(window.location.hostname);
}

// Aberto pela URL direta: janela de topo (ou parent sem Xrm) no host do Dataverse.
export function isStandaloneWebResourceRuntime() {
  if (!isDataverseHostRuntime()) return false;
  const current = window as Window & { Xrm?: XrmLike };
  if (current.Xrm?.WebApi) return false;
  try {
    return !(window.parent as Window & { Xrm?: XrmLike })?.Xrm?.WebApi;
  } catch {
    return true;
  }
}

let fetchRuntime: XrmLike | null = null;
let whoAmIUserId = "";

function getFetchRuntime(): XrmLike {
  if (!fetchRuntime) {
    const clientUrl = window.location.origin;
    const entitySetByName = Object.fromEntries(Object.entries(ENTITY_SET_TO_ENTITY_NAME).map(([set, name]) => [name, set]));
    fetchRuntime = {
      Utility: { getGlobalContext: () => ({ userSettings: { userId: whoAmIUserId }, getClientUrl: () => clientUrl }) },
      WebApi: createFetchWebApi(clientUrl, entitySetByName)
    };
    dataverseLog("Xrm.WebApi ausente: usando WebApi por fetch na URL direta do web resource.", { clientUrl });
  }
  return fetchRuntime;
}

async function fetchWhoAmIUserId() {
  if (whoAmIUserId) return whoAmIUserId;
  const response = await fetch(`${window.location.origin}/api/data/v9.2/WhoAmI`, {
    headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
    credentials: "same-origin"
  });
  if (!response.ok) throw new Error(`WhoAmI falhou (HTTP ${response.status}).`);
  whoAmIUserId = cleanGuid(String(((await response.json()) as { UserId?: string }).UserId ?? ""));
  return whoAmIUserId;
}

export function dataverseLog(message: string, data?: unknown) {
  if (data === undefined) {
    console.info(DV_LOG_PREFIX, message);
    return;
  }
  console.info(DV_LOG_PREFIX, message, data);
}

export function dataverseWarn(message: string, data?: unknown) {
  // A causa real vai em cause: o logger classifica rede/timeout e agrupa repetições pela causa.
  const cause = typeof data === "object" && data !== null ? (data as { error?: unknown }).error : undefined;
  (window as WindowWithFlowEnv).__APP_REPORT_ERROR?.(cause === undefined ? new Error(message) : Object.assign(new Error(message), { cause }), {
    severity: "warning", source: "dataverse", action: message, phase: "fallback", payload: data, notifyUser: false
  });
  if (data === undefined) {
    console.warn(DV_LOG_PREFIX, message);
    return;
  }
  console.warn(DV_LOG_PREFIX, message, data);
}

export function dataverseError(message: string, data?: unknown) {
  if (data === undefined) {
    console.error(DV_LOG_PREFIX, message);
    (window as WindowWithFlowEnv).__APP_REPORT_ERROR?.(new Error(message), {
      severity: "error",
      source: "dataverse",
      action: message
    });
    return;
  }
  console.error(DV_LOG_PREFIX, message, data);
  (window as WindowWithFlowEnv).__APP_REPORT_ERROR?.(Object.assign(new Error(message), { cause: data }), {
    severity: "error",
    source: "dataverse",
    action: message,
    payload: data
  });
}

export function getWindowXrm(): XrmLike | null {
  const current = window as Window & { Xrm?: XrmLike };
  try {
    const parentWindow = window.parent as Window & { Xrm?: XrmLike };
    if (current.Xrm?.WebApi) {
      const clientUrl = current.Xrm.Utility?.getGlobalContext?.().getClientUrl?.() ?? "";
      const logKey = `current:${clientUrl}`;
      if (lastRuntimeLogKey !== logKey) {
        lastRuntimeLogKey = logKey;
        dataverseLog("Xrm.WebApi encontrado na janela atual.", { clientUrl });
      }
      return current.Xrm;
    }
    if (parentWindow?.Xrm?.WebApi) {
      const clientUrl = parentWindow.Xrm.Utility?.getGlobalContext?.().getClientUrl?.() ?? "";
      const logKey = `parent:${clientUrl}`;
      if (lastRuntimeLogKey !== logKey) {
        lastRuntimeLogKey = logKey;
        dataverseLog("Xrm.WebApi encontrado na janela parent.", { clientUrl });
      }
      return parentWindow.Xrm;
    }
    if (isDataverseHostRuntime()) return getFetchRuntime();
    const logKey = `missing:${Boolean(current.Xrm)}:${Boolean(parentWindow?.Xrm)}`;
    if (lastRuntimeLogKey !== logKey) {
      lastRuntimeLogKey = logKey;
      dataverseWarn("Xrm.WebApi nao encontrado.", {
        hasWindowXrm: Boolean(current.Xrm),
        hasParentXrm: Boolean(parentWindow?.Xrm)
      });
    }
    return null;
  } catch (error) {
    dataverseWarn("Falha ao acessar window.parent.Xrm. Usando apenas window.Xrm.", error);
    if (!current.Xrm?.WebApi && isDataverseHostRuntime()) return getFetchRuntime();
    if (current.Xrm?.WebApi) {
      const clientUrl = current.Xrm.Utility?.getGlobalContext?.().getClientUrl?.() ?? "";
      const logKey = `current-parent-error:${clientUrl}`;
      if (lastRuntimeLogKey !== logKey) {
        lastRuntimeLogKey = logKey;
        dataverseLog("Xrm.WebApi encontrado na janela atual apos falha no parent.", { clientUrl });
      }
      return current.Xrm;
    }
    return null;
  }
}

export function hasDataverseRuntime() {
  if (shouldUseLocalFrontendFallback()) {
    dataverseLog("Frontend local/fallback detectado. Dataverse desativado para uso sem Xrm.");
    return false;
  }
  const hasRuntime = Boolean(getWindowXrm()?.WebApi);
  dataverseLog(hasRuntime ? "Runtime Xrm.WebApi detectado." : "Runtime Xrm.WebApi nao encontrado. Modo local/fallback.");
  return hasRuntime;
}

export function getWebApi() {
  const api = getWindowXrm()?.WebApi;
  if (!api) throw new Error("Dataverse indisponivel. Abra o app pelo link do Dataverse (WebResources/new_app-motoristas-v2) ou pelo Power Apps.");
  return api;
}

export function cleanGuid(value = "") {
  return value.replace(/[{}]/g, "").toLowerCase();
}

export function cleanODataGuid(value: unknown) {
  return cleanGuid(String(value ?? ""));
}

export function escapeODataText(value: string) {
  return value.replace(/'/g, "''");
}

function encodeOptions(value: string) {
  return value.startsWith("?") ? value : `?${value}`;
}

export function getWebApiEntityName(entitySetName: string) {
  const normalizedCollection = ENTITY_COLLECTION_ALIASES[entitySetName] ?? entitySetName;
  return ENTITY_SET_TO_ENTITY_NAME[normalizedCollection] || normalizedCollection;
}

export function getBusinessId(record: DataverseRecord, fallback = "") {
  return String(record.cr40f_id ?? fallback ?? "").trim();
}

export function describeDataverseError(error: unknown) {
  const record = (error ?? {}) as Record<string, unknown>;
  return {
    message: String(record.message ?? ""),
    errorCode: record.errorCode ?? record.code ?? "",
    raw: error
  };
}

export function getCurrentUserId() {
  return cleanGuid(getWindowXrm()?.Utility?.getGlobalContext?.().userSettings?.userId ?? "");
}

export async function retrieveMultiple(entitySetName: string, options = "") {
  const startedAt = performance.now();
  const entityName = getWebApiEntityName(entitySetName);
  dataverseLog("retrieveMultiple iniciado.", { entitySetName, entityName, options });
  try {
    const result = await getWebApi().retrieveMultipleRecords(entityName, encodeOptions(options));
    dataverseLog("retrieveMultiple concluido.", {
      entitySetName,
      entityName,
      count: result.entities.length,
      durationMs: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    dataverseError("retrieveMultiple falhou.", {
      entitySetName,
      entityName,
      options,
      durationMs: Math.round(performance.now() - startedAt),
      error: describeDataverseError(error)
    });
    throw error;
  }
}

export async function retrieveMultipleAll(entitySetName: string, options = "", schedule?: <T>(request: () => Promise<T>) => Promise<T>) {
  const entities: DataverseRecord[] = [];
  let nextOptions = options;
  let page = 0;

  while (nextOptions) {
    page += 1;
    const result = await (schedule ? schedule(() => retrieveMultiple(entitySetName, nextOptions)) : retrieveMultiple(entitySetName, nextOptions));
    entities.push(...result.entities);
    if (!result.nextLink) break;
    const queryIndex = result.nextLink.indexOf("?");
    nextOptions = queryIndex >= 0 ? result.nextLink.slice(queryIndex) : "";
    if (page > 20) throw new Error(`Consulta paginada excedeu limite de seguranca para ${entitySetName}.`);
  }

  return { entities };
}

export async function retrieveOne(entitySetName: string, id: string, options = "") {
  const cleanId = cleanGuid(id);
  const startedAt = performance.now();
  const entityName = getWebApiEntityName(entitySetName);
  dataverseLog("retrieveRecord iniciado.", { entitySetName, entityName, id: cleanId, options });
  try {
    const result = await getWebApi().retrieveRecord(entityName, cleanId, encodeOptions(options));
    dataverseLog("retrieveRecord concluido.", {
      entitySetName,
      entityName,
      id: cleanId,
      durationMs: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    dataverseError("retrieveRecord falhou.", {
      entitySetName,
      entityName,
      id: cleanId,
      options,
      durationMs: Math.round(performance.now() - startedAt),
      error: describeDataverseError(error)
    });
    throw error;
  }
}

export async function updateOne(entitySetName: string, id: string, data: Record<string, unknown>) {
  const cleanId = cleanGuid(id);
  const startedAt = performance.now();
  const entityName = getWebApiEntityName(entitySetName);
  dataverseLog("updateRecord iniciado.", { entitySetName, entityName, id: cleanId, fields: Object.keys(data) });
  try {
    const result = await getWebApi().updateRecord(entityName, cleanId, data);
    dataverseLog("updateRecord concluido.", {
      entitySetName,
      entityName,
      id: cleanId,
      durationMs: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    dataverseError("updateRecord falhou.", {
      entitySetName,
      entityName,
      id: cleanId,
      fields: Object.keys(data),
      durationMs: Math.round(performance.now() - startedAt),
      error: describeDataverseError(error)
    });
    throw error;
  }
}

export async function createOne(entitySetName: string, data: Record<string, unknown>) {
  const startedAt = performance.now();
  const entityName = getWebApiEntityName(entitySetName);
  dataverseLog("createRecord iniciado.", { entitySetName, entityName, fields: Object.keys(data) });
  try {
    const result = await getWebApi().createRecord(entityName, data);
    dataverseLog("createRecord concluido.", {
      entitySetName,
      entityName,
      id: result.id,
      durationMs: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    dataverseError("createRecord falhou.", {
      entitySetName,
      entityName,
      fields: Object.keys(data),
      durationMs: Math.round(performance.now() - startedAt),
      error: describeDataverseError(error)
    });
    throw error;
  }
}

export async function deleteOne(entitySetName: string, id: string) {
  const cleanId = cleanGuid(id);
  const entityName = getWebApiEntityName(entitySetName);
  const api = getWebApi();
  if (!api.deleteRecord) throw new Error("Exclusão indisponível neste runtime do Dataverse.");
  dataverseLog("deleteRecord iniciado.", { entitySetName, entityName, id: cleanId });
  try {
    return await api.deleteRecord(entityName, cleanId);
  } catch (error) {
    dataverseError("deleteRecord falhou.", { entitySetName, entityName, id: cleanId, error: describeDataverseError(error) });
    throw error;
  }
}

async function getCurrentUserEmail() {
  if (shouldUseLocalFrontendFallback()) {
    dataverseLog("Frontend local/fallback sem consulta de usuario Dataverse.");
    return "";
  }
  const xrm = getWindowXrm();
  let userId = cleanGuid(xrm?.Utility?.getGlobalContext?.().userSettings?.userId ?? "");
  if (!userId && isDataverseHostRuntime()) userId = await fetchWhoAmIUserId();
  dataverseLog("Usuario atual detectado.", { userId });
  if (!userId) return "";
  const systemUser = await retrieveOne(DATAVERSE.systemusers, userId, "$select=internalemailaddress,fullname");
  const email = String(systemUser.internalemailaddress ?? "");
  dataverseLog("Email Microsoft do usuario carregado.", { email, fullName: systemUser.fullname ?? "" });
  return email;
}

let qrPermissionColumnMissing = false;

// Id do motorista no fallback local (sem Xrm); também identifica as preferências locais, como o tour.
export const LOCAL_DRIVER_ID = "localhost-driver";

export async function getDriverContext(): Promise<DriverContext> {
  const email = await getCurrentUserEmail();
  if (!email && shouldUseLocalFrontendFallback()) {
    dataverseLog("Fallback de motorista local ativado para frontend sem Xrm.");
    return {
      id: LOCAL_DRIVER_ID,
      email: "",
      fullName: "Localhost",
      funcionario: {
        cr40f_funcionariosid: LOCAL_DRIVER_ID,
        cr40f_nomecompleto: "Localhost",
        cr40f_emailmicrosoft: "",
        cr40f_gerarrecibopersonalizado: true,
        cr40f_podecobrarqrcode: true,
        // Teste local do "Meu carro": abra com ?mockTerceiro=1.
        ...(new URLSearchParams(window.location.search).get("mockTerceiro") === "1" ? { cr40f_tipodevinculo: 1 } : {})
      }
    };
  }
  if (!email) throw new Error("Email Microsoft do usuario atual nao foi encontrado no Dataverse.");

  const driverQuery = (extraColumns: string) =>
    `$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_emailmicrosoft,_cr40f_veiculoatual_value,cr40f_tipodevinculo,cr40f_gerarrecibopersonalizado${extraColumns}&$filter=cr40f_status eq 0 and cr40f_emailmicrosoft eq '${escapeODataText(email)}'&$top=2`;
  // A coluna da cobrança por QR pode ainda não existir no ambiente; sem ela o login não pode cair.
  // Guarda a falha para não repetir a consulta inválida em cada chamada da sessão.
  const result = await retrieveMultiple(DATAVERSE.funcionarios, driverQuery(qrPermissionColumnMissing ? "" : ",cr40f_podecobrarqrcode")).catch((error: unknown) => {
    // Xrm.WebApi rejeita com objeto { message }, não com Error.
    const message = String((error as { message?: unknown } | null)?.message ?? error);
    if (qrPermissionColumnMissing || !message.includes("cr40f_podecobrarqrcode")) throw error;
    qrPermissionColumnMissing = true;
    dataverseWarn("Coluna cr40f_podecobrarqrcode ausente; cobrança por QR desativada.");
    return retrieveMultiple(DATAVERSE.funcionarios, driverQuery(""));
  });
  if (result.entities.length > 1) {
    throw new Error("Mais de um funcionario ativo usa o mesmo Email Microsoft. Corrija o cadastro antes de continuar.");
  }
  const funcionario = result.entities[0] ?? null;
  if (!funcionario) throw new Error("Motorista nao encontrado em Funcionarios pelo Email Microsoft.");

  dataverseLog("Motorista Dataverse resolvido.", {
    id: funcionario.cr40f_funcionariosid,
    email,
    fullName: funcionario.cr40f_nomecompleto,
    tipoDeVinculo: funcionario.cr40f_tipodevinculo,
    gerarReciboPersonalizado: funcionario.cr40f_gerarrecibopersonalizado
  });

  return {
    id: String(funcionario.cr40f_funcionariosid ?? ""),
    email,
    fullName: String(funcionario.cr40f_nomecompleto ?? ""),
    funcionario
  };
}

export function getDriverCurrentVehicleId(driver: DriverContext | null) {
  return cleanODataGuid(driver?.funcionario?._cr40f_veiculoatual_value);
}
