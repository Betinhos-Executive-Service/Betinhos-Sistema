import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

// Web resource de form do destinatário: leva o push do comunicado ao App Motoristas com o ID certo.
type NavigateCall = { page: Record<string, unknown>; options: Record<string, unknown> };

function loadRedirect(sessionStorage: Record<string, string> | null) {
  const calls: NavigateCall[] = [];
  const storage = sessionStorage === null ? undefined : {
    getItem: (key: string) => (key in sessionStorage ? sessionStorage[key] : null),
    setItem: (key: string, value: string) => { sessionStorage[key] = value; }
  };
  const sandbox: Record<string, unknown> = {
    Date,
    Xrm: { Navigation: { navigateTo: (page: Record<string, unknown>, options: Record<string, unknown>) => { calls.push({ page, options }); return Promise.resolve(); } } }
  };
  sandbox.window = sandbox;
  if (storage) sandbox.sessionStorage = storage;
  const context = createContext(sandbox);
  runInContext(readFileSync(join(process.cwd(), "webresources", "new_comunicadodestinatario_redirect.js"), "utf8"), context);
  const api = (sandbox.Betinhos as { ComunicadoRedirect: { onLoad: (ctx: unknown) => unknown; GUARD_MS: number } }).ComunicadoRedirect;
  return { api, calls };
}

const executionContext = (id: string) => ({ getFormContext: () => ({ data: { entity: { getId: () => id } } }) });

test("onLoad abre o App Motoristas no comunicado do registro", () => {
  const { api, calls } = loadRedirect({});
  api.onLoad(executionContext("{3F2504E0-4F89-11D3-9A0C-0305E82C3301}"));
  assert.equal(calls.length, 1);
  // Objetos vêm do contexto do vm (outro realm): compara por JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].page)), {
    pageType: "webresource",
    webresourceName: "new_app-motoristas-v2",
    data: "comunicadoId=3f2504e0-4f89-11d3-9a0c-0305e82c3301"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options)), { target: 1 });
});

test("onLoad nao redireciona de novo no mesmo registro dentro da janela de guarda", () => {
  const storage: Record<string, string> = {};
  const { api, calls } = loadRedirect(storage);
  api.onLoad(executionContext("3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
  api.onLoad(executionContext("3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
  assert.equal(calls.length, 1);
  storage["betinhos:comunicadoRedirect:3f2504e0-4f89-11d3-9a0c-0305e82c3301"] = String(Date.now() - api.GUARD_MS - 1);
  api.onLoad(executionContext("3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
  assert.equal(calls.length, 2);
});

test("onLoad ignora form sem registro e segue sem sessionStorage", () => {
  const { api, calls } = loadRedirect(null);
  api.onLoad(executionContext(""));
  assert.equal(calls.length, 0);
  api.onLoad(executionContext("3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
  assert.equal(calls.length, 1);
});
