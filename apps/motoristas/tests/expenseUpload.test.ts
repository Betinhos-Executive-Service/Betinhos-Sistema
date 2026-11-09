import assert from "node:assert/strict";
import test from "node:test";
import { describeExpenseSubmission, normalizeStoredExpenseSubmissions, summarizeExpenseUploads, type ExpenseSubmission, type ExpenseUploadRow } from "../src/features/despesas/expenseUploadState.ts";
import { resumeExpenseSubmission, type ExpenseSubmissionDependencies } from "../src/features/despesas/expenseSubmission.ts";

function harness() {
  const submission: ExpenseSubmission = {
    expenseId: crypto.randomUUID(), expenseConfirmed: false, draft: {} as ExpenseSubmission["draft"], payload: {}, motoristaId: crypto.randomUUID(),
    items: [{ id: crypto.randomUUID(), attemptId: crypto.randomUUID(), dataUrl: "data:image/jpeg;base64,AA==", mimeType: "image/jpeg", fileName: "comprovante-1.jpg", order: 1, dispatchStarted: false }]
  };
  let journal = structuredClone(submission);
  const rows: ExpenseUploadRow[] = [];
  let creates = 0;
  let dispatches = 0;
  const deps: ExpenseSubmissionDependencies = {
    save: async value => { journal = structuredClone(value); },
    ensure: async value => {
      if (!rows.length) { creates++; rows.push({ cr40f_anexodespesaoperacionalid: value.items[0].id, new_uploadattemptid: value.items[0].attemptId, cr40f_status: 100000000 }); }
    },
    loadRows: async () => structuredClone(rows),
    retry: async (id, previous, next) => { const row = rows.find(row => row.cr40f_anexodespesaoperacionalid === id && row.new_uploadattemptid === previous)!; row.new_uploadattemptid = next; row.cr40f_status = 100000000; },
    dispatch: async item => { assert.equal(journal.items[0].dispatchStarted, true); assert.equal(journal.items[0].id, item.id); dispatches++; },
    report: () => undefined
  };
  return { submission, deps, rows, journal: () => structuredClone(journal), counts: () => ({ creates, dispatches }) };
}

test("falha ao persistir impede qualquer criação ou upload", async () => {
  const h = harness(); h.deps.save = async () => { throw new Error("quota"); };
  await assert.rejects(resumeExpenseSubmission(h.submission, h.deps), /quota/);
  assert.deepEqual(h.counts(), { creates: 0, dispatches: 0 });
});

test("resposta de criação perdida reutiliza IDs ao reabrir", async () => {
  const h = harness(); const ensure = h.deps.ensure;
  h.deps.ensure = async value => { await ensure(value); throw new Error("resposta perdida"); };
  await assert.rejects(resumeExpenseSubmission(h.submission, h.deps));
  h.deps.ensure = ensure;
  await resumeExpenseSubmission(h.journal(), h.deps);
  assert.deepEqual(h.counts(), { creates: 1, dispatches: 1 });
});

test("timeout de aceitação não reenvia automaticamente após reabertura", async () => {
  const h = harness(); const dispatch = h.deps.dispatch;
  h.deps.dispatch = async item => { await dispatch(item); throw new Error("504"); };
  await resumeExpenseSubmission(h.submission, h.deps);
  await resumeExpenseSubmission(h.journal(), h.deps);
  assert.deepEqual(h.counts(), { creates: 1, dispatches: 1 });
  assert.equal(summarizeExpenseUploads(h.submission.items, h.rows).canRetry, false);
});

test("upload demorado permanece pendente e conclusão tardia é reconhecida", async () => {
  const h = harness(); await resumeExpenseSubmission(h.submission, h.deps);
  h.rows[0].cr40f_status = 100000004;
  assert.equal(summarizeExpenseUploads(h.submission.items, h.rows).pending, 1);
  h.rows[0].cr40f_status = 100000001;
  assert.equal(summarizeExpenseUploads(h.journal().items, h.rows).complete, true);
});

test("nova tentativa exige falha confirmada e preserva a despesa", async () => {
  const h = harness(); await resumeExpenseSubmission(h.submission, h.deps);
  h.rows[0].cr40f_status = 100000002;
  const expenseId = h.submission.expenseId; const previous = h.submission.items[0].attemptId;
  await resumeExpenseSubmission(h.submission, h.deps, true);
  assert.equal(h.submission.expenseId, expenseId);
  assert.notEqual(h.submission.items[0].attemptId, previous);
  assert.deepEqual(h.counts(), { creates: 1, dispatches: 2 });
});

test("resposta de retry perdida é reconciliada antes do envio", async () => {
  const h = harness(); await resumeExpenseSubmission(h.submission, h.deps); h.rows[0].cr40f_status = 100000002;
  const retry = h.deps.retry;
  h.deps.retry = async (...args) => { await retry(...args); throw new Error("resposta perdida"); };
  await assert.rejects(resumeExpenseSubmission(h.submission, h.deps, true));
  h.deps.retry = retry;
  await resumeExpenseSubmission(h.journal(), h.deps);
  assert.deepEqual(h.counts(), { creates: 1, dispatches: 2 });
});

test("comprovante ausente ou de tentativa antiga nunca conta como completo", () => {
  const h = harness();
  assert.equal(summarizeExpenseUploads(h.submission.items, []).complete, false);
  const stale = { cr40f_anexodespesaoperacionalid: h.submission.items[0].id, cr40f_status: 100000001, new_uploadattemptid: crypto.randomUUID() };
  assert.equal(summarizeExpenseUploads(h.submission.items, [stale]).complete, false);
});

test("falha de um arquivo mantém os concluídos e bloqueia retry enquanto outro processa", () => {
  const h = harness(); h.submission.items.push({ ...h.submission.items[0], id: crypto.randomUUID(), attemptId: crypto.randomUUID() });
  const rows = h.submission.items.map(item => ({ cr40f_anexodespesaoperacionalid: item.id, new_uploadattemptid: item.attemptId, cr40f_status: 100000002 }));
  rows[1].cr40f_status = 100000004;
  assert.equal(summarizeExpenseUploads(h.submission.items, rows).canRetry, false);
  rows[1].cr40f_status = 100000001;
  assert.deepEqual(summarizeExpenseUploads(h.submission.items, rows), { sent: 1, failed: 1, pending: 0, complete: false, canRetry: true });
});

test("fila restaura envio único legado e lista nova", async () => {
  const h = harness();
  assert.deepEqual(normalizeStoredExpenseSubmissions(null), []);
  assert.equal(normalizeStoredExpenseSubmissions(h.submission)[0].expenseId, h.submission.expenseId);
  assert.equal(normalizeStoredExpenseSubmissions({ submissions: [h.submission, h.submission] }).length, 2);
});

test("status do envio orienta a próxima ação do motorista", async () => {
  const h = harness();
  assert.equal(describeExpenseSubmission(h.submission, h.rows).action, "continue");
  await resumeExpenseSubmission(h.submission, h.deps);
  assert.equal(describeExpenseSubmission(h.submission, h.rows).action, "verify");
  h.rows[0].cr40f_status = 100000004;
  assert.deepEqual(describeExpenseSubmission(h.submission, h.rows), { state: "processing", text: "Anexando comprovante." });
  h.rows[0].cr40f_status = 100000002;
  assert.equal(describeExpenseSubmission(h.submission, h.rows).action, "retry");
  h.rows[0].cr40f_status = 100000001;
  assert.equal(describeExpenseSubmission(h.submission, h.rows).state, "complete");
});

test("progresso informa criação e envio do comprovante", async () => {
  const h = harness(); const events: unknown[] = [];
  h.deps.progress = event => events.push(event);
  await resumeExpenseSubmission(h.submission, h.deps);
  assert.deepEqual(events, [{ phase: "creating" }, { phase: "uploading", order: 1, total: 1 }]);
});
