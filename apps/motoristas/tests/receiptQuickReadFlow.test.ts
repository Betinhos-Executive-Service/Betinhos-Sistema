import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_QUICK_READ,
  QUICK_READ_SLOW_NOTICE_MS,
  QUICK_READ_TIMEOUT_MS,
  expenseFlowView,
  hasRemoteReferenceData,
  isQuickReadFieldHighlighted,
  nextQuickReadState,
  quickReadFilledFields,
  quickReadProgress,
  runQuickReadPipeline,
  startQuickReadState,
  type QuickReadLeitura
} from "../src/lib/receiptQuickRead.ts";
import { DEFAULT_EXPENSE_REFERENCE_DATA, type ExpenseDraft, type ExpenseReferenceData } from "../src/lib/expenses.ts";

const leitura: QuickReadLeitura = { legivel: true, valor: 51.9, data: "2026-10-10", hora: "18:28", estabelecimento: "Burger King", cnpj: null, litros: null, categoria_sugerida: "Almoço", forma_pagamento_sugerida: "Cartão de crédito", motivo_ilegivel: null };
const vazio: ExpenseDraft = { categoriaId: "", veiculoId: "", valor: "", dataGasto: "", formaPagamentoId: "", cidadeId: "", estabelecimento: "", descricao: "", kmInformado: "", litros: "" };
const remota: ExpenseReferenceData = {
  categories: [{ id: "8f1c0000-0000-0000-0000-000000000001", name: "Almoço", order: 20, exigeVeiculo: false, exigeReserva: false, exigeKm: false, exigeLitros: false }],
  paymentMethods: [{ id: "8f1c0000-0000-0000-0000-000000000002", name: "Cartão de crédito", order: 10, tipo: "Cartão" }],
  cities: []
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("timeout da leitura é 20 s e o aviso de demora aparece aos 8 s", () => {
  assert.equal(QUICK_READ_TIMEOUT_MS, 20_000);
  assert.equal(QUICK_READ_SLOW_NOTICE_MS, 8_000);
});

test("fluxo foto → revisão → leitura → formulário: a tela de gastos mostra a leitura enquanto lê", () => {
  const lendo = startQuickReadState(INITIAL_QUICK_READ, { online: true });
  assert.equal(lendo.status, "lendo");
  assert.equal(expenseFlowView(lendo), "leitura");
  const preenchido = nextQuickReadState(lendo, { kind: "lido", leitura });
  assert.equal(preenchido.status, "preenchido");
  assert.equal(expenseFlowView(preenchido), "formulario");
  assert.equal(expenseFlowView(INITIAL_QUICK_READ), "formulario");
});

test("sem internet a leitura não começa e vai direto para o manual", () => {
  const manual = startQuickReadState(INITIAL_QUICK_READ, { online: false });
  assert.equal(manual.status, "manual");
  assert.equal(expenseFlowView(manual), "formulario");
});

test("3ª foto ilegível vai em silêncio para o manual, sem contador visível", () => {
  let state = INITIAL_QUICK_READ;
  for (let i = 0; i < 2; i++) state = nextQuickReadState(startQuickReadState(state, { online: true }), { kind: "ilegivel" });
  assert.equal(state.status, "ilegivel");
  state = nextQuickReadState(startQuickReadState(state, { online: true }), { kind: "ilegivel" });
  assert.equal(state.status, "manual");
  assert.equal(state.tentativas, 3);
  assert.equal(expenseFlowView(state), "formulario");
});

test("foto ilegível abre a tela de nova foto, não o formulário; falha e offline vão ao formulário", () => {
  const ilegivel = nextQuickReadState(startQuickReadState(INITIAL_QUICK_READ, { online: true }), { kind: "ilegivel" });
  assert.equal(expenseFlowView(ilegivel), "ilegivel");
  assert.equal(expenseFlowView(nextQuickReadState(startQuickReadState(INITIAL_QUICK_READ, { online: true }), { kind: "falha" })), "formulario");
  assert.equal(expenseFlowView(startQuickReadState(INITIAL_QUICK_READ, { online: false })), "formulario");
});

test("progresso: enviando, depois lendo, preenchendo só com o resultado; aviso de demora após 8 s", () => {
  assert.deepEqual(quickReadProgress(0, false), { step: 0, slow: false });
  assert.deepEqual(quickReadProgress(2_000, false), { step: 1, slow: false });
  assert.deepEqual(quickReadProgress(7_999, false), { step: 1, slow: false });
  assert.deepEqual(quickReadProgress(8_000, false), { step: 1, slow: true });
  assert.deepEqual(quickReadProgress(3_000, true), { step: 2, slow: false });
});

test("listas com ids locais (local-*) não contam como carregadas", () => {
  assert.equal(hasRemoteReferenceData(DEFAULT_EXPENSE_REFERENCE_DATA), false);
  assert.equal(hasRemoteReferenceData({ ...remota, paymentMethods: [] }), false);
  assert.equal(hasRemoteReferenceData(remota), true);
});

test("pipeline espera as listas antes de ler e devolve as listas usadas", async () => {
  const chamadas: string[] = [];
  const result = await runQuickReadPipeline({
    referenceData: DEFAULT_EXPENSE_REFERENCE_DATA,
    isReferenceReady: hasRemoteReferenceData,
    loadReferenceData: async () => { chamadas.push("listas"); await sleep(5); return remota; },
    prepareImage: async () => { chamadas.push("imagem"); return "AAAA"; },
    read: async (_base64, categorias, formas) => { chamadas.push(`ler:${categorias.join("|")}:${formas.join("|")}`); return { ok: true, leitura }; }
  });
  assert.deepEqual(chamadas.at(-1), "ler:Almoço:Cartão de crédito");
  assert.equal(result.outcome.kind, "lido");
  assert.equal(result.referenceData, remota);
});

test("pipeline não recarrega listas já carregadas", async () => {
  let cargas = 0;
  const result = await runQuickReadPipeline({
    referenceData: remota,
    isReferenceReady: hasRemoteReferenceData,
    loadReferenceData: async () => { cargas++; return remota; },
    prepareImage: async () => "AAAA",
    read: async () => ({ ok: true, leitura })
  });
  assert.equal(cargas, 0);
  assert.equal(result.outcome.kind, "lido");
});

test("pipeline sem listas válidas não chama a leitura e vai para o manual", async () => {
  let leu = false;
  const result = await runQuickReadPipeline({
    referenceData: DEFAULT_EXPENSE_REFERENCE_DATA,
    isReferenceReady: hasRemoteReferenceData,
    loadReferenceData: async () => { throw new Error("offline"); },
    prepareImage: async () => "AAAA",
    read: async () => { leu = true; return { ok: true, leitura }; }
  });
  assert.equal(leu, false);
  assert.equal(result.outcome.kind, "falha");
  assert.equal(result.referenceData, null);
});

test("pipeline estoura o tempo e vira falha (manual) mesmo se a leitura nunca responder", async () => {
  const started = Date.now();
  const result = await runQuickReadPipeline({
    referenceData: remota,
    isReferenceReady: hasRemoteReferenceData,
    loadReferenceData: async () => remota,
    prepareImage: async () => "AAAA",
    read: () => new Promise(() => undefined),
    timeoutMs: 30
  });
  assert.equal(result.outcome.kind, "falha");
  assert.ok(Date.now() - started < 1_000);
});

test("pipeline repassa à leitura só o tempo que sobrou", async () => {
  let recebido = 0;
  await runQuickReadPipeline({
    referenceData: DEFAULT_EXPENSE_REFERENCE_DATA,
    isReferenceReady: hasRemoteReferenceData,
    loadReferenceData: async () => { await sleep(40); return remota; },
    prepareImage: async () => "AAAA",
    read: async (_b, _c, _f, timeoutMs) => { recebido = timeoutMs; return { ok: false }; },
    timeoutMs: 1_000
  });
  assert.ok(recebido > 0 && recebido <= 965, `recebido ${recebido}`);
});

test("campos preenchidos pela leitura ficam destacados até o motorista mudar o valor", () => {
  const depois = { ...vazio, valor: "51,90", dataGasto: "2026-10-10", estabelecimento: "Burger King", descricao: "" };
  const filled = quickReadFilledFields({ ...vazio, dataGasto: "2026-10-15" }, depois);
  assert.deepEqual(filled, { valor: "51,90", dataGasto: "2026-10-10", estabelecimento: "Burger King" });
  assert.equal(isQuickReadFieldHighlighted(depois, filled, "valor"), true);
  assert.equal(isQuickReadFieldHighlighted({ ...depois, valor: "52,00" }, filled, "valor"), false);
  assert.equal(isQuickReadFieldHighlighted(depois, filled, "cidadeId"), false);
});

test("o que o motorista digitou nunca é sobrescrito nem destacado", async () => {
  const { applyQuickReadToDraft } = await import("../src/lib/receiptQuickRead.ts");
  const digitado = { ...vazio, valor: "60,00", estabelecimento: "Outro" };
  const depois = applyQuickReadToDraft(digitado, leitura, remota);
  assert.equal(depois.valor, "60,00");
  assert.equal(depois.estabelecimento, "Outro");
  assert.equal(depois.categoriaId, remota.categories[0].id);
  const filled = quickReadFilledFields(digitado, depois);
  assert.equal(filled.valor, undefined);
  assert.equal(filled.estabelecimento, undefined);
  assert.equal(filled.categoriaId, remota.categories[0].id);
});
