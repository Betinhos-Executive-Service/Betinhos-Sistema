import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickReadResponse } from "../src/lib/receiptQuickRead.ts";

const leitura = { legivel: true, valor: 85.4, data: "2026-10-12", hora: "14:32", estabelecimento: "Posto X", cnpj: null, litros: 32.5, categoria_sugerida: "Abastecimento", forma_pagamento_sugerida: null, motivo_ilegivel: null };

test("parseQuickReadResponse aceita ok:true com leitura legível", () => {
  assert.deepEqual(parseQuickReadResponse({ ok: true, leitura }), { kind: "lido", leitura });
});
test("parseQuickReadResponse trata legivel=false como ilegível", () => {
  assert.equal(parseQuickReadResponse({ ok: true, leitura: { ...leitura, legivel: false } }).kind, "ilegivel");
});
test("parseQuickReadResponse trata ok:false e corpo inválido como falha", () => {
  assert.equal(parseQuickReadResponse({ ok: false, erro: "x" }).kind, "falha");
  assert.equal(parseQuickReadResponse("texto").kind, "falha");
  assert.equal(parseQuickReadResponse({ ok: true, leitura: { legivel: "sim" } }).kind, "falha");
});

import { applyQuickReadToDraft } from "../src/lib/receiptQuickRead.ts";
import { DEFAULT_EXPENSE_REFERENCE_DATA, type ExpenseDraft } from "../src/lib/expenses.ts";

const vazio: ExpenseDraft = { categoriaId: "", veiculoId: "", valor: "", dataGasto: "", formaPagamentoId: "", cidadeId: "", estabelecimento: "", descricao: "", kmInformado: "", litros: "" };

test("applyQuickReadToDraft preenche só campos vazios, casa a categoria por nome e não preenche a forma de pagamento", () => {
  const draft = applyQuickReadToDraft({ ...vazio, valor: "90,00" }, { ...leitura, forma_pagamento_sugerida: "TicketLog" }, DEFAULT_EXPENSE_REFERENCE_DATA, { today: "2026-10-15" });
  assert.equal(draft.valor, "90,00");
  assert.equal(draft.dataGasto, "2026-10-12");
  assert.equal(draft.estabelecimento, "Posto X");
  assert.equal(draft.categoriaId, "local-abastecimento");
  assert.equal(draft.formaPagamentoId, "");
  assert.equal(draft.litros, "32,5");
});
test("applyQuickReadToDraft formata valor em pt-BR e ignora litros quando a categoria não exige", () => {
  const draft = applyQuickReadToDraft(vazio, { ...leitura, categoria_sugerida: "Pedágio", valor: 12.3 }, DEFAULT_EXPENSE_REFERENCE_DATA);
  assert.equal(draft.valor, "12,30");
  assert.equal(draft.litros, "");
});
test("applyQuickReadToDraft ignora sugestão fora da lista", () => {
  assert.equal(applyQuickReadToDraft(vazio, { ...leitura, categoria_sugerida: "Bebida" }, DEFAULT_EXPENSE_REFERENCE_DATA).categoriaId, "");
});

import { INITIAL_QUICK_READ, nextQuickReadState, shouldRunQuickRead } from "../src/lib/receiptQuickRead.ts";

test("terceira foto ilegível libera manual e para de ler", () => {
  let s = nextQuickReadState(INITIAL_QUICK_READ, { kind: "ilegivel" });
  assert.deepEqual(s, { status: "ilegivel", tentativas: 1 });
  s = nextQuickReadState(s, { kind: "ilegivel" });
  s = nextQuickReadState(s, { kind: "ilegivel" });
  assert.deepEqual(s, { status: "manual", tentativas: 3 });
  assert.equal(shouldRunQuickRead(s), false);
});
test("falha vai para manual sem contar tentativa; lido encerra", () => {
  assert.deepEqual(nextQuickReadState(INITIAL_QUICK_READ, { kind: "falha" }), { status: "manual", tentativas: 0 });
  assert.deepEqual(nextQuickReadState(INITIAL_QUICK_READ, { kind: "lido", leitura }), { status: "preenchido", tentativas: 1 });
});
test("shouldRunQuickRead só em idle ou ilegivel", () => {
  assert.equal(shouldRunQuickRead(INITIAL_QUICK_READ), true);
  assert.equal(shouldRunQuickRead({ status: "ilegivel", tentativas: 2 }), true);
  assert.equal(shouldRunQuickRead({ status: "preenchido", tentativas: 1 }), false);
});

import { quickReadTargetSize } from "../src/lib/receiptQuickRead.ts";

test("quickReadTargetSize limita o maior lado a 1600 mantendo proporção", () => {
  assert.deepEqual(quickReadTargetSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(quickReadTargetSize(800, 600), { width: 800, height: 600 });
});

test("applyQuickReadToDraft troca a data automática (hoje) quando o motorista não mexeu na data", () => {
  const comHoje = { ...vazio, dataGasto: "2026-10-15" };
  assert.equal(applyQuickReadToDraft(comHoje, leitura, DEFAULT_EXPENSE_REFERENCE_DATA, { today: "2026-10-15" }).dataGasto, "2026-10-15");
  assert.equal(applyQuickReadToDraft(comHoje, leitura, DEFAULT_EXPENSE_REFERENCE_DATA, { replaceAutoDate: true, today: "2026-10-15" }).dataGasto, "2026-10-12");
});

import { buildQuickReadDescription, matchQuickReadCity, QUICK_READ_DESCRIPTION_MAX } from "../src/lib/receiptQuickRead.ts";
import type { ExpenseCityOption, ExpenseReferenceData } from "../src/lib/expenses.ts";

const cidade = (id: string, nome: string, uf: string): ExpenseCityOption => ({ id, name: `${nome} - ${uf}`, order: 0, uf, pais: "Brasil", codigoIbge: "" });
const cidades = [cidade("tbt", "Taubaté", "SP"), cidade("bj-pi", "Bom Jesus", "PI"), cidade("bj-rn", "Bom Jesus", "RN"), cidade("cps", "Campinas", "SP"), cidade("sp", "São Paulo", "SP")];

test("matchQuickReadCity casa nome e UF sem acento nem caixa; só nome quando único; senão vazio", () => {
  assert.equal(matchQuickReadCity(cidades, "TAUBATE", "sp"), "tbt");
  assert.equal(matchQuickReadCity(cidades, "Bom Jesus", "RN"), "bj-rn");
  assert.equal(matchQuickReadCity(cidades, "Bom Jesus", null), "");
  assert.equal(matchQuickReadCity(cidades, "campinas", null), "cps");
  assert.equal(matchQuickReadCity(cidades, "Sao Paulo", "SP"), "sp");
  assert.equal(matchQuickReadCity(cidades, "Pindamonhangaba", "SP"), "");
  // UF lida que não bate com nenhuma cidade desse nome: fica vazia (sem cair no "só nome").
  assert.equal(matchQuickReadCity(cidades, "Campinas", "RJ"), "");
  assert.equal(matchQuickReadCity(cidades, null, "SP"), "");
  assert.equal(matchQuickReadCity([], "Taubaté", "SP"), "");
});

const comCidades: ExpenseReferenceData = { ...DEFAULT_EXPENSE_REFERENCE_DATA, cities: cidades };

test("applyQuickReadToDraft preenche a cidade lida sem sobrescrever a escolhida pelo motorista", () => {
  assert.equal(applyQuickReadToDraft(vazio, { ...leitura, cidade: "Taubaté", uf: "SP" }, comCidades).cidadeId, "tbt");
  assert.equal(applyQuickReadToDraft({ ...vazio, cidadeId: "sp" }, { ...leitura, cidade: "Taubaté", uf: "SP" }, comCidades).cidadeId, "sp");
  assert.equal(applyQuickReadToDraft(vazio, { ...leitura, cidade: null, uf: "SP" }, comCidades).cidadeId, "");
  assert.equal(applyQuickReadToDraft(vazio, leitura, comCidades).cidadeId, "");
});

test("buildQuickReadDescription: categoria · nome fantasia · litros (combustível), curta", () => {
  assert.equal(buildQuickReadDescription({ categoria: "Abastecimento", estabelecimento: " Posto Ipiranga Moreira César ", litros: 32.5, exigeLitros: true }), "Abastecimento · Posto Ipiranga Moreira César · 32,5 L");
  assert.equal(buildQuickReadDescription({ categoria: "Almoço", estabelecimento: "Burger King", litros: 3, exigeLitros: false }), "Almoço · Burger King");
  assert.equal(buildQuickReadDescription({ categoria: "", estabelecimento: "Netpark JK", litros: null, exigeLitros: false }), "Netpark JK");
  assert.equal(buildQuickReadDescription({ categoria: "", estabelecimento: null, litros: null, exigeLitros: false }), "");
  const longa = buildQuickReadDescription({ categoria: "Estacionamento", estabelecimento: "X".repeat(200), litros: null, exigeLitros: false });
  assert.equal(QUICK_READ_DESCRIPTION_MAX, 120);
  assert.equal(longa.length, 120);
  assert.ok(longa.startsWith("Estacionamento · X") && longa.endsWith("…"));
});

test("applyQuickReadToDraft preenche a descrição só quando vazia", () => {
  const lido = { ...leitura, estabelecimento: "Posto Ipiranga Moreira César", litros: 32.5 };
  assert.equal(applyQuickReadToDraft(vazio, lido, comCidades).descricao, "Abastecimento · Posto Ipiranga Moreira César · 32,5 L");
  assert.equal(applyQuickReadToDraft({ ...vazio, descricao: "minha nota" }, lido, comCidades).descricao, "minha nota");
});

import { applyQuickRead, resolveQuickReadDate, todayInSaoPaulo } from "../src/lib/receiptQuickRead.ts";

test("data lida: aceita só de hoje até 3 dias atrás (hoje em America/Sao_Paulo)", () => {
  const hoje = "2026-10-15";
  assert.equal(resolveQuickReadDate("2026-10-15", hoje), "2026-10-15");
  assert.equal(resolveQuickReadDate("2026-10-12", hoje), "2026-10-12");
  assert.equal(resolveQuickReadDate("2026-10-11", hoje), "");
  assert.equal(resolveQuickReadDate(null, hoje), "");
  assert.equal(resolveQuickReadDate("lixo", hoje), "");
  // 23:30 de 15/10 em São Paulo ainda é 15/10 (UTC já é 16/10).
  assert.equal(todayInSaoPaulo(new Date("2026-10-16T02:30:00Z")), "2026-10-15");
});

test("data lida: ano errado do OCR é corrigido para o ano atual (ou o anterior na virada) se cair na janela", () => {
  assert.equal(resolveQuickReadDate("2020-10-15", "2026-10-15"), "2026-10-15");
  assert.equal(resolveQuickReadDate("2062-10-14", "2026-10-15"), "2026-10-14");
  assert.equal(resolveQuickReadDate("2026-12-30", "2027-01-01"), "2026-12-30");
  assert.equal(resolveQuickReadDate("2027-12-31", "2027-01-01"), "2026-12-31");
  // Futuro sem correção possível ou antigo demais no ano atual: vazio.
  assert.equal(resolveQuickReadDate("2026-10-20", "2026-10-15"), "");
  assert.equal(resolveQuickReadDate("2020-09-01", "2026-10-15"), "");
});

test("data fora da janela limpa a data automática; a digitada pelo motorista nunca muda", () => {
  const auto = { ...vazio, dataGasto: "2026-10-15" };
  const velho = { ...leitura, data: "2026-10-01" };
  assert.equal(applyQuickReadToDraft(auto, velho, DEFAULT_EXPENSE_REFERENCE_DATA, { replaceAutoDate: true, today: "2026-10-15" }).dataGasto, "");
  assert.equal(applyQuickReadToDraft(auto, { ...leitura, data: null }, DEFAULT_EXPENSE_REFERENCE_DATA, { replaceAutoDate: true, today: "2026-10-15" }).dataGasto, "");
  assert.equal(applyQuickReadToDraft({ ...vazio, dataGasto: "2026-10-13" }, velho, DEFAULT_EXPENSE_REFERENCE_DATA, { replaceAutoDate: false, today: "2026-10-15" }).dataGasto, "2026-10-13");
  assert.equal(applyQuickReadToDraft({ ...vazio, dataGasto: "2026-10-13" }, leitura, DEFAULT_EXPENSE_REFERENCE_DATA, { replaceAutoDate: false, today: "2026-10-15" }).dataGasto, "2026-10-13");
});

test("data só fica destacada quando veio da leitura (inclusive quando é a mesma de hoje)", () => {
  const auto = { ...vazio, dataGasto: "2026-10-15" };
  const hoje = { replaceAutoDate: true, today: "2026-10-15" };
  assert.equal(applyQuickRead(auto, { ...leitura, data: "2026-10-15" }, DEFAULT_EXPENSE_REFERENCE_DATA, hoje).filled.dataGasto, "2026-10-15");
  assert.equal(applyQuickRead(auto, { ...leitura, data: "2020-10-14" }, DEFAULT_EXPENSE_REFERENCE_DATA, hoje).filled.dataGasto, "2026-10-14");
  const vazia = applyQuickRead(auto, { ...leitura, data: "2026-09-01" }, DEFAULT_EXPENSE_REFERENCE_DATA, hoje);
  assert.equal(vazia.draft.dataGasto, "");
  assert.equal(vazia.filled.dataGasto, undefined);
  const digitada = applyQuickRead({ ...vazio, dataGasto: "2026-10-13" }, leitura, DEFAULT_EXPENSE_REFERENCE_DATA, { replaceAutoDate: false, today: "2026-10-15" });
  assert.equal(digitada.filled.dataGasto, undefined);
  assert.equal(digitada.filled.valor, "85,40");
});
