import {
  flushErrorLogQueue,
  installErrorLogger,
  logAppError,
  normalizeError as normalizeLoggedError,
  pendingErrorLogs
} from "@betinhos-executive-service/ui/error-logger.js";

// Wrapper do App Motoristas sobre o logger compartilhado (@betinhos-executive-service/ui/error-logger).
// O pacote grava em new_appmotoristaslog e cuida de fila, retry, dedupe e usuário. Aqui ficam o que é só
// do app: aviso ao usuário (evento appmotoristas:error), captura de console.error e redação de e-mail/telefone.

type BuildInfo = {
  version?: string;
  builtAt?: string;
  builtAtLabel?: string;
};

type WindowWithRuntime = Window & {
  __APP_BUILD_INFO?: BuildInfo;
  __APP_ERROR_LOGGER_INSTALLED?: boolean;
  __APP_REPORT_ERROR?: (error: unknown, context?: AppErrorLogContext) => void;
};

export type AppErrorNotice = {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  source: string;
  action: string;
  phase: string;
  message: string;
  code: string;
  userMessage: string;
};

export type AppErrorLogContext = {
  severity?: "info" | "warning" | "error" | "critical";
  source?: string;
  action?: string;
  phase?: string;
  component?: string;
  screen?: string;
  detailId?: string;
  detailType?: string;
  payload?: unknown;
  notifyUser?: boolean;
};

const APP_NAME = "App Motoristas";
export const APP_OPERATION_ERROR_MESSAGE = "Ocorreu um erro na operação. Feche e reabra o aplicativo antes de tentar novamente.";
export const APP_CONNECTION_LOST_MESSAGE = "A conexão com a internet foi perdida. Feche e reabra o aplicativo antes de tentar novamente.";
const LEGACY_QUEUE_KEY = "app-motoristas-error-log-queue-v1";
const PACKAGE_QUEUE_KEY = `betinhos-error-log-queue-v1:${APP_NAME}`;
const RETRY_MS = 30000;
let configured = false;
let originalConsoleError: typeof console.error | null = null;

const REDACTED = "[redacted]";
const REDACTED_EMAIL = "[redacted-email]";
const REDACTED_PHONE = "[redacted-phone]";
const REDACTED_BASE64 = "[redacted-base64]";
const REDACTED_URL = "[redacted-url]";
const SENSITIVE_KEY_PATTERN = /(base64|conteudo|content|signature|assinatura|photo|foto|image|imagem|telefone|phone|email|mail|token|secret|senha|password|authorization|sharelink|link)/i;
const SENSITIVE_URL_HOST_PATTERN = /(sharepoint|onedrive|1drv|powerautomate|logic\.azure|flow\.microsoft|blob\.core\.windows)/i;

function redactUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (SENSITIVE_URL_HOST_PATTERN.test(parsed.hostname)) return `${parsed.origin}/${REDACTED_URL}`;
    const query = parsed.search ? "?[redacted-query]" : "";
    const hash = parsed.hash ? "#[redacted-hash]" : "";
    return `${parsed.origin}${parsed.pathname}${query}${hash}`;
  } catch {
    return REDACTED_URL;
  }
}

export function redactSensitiveLogValue(value: unknown, key = "", depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (depth > 8) return "[MaxDepth]";

  if (typeof value === "string") {
    return value
      .replace(/data:[^;,]+;base64,[A-Za-z0-9+/=\s]{40,}/gi, `data:${REDACTED_BASE64}`)
      .replace(/\b[A-Za-z0-9+/]{160,}={0,2}\b/g, REDACTED_BASE64)
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, `Bearer ${REDACTED}`)
      .replace(/((?:access_token|token|password|senha|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, `$1${REDACTED}`)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED_EMAIL)
      .replace(/(^|[^\d])((?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)9?\d{4}[\s.-]?\d{4})(?=$|[^\d])/g, (_match, prefix) => `${prefix}${REDACTED_PHONE}`)
      .replace(/https?:\/\/[^\s"'<>)]*/gi, (url) => redactUrl(url));
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveLogValue(item, key, depth + 1));
  }

  if (typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    const entries = value instanceof Error
      ? Object.entries({ ...value, name: value.name, message: value.message, stack: value.stack, cause: (value as Error & { cause?: unknown }).cause })
      : Object.entries(value as Record<string, unknown>);
    entries.forEach(([entryKey, entryValue]) => {
      redacted[entryKey] = redactSensitiveLogValue(entryValue, entryKey, depth + 1);
    });
    return redacted;
  }

  return value;
}

function safeStringify(value: unknown, maxLength = 2000) {
  try {
    return String(JSON.stringify(redactSensitiveLogValue(value)) ?? "").slice(0, maxLength);
  } catch (error) {
    return `[unserializable:${error instanceof Error ? error.message : String(error)}]`;
  }
}

function getWindowRuntime(): WindowWithRuntime | null {
  if (typeof window === "undefined") return null;
  return window as WindowWithRuntime;
}

function createEventId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Move para a fila do pacote o que ficou pendente na fila antiga do app. */
function migrateLegacyQueue() {
  try {
    const legacy: unknown = JSON.parse(globalThis.localStorage?.getItem(LEGACY_QUEUE_KEY) ?? "[]");
    if (!Array.isArray(legacy) || !legacy.length) return;
    const current: unknown = JSON.parse(globalThis.localStorage?.getItem(PACKAGE_QUEUE_KEY) ?? "[]");
    globalThis.localStorage?.setItem(PACKAGE_QUEUE_KEY, JSON.stringify([...(Array.isArray(current) ? current : []), ...legacy]));
    globalThis.localStorage?.removeItem(LEGACY_QUEUE_KEY);
  } catch { /* sem localStorage: a fila antiga fica onde está */ }
}

/**
 * Configura o pacote uma vez. Os listeners globais do pacote são removidos logo em seguida porque
 * os deste arquivo também avisam o usuário e redigem e-mail/telefone antes de gravar.
 */
function ensureConfigured() {
  if (configured) return;
  configured = true;
  migrateLegacyQueue();
  const build = getWindowRuntime()?.__APP_BUILD_INFO ?? {};
  try {
    installErrorLogger({
      appName: APP_NAME,
      appVersion: build.version ?? "",
      builtAt: build.builtAtLabel ?? build.builtAt ?? ""
    })();
  } catch { /* o logger nunca derruba o app */ }
}

function buildNoticeId(source: string, message: string, action: string, phase: string) {
  return `${source}|${action}|${phase}|${message}`.slice(0, 500);
}

function buildUserFacingMessage(message: string, code: string, context: AppErrorLogContext) {
  const normalized = message.trim();

  if (/failed to fetch|não foi possível conectar ao servidor|nao foi possivel conectar ao servidor|offline/i.test(normalized)) {
    return APP_OPERATION_ERROR_MESSAGE;
  }
  const privilegeMatch = normalized.match(/missing (prv[\w]+) privilege .* entity '([^']+)'/i);
  if (privilegeMatch) {
    const [, privilege, entityName] = privilegeMatch;
    return `Acesso negado no Power Apps. Falta permissão ${privilege} para a entidade ${entityName}. Peça para adicionar esse privilégio na role do usuário ou do time.`;
  }

  if (/powerapps\/apps\/.+\/launch/i.test(normalized) && /403/.test(normalized)) {
    return "Acesso negado ao abrir o app publicado no Power Apps. Confirme se o usuário tem role do app e permissões das tabelas exigidas.";
  }

  if (/msdyn_tour/i.test(normalized) && /403|forbidden|acesso negado/i.test(normalized)) {
    return "Acesso negado à entidade msdyn_tour. O usuário precisa de privilégio de leitura nessa tabela para o app abrir sem erro.";
  }

  if (/falha ao carregar recurso/i.test(normalized)) {
    return normalized;
  }

  if (code) {
    return `${normalized} Código: ${code}`.trim();
  }

  if (context.source === "window.unhandledrejection") return `Falha inesperada no app: ${normalized}`;
  return normalized || "Erro inesperado no app.";
}

function dispatchErrorNotice(normalized: { message: string; code: string }, context: AppErrorLogContext) {
  const runtime = getWindowRuntime();
  if (!runtime) return;
  const severity = context.severity ?? "error";
  const source = context.source ?? "app";
  const action = context.action ?? "";
  const phase = context.phase ?? "";
  const notice: AppErrorNotice = {
    id: buildNoticeId(source, normalized.message, action, phase),
    severity,
    source,
    action,
    phase,
    message: normalized.message,
    code: normalized.code,
    userMessage: buildUserFacingMessage(normalized.message, normalized.code, context)
  };
  runtime.dispatchEvent(new CustomEvent<AppErrorNotice>("appmotoristas:error", { detail: notice }));
}

export function flushAppErrorLogQueue() {
  ensureConfigured();
  return flushErrorLogQueue();
}

export function reportAppError(error: unknown, context: AppErrorLogContext = {}) {
  ensureConfigured();
  const raw = normalizeLoggedError(error);
  const normalized = {
    name: String(redactSensitiveLogValue(raw.name)),
    message: String(redactSensitiveLogValue(raw.message)),
    stack: String(redactSensitiveLogValue(raw.stack)),
    code: String(redactSensitiveLogValue(raw.code))
  };
  if (context.notifyUser !== false) dispatchErrorNotice(normalized, context);
  const redactedError = Object.assign(new Error(normalized.message), { name: normalized.name, stack: normalized.stack });
  void logAppError(redactedError, {
    severity: context.severity,
    source: context.source,
    action: context.action,
    phase: context.phase,
    component: context.component,
    screen: context.screen,
    detailId: context.detailId,
    detailType: context.detailType,
    errorCode: normalized.code,
    payload: {
      eventId: createEventId(),
      payload: redactSensitiveLogValue(context.payload ?? {}),
      // Erro original (inclusive cause) para não perder o código interno do Dataverse.
      error: redactSensitiveLogValue(error)
    }
  });
}

function errorFromConsoleArgs(args: unknown[]) {
  const firstError = args.find((item) => item instanceof Error);
  if (firstError) return firstError;
  return new Error(args.map((item) => (typeof item === "string" ? item : safeStringify(item, 2000))).join(" "));
}

function isIgnorableWindowErrorMessage(message: unknown) {
  const normalized = String(message ?? "").trim().toLowerCase();
  return normalized === "resizeobserver loop completed with undelivered notifications.";
}

export function installGlobalAppErrorLogger() {
  const runtime = getWindowRuntime();
  if (!runtime) return;
  runtime.__APP_REPORT_ERROR = reportAppError;
  if (runtime.__APP_ERROR_LOGGER_INSTALLED) return;
  runtime.__APP_ERROR_LOGGER_INSTALLED = true;
  ensureConfigured();

  runtime.addEventListener("error", ((event: Event) => {
    const resourceTarget = event.target as (EventTarget & {
      tagName?: string;
      src?: string;
      href?: string;
      currentSrc?: string;
    }) | null;
    if (resourceTarget && resourceTarget !== runtime) {
      const tagName = String(resourceTarget.tagName ?? "resource").toLowerCase();
      const resourceUrl = String(resourceTarget.currentSrc ?? resourceTarget.src ?? resourceTarget.href ?? "").trim();
      reportAppError(new Error(`Falha ao carregar recurso ${tagName}: ${resourceUrl || "desconhecido"}`), {
        severity: "error",
        source: "window.resourceerror",
        action: resourceUrl,
        phase: tagName,
        payload: {
          tagName,
          resourceUrl
        }
      });
      return;
    }

    const errorEvent = event as ErrorEvent;
    if (isIgnorableWindowErrorMessage(errorEvent.message)) return;
    reportAppError(errorEvent.error ?? errorEvent.message, {
      severity: "critical",
      source: "window.error",
      action: errorEvent.filename,
      phase: `${errorEvent.lineno}:${errorEvent.colno}`,
      payload: {
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
        colno: errorEvent.colno,
        message: errorEvent.message
      }
    });
  }) as EventListener, true);

  runtime.addEventListener("unhandledrejection", (event) => {
    reportAppError(event.reason, {
      severity: "critical",
      source: "window.unhandledrejection"
    });
  });

  originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError?.(...args);
    const text = args.map((item) => String(item)).join(" ");
    if (text.includes("[AppMotoristas:Log]") || text.includes("[AppMotoristas:Dataverse]")) return;
    reportAppError(errorFromConsoleArgs(args), {
      severity: "error",
      source: "console.error",
      payload: args
    });
  };

  runtime.addEventListener("online", () => {
    void flushErrorLogQueue();
  });
  runtime.setInterval(() => {
    if (pendingErrorLogs()) void flushErrorLogQueue();
  }, RETRY_MS);
  void flushErrorLogQueue();
}
