import assert from "node:assert/strict";
import test from "node:test";
import { agruparMinhasMultas, descreverParcela, erroDeRede, parcelasVigentes, diaMes, mapMinhaMulta, textoAceite, type MinhaMulta } from "../src/features/termos/minhasMultas.ts";
import { lerMinhasMultas, MINHAS_MULTAS_OFFLINE_KEY, salvarMinhasMultas } from "../src/features/termos/minhasMultasOffline.ts";

const multa = (p: Partial<MinhaMulta>): MinhaMulta => ({ id: "m1", auto: "A000000001", placa: "TST1A23", dataHora: "2026-11-05T17:30:00Z", local: "Av. Exemplo, 100 (fictício)", infracao: "Infração fictícia", grupo: "andamento", situacao: "Aguardando o pagamento", acao: null, termoId: null, termoStatus: null, prazoAceite: null, aceiteDeclaradoEm: null, parcelas: [], ...p });

const memoria = () => {
  const dados = new Map<string, string>();
  return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => { dados.set(k, v); }, removeItem: (k: string) => { dados.delete(k); } };
};

test("agrupa na ordem do servidor", () => {
  const g = agruparMinhasMultas([multa({ id: "a", grupo: "precisa", acao: "assinar" }), multa({ id: "b" }), multa({ id: "c", grupo: "encerrada" }), multa({ id: "d", grupo: "precisa", acao: "aceite" })]);
  assert.deepEqual([g.precisa.length, g.andamento.length, g.encerrada.length], [2, 1, 1]);
  assert.deepEqual(g.precisa.map((m) => m.id), ["a", "d"]);
});

test("cache é do usuário que salvou", () => {
  const armazem = memoria();
  salvarMinhasMultas("u1", [multa({})], armazem);
  assert.equal(lerMinhasMultas("u1", armazem)?.itens.length, 1);
  assert.equal(lerMinhasMultas("u2", armazem), null);
});

test("cache quebrado não derruba", () => {
  const armazem = memoria();
  armazem.setItem(MINHAS_MULTAS_OFFLINE_KEY, "{quebrado");
  assert.equal(lerMinhasMultas("u1", armazem), null);
  armazem.setItem(MINHAS_MULTAS_OFFLINE_KEY, JSON.stringify({ salvoEm: "ontem", itens: [] }));
  assert.equal(lerMinhasMultas("u1", armazem), null);
});

test("armazenamento que falha ao gravar não derruba", () => {
  const quebrado = { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error("cheio"); } };
  assert.doesNotThrow(() => salvarMinhasMultas("u1", [multa({})], quebrado));
});

test("lê o JSON do servidor (MinhasMultas.cs) e ignora item inválido", () => {
  const ok = mapMinhaMulta({ id: "x", auto: "A1", placa: "TST1A23", dataHora: "2026-11-05T17:30:00Z", local: "L", infracao: "I", grupo: "precisa", situacao: "Aceite a indicação na CNH Digital", acao: "aceite", termoId: null, termoStatus: null, prazoAceite: "2026-11-25", aceiteDeclaradoEm: null, parcelas: [{ numero: 1, competencia: "2026-12-01", valor: 65.08, status: "prevista" }] });
  assert.equal(ok?.acao, "aceite");
  assert.equal(ok?.parcelas[0].valor, 65.08);
  assert.equal(mapMinhaMulta({ id: "x", grupo: "outro" }), null);
  assert.equal(mapMinhaMulta(null), null);
});

test("textos do aceite e da parcela", () => {
  assert.equal(textoAceite("A000000001", "2026-11-25"), "Abra a CNH Digital, vá em Infrações e aceite a indicação da multa A000000001 até 25/11.");
  assert.equal(diaMes("2026-11-05"), "05/11");
  assert.equal(descreverParcela({ numero: 2, competencia: "2026-12-01", valor: 65.08, status: "prevista" }, 3), "Parcela 2 de 3 · R$ 65,08 · folha de 12/2026 · prevista");
});

test("total de parcelas ignora as canceladas", () => {
  const todas = [
    { numero: 1, competencia: "2026-11-01", valor: 10, status: "descontada" },
    { numero: 2, competencia: "2026-12-01", valor: 10, status: "cancelada" },
    { numero: 3, competencia: "2027-01-01", valor: 10, status: "prevista" }
  ];
  const vigentes = parcelasVigentes(todas);
  assert.deepEqual(vigentes.map((p) => p.numero), [1, 3]);
  assert.match(descreverParcela(vigentes[0], vigentes.length), /^Parcela 1 de 2 /);
});

test("só falha de rede usa o cache; erro do servidor não", () => {
  assert.equal(erroDeRede(new TypeError("Failed to fetch")), true);
  assert.equal(erroDeRede(Object.assign(new Error("x"), { cause: new TypeError("f") })), true);
  assert.equal(erroDeRede(Object.assign(new Error("Falha ao registrar ação (500)."), { code: 500 })), false);
  assert.equal(erroDeRede(new SyntaxError("json")), false);
});
