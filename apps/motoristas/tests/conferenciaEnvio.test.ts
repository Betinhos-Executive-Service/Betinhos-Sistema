import assert from "node:assert/strict";
import test from "node:test";
import { calcularSinais, servicoTocaODia, type GastoConferido, type GastoRecente, type ServicoConferido } from "../src/lib/conferenciaEnvio.ts";
import { STATUS_DESPESA } from "../src/lib/gastosRelatorio.ts";

let seq = 0;
const recente = (p: Partial<GastoRecente>): GastoRecente => ({
  id: `r${++seq}`, valor: 10, data: "2026-11-05", categoria: "Outros", formaPagamentoId: "", status: STATUS_DESPESA.enviado,
  statusAnexo: null, litros: null, km: null, veiculoId: "", estabelecimento: "", conciliadaCartao: false, hora: null, ...p
});
const gasto = (p: Partial<GastoConferido>): GastoConferido => ({ categoria: "Outros", valor: 10, data: "2026-11-05", hora: null, litros: null, km: null, veiculoId: "", ...p });
const servicoNoDia: ServicoConferido[] = [{ saida: "2026-11-05T08:00", retorno: "2026-11-05T18:00", cancelado: false }];
const tipos = (args: Parameters<typeof calcularSinais>[0]) => calcularSinais(args).sinais.map((s) => s.tipo);
const base = { leituraData: null, recentes: [], servicos: servicoNoDia };

test("acima da política só na faixa vermelha: refeição > R$ 44,10 e litro > R$ 6,222", () => {
  assert.deepEqual(tipos({ ...base, gasto: gasto({ categoria: "Almoço", valor: 44.1 }) }), []);
  assert.deepEqual(tipos({ ...base, gasto: gasto({ categoria: "Jantar", valor: 44.11 }) }), ["acima_politica"]);
  assert.deepEqual(tipos({ ...base, gasto: gasto({ categoria: "Abastecimento", valor: 62.2, litros: 10 }) }), []);
  assert.deepEqual(tipos({ ...base, gasto: gasto({ categoria: "Abastecimento", valor: 62.3, litros: 10 }) }), ["acima_politica"]);
  assert.deepEqual(tipos({ ...base, gasto: gasto({ categoria: "Café", valor: 90 }) }), []);
});

test("refeição próxima: com hora < 3 h; sem hora, mesma refeição no mesmo dia", () => {
  const almoco = recente({ categoria: "Almoço", valor: 30, hora: "12:00" });
  assert.deepEqual(tipos({ ...base, recentes: [almoco], gasto: gasto({ categoria: "Jantar", valor: 35, hora: "14:59" }) }), ["refeicao_proxima"]);
  assert.deepEqual(tipos({ ...base, recentes: [almoco], gasto: gasto({ categoria: "Jantar", valor: 35, hora: "15:00" }) }), []);
  const semHora = recente({ categoria: "Almoço", valor: 30 });
  assert.deepEqual(tipos({ ...base, recentes: [semHora], gasto: gasto({ categoria: "Almoço", valor: 35 }) }), ["refeicao_proxima"]);
  assert.deepEqual(tipos({ ...base, recentes: [semHora], gasto: gasto({ categoria: "Jantar", valor: 35 }) }), []);
});

test("abastecimento próximo: < 4 h ou < 150 km do anterior do mesmo veículo", () => {
  const anterior = recente({ categoria: "Abastecimento", valor: 200, litros: 40, km: 1000, veiculoId: "v1", data: "2026-11-04", hora: "10:00" });
  const novo = (p: Partial<GastoConferido>) => gasto({ categoria: "Abastecimento", valor: 120, litros: 20, veiculoId: "v1", ...p });
  assert.deepEqual(tipos({ ...base, recentes: [anterior], gasto: novo({ km: 1149, hora: "09:00" }) }), ["abastecimento_proximo"]);
  assert.deepEqual(tipos({ ...base, recentes: [anterior], gasto: novo({ km: 1150, hora: "09:00" }) }), []);
  assert.deepEqual(tipos({ ...base, recentes: [anterior], gasto: novo({ km: 1500, data: "2026-11-04", hora: "13:59" }) }), ["abastecimento_proximo"]);
  assert.deepEqual(tipos({ ...base, recentes: [anterior], gasto: novo({ km: 1100, veiculoId: "v2" }) }), []);
});

test("mais de 3 cafés ou lanches no dia, contando o atual", () => {
  const tres = [1, 2, 3].map(() => recente({ categoria: "Café", valor: 7 + seq }));
  assert.deepEqual(tipos({ ...base, recentes: tres.slice(0, 2), gasto: gasto({ categoria: "Lanche", valor: 15 }) }), []);
  assert.deepEqual(tipos({ ...base, recentes: tres, gasto: gasto({ categoria: "Lanche", valor: 15 }) }), ["muitos_cafes"]);
});

test("possível duplicidade: mesmo valor e mesma data; cancelado e o próprio gasto não contam", () => {
  const igual = recente({ categoria: "Pedágio", valor: 18.9 });
  assert.deepEqual(tipos({ ...base, recentes: [igual], gasto: gasto({ categoria: "Pedágio", valor: 18.9 }) }), ["possivel_duplicidade"]);
  assert.deepEqual(tipos({ ...base, recentes: [{ ...igual, status: STATUS_DESPESA.cancelado }], gasto: gasto({ categoria: "Pedágio", valor: 18.9 }) }), []);
  assert.deepEqual(tipos({ ...base, recentes: [igual], gasto: gasto({ id: igual.id, categoria: "Pedágio", valor: 18.9 }) }), []);
});

test("refeição sem serviço no dia sugere o dia vizinho; serviço que passa da meia-noite e cancelado", () => {
  const ontem: ServicoConferido = { saida: "2026-11-04T09:00", retorno: "2026-11-04T17:00", cancelado: false };
  const r = calcularSinais({ leituraData: null, recentes: [], servicos: [ontem], gasto: gasto({ categoria: "Almoço", valor: 30 }) });
  assert.deepEqual(r.sinais.map((s) => s.tipo), ["refeicao_sem_servico"]);
  assert.equal(r.servicoDiaVizinho, "2026-11-04");
  const madrugada: ServicoConferido = { saida: "2026-11-04T22:00", retorno: "2026-11-05T02:00", cancelado: false };
  assert.deepEqual(tipos({ leituraData: null, recentes: [], servicos: [madrugada], gasto: gasto({ categoria: "Jantar", valor: 30 }) }), []);
  assert.equal(servicoTocaODia({ ...madrugada, cancelado: true }, "2026-11-05"), false);
  assert.deepEqual(tipos({ leituraData: null, recentes: [], servicos: [], gasto: gasto({ categoria: "Abastecimento", valor: 100, litros: 20 }) }), []);
});

test("data diferente da lida no cupom", () => {
  assert.deepEqual(tipos({ ...base, leituraData: "2026-11-04", gasto: gasto({ categoria: "Pedágio", valor: 9 }) }), ["data_diferente_cupom"]);
  assert.deepEqual(tipos({ ...base, leituraData: "2026-11-05", gasto: gasto({ categoria: "Pedágio", valor: 9 }) }), []);
});

test("detalhe cita valores e datas", () => {
  const { sinais } = calcularSinais({ ...base, gasto: gasto({ categoria: "Almoço", valor: 58 }) });
  assert.equal(sinais[0].detalhe, "Almoço de R$ 58,00 contra a política de R$ 42,00");
});
