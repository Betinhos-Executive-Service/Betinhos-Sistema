/* Origem: repo Betinhos-Executive-Service/design-system-betinhos, branch main (commit ddc68ca, 19/10/2026), arquivo packages/ui/dist/error-logger.iife.js.
   Copiado sem alterações; para atualizar, copie de novo o arquivo da versão nova do pacote. */
/* @betinhos-executive-service/ui 1.11.0 · error-logger. Gerado por scripts/build-error-logger.mjs; não edite. */
"use strict";
var BetinhosErrorLogger = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/errorLogger.ts
  var errorLogger_exports = {};
  __export(errorLogger_exports, {
    ERROR_LOG_ENTITY_SET: () => ERROR_LOG_ENTITY_SET,
    ERROR_LOG_TABLE: () => ERROR_LOG_TABLE,
    buildErrorLogRecord: () => buildErrorLogRecord,
    detectDataverseRuntime: () => detectDataverseRuntime,
    flushErrorLogQueue: () => flushErrorLogQueue,
    installErrorLogger: () => installErrorLogger,
    logAppError: () => logAppError,
    logDataverseFailure: () => logDataverseFailure,
    normalizeError: () => normalizeError,
    pendingErrorLogs: () => pendingErrorLogs,
    redactSensitive: () => redactSensitive,
    resetErrorLoggerForTests: () => resetErrorLoggerForTests,
    sanitizeDataversePath: () => sanitizeDataversePath,
    setErrorLogContext: () => setErrorLogContext
  });
  var ERROR_LOG_TABLE = "new_appmotoristaslog";
  var ERROR_LOG_ENTITY_SET = "new_appmotoristaslogs";
  var API_VERSION = "v9.2";
  var MAX_LOGS_PER_SESSION = 30;
  var DEDUPE_WINDOW_MS = 6e4;
  var RETRY_MS = 3e4;
  var MAX_QUEUE = 50;
  var GLOBAL_KEY = "__BETINHOS_ERROR_LOGGER__";
  var LIMITS = {
    name: 160,
    severity: 30,
    source: 120,
    action: 180,
    phase: 120,
    component: 180,
    screen: 120,
    detailId: 120,
    detailType: 80,
    message: 2e4,
    stack: 1e5,
    errorName: 220,
    errorCode: 120,
    appName: 120,
    appVersion: 60,
    builtAt: 80,
    sessionId: 120,
    userId: 120,
    userName: 300,
    userEmail: 300,
    userDomainName: 300,
    url: 4e3,
    referrer: 4e3,
    userAgent: 4e3,
    language: 80,
    platform: 160,
    timeZone: 120,
    viewport: 80,
    visibility: 40,
    connection: 80,
    clientUrl: 500,
    isOffline: 20,
    payload: 1e5,
    raw: 1e5
  };
  var state = {
    options: null,
    context: { screen: "", userEmail: "" },
    sessionId: "",
    sentCount: 0,
    signatures: /* @__PURE__ */ new Map(),
    memoryQueue: null,
    flushing: null,
    userPromise: null,
    lastDeliveryError: ""
  };
  function win() {
    return typeof window === "undefined" ? null : window;
  }
  function detectDataverseRuntime() {
    var _a, _b, _c, _d, _e, _f;
    const current = win();
    if (!current) return null;
    const candidates = [];
    try {
      candidates.push((_a = current.parent) == null ? void 0 : _a.Xrm);
    } catch {
    }
    try {
      candidates.push(current.Xrm);
    } catch {
    }
    for (const xrm of candidates) {
      try {
        const globalContext = (_c = (_b = xrm == null ? void 0 : xrm.Utility) == null ? void 0 : _b.getGlobalContext) == null ? void 0 : _c.call(_b);
        const clientUrl = cleanUrl((_d = globalContext == null ? void 0 : globalContext.getClientUrl) == null ? void 0 : _d.call(globalContext));
        if (xrm && globalContext && clientUrl) return { clientUrl, xrm, globalContext };
      } catch {
      }
    }
    try {
      const globalContext = (_e = current.GetGlobalContext) == null ? void 0 : _e.call(current);
      const clientUrl = cleanUrl((_f = globalContext == null ? void 0 : globalContext.getClientUrl) == null ? void 0 : _f.call(globalContext));
      if (globalContext && clientUrl) return { clientUrl, xrm: null, globalContext };
    } catch {
    }
    return null;
  }
  function cleanUrl(value) {
    return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
  }
  function cleanGuid(value) {
    return String(value != null ? value : "").replace(/[{}]/g, "").toLowerCase();
  }
  var ODATA_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0"
  };
  async function getJson(url) {
    try {
      const response = await fetch(url, { credentials: "include", headers: ODATA_HEADERS });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  function getUserInfo(runtime) {
    if (state.userPromise) return state.userPromise;
    state.userPromise = (async () => {
      var _a, _b, _c, _d, _e;
      let settings = {};
      try {
        settings = (_a = runtime.globalContext.userSettings) != null ? _a : {};
      } catch {
      }
      const info = { userId: cleanGuid(settings == null ? void 0 : settings.userId), userName: String((_b = settings == null ? void 0 : settings.userName) != null ? _b : ""), userEmail: "", userDomainName: "" };
      if (typeof fetch !== "function") return info;
      const api = `${runtime.clientUrl}/api/data/${API_VERSION}`;
      if (!info.userId) {
        const whoAmI = await getJson(`${api}/WhoAmI`);
        info.userId = cleanGuid(whoAmI == null ? void 0 : whoAmI.UserId);
      }
      if (!info.userId) return info;
      const user = await getJson(`${api}/systemusers(${info.userId})?$select=internalemailaddress,fullname,domainname`);
      if (user) {
        info.userName = String((_c = user.fullname) != null ? _c : info.userName);
        info.userEmail = String((_d = user.internalemailaddress) != null ? _d : "");
        info.userDomainName = String((_e = user.domainname) != null ? _e : "");
      }
      return info;
    })().catch(() => ({ userId: "", userName: "", userEmail: "", userDomainName: "" }));
    return state.userPromise;
  }
  var REDACTED = "[redacted]";
  var SENSITIVE_KEY = /(base64|conteudo|content|signature|assinatura|photo|foto|image|imagem|token|secret|senha|password|authorization|sharelink|cookie)/i;
  var SENSITIVE_HOST = /(sharepoint|onedrive|1drv|powerautomate|logic\.azure|flow\.microsoft|blob\.core\.windows)/i;
  function redactUrl(value) {
    try {
      const parsed = new URL(value);
      if (SENSITIVE_HOST.test(parsed.hostname)) return `${parsed.origin}/[redacted-url]`;
      return `${parsed.origin}${parsed.pathname}${parsed.search ? "?[redacted-query]" : ""}${parsed.hash ? "#[redacted-hash]" : ""}`;
    } catch {
      return "[redacted-url]";
    }
  }
  function redactSensitive(value, key = "", depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
    if (value === null || value === void 0) return value;
    if (key && SENSITIVE_KEY.test(key)) return REDACTED;
    if (typeof value === "string") {
      return value.replace(/data:[^;,]+;base64,[A-Za-z0-9+/=\s]{40,}/gi, "data:[redacted-base64]").replace(/\b[A-Za-z0-9+/]{160,}={0,2}/g, "[redacted-base64]").replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`).replace(/((?:access_token|token|password|senha|secret|authorization)\s*[=:]\s*)[^\s,;&"]+/gi, `$1${REDACTED}`).replace(/https?:\/\/[^\s"'<>)]*/gi, redactUrl);
    }
    if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
    if (typeof value !== "object") return value;
    if (depth > 8) return "[MaxDepth]";
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactSensitive(item, key, depth + 1, seen));
    const source = value instanceof Error ? { ...value, name: value.name, message: value.message, stack: value.stack, cause: value.cause } : value;
    const result = {};
    for (const [entryKey, entry] of Object.entries(source)) result[entryKey] = redactSensitive(entry, entryKey, depth + 1, seen);
    return result;
  }
  function stringify(value, limit) {
    var _a;
    try {
      return truncate((_a = JSON.stringify(redactSensitive(value))) != null ? _a : "", limit);
    } catch (error) {
      return `[unserializable:${error instanceof Error ? error.message : String(error)}]`;
    }
  }
  function truncate(value, limit) {
    const text = String(value != null ? value : "");
    return text.length <= limit ? text : text.slice(0, limit);
  }
  function clean(value, limit) {
    return truncate(redactSensitive(String(value != null ? value : "")), limit);
  }
  function normalizeError(error, depth = 0) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    if (error instanceof Error) {
      const record = error;
      const cause = depth < 4 && record.cause ? normalizeError(record.cause, depth + 1) : null;
      return {
        name: error.name || "Error",
        message: error.message || "Erro sem mensagem.",
        stack: error.stack || String(error),
        code: String((_c = (_b = (_a = record.errorCode) != null ? _a : record.code) != null ? _b : cause == null ? void 0 : cause.code) != null ? _c : "")
      };
    }
    if (typeof error === "string") return { name: "Error", message: error || "Erro sem mensagem.", stack: "", code: "" };
    if (error && typeof error === "object") {
      const record = error;
      const nested = depth < 4 && record.error && typeof record.error === "object" ? normalizeError(record.error, depth + 1) : null;
      let fallback = "";
      try {
        fallback = (_d = JSON.stringify(error)) != null ? _d : "";
      } catch {
        fallback = String(error);
      }
      return {
        name: String((_f = (_e = record.name) != null ? _e : nested == null ? void 0 : nested.name) != null ? _f : "UnknownError"),
        message: String((_i = (_h = (_g = record.message) != null ? _g : nested == null ? void 0 : nested.message) != null ? _h : fallback) != null ? _i : "Erro desconhecido."),
        stack: String((_k = (_j = record.stack) != null ? _j : nested == null ? void 0 : nested.stack) != null ? _k : ""),
        code: String((_n = (_m = (_l = record.errorCode) != null ? _l : record.code) != null ? _m : nested == null ? void 0 : nested.code) != null ? _n : "")
      };
    }
    return { name: "UnknownError", message: String(error != null ? error : "Erro desconhecido."), stack: "", code: "" };
  }
  function sanitizeDataversePath(path) {
    return String(path || "").replace(/^https?:\/\/[^/]+/i, "").replace(/^\/api\/data\/v\d+(\.\d+)?/i, "").split("?")[0].replace(/\(\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?\)/gi, "(id)");
  }
  function getSessionId() {
    var _a, _b, _c;
    if (!state.sessionId) {
      state.sessionId = (_c = (_b = (_a = globalThis.crypto) == null ? void 0 : _a.randomUUID) == null ? void 0 : _b.call(_a)) != null ? _c : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    return state.sessionId;
  }
  function safeCall(fn) {
    var _a;
    try {
      return (_a = fn == null ? void 0 : fn()) != null ? _a : "";
    } catch {
      return "";
    }
  }
  function buildErrorLogRecord(error, details, env) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
    const options = state.options;
    const appName = (options == null ? void 0 : options.appName) || "App sem nome";
    const normalized = normalizeError(error);
    const severity = (_a = details.severity) != null ? _a : "error";
    const action = details.action || "runtime-error";
    const source = details.source || "app";
    const screen = details.screen || state.context.screen || safeCall(options == null ? void 0 : options.getScreen);
    const userEmail = state.context.userEmail || safeCall(options == null ? void 0 : options.getUserEmail) || env.user.userEmail;
    const errorCode = (_b = details.errorCode) != null ? _b : normalized.code;
    const current = win();
    const nav = current == null ? void 0 : current.navigator;
    let timeZone = "";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
    }
    return {
      new_name: clean(`${appName} | ${severity} | ${action} | ${normalized.message}`, LIMITS.name),
      new_occurredat: env.now,
      new_severity: truncate(severity, LIMITS.severity),
      new_source: clean(source, LIMITS.source),
      new_action: clean(action, LIMITS.action),
      new_phase: clean(details.phase || "runtime", LIMITS.phase),
      new_component: clean(details.component || appName, LIMITS.component),
      new_screen: clean(screen, LIMITS.screen),
      new_detailid: clean(details.detailId, LIMITS.detailId),
      new_detailtype: clean(details.detailType, LIMITS.detailType),
      new_message: clean(normalized.message, LIMITS.message),
      new_stack: clean(normalized.stack, LIMITS.stack),
      new_errorname: clean(normalized.name, LIMITS.errorName),
      new_errorcode: clean(errorCode, LIMITS.errorCode),
      new_appname: truncate(appName, LIMITS.appName),
      new_appversion: truncate((_c = options == null ? void 0 : options.appVersion) != null ? _c : "", LIMITS.appVersion),
      new_builtat: truncate((_d = options == null ? void 0 : options.builtAt) != null ? _d : "", LIMITS.builtAt),
      new_sessionid: truncate(getSessionId(), LIMITS.sessionId),
      new_userid: truncate(env.user.userId, LIMITS.userId),
      new_username: truncate(env.user.userName, LIMITS.userName),
      new_useremail: truncate(userEmail, LIMITS.userEmail),
      new_userdomainname: truncate(env.user.userDomainName, LIMITS.userDomainName),
      new_clienturl: truncate((_f = (_e = env.runtime) == null ? void 0 : _e.clientUrl) != null ? _f : "", LIMITS.clientUrl),
      new_url: clean((_g = current == null ? void 0 : current.location) == null ? void 0 : _g.href, LIMITS.url),
      new_referrer: clean((_h = current == null ? void 0 : current.document) == null ? void 0 : _h.referrer, LIMITS.referrer),
      new_useragent: truncate((_i = nav == null ? void 0 : nav.userAgent) != null ? _i : "", LIMITS.userAgent),
      new_language: truncate((_j = nav == null ? void 0 : nav.language) != null ? _j : "", LIMITS.language),
      new_platform: truncate((_k = nav == null ? void 0 : nav.platform) != null ? _k : "", LIMITS.platform),
      new_timezone: truncate(timeZone, LIMITS.timeZone),
      new_viewport: (current == null ? void 0 : current.innerWidth) ? truncate(`${current.innerWidth}x${current.innerHeight}@${current.devicePixelRatio || 1}`, LIMITS.viewport) : "",
      new_visibilitystate: truncate((_m = (_l = current == null ? void 0 : current.document) == null ? void 0 : _l.visibilityState) != null ? _m : "", LIMITS.visibility),
      new_connectiontype: truncate((_q = (_p = (_n = nav == null ? void 0 : nav.connection) == null ? void 0 : _n.effectiveType) != null ? _p : (_o = nav == null ? void 0 : nav.connection) == null ? void 0 : _o.type) != null ? _q : "", LIMITS.connection),
      new_isoffline: (nav == null ? void 0 : nav.onLine) === false ? "true" : "false",
      new_payloadjson: stringify((_r = details.payload) != null ? _r : {}, LIMITS.payload),
      new_rawjson: stringify({ error: normalized, details: { ...details, payload: void 0 }, occurredAt: env.now, delivery: { pending: readQueue().length, lastError: state.lastDeliveryError } }, LIMITS.raw)
    };
  }
  function queueKey() {
    var _a, _b;
    return `betinhos-error-log-queue-v1:${(_b = (_a = state.options) == null ? void 0 : _a.appName) != null ? _b : "app"}`;
  }
  function readQueue() {
    var _a, _b;
    if (state.memoryQueue) return state.memoryQueue;
    try {
      const parsed = JSON.parse((_b = (_a = globalThis.localStorage) == null ? void 0 : _a.getItem(queueKey())) != null ? _b : "[]");
      state.memoryQueue = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
    } catch {
      state.memoryQueue = [];
    }
    return state.memoryQueue;
  }
  function writeQueue(items) {
    var _a;
    state.memoryQueue = items.slice(-MAX_QUEUE);
    try {
      (_a = globalThis.localStorage) == null ? void 0 : _a.setItem(queueKey(), JSON.stringify(state.memoryQueue));
    } catch {
    }
  }
  function pendingErrorLogs() {
    return readQueue().length;
  }
  async function send(runtime, record) {
    var _a, _b;
    const createRecord = (_b = (_a = runtime.xrm) == null ? void 0 : _a.WebApi) == null ? void 0 : _b.createRecord;
    if (typeof createRecord === "function") {
      await createRecord.call(runtime.xrm.WebApi, ERROR_LOG_TABLE, record);
      return;
    }
    const response = await fetch(`${runtime.clientUrl}/api/data/${API_VERSION}/${ERROR_LOG_ENTITY_SET}`, {
      method: "POST",
      credentials: "include",
      keepalive: JSON.stringify(record).length < 6e4,
      headers: ODATA_HEADERS,
      body: JSON.stringify(record)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
  function flushErrorLogQueue() {
    if (state.flushing) return state.flushing;
    const runtime = detectDataverseRuntime();
    if (!runtime || !readQueue().length) return Promise.resolve();
    state.flushing = (async () => {
      for (let item = readQueue()[0]; item; item = readQueue()[0]) {
        try {
          await send(runtime, item);
          writeQueue(readQueue().filter((pending) => pending !== item));
          state.lastDeliveryError = "";
        } catch (error) {
          state.lastDeliveryError = truncate(normalizeError(error).message, 500);
          break;
        }
      }
    })().catch(() => void 0).finally(() => {
      state.flushing = null;
    });
    return state.flushing;
  }
  function setErrorLogContext(next = {}) {
    if (typeof next.screen === "string") state.context.screen = next.screen;
    if (typeof next.userEmail === "string") state.context.userEmail = next.userEmail;
  }
  function shouldSend(signature, now) {
    if (state.sentCount >= MAX_LOGS_PER_SESSION) return false;
    const last = state.signatures.get(signature);
    if (last !== void 0 && now - last < DEDUPE_WINDOW_MS) return false;
    state.signatures.set(signature, now);
    state.sentCount += 1;
    return true;
  }
  async function logAppError(error, details = {}) {
    try {
      const runtime = detectDataverseRuntime();
      if (!runtime) return "skipped";
      const normalized = normalizeError(error);
      if (!shouldSend(`${details.action || ""}|${normalized.message}`, Date.now())) return "skipped";
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const user = await getUserInfo(runtime);
      const record = buildErrorLogRecord(error, details, { runtime, user, now });
      writeQueue([...readQueue(), record]);
      await flushErrorLogQueue();
      return readQueue().includes(record) ? "queued" : "sent";
    } catch {
      return "skipped";
    }
  }
  function logDataverseFailure(failure) {
    var _a, _b, _c, _d, _e, _f;
    try {
      const method = (failure.method || "GET").toUpperCase();
      const route = sanitizeDataversePath(failure.path);
      const body = failure.body;
      const isNetwork = failure.status === void 0;
      const message = isNetwork ? `Falha de rede em ${method} ${route}: ${normalizeError(failure.error).message}` : String((_b = (_a = body == null ? void 0 : body.error) == null ? void 0 : _a.message) != null ? _b : `HTTP ${failure.status} em ${method} ${route}`);
      const error = new Error(message);
      error.name = isNetwork ? "NetworkError" : "DataverseError";
      if (isNetwork && failure.error instanceof Error && failure.error.stack) error.stack = failure.error.stack;
      return logAppError(error, {
        source: "Dataverse",
        action: `${method} ${route}`,
        phase: "dataverse",
        component: failure.component || "request",
        errorCode: isNetwork ? "network" : String((_d = (_c = body == null ? void 0 : body.error) == null ? void 0 : _c.code) != null ? _d : failure.status),
        detailId: failure.detailId,
        detailType: failure.detailType,
        severity: failure.severity,
        payload: { method, route, status: (_e = failure.status) != null ? _e : null, body: (_f = failure.body) != null ? _f : null }
      });
    } catch {
      return Promise.resolve("skipped");
    }
  }
  function isIgnorableMessage(message) {
    return /^resizeobserver loop (limit exceeded|completed with undelivered notifications)/i.test(String(message != null ? message : "").trim());
  }
  function installErrorLogger(options) {
    state.options = { ...options };
    state.memoryQueue = null;
    const target = win();
    if (!target) return () => void 0;
    const existing = target[GLOBAL_KEY];
    if (existing) return existing.uninstall;
    const onError = (event) => {
      var _a, _b;
      const element = event.target;
      if (element && element !== target && element.tagName) {
        const tag = String(element.tagName).toLowerCase();
        const url = String(element.currentSrc || element.src || element.href || "");
        void logAppError(new Error(`Falha ao carregar recurso ${tag}: ${url ? redactUrl(url) : "desconhecido"}`), {
          source: "window.resourceerror",
          action: `resource ${tag}`,
          phase: "load",
          component: tag,
          payload: { tag, url }
        });
        return;
      }
      const errorEvent = event;
      if (isIgnorableMessage(errorEvent.message) || isIgnorableMessage((_a = errorEvent.error) == null ? void 0 : _a.message)) return;
      void logAppError((_b = errorEvent.error) != null ? _b : errorEvent.message, {
        severity: "critical",
        source: "window.error",
        action: "window.error",
        phase: "global",
        component: "window",
        payload: { filename: errorEvent.filename, lineno: errorEvent.lineno, colno: errorEvent.colno }
      });
    };
    const onRejection = (event) => {
      void logAppError(event.reason, {
        severity: "critical",
        source: "window.unhandledrejection",
        action: "unhandledrejection",
        phase: "global",
        component: "window"
      });
    };
    const onOnline = () => {
      void flushErrorLogQueue();
    };
    target.addEventListener("error", onError, true);
    target.addEventListener("unhandledrejection", onRejection);
    target.addEventListener("online", onOnline);
    const timer = target.setInterval(() => {
      if (readQueue().length) void flushErrorLogQueue();
    }, RETRY_MS);
    void flushErrorLogQueue();
    const installed = {
      uninstall: () => {
        target.removeEventListener("error", onError, true);
        target.removeEventListener("unhandledrejection", onRejection);
        target.removeEventListener("online", onOnline);
        target.clearInterval(timer);
        if (target[GLOBAL_KEY] === installed) delete target[GLOBAL_KEY];
      }
    };
    target[GLOBAL_KEY] = installed;
    return installed.uninstall;
  }
  function resetErrorLoggerForTests() {
    state.options = null;
    state.context = { screen: "", userEmail: "" };
    state.sessionId = "";
    state.sentCount = 0;
    state.signatures.clear();
    state.memoryQueue = null;
    state.flushing = null;
    state.userPromise = null;
    state.lastDeliveryError = "";
  }
  return __toCommonJS(errorLogger_exports);
})();
