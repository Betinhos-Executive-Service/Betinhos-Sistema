import assert from "node:assert/strict";
import test from "node:test";
import { getInitialDespesaId, getInitialGastosCartaoLink } from "../src/app/bootstrap.ts";
import type { ExpenseDraft, ExpensePhoto, ExpenseReferenceData } from "../src/lib/expenses.ts";
import {
  acharGastoCartaoDuplicado,
  aplicarLeituraNoGastoCartao,
  buildGastoCartaoCompletarPayload,
  cartaoFinalDoNome,
  conferirLeituraComCartao,
  filtroGastosCartaoPendentes,
  gastoCartaoParaRascunho,
  isGastoCartaoPendenteRow,
  mapGastoCartao,
  mesclarRascunho,
  validarDescricao,
  type GastoCartao
} from "../src/lib/gastosCartao.ts";

const MOTORISTA = "11111111-2222-4333-8444-555555555555";
const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const referenceData: ExpenseReferenceData = {
  categories: [
    { id: "cat-almoco", name: "Almoço", order: 1, exigeVeiculo: false, exigeReserva: false, exigeKm: false, exigeLitros: false },
    { id: "cat-abast", name: "Abastecimento", order: 2, exigeVeiculo: true, exigeReserva: false, exigeKm: true, exigeLitros: true }
  ],
  paymentMethods: [
    { id: "pay-cartao", name: "Cartão de crédito", order: 1, tipo: "Cartão" },
    { id: "pay-reembolso", name: "Particular (Reembolso)", order: 2, tipo: "Reembolso" }
  ],
  cities: [{ id: "city-sp", name: "São Paulo - SP", order: 0, uf: "SP", pais: "Brasil", codigoIbge: "3550308" }]
};

const row = (overrides: Record<string, unknown> = {}) => ({
  cr40f_despesaoperacionalid: ID.toUpperCase(),
  cr40f_nome: "Cartão final 1234 · Posto Shell",
  cr40f_valor: 120.5,
  cr40f_datagasto: "2026-11-03T03:00:00Z",
  cr40f_estabelecimento: "Posto Shell",
  _cr40f_motorista_value: MOTORISTA,
  _cr40f_categoria_value: "cat-almoco",
  _cr40f_formapagamento_value: "pay-cartao",
  cr40f_conciliadacartao: true,
  cr40f_origem: 100000002,
  cr40f_statusoperacional: 100000001,
  statecode: 0,
  ...overrides
});

const gasto = (overrides: Partial<GastoCartao> = {}): GastoCartao => ({
  ...mapGastoCartao(row()),
  ...overrides
});

const draft = (overrides: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  ...gastoCartaoParaRascunho(gasto()),
  categoriaId: "cat-almoco",
  cidadeId: "city-sp",
  descricao: "Almoço com o cliente",
  ...overrides
});

const photos: ExpensePhoto[] = [{ id: "p1", dataUrl: "data:image/jpeg;base64,abc" }];

test("filtro pega só despesas do motorista criadas pelo flow e ainda pendentes", () => {
  const filtro = filtroGastosCartaoPendentes(`{${MOTORISTA.toUpperCase()}}`);
  assert.match(filtro, new RegExp(`_cr40f_motorista_value eq ${MOTORISTA}`, "i"));
  assert.match(filtro, /cr40f_conciliadacartao eq true/);
  assert.match(filtro, /cr40f_origem eq 100000002/);
  assert.match(filtro, /cr40f_statusoperacional eq 100000001/);
  assert.match(filtro, /statecode eq 0/);
  assert.throws(() => filtroGastosCartaoPendentes("nao-e-guid"), /Motorista/);
});

test("isGastoCartaoPendenteRow espelha o filtro", () => {
  assert.equal(isGastoCartaoPendenteRow(row(), MOTORISTA), true);
  assert.equal(isGastoCartaoPendenteRow(row({ cr40f_statusoperacional: 100000000 }), MOTORISTA), false);
  assert.equal(isGastoCartaoPendenteRow(row({ cr40f_origem: 100000000 }), MOTORISTA), false);
  assert.equal(isGastoCartaoPendenteRow(row({ cr40f_conciliadacartao: false }), MOTORISTA), false);
  assert.equal(isGastoCartaoPendenteRow(row({ statecode: 1 }), MOTORISTA), false);
  assert.equal(isGastoCartaoPendenteRow(row({ _cr40f_motorista_value: "outro" }), MOTORISTA), false);
});

test("mapGastoCartao lê data, final do cartão e normaliza ids", () => {
  const item = mapGastoCartao(row());
  assert.equal(item.id, ID);
  assert.equal(item.dataGasto, "2026-11-03");
  assert.equal(item.cartaoFinal, "1234");
  assert.equal(item.valor, 120.5);
  assert.equal(cartaoFinalDoNome("Sem cartão"), "");
});

test("rascunho mantém valor, data, forma e estabelecimento e pede descrição vazia", () => {
  const rascunho = gastoCartaoParaRascunho(gasto());
  assert.equal(rascunho.valor, "120,50");
  assert.equal(rascunho.dataGasto, "2026-11-03");
  assert.equal(rascunho.formaPagamentoId, "pay-cartao");
  assert.equal(rascunho.descricao, "");
  assert.equal(validarDescricao(rascunho), "Descreva o gasto.");
  assert.equal(validarDescricao({ ...rascunho, descricao: "  " }), "Descreva o gasto.");
  assert.equal(validarDescricao({ ...rascunho, descricao: "Almoço" }), "");
});

test("mesclarRascunho preserva o que o motorista digitou sem trocar os dados do banco", () => {
  const base = gastoCartaoParaRascunho(gasto());
  const mesclado = mesclarRascunho(base, { ...base, valor: "999", descricao: "Digitei", cidadeId: "city-sp", categoriaId: "cat-abast" });
  assert.equal(mesclado.valor, base.valor);
  assert.equal(mesclado.descricao, "Digitei");
  assert.equal(mesclado.cidadeId, "city-sp");
  assert.equal(mesclado.categoriaId, "cat-abast");
});

const nav = { categoria: "cr40f_Categoria", cidade: "cr40f_Cidade", veiculo: "cr40f_Veiculo", motorista: "", reserva: "", formaPagamento: "" };
const buildArgs = (d: ExpenseDraft, p: ExpensePhoto[] = photos) => ({
  draft: d,
  photos: p,
  referenceData,
  categoryEntitySet: "cr40f_categorias",
  cityEntitySet: "cr40f_cidades",
  veiculoEntitySet: "cr40f_veiculos",
  lookupNavigationNames: nav as never
});

test("PATCH de completar não altera valor, data, forma, estabelecimento, origem nem conciliação", () => {
  const payload = buildGastoCartaoCompletarPayload(buildArgs(draft()));
  assert.equal(payload.cr40f_observacao, "Almoço com o cliente");
  assert.equal(payload.cr40f_statusoperacional, 100000000);
  assert.equal(payload.cr40f_statusanexo, 100000001);
  assert.equal(payload["cr40f_Categoria@odata.bind"], "/cr40f_categorias(cat-almoco)");
  assert.equal(payload["cr40f_Cidade@odata.bind"], "/cr40f_cidades(city-sp)");
  for (const proibido of ["cr40f_valor", "cr40f_datagasto", "cr40f_estabelecimento", "cr40f_nome", "cr40f_origem", "cr40f_conciliadacartao", "cr40f_FormaPagamento@odata.bind"]) {
    assert.equal(proibido in payload, false, proibido);
  }
  assert.throws(() => buildGastoCartaoCompletarPayload(buildArgs(draft(), [])), /foto do comprovante/);
});

test("PATCH exige descrição e leva veículo, KM e litros quando a categoria pede", () => {
  assert.throws(() => buildGastoCartaoCompletarPayload(buildArgs(draft({ descricao: "" }))), /Descreva/);
  const payload = buildGastoCartaoCompletarPayload(buildArgs(draft({ categoriaId: "cat-abast", veiculoId: "veic-1", kmInformado: "58230", litros: "42,5" })));
  assert.equal(payload.cr40f_kminformado, 58230);
  assert.equal(payload.cr40f_litros, 42.5);
  assert.equal(payload["cr40f_Veiculo@odata.bind"], "/cr40f_veiculos(veic-1)");
});

test("aviso de duplicidade: mesma forma, valor (±0,05) e data informada de -1 a +2 dias da compra", () => {
  const pendentes = [gasto({ id: "a", valor: 100, dataGasto: "2026-11-03" }), gasto({ id: "b", valor: 100, dataGasto: "2026-11-04" })];
  const forma = pendentes[0].formaPagamentoId;
  const achar = (valor: number, data: string, formaId = forma) => acharGastoCartaoDuplicado(pendentes, formaId, valor, data)?.id ?? null;
  assert.equal(achar(100, "2026-11-03"), "a");
  assert.equal(achar(100.05, "2026-11-04"), "b");
  assert.equal(achar(100, "2026-11-05"), "b");
  assert.equal(achar(100, "2026-11-06"), "b");
  assert.equal(achar(100, "2026-11-07"), null);
  assert.equal(achar(100, "2026-11-02"), "a");
  assert.equal(achar(100, "2026-11-01"), null);
  assert.equal(achar(100.1, "2026-11-03"), null);
  assert.equal(achar(100, "2026-11-03", "outra-forma"), null);
  assert.equal(achar(0, "2026-11-03"), null);
  assert.equal(acharGastoCartaoDuplicado([], forma, 100, "2026-11-03"), null);
});

test("deep links: despesaId (direto, com chaves ou dentro de data) e gastosCartao", () => {
  assert.equal(getInitialDespesaId(`?despesaId=${ID}`), ID);
  assert.equal(getInitialDespesaId(`?despesaId={${ID.toUpperCase()}}`), ID);
  assert.equal(getInitialDespesaId(`?data=${encodeURIComponent(`despesaId=${ID}`)}`), ID);
  assert.equal(getInitialDespesaId("?despesaId=abc"), "");
  assert.equal(getInitialDespesaId(""), "");
  assert.equal(getInitialGastosCartaoLink("?gastosCartao=1"), true);
  assert.equal(getInitialGastosCartaoLink("?gastosCartao=true"), true);
  assert.equal(getInitialGastosCartaoLink("?gastosCartao=0"), false);
  assert.equal(getInitialGastosCartaoLink(""), false);
});

test("leitura do recibo confere com o cartão: valor dentro de R$ 0,05 e mesmo dia", () => {
  assert.deepEqual(conferirLeituraComCartao(gasto(), { valor: 120.55, data: "2026-11-03" }), {
    valor: { recibo: "R$ 120,55", cartao: "R$ 120,50", confere: true },
    data: { recibo: "03/11", cartao: "03/11", confere: true }
  });
  assert.deepEqual(Object.keys(conferirLeituraComCartao(gasto(), { valor: 120.5, data: null }) ?? {}), ["valor"]);
  assert.deepEqual(Object.keys(conferirLeituraComCartao(gasto(), { valor: null, data: "2026-11-03" }) ?? {}), ["data"]);
});

test("leitura com valor diferente traz recibo e cartão do valor; a data que bate segue como confere", () => {
  const conferencia = conferirLeituraComCartao(gasto({ valor: 58 }), { valor: 99.9, data: "2026-11-03" });
  assert.deepEqual(conferencia?.valor, { recibo: "R$ 99,90", cartao: "R$ 58,00", confere: false });
  assert.equal(conferencia?.data?.confere, true);
  assert.equal(conferirLeituraComCartao(gasto({ valor: 51.9 }), { valor: 51.96, data: null })?.valor?.confere, false);
});

test("leitura com data diferente traz dd/mm do recibo e do cartão; valor e data divergem por campo", () => {
  assert.deepEqual(conferirLeituraComCartao(gasto(), { valor: 120.5, data: "2026-10-10" })?.data, { recibo: "10/10", cartao: "03/11", confere: false });
  const ambos = conferirLeituraComCartao(gasto({ valor: 51.9 }), { valor: 99.9, data: "2026-10-10" });
  assert.deepEqual([ambos?.valor?.confere, ambos?.data?.confere], [false, false]);
});

test("leitura sem valor nem data válidos não diz nada", () => {
  assert.equal(conferirLeituraComCartao(gasto(), { valor: null, data: null }), null);
  assert.equal(conferirLeituraComCartao(gasto(), { valor: 0, data: "lixo" }), null);
});

test("leitura no modo cartão nunca muda valor, data, forma, estabelecimento nem descrição", () => {
  const leitura = {
    legivel: true, valor: 99.9, data: "2026-10-10", hora: null, estabelecimento: "Outro Lugar", cnpj: null, litros: 40,
    cidade: "São Paulo", uf: "SP", categoria_sugerida: "Abastecimento", forma_pagamento_sugerida: "Particular (Reembolso)", motivo_ilegivel: null
  };
  const base = draft({ categoriaId: "", cidadeId: "", descricao: "", litros: "" });
  const depois = aplicarLeituraNoGastoCartao(base, leitura, referenceData);
  assert.deepEqual(
    { valor: depois.valor, dataGasto: depois.dataGasto, formaPagamentoId: depois.formaPagamentoId, estabelecimento: depois.estabelecimento, descricao: depois.descricao },
    { valor: base.valor, dataGasto: base.dataGasto, formaPagamentoId: base.formaPagamentoId, estabelecimento: base.estabelecimento, descricao: "" }
  );
  assert.equal(depois.categoriaId, "cat-abast");
  assert.equal(depois.cidadeId, "city-sp");
  assert.equal(depois.litros, "40");
  const preenchido = aplicarLeituraNoGastoCartao(draft({ litros: "10" }), leitura, referenceData);
  assert.equal(preenchido.categoriaId, "cat-almoco");
  assert.equal(preenchido.litros, "10");
});
