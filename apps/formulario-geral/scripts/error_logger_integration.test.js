// Error-logger compartilhado embutido no webresource.html: modo mock não grava e,
// com Xrm, grava em new_appmotoristaslog com appName, versão, data do build e aba da tela.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const loggerSource = fs.readFileSync(path.join(root, "vendor", "betinhos-error-logger.iife.js"), "utf8");

function createWindow(xrm) {
  const listeners = {};
  const storage = new Map();
  const win = {
    navigator: { userAgent: "node-test", language: "pt-BR", platform: "test", onLine: true },
    location: { href: "https://org23b93544.crm2.dynamics.com/WebResources/new_formulario_geral.html" },
    document: { referrer: "", visibilityState: "visible" },
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    Intl,
    crypto: { randomUUID: () => "sessao-teste" }
  };
  win.window = win;
  win.parent = win;
  win.globalThis = win;
  if (xrm) win.Xrm = xrm;
  vm.createContext(win);
  vm.runInContext(loggerSource, win);
  return { win, listeners, storage };
}

(async () => {
  // Modo mock: sem Xrm, nada é gravado.
  const mock = createWindow(null);
  assert.ok(mock.win.BetinhosErrorLogger, "IIFE deve expor window.BetinhosErrorLogger");
  mock.win.BetinhosErrorLogger.installErrorLogger({ appName: "Tela Formulario Geral", appVersion: "v1.15.10" });
  assert.equal(await mock.win.BetinhosErrorLogger.logAppError(new Error("mock")), "skipped", "modo mock nao grava log");

  // Dataverse: grava com os campos que a tela preenche.
  const created = [];
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => "https://org23b93544.crm2.dynamics.com",
        userSettings: { userId: "{11111111-2222-3333-4444-555555555555}", userName: "Teste" }
      })
    },
    WebApi: { createRecord: async (entity, data) => { created.push({ entity, data }); return { id: "x" }; } }
  };
  const dv = createWindow(xrm);
  dv.win.BetinhosErrorLogger.installErrorLogger({
    appName: "Tela Formulario Geral",
    appVersion: "v1.15.10",
    builtAt: "19/10/2026 21:00",
    getScreen: () => "geral",
    getUserEmail: () => "teste@exemplo.com.br"
  });
  const result = await dv.win.BetinhosErrorLogger.logAppError(new Error("falha teste"), {
    source: "toast", action: "salvar", detailId: "abc", detailType: "edicao"
  });
  assert.equal(result, "sent");
  assert.equal(created.length, 1);
  assert.equal(created[0].entity, "new_appmotoristaslog");
  const record = created[0].data;
  assert.equal(record.new_appname, "Tela Formulario Geral");
  assert.equal(record.new_appversion, "v1.15.10");
  assert.equal(record.new_builtat, "19/10/2026 21:00");
  assert.equal(record.new_screen, "geral");
  assert.equal(record.new_useremail, "teste@exemplo.com.br");
  assert.equal(record.new_detailtype, "edicao");
  assert.equal(record.new_message, "falha teste");

  // Fila antiga (formulario_geral_error_log_queue_v1) é lida pela chave do pacote.
  const legacyKey = "betinhos-error-log-queue-v1:Tela Formulario Geral";
  const queued = createWindow(xrm);
  queued.storage.set(legacyKey, JSON.stringify([{ new_name: "antigo", new_appname: "Tela Formulario Geral" }]));
  const before = created.length;
  queued.win.BetinhosErrorLogger.installErrorLogger({ appName: "Tela Formulario Geral", appVersion: "v1.15.10" });
  await queued.win.BetinhosErrorLogger.flushErrorLogQueue();
  assert.equal(created.length, before + 1, "fila pendente deve ser reenviada ao instalar");
  assert.equal(created[before].data.new_name, "antigo");

  console.log("error_logger_integration ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
