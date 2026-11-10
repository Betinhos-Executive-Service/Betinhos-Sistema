import assert from "node:assert/strict";
import test from "node:test";
import { executeCustomApi } from "../src/data/dataverse/customApi.ts";

type G = typeof globalThis & { window?: unknown; fetch?: unknown };

test("URL direta do Dataverse sem Xrm executa a Custom API por fetch", async () => {
  const g = globalThis as G;
  const calls: Array<{ url: string; init: any }> = [];
  const original = { window: g.window, fetch: g.fetch };
  g.window = { location: { origin: "https://org.crm2.dynamics.com", hostname: "org.crm2.dynamics.com" } };
  g.window = Object.assign(g.window as object, { parent: g.window });
  g.fetch = async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ new_FotoJson: "{}" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await executeCustomApi("new_ObterFotoPassageiro", { new_ReservaId: "a", new_PassageiroId: "b" });
    assert.equal(result.new_FotoJson, "{}");
    assert.match(calls[0].url, /^https:\/\/org\.crm2\.dynamics\.com\/api\/data\/v9\.2\/new_ObterFotoPassageiro$/);
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init.body), { new_ReservaId: "a", new_PassageiroId: "b" });
  } finally {
    g.window = original.window;
    g.fetch = original.fetch;
  }
});
