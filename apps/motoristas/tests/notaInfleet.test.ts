import assert from "node:assert/strict";
import test from "node:test";
import { atualizadaEm, faixaDaNota, lerNotaInfleet, oQueMelhorar, proximaFaixa, rotuloMes, variacaoMensal } from "../src/features/minha-nota/notaInfleet.ts";
import { NOTA_CACHE_KEY, lerNotaCache, salvarNotaCache } from "../src/features/minha-nota/notaCache.ts";

test("lerNotaInfleet mapeia o resultado ok", () => {
  const nota = lerNotaInfleet(JSON.stringify({
    schema: 1, situacao: "ok", periodo: { inicio: "2026-08-21", fim: "2026-11-19" }, km: 5156.2, nota: 82.9,
    comportamentos: [{ chave: "hardBraking", rotulo: "Frenagem brusca", nota: 67 }],
    meses: [{ ano: 2026, mes: 11, nota: 99.8, km: 100 }]
  }));
  assert.equal(nota.situacao, "ok");
  if (nota.situacao !== "ok") return;
  assert.equal(nota.inicio, "2026-08-21");
  assert.equal(nota.fim, "2026-11-19");
  assert.equal(nota.nota, 82.9);
  assert.equal(nota.comportamentos[0].rotulo, "Frenagem brusca");
  assert.equal(nota.meses[0].mes, 11);
});

test("lerNotaInfleet valida schema e situação", () => {
  assert.throws(() => lerNotaInfleet(JSON.stringify({ schema: 2, situacao: "ok" })), /Resposta inesperada da nota\./);
  assert.throws(() => lerNotaInfleet(JSON.stringify({ schema: 1, situacao: "x" })), /Resposta inesperada da nota\./);
  assert.deepEqual(lerNotaInfleet(JSON.stringify({ schema: 1, situacao: "sem_cadastro" })), { situacao: "sem_cadastro" });
});

test("faixaDaNota usa a nota arredondada", () => {
  assert.equal(faixaDaNota(89.6).rotulo, "Ótima");
  assert.equal(faixaDaNota(89.4).rotulo, "Boa");
  assert.equal(faixaDaNota(75).rotulo, "Boa");
  assert.equal(faixaDaNota(74.4).rotulo, "Atenção");
  assert.equal(faixaDaNota(74.4).tom, "atencao");
});

test("oQueMelhorar traz até 2 abaixo de 90, da pior para a melhor", () => {
  const c = [95, 60, 80, 70].map((nota, i) => ({ chave: `k${i}`, rotulo: `R${i}`, nota }));
  assert.deepEqual(oQueMelhorar(c).map((x) => x.nota), [60, 70]);
  assert.deepEqual(oQueMelhorar([{ chave: "a", rotulo: "A", nota: 95 }]), []);
});

test("rotuloMes", () => {
  assert.equal(rotuloMes(2026, 11), "nov/26");
  assert.equal(rotuloMes(2027, 1), "jan/27");
});

test("proximaFaixa diz quantos pontos faltam", () => {
  assert.deepEqual(proximaFaixa(82.9), { rotulo: "Ótima", faltam: 7 });
  assert.deepEqual(proximaFaixa(60), { rotulo: "Boa", faltam: 15 });
  assert.equal(proximaFaixa(89.6), null);
});

test("variacaoMensal compara o último mês com o anterior", () => {
  const m = (mes: number, nota: number) => ({ ano: 2026, mes, nota, km: 100 });
  assert.equal(variacaoMensal([m(11, 90)]), null);
  const v = variacaoMensal([m(9, 70), m(10, 88.7), m(11, 92.4)]);
  assert.equal(v?.pontos, 3);
  assert.equal(v?.mesAnterior.mes, 10);
});

function armazemFalso() {
  const dados = new Map<string, string>();
  return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v), removeItem: (k: string) => void dados.delete(k), dados };
}

test("cache da nota vale 1 h e é do usuário que salvou", () => {
  const armazem = armazemFalso();
  const nota = { situacao: "sem_cadastro" } as const;
  salvarNotaCache("u1", nota, armazem, new Date("2026-11-19T10:00:00Z"));
  assert.deepEqual(lerNotaCache("u1", armazem, new Date("2026-11-19T10:59:00Z")), { nota, fresca: true });
  assert.equal(lerNotaCache("u1", armazem, new Date("2026-11-19T11:01:00Z"))?.fresca, false);
  assert.equal(lerNotaCache("u2", armazem), null);
  assert.equal(armazem.dados.has(NOTA_CACHE_KEY), false);
});

const baseTabela = { schema: 1, situacao: "ok", nota: 80, km: 100, periodo: { inicio: "2026-08-21", fim: "2026-11-19" }, meses: [] };

test("lê sincronizadoEm e mostra em São Paulo", () => {
  const nota = lerNotaInfleet(JSON.stringify({ ...baseTabela, sincronizadoEm: "2026-11-19T08:00:05Z", comportamentos: [] }));
  assert.equal(nota.situacao === "ok" && nota.sincronizadoEm, "2026-11-19T08:00:05Z");
  assert.equal(atualizadaEm("2026-11-19T08:00:05Z"), "Atualizada em 19/11 às 05:00");
});

test("sincronizadoEm inválido é descartado na leitura", () => {
  const nota = lerNotaInfleet(JSON.stringify({ ...baseTabela, sincronizadoEm: "ontem", comportamentos: [] }));
  assert.equal(nota.situacao === "ok" ? nota.sincronizadoEm : "x", undefined);
});
