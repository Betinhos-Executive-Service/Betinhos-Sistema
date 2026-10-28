import assert from "node:assert/strict";
import test from "node:test";
import { decideExpenseUploadMode, type ExpenseUploadModeDependencies } from "../src/features/despesas/expenseUploadMode.ts";

function deps(overrides: Partial<ExpenseUploadModeDependencies> = {}) {
  const calls = { flowUrl: 0, schema: 0, warnings: [] as string[] };
  const value: ExpenseUploadModeDependencies = {
    hasRuntime: () => true,
    resolveAsyncFlowUrl: async () => { calls.flowUrl++; return "https://flow.example/async"; },
    assertAsyncSchema: async () => { calls.schema++; },
    warn: message => { calls.warnings.push(message); },
    ...overrides
  };
  return { value, calls };
}

test("envio assíncrono liga quando o Flow assíncrono está configurado, sem depender do ambiente", async () => {
  const h = deps();
  assert.equal(await decideExpenseUploadMode(h.value), "async");
  assert.deepEqual({ flowUrl: h.calls.flowUrl, schema: h.calls.schema }, { flowUrl: 1, schema: 1 });
});

test("sem URL do Flow assíncrono usa o envio legado do OneDrive e não consulta o schema", async () => {
  const h = deps({ resolveAsyncFlowUrl: async () => "  " });
  assert.equal(await decideExpenseUploadMode(h.value), "legacy");
  assert.equal(h.calls.schema, 0);
});

test("falha ao ler a variável do Flow cai no envio legado", async () => {
  const h = deps({ resolveAsyncFlowUrl: async () => { throw new Error("403"); } });
  assert.equal(await decideExpenseUploadMode(h.value), "legacy");
  assert.equal(h.calls.warnings.length, 1);
});

test("schema assíncrono incompleto cai no envio legado antes de criar qualquer registro", async () => {
  const h = deps({ assertAsyncSchema: async () => { throw new Error("coluna ausente"); } });
  assert.equal(await decideExpenseUploadMode(h.value), "legacy");
  assert.equal(h.calls.warnings.length, 1);
});

test("fora do Dataverse usa o caminho legado sem consultar nada", async () => {
  const h = deps({ hasRuntime: () => false });
  assert.equal(await decideExpenseUploadMode(h.value), "legacy");
  assert.deepEqual({ flowUrl: h.calls.flowUrl, schema: h.calls.schema }, { flowUrl: 0, schema: 0 });
});
