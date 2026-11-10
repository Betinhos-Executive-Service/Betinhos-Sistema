import test from "node:test";
import assert from "node:assert/strict";
import { createFetchWebApi, SESSION_EXPIRED_EVENT } from "../src/data/dataverse/fetchWebApi.ts";

type Call = { url: string; init?: RequestInit };

function installFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler({ url, init });
  };
  return calls;
}

const api = () => createFetchWebApi("https://org.crm2.dynamics.com/", { cr40f_reservadeveculos: "cr40f_reservadeveculoses" });

test("retrieveMultipleRecords usa o conjunto da entidade, $options e devolve entities/nextLink", async () => {
  const calls = installFetch(() => new Response(JSON.stringify({ value: [{ a: 1 }], "@odata.nextLink": "next" }), { status: 200 }));
  const result = await api().retrieveMultipleRecords("cr40f_reservadeveculos", "$select=cr40f_id&$top=2");
  assert.equal(calls[0].url, "https://org.crm2.dynamics.com/api/data/v9.2/cr40f_reservadeveculoses?$select=cr40f_id&$top=2");
  assert.deepEqual(result, { entities: [{ a: 1 }], nextLink: "next" });
});

test("createRecord le o id do cabecalho OData-EntityId e updateRecord faz PATCH", async () => {
  const calls = installFetch(({ init }) =>
    init?.method === "POST"
      ? new Response(null, { status: 204, headers: { "OData-EntityId": "https://org.crm2.dynamics.com/api/data/v9.2/cr40f_reservadeveculoses(ABC-1)" } })
      : new Response(null, { status: 204 })
  );
  const created = await api().createRecord("cr40f_reservadeveculos", { cr40f_trajeto: "x" });
  assert.equal(created.id, "abc-1");
  await api().updateRecord("cr40f_reservadeveculos", "{ABC-1}", { cr40f_trajeto: "y" });
  assert.equal(calls[1].init?.method, "PATCH");
  assert.equal(calls[1].url, "https://org.crm2.dynamics.com/api/data/v9.2/cr40f_reservadeveculoses(abc-1)");
});

test("entidade fora do mapa resolve o conjunto pela metadata uma vez", async () => {
  const calls = installFetch(({ url }) =>
    url.includes("EntityDefinitions")
      ? new Response(JSON.stringify({ EntitySetName: "new_coisas" }), { status: 200 })
      : new Response(JSON.stringify({ a: 1 }), { status: 200 })
  );
  const webApi = api();
  await webApi.retrieveRecord("new_coisa", "1", "$select=a");
  await webApi.retrieveRecord("new_coisa", "2");
  assert.equal(calls.filter((c) => c.url.includes("EntityDefinitions")).length, 1);
  assert.equal(calls[2].url, "https://org.crm2.dynamics.com/api/data/v9.2/new_coisas(2)");
});

test("execute: action vinculada vai no caminho do registro sem o parametro vinculado", async () => {
  const calls = installFetch(() => new Response("{}", { status: 200 }));
  await api().online.execute({
    entity: { entityType: "cr40f_reservadeveculos", id: "1" },
    new_Motivo: "m",
    getMetadata: () => ({ boundParameter: "entity", operationType: 0, operationName: "new_Confirmar", parameterTypes: {} })
  });
  assert.equal(calls[0].url, "https://org.crm2.dynamics.com/api/data/v9.2/cr40f_reservadeveculoses(1)/Microsoft.Dynamics.CRM.new_Confirmar");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { new_Motivo: "m" });
});

test("401 rejeita com mensagem de sessao expirada e avisa a janela", async () => {
  installFetch(() => new Response("", { status: 401 }));
  const events: string[] = [];
  (globalThis as any).window = { dispatchEvent: (event: Event) => events.push(event.type) };
  (globalThis as any).CustomEvent = class extends Event { detail: unknown; constructor(type: string, init?: { detail?: unknown }) { super(type); this.detail = init?.detail; } };
  await assert.rejects(api().retrieveRecord("cr40f_reservadeveculos", "1"), (error: any) => /expirou/.test(error.message) && error.status === 401);
  assert.deepEqual(events, [SESSION_EXPIRED_EVENT]);
});
