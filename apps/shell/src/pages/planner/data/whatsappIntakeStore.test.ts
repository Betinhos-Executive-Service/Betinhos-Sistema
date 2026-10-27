import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createContactFromWhatsAppIntake, seedState } from "./mock";

function input(requestId = "wa-request-1") {
  return { requestId, conversationKey: "5511999990000", senderName: "Ana", senderPhone: "+55 (11) 99999-0000", messages: [{ text: "Preciso de um traslado amanhã", direction: "inbound", sentAt: "2026-09-11T10:00:00Z" }], classification: { category: "orcamento", priority: "urgent", summary: "Solicitação de traslado", nextAction: "Confirmar origem e destino", dueDate: "2026-09-11" } };
}

function withStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) });
}

afterEach(() => { vi.unstubAllGlobals(); });

test("intake cria contato e task vinculada no mock", () => {
  withStorage();
  const result = createContactFromWhatsAppIntake(seedState(), input());
  assert.equal(result.status, "created");
  assert.ok(result.contactId);
  assert.ok(result.taskId);
  assert.equal(result.state.tasks.at(-1)!.contactId, result.contactId);
  assert.equal(result.state.tasks.at(-1)!.priority, "high");
});

test("intake repetido não duplica task", () => {
  withStorage();
  const first = createContactFromWhatsAppIntake(seedState(), input());
  const second = createContactFromWhatsAppIntake(first.state, input());
  assert.equal(second.status, "duplicate");
  assert.equal(second.state.tasks.length, first.state.tasks.length);
});

test("novo intake do mesmo telefone atualiza contato e cria nova task", () => {
  withStorage();
  const first = createContactFromWhatsAppIntake(seedState(), input());
  const second = createContactFromWhatsAppIntake(first.state, input("wa-request-2"));
  assert.equal(second.status, "updated");
  assert.equal(second.state.contacts!.filter((contact) => contact.senderPhone!.replace(/\D/g, "") === "5511999990000").length, 1);
});
