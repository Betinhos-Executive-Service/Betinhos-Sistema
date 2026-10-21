import assert from "node:assert/strict";
import test from "node:test";
import { CHECKLIST_SEND_ERROR_FALLBACK, describeChecklistSend } from "../src/lib/checklistSend.ts";
import { mockChecklistFailure } from "../src/lib/checklists.ts";

test("envio do checklist mostra a foto atual de M e o registro pendente", () => {
  const view = describeChecklistSend({ phase: "uploading", current: 2, total: 3 });
  assert.equal(view.status, "busy");
  assert.equal(view.title, "Enviando checklist");
  assert.deepEqual(view.steps, [
    { label: "Enviando foto 2 de 3", status: "active" },
    { label: "Registrar checklist", status: "pending" }
  ]);
  assert.equal(view.statusText, "Enviando foto 2 de 3");
  assert.equal(view.progress, 2 / 5);
});

test("registro do checklist marca as fotos como enviadas e avança a barra", () => {
  const view = describeChecklistSend({ phase: "registering", total: 3 });
  assert.deepEqual(view.steps.map((step) => step.status), ["done", "active"]);
  assert.equal(view.steps[0].label, "3 fotos enviadas");
  assert.equal(view.progress, 4 / 5);
});

test("checklist sem foto tem só a etapa de registro", () => {
  const view = describeChecklistSend({ phase: "registering", total: 0 });
  assert.deepEqual(view.steps, [{ label: "Registrando checklist", status: "active" }]);
  assert.equal(view.progress, 1 / 2);
});

test("sucesso do checklist completa a barra e agradece", () => {
  const view = describeChecklistSend({ phase: "done", total: 1 });
  assert.equal(view.status, "done");
  assert.equal(view.title, "Checklist enviado");
  assert.equal(view.progress, 1);
  assert.deepEqual(view.steps.map((step) => step.label), ["Foto enviada", "Checklist registrado"]);
});

test("erro do checklist explica a causa e garante que o progresso ficou salvo", () => {
  const view = describeChecklistSend({ phase: "error", total: 2, message: "Sem conexão para enviar a foto." });
  assert.equal(view.status, "error");
  assert.match(view.description, /^Sem conexão para enviar a foto\. /);
  assert.match(view.description, /fotos já enviadas continuam salvos/);
  const fallback = describeChecklistSend({ phase: "error", total: 0, message: "  " });
  assert.ok(fallback.description.startsWith(CHECKLIST_SEND_ERROR_FALLBACK));
});

test("falha simulada do checklist só aceita foto ou registro", () => {
  assert.equal(mockChecklistFailure("?mockChecklistFalha=foto"), "foto");
  assert.equal(mockChecklistFailure("?x=1&mockChecklistFalha=registro"), "registro");
  assert.equal(mockChecklistFailure("?mockChecklistFalha=tudo"), "");
  assert.equal(mockChecklistFailure(""), "");
});
