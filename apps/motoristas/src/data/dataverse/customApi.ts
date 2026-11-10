import { createFetchWebApi } from "./fetchWebApi.ts";

// Execução de Custom API (Action não vinculada) pelo Xrm.WebApi.online.execute, compartilhada por comunicados e termos de multa.
type XrmApi = { WebApi?: { online?: { execute?: (request: Record<string, unknown>) => Promise<Response> } } };

export type CustomApiParameters = Record<string, string | number>;

/** Mensagem para o motorista: a do servidor quando existir (ex.: "Este termo não é seu."). */
export function customApiErrorMessage(error: unknown, fallback: string) {
  const record = (error ?? {}) as { serverMessage?: unknown; message?: unknown };
  const message = String(record.serverMessage || record.message || "").trim();
  return message || fallback;
}

export async function executeCustomApi(operationName: string, parameters: CustomApiParameters): Promise<Record<string, unknown>> {
  let xrm: XrmApi | undefined;
  try { xrm = (window.parent as Window & { Xrm?: XrmApi }).Xrm; } catch { /* Parent may be cross-origin. */ }
  xrm ??= (window as Window & { Xrm?: XrmApi }).Xrm;
  let online = xrm?.WebApi?.online;
  // URL direta do web resource (host do Dataverse, sem Xrm): Action não vinculada por fetch com o cookie da sessão.
  if (!online && /\.dynamics\.com$/i.test(window.location.hostname)) online = createFetchWebApi(window.location.origin, {}).online;
  // O Xrm depende do `this`; extrair o método solto quebra com "reading '_execute'".
  const execute = online?.execute?.bind(online);
  if (!execute) throw new Error("Abra o app pelo Power Apps ou pelo link do Dataverse para registrar esta ação.");
  const parameterTypes = Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, {
    // Com "Edm.Guid" o Xrm serializa a string como 'undefined'; o servidor converte o texto para Guid.
    typeName: typeof value === "number" ? "Edm.Decimal" : "Edm.String",
    structuralProperty: 1
  }]));
  let response: Response;
  try {
    response = await execute({
      ...parameters,
      getMetadata: () => ({ boundParameter: null, operationType: 0, operationName, parameterTypes })
    });
  } catch (error) {
    // Xrm e o WebApi por fetch rejeitam com { message } já vindo do servidor.
    // Copia code/errorCode/message do erro original para quem já tratava esses campos (Comunicados).
    const message = customApiErrorMessage(error, "Falha ao registrar ação.");
    const original = error && typeof error === "object" ? { ...(error as Record<string, unknown>) } : {};
    throw Object.assign(new Error(message), original, { message, serverMessage: message, operationName, cause: error });
  }
  if (!response.ok) {
    // Guarda a resposta técnica no erro; o logger aplica a ocultação de dados sensíveis.
    const responseBody = await response.text().catch(() => "Resposta indisponível.");
    let responseDetail: unknown = responseBody.slice(0, 4000);
    try { responseDetail = JSON.parse(responseBody); } catch { /* Response may be plain text. */ }
    const serverMessage = String((responseDetail as { error?: { message?: unknown } })?.error?.message ?? "");
    throw Object.assign(new Error(`Falha ao registrar ação (${response.status}).`), {
      code: response.status,
      operationName,
      statusText: response.statusText,
      requestId: response.headers.get("x-ms-service-request-id") ?? response.headers.get("REQ_ID") ?? "",
      responseBody: responseDetail,
      serverMessage
    });
  }
  if (response.status === 204 || typeof response.json !== "function") return {};
  try { return (await response.json()) as Record<string, unknown>; } catch { return {}; }
}
