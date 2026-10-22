import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

// Web resource de OnLoad dos forms do push: leva o toque da notificação ao App Motoristas no registro certo.
type NavigateCall = { page: Record<string, unknown>; options: Record<string, unknown> };
const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function loadRedirect(options: { storage?: Record<string, string> | null; appName?: string | null } = {}) {
  const calls: NavigateCall[] = [];
  const store = options.storage === undefined ? {} : options.storage;
  const appName = options.appName === undefined ? "new_AppMotoristasv2" : options.appName;
  const sandbox: Record<string, unknown> = {
    Date,
    Promise,
    Xrm: {
      Navigation: { navigateTo: (page: Record<string, unknown>, opts: Record<string, unknown>) => { calls.push({ page, options: opts }); return Promise.resolve(); } },
      Utility: appName === null ? {} : { getGlobalContext: () => ({ getCurrentAppProperties: () => Promise.resolve({ uniqueName: appName }) }) }
    }
  };
  sandbox.window = sandbox;
  if (store) sandbox.sessionStorage = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v; } };
  runInContext(readFileSync(join(process.cwd(), "webresources", "new_appmotoristas_push_redirect.js"), "utf8"), createContext(sandbox));
  const api = (sandbox.Betinhos as { PushRedirect: { onLoad: (ctx: unknown) => Promise<unknown>; GUARD_MS: number } }).PushRedirect;
  return { api, calls, store };
}

const ctx = (entityName: string, id: string) => ({ getFormContext: () => ({ data: { entity: { getEntityName: () => entityName, getId: () => id } } }) });
// Objetos vêm do contexto do vm (outro realm): compara por JSON.
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("comunicado abre o App Motoristas no comunicado do registro", async () => {
  const { api, calls } = loadRedirect();
  await api.onLoad(ctx("new_comunicadodestinatario", `{${ID.toUpperCase()}}`));
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(calls[0].page), { pageType: "webresource", webresourceName: "new_app-motoristas-v2", data: `comunicadoId=${ID}` });
  assert.deepEqual(plain(calls[0].options), { target: 1 });
});

test("serviço abre o App Motoristas no detalhe do serviço", async () => {
  const { api, calls } = loadRedirect();
  await api.onLoad(ctx("cr40f_reservadeveculos", ID));
  assert.equal(plain(calls[0].page).data, `servicoId=${ID}&tipo=SERVICO`);
});

test("checklist de vistoria abre o App Motoristas no checklist", async () => {
  const { api, calls } = loadRedirect();
  await api.onLoad(ctx("new_checklistveiculo", ID));
  assert.equal(plain(calls[0].page).data, `checklistId=${ID}`);
});

test("termo de multa abre o App Motoristas na tela Multas", async () => {
  const { api, calls } = loadRedirect();
  await api.onLoad(ctx("new_termomulta", ID));
  assert.equal(plain(calls[0].page).data, `termoMultaId=${ID}`);
});

test("fora do App Motoristas (ex.: app Interno) não redireciona", async () => {
  const interno = loadRedirect({ appName: "cr40f_ModelDrivenBetinhos" });
  await interno.api.onLoad(ctx("cr40f_reservadeveculos", ID));
  assert.equal(interno.calls.length, 0);
  const semApi = loadRedirect({ appName: null });
  await semApi.api.onLoad(ctx("cr40f_reservadeveculos", ID));
  assert.equal(semApi.calls.length, 0);
});

test("guarda evita loop ao voltar e expira; tabela desconhecida e form sem ID são ignorados", async () => {
  const { api, calls, store } = loadRedirect();
  await api.onLoad(ctx("new_comunicadodestinatario", ID));
  await api.onLoad(ctx("new_comunicadodestinatario", ID));
  assert.equal(calls.length, 1);
  store![`betinhos:pushRedirect:${ID}`] = String(Date.now() - api.GUARD_MS - 1);
  await api.onLoad(ctx("new_comunicadodestinatario", ID));
  assert.equal(calls.length, 2);
  await api.onLoad(ctx("account", ID));
  await api.onLoad(ctx("cr40f_reservadeveculos", ""));
  assert.equal(calls.length, 2);
});

test("segue sem sessionStorage", async () => {
  const { api, calls } = loadRedirect({ storage: null });
  await api.onLoad(ctx("cr40f_reservadeveculos", ID));
  assert.equal(calls.length, 1);
});
