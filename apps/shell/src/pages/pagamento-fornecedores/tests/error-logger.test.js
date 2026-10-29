import assert from "node:assert/strict";
import { test, vi } from 'vitest';
import { APP_VERSION_LABEL } from "../build-info.js";

const loadWrapper = () =>
  (vi.resetModules(), import('../lib/error-logger.js'));

test("fora do Dynamics o logger não grava e não lança", async () => {
  const { logError } = await loadWrapper();
  assert.equal(await logError(new Error("mock")), "skipped");
});

test("no Dynamics grava appName, versão, tela, e-mail e errorCode do status", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const created = [];
  const listeners = {};
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes("WhoAmI")
        ? { UserId: "11111111-1111-1111-1111-111111111111" }
        : { internalemailaddress: "teste@betinhos.com.br", fullname: "Teste", domainname: "teste" },
  });
  globalThis.window = {
    location: { href: "https://org.crm2.dynamics.com/WebResources/x.html" },
    navigator: { userAgent: "node", language: "pt-BR", onLine: true },
    addEventListener: (name, fn) => (listeners[name] = fn),
    removeEventListener: () => undefined,
    setInterval: () => 1,
    clearInterval: () => undefined,
    Xrm: {
      Utility: { getGlobalContext: () => ({ getClientUrl: () => "https://org.crm2.dynamics.com", userSettings: {} }) },
      WebApi: { createRecord: async (entity, record) => created.push({ entity, record }) },
    },
  };
  try {
    const { installPaymentErrorLogger, logError, setErrorLogContext, ERROR_LOG_APP_NAME } = await loadWrapper();
    const uninstall = installPaymentErrorLogger({ clientUrl: "https://org.crm2.dynamics.com", contextSource: "xrm" });
    assert.equal(typeof listeners.error, "function");
    setErrorLogContext({ screen: "lots" });
    const error = Object.assign(new Error("teste sintético"), { status: 412 });
    assert.equal(await logError(error, { action: "Teste", phase: "ui.action", payload: { a: 1 } }), "sent");
    const [{ entity, record }] = created;
    assert.equal(entity, "new_appmotoristaslog");
    assert.equal(record.new_appname, ERROR_LOG_APP_NAME);
    assert.equal(record.new_appversion, APP_VERSION_LABEL.split(" ")[0]);
    assert.equal(record.new_screen, "lots");
    assert.equal(record.new_useremail, "teste@betinhos.com.br");
    assert.equal(record.new_errorcode, "412");
    assert.equal(record.new_component, "DataverseClient");
    uninstall();
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
