import assert from "node:assert/strict";
import test from "node:test";
import { saveVoucherRemote } from "../src/features/voucher/remoto.ts";

const id = "11111111-1111-1111-1111-111111111111";
const pending = { cr40f_status: 202410006, new_linkdovoucher: null };
const completed = { cr40f_status: 202410008, new_linkdovoucher: "https://example.com/voucher.pdf" };
const vehicle = { veiculoId: "22222222-2222-2222-2222-222222222222", placa: "RTI7G00", modelo: "Cruze", cor: "Prata", segundos: 3600, percentual: 100, cadastrado: true };
const automaticVehicle = { decisao: "automatico" as const, motivo: "acima-do-limite", totalSegundos: 3600, candidatos: [vehicle], escolhido: vehicle };

async function runVoucher(status: number, records: Record<string, unknown>[]) {
  const previousWindow = (globalThis as any).window;
  const previousFetch = globalThis.fetch;
  let posts = 0;
  let reads = 0;
  const updates: Record<string, unknown>[] = [];
  const reports: { error: unknown; context: Record<string, any> }[] = [];
  const runtime: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    setTimeout: (callback: () => void) => { callback(); return 0; },
    __APP_REPORT_ERROR: (error: unknown, context: Record<string, any>) => { reports.push({ error, context }); },
    Xrm: { WebApi: {
      retrieveRecord: async () => records[Math.min(reads++, records.length - 1)],
      retrieveMultipleRecords: async (entity: string) => ({ entities: entity === "environmentvariabledefinition"
        ? [{ environmentvariabledefinitionid: id, defaultvalue: "https://example.com/invoke?sig=secret" }]
        : [] }),
      updateRecord: async (_entity: string, _id: string, data: Record<string, unknown>) => { updates.push(data); }
    } }
  };
  runtime.parent = runtime;
  (globalThis as any).window = runtime;
  globalThis.fetch = async () => { posts++; return new Response(JSON.stringify({ id: "OS-9549" }), { status }); };
  try {
    const result = await saveVoucherRemote({
      detail: { type: "SERVICO", id: "OS-9549", title: "Serviço", fields: [], actions: [],
        dataverse: { entitySetName: "cr40f_reservadeveculoses", id, record: {} } },
      fields: { "Horário Inicial": "08:00", "Horário Final": "10:00" },
      vehicleResolution: automaticVehicle
    });
    return { result, posts, reads, updates, reports };
  } catch (error) {
    return { error, posts, reads, updates, reports };
  } finally {
    (globalThis as any).window = previousWindow;
    globalThis.fetch = previousFetch;
  }
}

test("voucher reconhece conclusão tardia após 504 sem reenviar nem sobrescrever finalização", async () => {
  const outcome = await runVoucher(504, [pending, pending, completed]);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.posts, 1);
  assert.deepEqual(outcome.updates, []);
});

test("voucher já concluído não dispara outro Flow", async () => {
  const outcome = await runVoucher(200, [completed]);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.posts, 0);
  assert.deepEqual(outcome.updates, []);
});

test("voucher antigo sem nova conclusão não comprova sucesso após timeout", async () => {
  const oldVoucher = { ...pending, new_linkdovoucher: "https://example.com/old.pdf" };
  const outcome = await runVoucher(504, [oldVoucher]);
  assert.ok(outcome.error instanceof Error);
  assert.equal(outcome.posts, 1);
  assert.deepEqual(outcome.updates, []);
});

test("voucher não transforma erro HTTP 400 em sucesso", async () => {
  const outcome = await runVoucher(400, [pending, completed]);
  assert.ok(outcome.error instanceof Error);
  assert.equal(outcome.reads, 1);
  assert.deepEqual(outcome.updates, []);
  assert.ok(outcome.reports[0].error instanceof Error);
  assert.equal((outcome.reports[0].error as Error).message, "Flow HTTP falhou.");
  assert.doesNotMatch(outcome.reports[0].context.payload.urlUsada, /secret/);
});

test("voucher com retorno HTTP normal continua atualizando status", async () => {
  const outcome = await runVoucher(200, [pending]);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.posts, 1);
  assert.equal(outcome.updates[0]?.cr40f_status, 202410008);
  assert.equal(outcome.updates[0]?.new_rascunhovoucher, null);
});

test("voucher sem comprovacao remota preserva falha e não finaliza", async () => {
  const outcome = await runVoucher(504, [pending]);
  assert.ok(outcome.error instanceof Error);
  assert.equal(outcome.posts, 1);
  assert.deepEqual(outcome.updates, []);
});

test("voucher novo comprovado no Dataverse permite finalizar após timeout", async () => {
  const outcome = await runVoucher(504, [pending, { ...pending, new_linkdovoucher: completed.new_linkdovoucher }]);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.posts, 1);
  assert.equal(outcome.updates[0]?.cr40f_status, 202410008);
});
