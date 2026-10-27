import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  buildQuoteEmailHtml,
  buildQuotePlainText,
  buildQuoteRouteText,
  filterQuotes,
  formatMoney,
  getQuoteMetrics,
  deadlineFromPreset,
  deriveQuoteStatus,
  getQuoteNextAction,
  isVanVehicle,
  isQuoteOpen,
  parseQuoteMoney,
  quoteStage,
  validateQuoteStep,
  validateQuoteDraft,
  validateQuoteCommercial,
} from "./quoteDomain";

const base = {
  code: "COT-0042",
  title: "Transfer executivo",
  client: "ACME & Filhos",
  clientContact: "Iara <teste>",
  vehicleType: "Van executiva",
  origin: "GRU",
  destination: "Faria Lima",
  serviceDate: "2026-09-10T14:45",
  returnDate: "2026-09-10T22:00",
  passengers: "8",
  value: "R$ 1.092,30",
  commercialTerms: "Pagamento <30 dias>",
  deadline: "2026-09-09",
};

test("valida campos mínimos e exige motivo somente para Perdida", () => {
  assert.equal(validateQuoteDraft({}).valid, false);
  assert.equal(validateQuoteDraft({ ...base, title: "", status: "Nova" }).missing.includes("título interno"), true);
  assert.equal(validateQuoteDraft({ ...base, status: "Perdida" }).missing.includes("motivo da perda"), true);
  assert.equal(validateQuoteDraft({ ...base, channel: "WhatsApp", clientPhone: "11999999999", status: "Perdida", lossReason: "Preço" }).valid, true);
});

test("gera roteiro com e sem retorno", () => {
  assert.deepEqual(buildQuoteRouteText(base), ["Trajeto: GRU / Faria Lima", "Saída: 10/09/2026, 14:45", "Retorno: 10/09/2026, 22:00", "Passageiros: 8"]);
  assert.equal(buildQuoteRouteText({ ...base, returnDate: "" }).some((line) => line.startsWith("Retorno")), false);
});

test("seleciona modelo van e escapa conteúdo dinâmico", () => {
  assert.equal(isVanVehicle(base.vehicleType), true);
  const html = buildQuoteEmailHtml(base, { baseUrl: "https://crm.example" });
  assert.equal(html.includes("new_cotacao_van_veiculos.png"), true);
  assert.equal(html.includes("ACME &amp; Filhos"), true);
  assert.equal(html.includes("Iara &lt;teste&gt;"), true);
  assert.equal(html.includes("Pagamento &lt;30 dias&gt;"), true);
  assert.equal((html.match(/<tr>/g) || []).length >= 6, true);
});

test("seleciona modelo executivo e oferece fallback textual", () => {
  const html = buildQuoteEmailHtml({ ...base, vehicleType: "Sedan executivo" });
  assert.equal(html.includes("new_cotacao_banner_veiculos.png"), true);
  assert.equal(html.includes("new_cotacao_compromissos.png"), true);
  assert.match(buildQuotePlainText(base), /Custo total: R\$ 1\.092,30/);
});

test("valida cada etapa e exige telefone ou e-mail", () => {
  assert.deepEqual(Object.keys(validateQuoteStep({}, "request").errors), ["title", "client", "clientContact", "clientPhone"]);
  assert.equal(validateQuoteStep({ ...base, clientPhone: "", clientEmail: "" }, "request").errors.clientPhone, "Informe pelo menos o telefone ou o e-mail.");
  assert.equal(validateQuoteStep({ ...base, clientPhone: "", clientEmail: "invalido" }, "request").errors.clientEmail, "Informe um e-mail válido.");
  assert.equal(validateQuoteStep({ ...base, clientPhone: "", clientEmail: "iara@acme.com" }, "request").valid, true);
  assert.equal(validateQuoteStep({ ...base, clientPhone: "11999999999", clientEmail: "" }, "request").valid, true);
  assert.equal(validateQuoteStep({ ...base, clientPhone: "11999999999", passengerProfile: "x".repeat(301) }, "request").errors.passengerProfile, "O perfil do passageiro excede 300 caracteres.");
  assert.equal(validateQuoteStep({ ...base, deadline: "" }, "commercial").valid, true);
  assert.equal(validateQuoteDraft({ ...base, channel: "Telefone", clientPhone: "11999999999", deadline: "" }).valid, true);
  assert.equal(validateQuoteStep(base, "review").valid, false);
  assert.equal(validateQuoteStep({ ...base, channel: "Telefone", clientPhone: "11999999999" }, "review").valid, true);
});

test("exige valor positivo e permite condições comerciais vazias", () => {
  for (const value of ["", "R$ 0,00", "-1", "abc"]) assert.equal(validateQuoteCommercial({ value, commercialTerms: "À vista" }).valid, false);
  assert.equal(validateQuoteCommercial({ value: "R$ 1.092,30", commercialTerms: "  " }).valid, true);
  assert.equal(validateQuoteCommercial({ value: "R$ 1.092,30", commercialTerms: "À vista" }).valid, true);
  assert.equal(validateQuoteStep({ ...base, value: "R$ 0,00", status: "Cotada" }, "commercial").valid, false);
  assert.equal(validateQuoteStep({ ...base, commercialTerms: "", status: "Cotada" }, "commercial").valid, true);
  assert.equal(validateQuoteStep({ ...base, status: "Respondida ao cliente" }, "commercial").valid, true);
});

test("valor total inteiro permanece em reais após digitação e formatação", () => {
  for (const [input, expected] of [["737", "R$ 737,00"], ["737,50", "R$ 737,50"], ["737.50", "R$ 737,50"], ["R$ 737,00", "R$ 737,00"], ["R$ 1.250,50", "R$ 1.250,50"]]) {
    assert.equal(validateQuoteCommercial({ value: input }).valid, true);
    assert.equal(formatMoney(input), expected);
  }
  assert.equal(parseQuoteMoney(""), null);
  assert.equal(Number.isNaN(parseQuoteMoney("12abc")), true);
  assert.equal(parseQuoteMoney("0"), 0);
});

test("separa pedido, condições comerciais e observações na proposta", () => {
  const quote = { ...base, notes: "Linha 1\n<script>alert(1)</script>", commercialTerms: "30 dias\nValidade: 10 dias" };
  const html = buildQuoteEmailHtml(quote);
  assert.match(html, /Pedido do cliente:/);
  assert.match(html, /Condições Comerciais/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal((html.match(/30 dias/g) || []).length, 1);
  const text = buildQuotePlainText(quote);
  assert.match(text, /PEDIDO DO CLIENTE:\nLinha 1/);
  assert.match(text, /CONDIÇÕES COMERCIAIS:\n30 dias/);
});

test("permite criar cotação sem data e hora do serviço", () => {
  const { serviceDate, ...withoutServiceDate } = { ...base, clientPhone: "11999999999" };
  assert.equal(validateQuoteDraft(withoutServiceDate).valid, true);
  assert.equal(validateQuoteStep(withoutServiceDate, "request").valid, true);
});

test("trajeto é opcional na cotação e, quando informado, limita-se a 10.000 caracteres", () => {
  assert.equal(validateQuoteStep({ ...base, clientPhone: "11999999999", route: "" }, "request").valid, true);
  assert.equal(validateQuoteStep({ ...base, route: `${"A".repeat(4998)}/${"B".repeat(4998)}` }, "request").errors.route, undefined);
  assert.equal(validateQuoteStep({ ...base, route: `${"A".repeat(4999)}/${"B".repeat(4999)}` }, "request").errors.route, "O trajeto excede 10.000 caracteres.");
});

test("filtra cotações e calcula indicadores operacionais", () => {
  const quotes = [
    { id: "q1", code: "COT-1", client: "Acme", status: "Nova", priority: "high", deadline: "2026-09-14" },
    { id: "q2", code: "COT-2", client: "Beta", status: "Aguardando informação", priority: "medium", deadline: "2026-09-15" },
    { id: "q3", code: "COT-3", client: "Gama", status: "Aceita pelo cliente", priority: "low", deadline: "2026-09-10" },
  ];
  const tasks = [{ id: "t1", quoteId: "q1", assigneeIds: ["e1"] }, { id: "t2", quoteId: "q2", assigneeIds: [] }];
  assert.deepEqual(getQuoteMetrics(quotes, tasks, "2026-09-15"), { active: 2, overdue: 1, dueToday: 1, waiting: 1, unassigned: 1 });
  assert.deepEqual(filterQuotes(quotes, tasks, { query: "acme", priority: "high", responsible: "e1" }, "2026-09-15").map((item) => item.id), ["q1"]);
  assert.deepEqual(filterQuotes(quotes, tasks, { deadline: "overdue" }, "2026-09-15").map((item) => item.id), ["q1"]);
  assert.deepEqual(filterQuotes(quotes, tasks, { status: ["Nova", "Aguardando informação"], responsible: ["e1", "unassigned"] }, "2026-09-15").map((item) => item.id), ["q1", "q2"]);
  assert.deepEqual(filterQuotes(quotes, tasks, { deadline: ["overdue", "today"], priority: ["high", "medium"] }, "2026-09-15").map((item) => item.id), ["q1", "q2"]);
});

test("cotação respondida ao cliente não entra nas atrasadas", () => {
  const quotes = [
    { id: "nova", status: "Nova", deadline: "2026-09-14" },
    { id: "respondida", status: "Respondida ao cliente", deadline: "2026-09-14" },
  ];
  assert.equal(getQuoteMetrics(quotes, [], "2026-09-15").overdue, 1);
  assert.deepEqual(filterQuotes(quotes, [], { deadline: "overdue" }, "2026-09-15").map((quote) => quote.id), ["nova"]);
});

test("define uma ação primária por etapa", () => {
  assert.deepEqual(getQuoteNextAction({ status: "Nova" }).primary, { id: "start", label: "Iniciar cotação", status: "Em análise pelo financeiro" });
  assert.equal(getQuoteNextAction({ status: "Em análise pelo financeiro" }).primary.id, "compose");
  assert.equal(getQuoteNextAction({ status: "Aguardando informação" }).primary.id, "return");
  assert.equal(getQuoteNextAction({ status: "Cotada" }).primary.id, "compose");
  assert.equal(getQuoteNextAction({ status: "Respondida ao cliente" }).primary.id, "outcome");
  assert.equal(getQuoteNextAction({ status: "Perdida" }).primary.status, "Nova");
  assert.equal(quoteStage("Aguardando informação").id, "request");
  assert.equal(quoteStage("Cotada").id, "cost");
  assert.equal(quoteStage("Aceita pelo cliente").id, "response");
});

test("Cotada deriva das opções precificadas e o prazo tem atalhos em dias úteis", () => {
  const priced = [{ id: "a", name: "Executivo", value: "R$ 900,00" }];
  const unpriced = [{ id: "a", name: "Executivo", value: "" }];
  assert.equal(deriveQuoteStatus({ status: "Em análise pelo financeiro", options: priced }), "Cotada");
  assert.equal(deriveQuoteStatus({ status: "Em análise pelo financeiro", options: unpriced }), "Em análise pelo financeiro");
  assert.equal(deriveQuoteStatus({ status: "Cotada", options: unpriced }), "Em análise pelo financeiro");
  assert.equal(deriveQuoteStatus({ status: "Nova", options: priced }), "Nova");
  assert.equal(deriveQuoteStatus({ status: "Cotada", options: [], value: "R$ 800,00" }), "Cotada");
  assert.equal(deriveQuoteStatus({ status: "Cotada" }), "Cotada");
  assert.equal(deriveQuoteStatus({ status: "Respondida ao cliente", options: unpriced }), "Respondida ao cliente");
  assert.equal(deadlineFromPreset("today", "2026-10-23"), "2026-10-23");
  assert.equal(deadlineFromPreset("2d", "2026-10-23"), "2026-10-27");
  assert.equal(deadlineFromPreset("7d", "2026-10-23"), "2026-11-03");
  assert.equal(deadlineFromPreset("nope", "2026-10-23"), "");
});

test("resultado registrado deixa de ser cotação em aberto", () => {
  for (const status of ["Aceita pelo cliente", "Perdida", "Cancelada"]) assert.equal(isQuoteOpen(status), false);
  for (const status of ["Nova", "Em análise pelo financeiro", "Aguardando informação", "Cotada", "Respondida ao cliente"]) assert.equal(isQuoteOpen(status), true);
});
