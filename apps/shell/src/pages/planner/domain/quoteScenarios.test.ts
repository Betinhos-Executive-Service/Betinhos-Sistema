import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { QuoteOptionData } from './types'
import { createQuote, markQuoteSent, seedState, setQuoteOutcome, updateQuote } from "../data/mock";
import { chosenQuoteOption, newQuoteOption, prepareQuoteProposal, prepareIndividualQuoteProposal, resolveQuoteAcceptance, validateQuoteOption } from "./quoteScenarios";
import { buildQuoteEmailHtml, buildQuotePlainText, validateQuoteCommercial } from "./quoteDomain";

test("cotação individual gera somente a opção solicitada, sem incluir alternativas", () => {
  const quote = { options: [
    { id: "executive", name: "Transfer executivo", value: "2400", commercialTerms: "Condição executiva" },
    { id: "premium", name: "Transfer premium", value: "3200", commercialTerms: "Condição premium" },
  ] };
  for (const option of quote.options) {
    const result = prepareIndividualQuoteProposal(quote, option.id);
    assert.equal(result.valid, true);
    assert.deepEqual(result.options.map((item) => item.id), [option.id]);
    const other = quote.options.find((item) => item.id !== option.id)!;
    for (const content of [buildQuoteEmailHtml({ ...quote, proposalOptions: result.options }), buildQuotePlainText({ ...quote, proposalOptions: result.options })]) {
      assert.ok(content.includes(option.name));
      assert.ok(!content.includes(other.name));
      assert.ok(!content.includes(other.commercialTerms));
    }
  }
  assert.equal(prepareIndividualQuoteProposal(quote).valid, false);
  assert.equal(prepareIndividualQuoteProposal(quote, "missing").valid, false);
});

test("cotação individual mantém o bloco antigo de valor e usa o preço da opção", () => {
  const html = buildQuoteEmailHtml({ value: "9999", proposalOptions: [{ id: "one", name: "Executivo", value: "855,29", commercialTerms: "Pagamento em 30 dias" }] });
  assert.match(html, /Com base nesse comprometimento, faço saber que o custo total é de/);
  assert.match(html, /class="cotacao-value"[^>]*font-size:30px[^>]*>R\$ 855,29/);
  assert.match(html, /Veja abaixo informações importantes para sua contratação/);
  assert.match(html, /Pagamento em 30 dias/);
  assert.doesNotMatch(html, /Condições da opção/);
  const band = html.match(/<td style="background:#0a2f41;padding:22px 34px 24px;text-align:center;">([\s\S]*?)<\/td>/)?.[1]!;
  assert.ok(band.includes("Condições Comerciais"));
  assert.ok(band.indexOf("Pagamento em 30 dias") < band.indexOf("Com base nesse comprometimento"));
  assert.doesNotMatch(html, /Sua cotação|Escolha a opção|9\.999,00/);
});

test("opção com título e total é válida sem veículos; proposta apresenta somente seus dados comerciais", () => {
  const option = { id: "simple", name: "Transfer ida e volta", commercialTerms: "Pagamento em 30 dias", value: "R$ 2.400,00" };
  assert.equal(validateQuoteOption(option).valid, true);
  assert.equal(validateQuoteCommercial({ status: "Cotada", options: [option] }).valid, true);
  const prepared = prepareQuoteProposal({ options: [option] });
  assert.equal(prepared.valid, true);
  for (const output of [buildQuoteEmailHtml({ proposalOptions: prepared.options }), buildQuotePlainText({ proposalOptions: prepared.options })]) {
    assert.match(output, /Transfer ida e volta/);
    assert.match(output, /Pagamento em 30 dias/);
    assert.match(output, /2\.400,00/);
    assert.doesNotMatch(output, /Composição não|Quantidade/);
  }
  assert.deepEqual(newQuoteOption().items, []);
  assert.equal(validateQuoteOption({ ...option, value: "" }).valid, false);
});

function option(name: string, items: Array<[string, string]>, value: string): QuoteOptionData {
  return { ...newQuoteOption(0), name, items: items.map(([vehicleType, quantity]) => ({ vehicleType, quantity })), value, commercialTerms: "Pagamento conforme contrato", notes: "Bagagem incluída" };
}

test("cotação antiga respondida registra aceite sem inventar versão de envio", () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;
  try {
    const quote = { id: "legacy-qa", status: "Respondida ao cliente", title: "Recepção", client: "Casa 9", value: "860", proposalVersions: [], options: [] };
    const accepted = { acceptedOptionId: "legacy-legacy-qa", acceptedProposalVersionId: "" };
    const state = { ...seedState(), quotes: [quote] };
    const result = setQuoteOutcome(state, quote.id, "Aceita pelo cliente", "", accepted).quotes[0];
    assert.equal(result.status, "Aceita pelo cliente");
    assert.equal(result.value, "860");
    assert.equal(result.acceptedProposalVersionId, "");
    assert.deepEqual(result.proposalVersions, []);
    assert.equal(chosenQuoteOption(result!)!.id, accepted.acceptedOptionId);
    assert.throws(() => resolveQuoteAcceptance({ ...quote, status: "Cotada" }, accepted));
    assert.throws(() => resolveQuoteAcceptance({ ...quote, proposalVersions: [{ id: "v1", options: [] }] }, accepted));
    assert.throws(() => resolveQuoteAcceptance(quote, { acceptedOptionId: "missing" }));
    assert.equal(setQuoteOutcome(state, quote.id, "Perdida", "Preço").quotes[0].lossReason, "Preço");
    assert.equal(setQuoteOutcome(state, quote.id, "Cancelada").quotes[0].status, "Cancelada");
  } finally { globalThis.localStorage = previousStorage; }
});

test("cadastra composições sem preço e envia somente as opções válidas selecionadas", () => {
  const options = [
    option("1 van", [["Van", "1"]], ""),
    option("3 executivos", [["Executivo", "3"]], "R$ 2.400,00"),
    option("1 blindado + 2 executivos", [["Blindado", "1"], ["Executivo", "2"]], "R$ 3.900,00"),
  ];
  const prepared = prepareQuoteProposal({ options }, [options[1].id, options[2].id]);
  assert.equal(prepared.valid, true);
  assert.deepEqual(prepared.options.map(({ name }) => name), ["3 executivos", "1 blindado + 2 executivos"]);
  assert.equal(prepareQuoteProposal({ options }, [options[0].id]).valid, false);
});

test("envio congela a alternativa e o aceite usa o preço da versão enviada", () => {
  const previousStorage = globalThis.localStorage;
  const store = new Map<string, string>();
  globalThis.localStorage = { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => store.set(key, value) } as unknown as Storage;
  let state = createQuote(seedState(), { title: "Transfer", client: "Cliente" });
  const quote = state.quotes[0];
  const options = [option("Van", [["Van", "1"]], "R$ 1.500,00"), option("Executivo", [["Executivo", "3"]], "R$ 2.400,00")];
  state = updateQuote(state, quote.id, { status: "Cotada", options, proposalOptions: options });
  const sendInput = { options, proposalOptions: options.slice(0, 1), send: { channel: "WhatsApp", recipient: "Cliente", sentAt: "2026-09-18T12:00:00.000Z" } };
  const sent = markQuoteSent(state, quote!.id, sendInput);
  const originalVersion = sent.quotes[0]!.proposalVersions![0]!;
  const editedOptions = options.map((item) => ({ ...item, value: "R$ 9.999,00" }));
  const revised = updateQuote(sent, quote.id, { options: editedOptions, proposalOptions: [editedOptions[0]] });
  const accepted = setQuoteOutcome(revised, quote.id, "Aceita pelo cliente", "", {
    acceptedProposalVersionId: originalVersion.id,
    acceptedOptionId: originalVersion.options![0]!.id,
  });
  assert.equal(accepted.quotes[0].value, "R$ 1.500,00");
  assert.equal(accepted.quotes[0]!.acceptedOptionId, originalVersion.options![0]!.id);
  assert.equal(accepted.quotes[0]!.proposalVersions![0]!.options![0]!.value, "R$ 1.500,00");
  assert.throws(() => setQuoteOutcome(revised, quote.id, "Aceita pelo cliente"), /proposta registrada como enviada/);
  globalThis.localStorage = previousStorage;
});
