import assert from "node:assert/strict";
import test from "node:test";
import { agruparMinhasMultas, etapaDaMulta, resumoDesconto, legendaParcelas, mesFolha, diasAteOPrazo, textoChipPrazo, erroDeRede, parcelasVigentes, diaMes, mapMinhaMulta, type MinhaMulta } from "../src/features/termos/minhasMultas.ts";
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

test("dia e mês", () => {
  assert.equal(diaMes("2026-11-05"), "05/11");
});

test("total de parcelas ignora as canceladas", () => {
  const todas = [
    { numero: 1, competencia: "2026-11-01", valor: 10, status: "descontada" },
    { numero: 2, competencia: "2026-12-01", valor: 10, status: "cancelada" },
    { numero: 3, competencia: "2027-01-01", valor: 10, status: "prevista" }
  ];
  const vigentes = parcelasVigentes(todas);
  assert.deepEqual(vigentes.map((p) => p.numero), [1, 3]);
});

test("só falha de rede usa o cache; erro do servidor não", () => {
  assert.equal(erroDeRede(new TypeError("Failed to fetch")), true);
  assert.equal(erroDeRede(Object.assign(new Error("x"), { cause: new TypeError("f") })), true);
  assert.equal(erroDeRede(Object.assign(new Error("Falha ao registrar ação (500)."), { code: 500 })), false);
  assert.equal(erroDeRede(new SyntaxError("json")), false);
});

const parc = (numero: number, status: string, valor = 65.08) => ({ numero, competencia: `2026-${10 + numero}-01`, valor, status });

test("etapa da multa: ação manda, encerrada fecha, parcelas decidem, resto se infere", () => {
  assert.equal(etapaDaMulta(multa({ grupo: "precisa", acao: "assinar" })), 0);
  assert.equal(etapaDaMulta(multa({ grupo: "precisa", acao: "aceite" })), 1);
  assert.equal(etapaDaMulta(multa({ grupo: "encerrada", parcelas: [parc(1, "descontada")] })), 4);
  assert.equal(etapaDaMulta(multa({ parcelas: [parc(1, "descontada"), parc(2, "prevista")] })), 2);
  assert.equal(etapaDaMulta(multa({ parcelas: [parc(1, "descontada"), parc(2, "cancelada")] })), 3);
  assert.equal(etapaDaMulta(multa({ termoStatus: "pendente" })), 0);
  assert.equal(etapaDaMulta(multa({ aceiteDeclaradoEm: "2026-11-10" })), 1);
  assert.equal(etapaDaMulta(multa({ termoStatus: "assinado" })), 2);
  assert.equal(etapaDaMulta(multa({})), 2);
});

test("resumo do desconto soma só o que falta e ignora cancelada", () => {
  const r = resumoDesconto([parc(1, "descontada"), parc(2, "prevista"), parc(3, "prevista"), parc(4, "cancelada", 99)]);
  assert.deepEqual(r, { total: 3, descontadas: 1, falta: 130.16 });
  assert.deepEqual(resumoDesconto([]), { total: 0, descontadas: 0, falta: 0 });
  assert.equal(legendaParcelas(1, 3), "1 de 3 parcelas descontada");
  assert.equal(legendaParcelas(2, 3), "2 de 3 parcelas descontadas");
  assert.equal(legendaParcelas(0, 1), "0 de 1 parcela descontadas");
});

test("mês da folha e chip de prazo", () => {
  assert.equal(mesFolha("2026-11-01"), "Nov/2026");
  assert.equal(mesFolha("2027-01-01"), "Jan/2027");
  assert.equal(mesFolha(null), "");
  assert.equal(diasAteOPrazo("2026-11-25", "2026-11-18"), 7);
  assert.equal(diasAteOPrazo("2026-12-01", "2026-11-30"), 1);
  assert.equal(diasAteOPrazo(null, "2026-11-18"), null);
  assert.equal(textoChipPrazo("2026-11-25", "2026-11-18"), "Até 25/11 · faltam 7 dias");
  assert.equal(textoChipPrazo("2026-11-19", "2026-11-18"), "Até 19/11 · falta 1 dia");
  assert.equal(textoChipPrazo("2026-11-18", "2026-11-18"), "Até 18/11 · é hoje");
  assert.equal(textoChipPrazo("2026-11-10", "2026-11-18"), "Prazo vencido em 10/11");
  assert.equal(textoChipPrazo(null, "2026-11-18"), "");
});
