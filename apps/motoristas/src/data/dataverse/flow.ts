// Power Automate: URLs dos Flows (variáveis de ambiente), chamada HTTP e leitura do resultado.
import { cleanGuid, dataverseError, dataverseLog, dataverseWarn, describeDataverseError, escapeODataText, getWindowXrm, hasDataverseRuntime, retrieveMultiple, type AppResourceFlowEnv, type WindowWithFlowEnv } from "./cliente.ts";
import { normalizeText, parseCurrencyNumber } from "./registros.ts";

export const FLOW_URLS = {
  expenseAsync: "VITE_FLOW_DESPESA_ASYNC_URL",
  gerarVoucher: "VITE_FLOW_GERAR_VOUCHER_URL",
  salvarFotosManutencao: "VITE_FLOW_SALVAR_FOTOS_MANUTENCAO_URL",
  enviarReciboCliente: "VITE_FLOW_ENVIAR_RECIBO_CLIENTE_URL",
  quickRead: "VITE_FLOW_LEITURA_RAPIDA_URL"
} as const;

const FLOW_DATAVERSE_ENVIRONMENT_VARIABLES: Record<string, string | undefined> = {
  [FLOW_URLS.expenseAsync]: "new_FlowURLDespesaAsync",
  [FLOW_URLS.gerarVoucher]: "new_FlowURLFlowGerarVoucherAppMotoristasv2",
  [FLOW_URLS.salvarFotosManutencao]: "new_FlowURLFlowSalvarArquivosOnedrive",
  [FLOW_URLS.enviarReciboCliente]: "new_FlowURLFlowEnviarReciboCliente",
  [FLOW_URLS.quickRead]: "new_FlowURLDespesaLeituraRapida"
};
const flowUrlCache = new Map<string, string>();

export function formatFlowDecimal(value: string) {
  const number = parseCurrencyNumber(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function getFlowLink(result: unknown) {
  const record = (result ?? {}) as Record<string, unknown>;
  const direct = getFlowText(
    record,
    "shareLink",
    "link",
    "webUrl",
    "url",
    "fileLink",
    "sharedLink"
  );
  if (direct) return direct;
  const nestedLink = (record.link ?? record.shareLink ?? {}) as Record<string, unknown>;
  const nestedDirect = getFlowText(nestedLink, "webUrl", "url", "href");
  if (nestedDirect) return nestedDirect;
  const bodyRecord = parseFlowRecord(record.body ?? record.Body ?? record.responseText);
  if (bodyRecord) return getFlowLink(bodyRecord);
  return "";
}

function parseFlowRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function describeFlowResultForLog(result: unknown) {
  const record = (result ?? {}) as Record<string, unknown>;
  return {
    keys: Object.keys(record),
    status: record.status ?? record.Status ?? record.resultado ?? record.Resultado ?? "",
    message: record.message ?? record.mensagem ?? record.error ?? record.erro ?? "",
    hasShareLink: Boolean(getFlowText(record, "shareLink")),
    hasLink: Boolean(getFlowText(record, "link")),
    hasWebUrl: Boolean(getFlowText(record, "webUrl")),
    hasUrl: Boolean(getFlowText(record, "url")),
    hasFileLink: Boolean(getFlowText(record, "fileLink")),
    hasSharedLink: Boolean(getFlowText(record, "sharedLink")),
    hasBody: Boolean(record.body ?? record.Body),
    bodyKeys: Object.keys(parseFlowRecord(record.body ?? record.Body ?? record.responseText) ?? {})
  };
}

export function requireFlowLink(result: unknown, context: Record<string, unknown>) {
  const link = getFlowLink(result);
  if (link) return link;
  dataverseError("FlowSalvarArquivosOnedrive nao retornou link compartilhavel.", {
    ...context,
    expectedKeys: ["shareLink", "link", "webUrl", "url", "fileLink", "sharedLink"],
    flowResult: describeFlowResultForLog(result)
  });
  throw new Error("Arquivo salvo no OneDrive, mas o Flow nao retornou link compartilhavel. Envio interrompido.");
}

export function getCurrentClientUrlKey() {
  return String(getWindowXrm()?.Utility?.getGlobalContext?.().getClientUrl?.() ?? "").replace(/\/+$/, "").toLowerCase();
}

export function describeFlowUrl(url: string) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const lastPath = pathParts[pathParts.length - 1] ?? "";
    return `${parsed.hostname}/${lastPath.slice(0, 12)}${lastPath.length > 12 ? "..." : ""}`;
  } catch {
    return "URL invalida";
  }
}

function describeFlowUrlForDebug(url: string) {
  try {
    const parsed = new URL(url);
    const params = Array.from(parsed.searchParams.keys());
    const redactedParams = params.length ? `?${params.join("=&")}=` : " sem query";
    return `${parsed.origin}${parsed.pathname}${redactedParams}`;
  } catch {
    return "URL invalida";
  }
}

function hasSharedAccessQuery(url: string) {
  try {
    const params = new URL(url).searchParams;
    return Boolean(params.get("sig") || params.get("code"));
  } catch {
    return false;
  }
}

function buildHttpFlowErrorMessage(envKey: string, url: string, response: Response, responseText: string) {
  const bodyPreview = responseText.trim().replace(/\s+/g, " ").slice(0, 220);
  const bodyInfo = bodyPreview ? ` Corpo: ${bodyPreview}` : " Corpo vazio.";
  const endpointInfo = `Endpoint: ${describeFlowUrl(url)}. Variavel: ${envKey}. URL usada: ${describeFlowUrlForDebug(url)}.`;
  const sharedAccessRequired = /Shared Access/i.test(responseText);
  const queryHint = hasSharedAccessQuery(url)
    ? "A URL tem query de acesso; confira se foi copiada depois de salvar/publicar o Flow."
    : "A URL esta sem sig/code. Copie a URL completa do gatilho HTTP, incluindo tudo depois de ?.";

  if (response.status === 401 || response.status === 403) {
    if (sharedAccessRequired) {
      return `Flow exige Shared Access/SAS. HTTP ${response.status} ${response.statusText || ""}. ${endpointInfo} ${queryHint}${bodyInfo}`;
    }
    return `Flow bloqueado antes da execucao. HTTP ${response.status} ${response.statusText || ""}. ${endpointInfo} Verifique URL do gatilho HTTP, query sig/code e politica de autenticacao do Flow.${bodyInfo}`;
  }

  if (response.status === 404) {
    return `Flow nao encontrado. HTTP 404. ${endpointInfo} Provavel URL antiga, Flow recriado, ambiente errado ou caminho quebrado.${bodyInfo}`;
  }

  return `Flow falhou. HTTP ${response.status} ${response.statusText || ""}. ${endpointInfo}${bodyInfo}`;
}

function getFlowText(result: unknown, ...keys: string[]) {
  const record = (result ?? {}) as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}

export function assertFlowSuccess(result: unknown, flowName: string) {
  const record = (result ?? {}) as Record<string, unknown>;
  const rawStatus = String(record.status ?? record.Status ?? record.resultado ?? record.Resultado ?? "").trim();
  if (!rawStatus) return;
  const status = normalizeText(rawStatus);
  if (status === "sucesso" || status === "success" || status === "ok") return;
  const message = String(record.message ?? record.mensagem ?? record.error ?? record.erro ?? `${flowName} retornou status ${rawStatus}`);
  dataverseError(`${flowName} retornou falha.`, {
    flowName,
    rawStatus,
    message,
    flowResult: describeFlowResultForLog(result)
  });
  throw new Error(message);
}

async function getDataverseEnvironmentVariableValue(schemaName: string) {
  const cacheKey = `${getCurrentClientUrlKey()}|${schemaName}`;
  if (flowUrlCache.has(cacheKey)) return flowUrlCache.get(cacheKey) ?? "";

  const definitionResult = await retrieveMultiple(
    "environmentvariabledefinitions",
    [
      "$select=environmentvariabledefinitionid,schemaname,defaultvalue",
      `$filter=schemaname eq '${escapeODataText(schemaName)}'`,
      "$top=1"
    ].join("&")
  );
  const definition = definitionResult.entities[0];
  if (!definition?.environmentvariabledefinitionid) {
    throw new Error(`Variavel de ambiente Dataverse nao encontrada: ${schemaName}`);
  }

  const valueResult = await retrieveMultiple(
    "environmentvariablevalues",
    [
      "$select=value",
      `$filter=_environmentvariabledefinitionid_value eq ${cleanGuid(definition.environmentvariabledefinitionid)}`,
      "$top=1"
    ].join("&")
  );
  const url = String(valueResult.entities[0]?.value ?? definition.defaultvalue ?? "").trim();
  // Valor vazio nao e cacheado: uma variavel configurada depois passa a valer sem recarregar o app.
  if (url) flowUrlCache.set(cacheKey, url);
  return url;
}

export async function resolveFlowUrl(envKey: string) {
  const dataverseSchemaName = FLOW_DATAVERSE_ENVIRONMENT_VARIABLES[envKey];
  if (dataverseSchemaName && hasDataverseRuntime()) {
    try {
      const dataverseUrl = await getDataverseEnvironmentVariableValue(dataverseSchemaName);
      if (dataverseUrl) return dataverseUrl;
      dataverseWarn("Variavel de ambiente Dataverse vazia.", { envKey, dataverseSchemaName });
    } catch (error) {
      dataverseWarn("Falha ao ler variavel de ambiente Dataverse. Usando fallback local.", {
        envKey,
        dataverseSchemaName,
        error: describeDataverseError(error)
      });
    }
  }

  const flowEnv = ((window as WindowWithFlowEnv).__APP_FLOW_ENV ?? {}) as AppResourceFlowEnv;
  return flowEnv[envKey] ?? "";
}

export class HttpFlowError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function runHttpFlow(envKey: string, payload: Record<string, unknown>) {
  const url = await resolveFlowUrl(envKey);
  if (!url) throw new Error(`URL do Flow nao configurada: ${envKey}. Configure a variavel Dataverse ou window.__APP_FLOW_ENV.`);
  const startedAt = performance.now();
  dataverseLog("Flow HTTP iniciado.", { envKey, payloadFields: Object.keys(payload) });
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    dataverseError("Flow HTTP nao recebeu resposta.", {
      envKey,
      endpoint: describeFlowUrl(url),
      urlUsada: describeFlowUrlForDebug(url),
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error(`Flow sem resposta. Variavel: ${envKey}. Endpoint: ${describeFlowUrl(url)}. URL usada: ${describeFlowUrlForDebug(url)}. Verifique CORS, rede, URL do gatilho HTTP e se a query sig/code esta completa.`);
  }
  const responseText = await response.text();
  if (!response.ok) {
    dataverseError("Flow HTTP falhou.", {
      envKey,
      endpoint: describeFlowUrl(url),
      urlUsada: describeFlowUrlForDebug(url),
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      payloadResumo: summarizeFlowPayload(payload),
      responseText
    });
    throw new HttpFlowError(buildHttpFlowErrorMessage(envKey, url, response, responseText), response.status);
  }
  dataverseLog("Flow HTTP concluido.", {
    envKey,
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    hasBody: Boolean(responseText)
  });
  if (!responseText) return {};
  try {
    return JSON.parse(responseText);
  } catch {
    dataverseWarn("Flow HTTP retornou corpo nao JSON.", {
      envKey,
      responseText
    });
    return { responseText };
  }
}

function summarizeFlowPayload(payload: Record<string, unknown>) {
  const content = typeof payload.conteudoBase64 === "string" ? payload.conteudoBase64 : "";
  return {
    caminhoCompleto: payload.caminhoCompleto ?? "",
    nomeArquivo: payload.nomeArquivo ?? "",
    mimeType: payload.mimeType ?? "",
    base64Chars: content.length,
    approxBytes: content ? Math.round((content.length * 3) / 4) : 0,
    metadados: payload.metadados ?? {}
  };
}
