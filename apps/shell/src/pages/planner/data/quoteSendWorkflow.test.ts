import { afterEach, test, vi } from "vitest";
import { createQuoteWithLegacyTask } from "./legacyQuoteTask.fixture";
import assert from "node:assert/strict";
import { markQuoteSent, seedState, setQuoteOutcome, updateQuote, updateTask } from "./mock";
import { buildQuoteEmailHtml, buildQuotePlainText } from "../domain/quoteDomain";

const send = { channel: "WhatsApp", recipient: "+55 11 99999-9999", sentAt: "2026-09-28T12:00:00.000Z" };
const options = [
  { id: "van", name: "Van", items: [{ id: "v", vehicleType: "Van", quantity: 2 }], value: "R$ 2.400,00", commercialTerms: "Bagagem incluída" },
  { id: "exec", name: "Executivo", items: [{ id: "e", vehicleType: "Executivo", quantity: 3 }], value: "" },
];
afterEach(() => { vi.unstubAllGlobals(); });

function setup() {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  const state = createQuoteWithLegacyTask(seedState(), { title: "Transfer", client: "Empresa", clientContact: "Cliente", clientPhone: send.recipient, route: "SP / Campinas", options: structuredClone(options), commercialTerms: "Pagamento em 30 dias" });
  return { state, id: state.quotes[0].id };
}

test("pessoas diferentes precificam e enviam; a baixa ocorre no envio integral", () => {
  let { state, id } = setup();
  state = updateQuote(state, id, { status: "Cotada" });
  const task = state.tasks.find((item) => item.quoteId === id);
  assert.equal(task!.status, "doing");
  assert.equal(state.quotes[0].commercialTerms, "Pagamento em 30 dias");
  assert.throws(() => updateTask(state, task!.id, { status: "done" }), /decisão do cliente/i);
  state = markQuoteSent({ ...state, currentUserId: "atendente-2", currentUserName: "Atendente 2" }, id, { options: state.quotes[0].options, proposalOptions: [state.quotes[0].options![0]], send, requestId: "request-1" });
  const quote = state.quotes[0];
  const version = quote.proposalVersions![0];
  assert.equal(quote.status, "Respondida ao cliente");
  const sentTask = state.tasks.find((item) => item.quoteId === id);
  assert.equal(sentTask!.status, "waiting");
  assert.deepEqual(sentTask!.waitingContext!.onNames, ["Cliente"]);
  assert.equal(quote.options!.length, 2);
  assert.equal(quote.commercialTerms, "Pagamento em 30 dias");
  assert.equal(version.authorId, "atendente-2");
  assert.equal(version.channel, "WhatsApp");
  assert.equal(version.recipient, "+55 11 99999-9999");
  assert.equal(version.sentAt, send.sentAt);
  assert.ok(Number.isFinite(Date.parse(version.createdAt!)));
  assert.equal(version.commercialTerms, "Pagamento em 30 dias");
  assert.match(version.text!, /Pagamento em 30 dias/);
  assert.match(version.text!, /Bagagem incluída/);
  assert.match(version.text!, /2\.400,00/);
  assert.doesNotMatch(version.text!, /4\.800,00/);
  const repeated = markQuoteSent(state, id, { send, requestId: "request-1" });
  assert.equal(repeated.quotes[0].proposalVersions!.length, 1);
  const revision = updateQuote(state, id, { options: quote.options!.map((item) => ({ ...item, value: "R$ 9.999,00" })), commercialTerms: "Pagamento imediato" });
  assert.equal(revision.quotes[0].proposalVersions![0].options![0].value, "R$ 2.400,00");
  const resent = markQuoteSent(revision, id, { options: revision.quotes[0].options, proposalOptions: [revision.quotes[0].options![0]], send, requestId: "request-2" });
  assert.equal(resent.quotes[0].proposalVersions!.length, 2);
  assert.equal(resent.quotes[0].proposalVersions![1].number, 2);
  assert.equal(resent.quotes[0].proposalVersions![0].options![0].value, "R$ 2.400,00");
  const accepted = setQuoteOutcome(resent, id, "Aceita pelo cliente", "", { acceptedProposalVersionId: version.id, acceptedOptionId: "van" });
  assert.equal(accepted.quotes[0].value, "R$ 2.400,00");
  assert.equal(accepted.quotes[0].commercialTerms, "Pagamento em 30 dias");
});

test("registro exige canal e destinatário e inclui somente opções com preço válido", () => {
  const setupState = setup();
  const state = updateQuote(setupState.state, setupState.id, { status: "Cotada" });
  const proposal = { proposalOptions: [state.quotes[0].options![0]], send, requestId: "attempt" };
  assert.throws(() => markQuoteSent(state, setupState.id, { requestId: "attempt", send: { ...send, channel: "E-mail", recipient: "sem-arroba" } }), /e-mail válido/i);
  const result = markQuoteSent(state, setupState.id, { requestId: "attempt", send });
  assert.deepEqual(result.quotes[0].proposalVersions![0].options!.map((option) => option.id), ["van"]);
  assert.throws(() => markQuoteSent(state, setupState.id, { ...proposal, expectedModifiedAt: "old" }), /alterada/i);
  assert.equal(state.quotes[0].proposalVersions!.length, 0);
});

test("condições gerais aparecem uma vez e específicas acompanham cada alternativa", () => {
  const quote = { client: "Empresa", commercialTerms: "Pagamento em 30 dias", options: [options[0]], proposalOptions: [options[0]] };
  for (const text of [buildQuoteEmailHtml(quote), buildQuotePlainText(quote)]) {
    assert.equal(text.split("Pagamento em 30 dias").length - 1, 1);
    assert.match(text, /Bagagem incluída/);
  }
});
