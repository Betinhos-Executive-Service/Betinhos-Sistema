import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { createQuote, markQuoteSent, seedState, setQuoteOutcome, updateQuote } from "./mock";
import { createQuoteProposalVersion, normalizeQuoteOptions, prepareQuoteResponse } from "../domain/quoteScenarios";
import { buildQuoteEmailHtml, buildQuotePlainText } from "../domain/quoteDomain";
import { clientDecisionWaitingContext } from "../domain/quoteTaskFlow";

afterEach(() => { vi.unstubAllGlobals(); });

function setup() {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  let state = createQuote(seedState(), { title: "Transfer", client: "Empresa", options: [
    { id: "a", name: "Executivo", value: "1200" },
    { id: "b", name: "Premium", value: "1800" },
    { id: "incomplete", name: "Em composição", value: "" },
  ] });
  const id = state.quotes[0].id;
  state = updateQuote(state, id, { status: "Cotada" });
  return { state, id };
}

const send = { channel: "E-mail", recipient: "cliente@empresa.com", sentAt: "2026-10-23T15:00:00.000Z" };

test("registra o envio da cotação inteira com canal e destinatário e preserva todas as opções válidas", () => {
  const { state, id } = setup();
  assert.throws(() => markQuoteSent(state, id, { requestId: "sem-envio" }), /canal/i);
  const result = markQuoteSent({ ...state, currentUserId: "renan", currentUserName: "Renan" }, id, {
    requestId: "confirmation-1", proposalOptions: [state.quotes[0].options![0]], send,
    text: "Texto editado na prévia",
  });
  const quote = result.quotes[0];
  const version = quote.proposalVersions![0];
  const task = result.tasks.find((item) => item.quoteId === id);
  assert.equal(quote.status, "Respondida ao cliente");
  assert.equal(task!.status, "waiting");
  assert.equal(task!.waitingContext!.subject, "Decisão do cliente sobre a proposta");
  assert.deepEqual(version.options!.map((option) => option.id), ["a", "b"]);
  assert.equal(quote.options!.length, 3);
  assert.equal(version.authorId, "renan");
  assert.ok(Number.isFinite(Date.parse(version.createdAt!)));
  assert.equal(version.channel, "E-mail");
  assert.equal(version.recipient, "cliente@empresa.com");
  assert.equal(version.sentAt, send.sentAt);
  assert.equal(version.text, "Texto editado na prévia");
  assert.equal(markQuoteSent(result, id, { requestId: "confirmation-1" }).quotes[0].proposalVersions!.length, 1);
  const edited = updateQuote(result, id, { options: quote.options!.map((option) => ({ ...option, value: "9999" })) });
  const accepted = setQuoteOutcome(edited, id, "Aceita pelo cliente", "", { acceptedProposalVersionId: version.id, acceptedOptionId: "b" });
  assert.equal(accepted.quotes[0].value, "1800");
});

test("confirmação exige cotação cotada, preço válido e revisão atual", () => {
  const { state, id } = setup();
  assert.throws(() => markQuoteSent(state, id, { send, expectedModifiedAt: "old" }), /alterada/i);
  const noPrice = { ...state, quotes: state.quotes.map((quote) => quote.id === id ? { ...quote, options: quote.options!.map((option) => ({ ...option, value: "" })) } : quote) };
  assert.throws(() => markQuoteSent(noPrice, id, { send }), /opção|valor|preço/i);
  const newQuote = { ...state, quotes: state.quotes.map((quote) => quote.id === id ? { ...quote, status: "Nova" } : quote) };
  assert.throws(() => markQuoteSent(newQuote, id, { send }), /cotação|cotada/i);
  assert.equal(state.quotes[0].proposalVersions!.length, 0);
});

// O caso "adapter Dataverse registra o envio em transação..." lê o fonte de dataverse.js e fica com o porte do adaptador Dataverse.
