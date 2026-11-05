import assert from "node:assert/strict";
import test from "node:test";
import {
  METAS_GASTOS,
  STATUS_DESPESA,
  calcularMedias,
  contarSemComprovante,
  despesasDoPeriodo,
  despesasMock,
  ehPendente,
  filtroDespesasRelatorio,
  hojeSaoPaulo,
  mapDespesaRelatorio,
  mediaPorGasto,
  montarRelatorio,
  periodoDe,
  precoMedioLitro,
  semaforo,
  tendenciaMensal,
  variacaoPercentual,
  type DespesaRelatorio
} from "../src/lib/gastosRelatorio.ts";

let seq = 0;
const d = (parcial: Partial<DespesaRelatorio>): DespesaRelatorio => ({
  id: `d${++seq}`, valor: 10, data: "2026-11-10", categoria: "Outros", formaPagamentoId: "", status: STATUS_DESPESA.enviado,
  statusAnexo: 100000002, litros: null, km: null, veiculoId: "", estabelecimento: "", conciliadaCartao: false, ...parcial
});
const HOJE = "2026-11-20";

test("preço médio por litro = valor ÷ litros e ignora abastecimento sem litros", () => {
  const lista = [
    d({ categoria: "Abastecimento", valor: 300, litros: 50 }),
    d({ categoria: "Abastecimento", valor: 200, litros: 30 }),
    d({ categoria: "Abastecimento", valor: 999, litros: null }),
    d({ categoria: "Abastecimento", valor: 999, litros: 0 }),
    d({ categoria: "Almoço", valor: 40, litros: 5 })
  ];
  const media = precoMedioLitro(lista);
  assert.equal(media?.quantidade, 2);
  assert.ok(Math.abs((media?.valor ?? 0) - 500 / 80) < 1e-9);
  assert.equal(precoMedioLitro([d({ categoria: "Abastecimento", litros: null })]), null);
});

test("refeição média considera almoço e jantar, sem acento e sem café", () => {
  const lista = [d({ categoria: "Almoço", valor: 40 }), d({ categoria: "Jantar", valor: 60 }), d({ categoria: "Café", valor: 10 }), d({ categoria: "Lanche", valor: 20 })];
  assert.deepEqual(mediaPorGasto(lista, "almoco", "jantar"), { valor: 50, quantidade: 2 });
  assert.deepEqual(mediaPorGasto(lista, "cafe", "lanche"), { valor: 15, quantidade: 2 });
  assert.equal(mediaPorGasto(lista, "pedagio"), null);
});

test("variação contra o período anterior: sem base devolve null, com base arredonda", () => {
  assert.equal(variacaoPercentual(6.24, 6), 4);
  assert.equal(variacaoPercentual(5.82, 6), -3);
  assert.equal(variacaoPercentual(6, null), null);
  assert.equal(variacaoPercentual(6, 0), null);
  const base = [d({ categoria: "Almoço", valor: 40, data: "2026-11-05" })];
  const semBase = montarRelatorio(base, "mes", HOJE);
  assert.equal(semBase.cartoes[0].variacao, null);
  const comBase = montarRelatorio([...base, d({ categoria: "Almoço", valor: 50, data: "2026-10-05" })], "mes", HOJE);
  assert.equal(comBase.cartoes[0].variacao, -20);
});

test("Cancelado fica fora de total, médias, status e lista", () => {
  const lista = [
    d({ categoria: "Almoço", valor: 40, data: "2026-11-05" }),
    d({ categoria: "Almoço", valor: 400, data: "2026-11-06", status: STATUS_DESPESA.cancelado })
  ];
  assert.equal(despesasDoPeriodo(lista, "2026-11-01", "2026-12-01").length, 1);
  const rel = montarRelatorio(lista, "mes", HOJE);
  assert.equal(rel.total, 40);
  assert.equal(rel.quantidade, 1);
  assert.equal(rel.cartoes[0].valor, 40);
  assert.equal(rel.despesas.length, 1);
});

test("semáforo contra a política: litro com faixa amarela de 2% e refeição de 5%", () => {
  const { litro, refeicao } = METAS_GASTOS;
  assert.equal(semaforo(6.1, litro), "verde");
  assert.equal(semaforo(5.89, litro), "verde");
  assert.equal(semaforo(6.11, litro), "amarelo");
  assert.equal(semaforo(6.222, litro), "amarelo");
  assert.equal(semaforo(6.23, litro), "vermelho");
  assert.equal(semaforo(42, refeicao), "verde");
  assert.equal(semaforo(44.1, refeicao), "amarelo");
  assert.equal(semaforo(44.11, refeicao), "vermelho");
});

test("lista do período: todas da mais recente para a mais antiga; pendente é só precisa corrigir e recusado", () => {
  const lista = [
    d({ id: "a", categoria: "Almoço", data: "2026-11-02", status: STATUS_DESPESA.validado }),
    d({ id: "b", categoria: "Almoço", data: "2026-11-05", status: STATUS_DESPESA.precisaCorrigir }),
    d({ id: "c", categoria: "Almoço", data: "2026-11-03", status: STATUS_DESPESA.enviado }),
    d({ id: "e", categoria: "Almoço", data: "2026-11-01", status: STATUS_DESPESA.recusado })
  ];
  const rel = montarRelatorio(lista, "mes", HOJE);
  assert.deepEqual(rel.despesas.map((x) => x.id), ["b", "c", "a", "e"]);
  assert.deepEqual(rel.despesas.filter(ehPendente).map((x) => x.id), ["b", "e"]);
});

test("tendência mensal: R$/L e refeição por mês até o atual, sem meses vazios no início e com o período marcado", () => {
  const lista = [
    d({ categoria: "Abastecimento", valor: 300, litros: 50, data: "2026-09-10" }),
    d({ categoria: "Abastecimento", valor: 310, litros: 50, data: "2026-11-03" }),
    d({ categoria: "Abastecimento", valor: 999, litros: null, data: "2026-11-04" }),
    d({ categoria: "Almoço", valor: 40, data: "2026-10-02" }),
    d({ categoria: "Jantar", valor: 60, data: "2026-10-03" }),
    d({ categoria: "Almoço", valor: 90, data: "2026-11-05", status: STATUS_DESPESA.cancelado })
  ];
  const { litro, refeicao } = tendenciaMensal(lista, periodoDe("mes", HOJE), HOJE);
  assert.deepEqual(litro.map((p) => [p.rotulo, p.valor, p.noPeriodo]), [["set", 6, false], ["out", null, false], ["nov", 6.2, true]]);
  assert.deepEqual(refeicao.map((p) => [p.rotulo, p.valor]), [["set", null], ["out", 50], ["nov", null]]);
  const tres = tendenciaMensal(lista, periodoDe("3meses", HOJE), HOJE);
  assert.deepEqual(tres.litro.map((p) => p.noPeriodo), [true, true, true]);
  assert.deepEqual(tendenciaMensal([], periodoDe("mes", HOJE), HOJE), { litro: [], refeicao: [] });
  assert.equal(montarRelatorio(lista, "mesAnterior", HOJE).tendencia.litro.find((p) => p.noPeriodo)?.rotulo, "out");
});

test("limites do período em America/Sao_Paulo", () => {
  // 02:59Z de 01/12 ainda é 30/11 em São Paulo (UTC-3); 03:00Z já é dezembro.
  assert.equal(hojeSaoPaulo(new Date("2026-12-01T02:59:00Z")), "2026-11-30");
  assert.equal(hojeSaoPaulo(new Date("2026-12-01T03:00:00Z")), "2026-12-01");
  assert.equal(hojeSaoPaulo(new Date("2026-01-01T01:00:00Z")), "2025-12-31");
  const mes = periodoDe("mes", "2026-11-30");
  assert.deepEqual([mes.inicio, mes.fim, mes.anteriorInicio, mes.anteriorFim], ["2026-11-01", "2026-12-01", "2026-10-01", "2026-11-01"]);
  const anterior = periodoDe("mesAnterior", "2026-01-15");
  assert.deepEqual([anterior.inicio, anterior.fim, anterior.anteriorInicio], ["2025-12-01", "2026-01-01", "2025-11-01"]);
  const tres = periodoDe("3meses", "2026-11-20");
  assert.deepEqual([tres.inicio, tres.fim, tres.anteriorInicio, tres.anteriorFim], ["2026-09-01", "2026-12-01", "2026-06-01", "2026-09-01"]);
  const lista = [d({ data: "2026-10-31" }), d({ data: "2026-11-01" }), d({ data: "2026-11-30" }), d({ data: "2026-12-01" })];
  assert.deepEqual(despesasDoPeriodo(lista, mes.inicio, mes.fim).map((x) => x.data), ["2026-11-01", "2026-11-30"]);
});

test("sem comprovante e mapeamento das colunas do Dataverse", () => {
  assert.equal(contarSemComprovante([d({ statusAnexo: 100000000 }), d({ statusAnexo: 100000003 }), d({ statusAnexo: 100000002 }), d({ statusAnexo: null })]), 2);
  const mapa = new Map([["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "Pedágio"]]);
  const despesa = mapDespesaRelatorio({
    cr40f_despesaoperacionalid: "11111111-2222-4333-8444-555555555555", cr40f_valor: 18.9, cr40f_datagasto: "2026-11-03T12:00:00Z",
    _cr40f_categoria_value: "{AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE}", cr40f_statusoperacional: 100000002, cr40f_litros: null, cr40f_kminformado: 120,
    cr40f_estabelecimento: "Dutra", cr40f_conciliadacartao: true
  }, mapa);
  assert.deepEqual([despesa.categoria, despesa.data, despesa.valor, despesa.status, despesa.litros, despesa.km, despesa.conciliadaCartao], ["Pedágio", "2026-11-03", 18.9, STATUS_DESPESA.validado, null, 120, true]);
  const filtro = filtroDespesasRelatorio("11111111-2222-4333-8444-555555555555", HOJE);
  assert.match(filtro, /_cr40f_motorista_value eq 11111111-2222-4333-8444-555555555555 and statecode eq 0 and cr40f_datagasto ge 2026-06-01T00:00:00Z and cr40f_datagasto lt 2026-12-01T00:00:00Z/);
  assert.throws(() => filtroDespesasRelatorio("nada", HOJE), /Motorista não identificado/);
});

test("mock: cerca de 25 despesas, nunca no futuro, e o relatório do mês atual tem médias", () => {
  for (const hoje of ["2026-11-04", "2026-11-30", "2026-03-01"]) {
    const mock = despesasMock(hoje);
    assert.ok(mock.length >= 25);
    assert.ok(mock.every((x) => x.data <= hoje), `futuro em ${hoje}`);
  }
  const rel = montarRelatorio(despesasMock("2026-11-20"), "mes", "2026-11-20");
  assert.deepEqual(rel.cartoes.map((c) => c.id), ["litro", "refeicao", "cafeLanche"]);
  assert.ok(rel.cartoes.every((c) => c.variacao != null));
});
