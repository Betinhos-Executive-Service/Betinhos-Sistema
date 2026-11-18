import test from "node:test";
import assert from "node:assert/strict";
import { retrieveMultiple } from "../src/data/dataverse/cliente.ts";
import { executeCustomApi } from "../src/data/dataverse/customApi.ts";

// Dentro do model-driven o Xrm.WebApi do Power Apps travava sem responder (PROD, 12/11/2026):
// no host do Dataverse os dados e as Custom APIs vão por fetch, como na URL direta.
test("no model-driven os dados vão por fetch mesmo com Xrm.WebApi do parent travado", async () => {
  const previousWindow = (globalThis as any).window;
  const previousFetch = globalThis.fetch;
  const hang = () => new Promise(() => {});
  const xrm = { WebApi: { retrieveMultipleRecords: hang, online: { execute: hang } }, Utility: { getGlobalContext: () => ({ userSettings: { userId: "" }, getClientUrl: () => "https://org.crm2.dynamics.com" }) } };
  (globalThis as any).window = { location: { origin: "https://org.crm2.dynamics.com", hostname: "org.crm2.dynamics.com" }, parent: { Xrm: xrm } };
  const urls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    urls.push(url);
    return url.includes("cr40f_AcaoTeste") ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response(JSON.stringify({ value: [{ a: 1 }] }), { status: 200 });
  };
  try {
    const result = await retrieveMultiple("cr40f_reservadeveculoses", "$top=1");
    assert.deepEqual(result.entities, [{ a: 1 }]);
    assert.deepEqual(await executeCustomApi("cr40f_AcaoTeste", { cr40f_Id: "x" }), { ok: true });
    assert.ok(urls.every((url) => url.startsWith("https://org.crm2.dynamics.com/api/data/v9.2/")), urls.join(" "));
  } finally {
    (globalThis as any).window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
