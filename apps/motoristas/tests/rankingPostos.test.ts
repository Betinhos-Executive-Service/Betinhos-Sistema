import assert from "node:assert/strict";
import { test } from "node:test";
import { ehMenorPreco, parseRankingPostos, rotuloAbastecimentos, type CidadeRanking } from "../src/lib/rankingPostos.ts";

const posto = (nome: string, precoLitro: number) => ({ nome, precoLitro, abastecimentos: 2, ultimoAbastecimento: "2026-11-03" });

test("parseRankingPostos lê a resposta da Custom API", () => {
  const ranking = parseRankingPostos(JSON.stringify({ ok: true, dias: 30, cidades: [{ cidade: "Taubaté - SP", postos: [posto("A", 6.19)] }] }));
  assert.equal(ranking.dias, 30);
  assert.equal(ranking.cidades[0].postos[0].precoLitro, 6.19);
});

test("parseRankingPostos falha quando o plugin não acha o motorista, para a tela mostrar erro e não lista vazia", () => {
  assert.throws(() => parseRankingPostos(JSON.stringify({ ok: false, motivo: "sem_motorista" })), /indisponível/);
  assert.throws(() => parseRankingPostos(""), /indisponível/);
});

test("ehMenorPreco só marca quando há com quem comparar e aceita empate", () => {
  const sozinho: CidadeRanking = { cidade: "X", postos: [posto("A", 6)] };
  assert.equal(ehMenorPreco(sozinho, sozinho.postos[0]), false);
  const empate: CidadeRanking = { cidade: "Y", postos: [posto("A", 6), posto("B", 6), posto("C", 7)] };
  assert.deepEqual(empate.postos.map((p) => ehMenorPreco(empate, p)), [true, true, false]);
});

test("rotuloAbastecimentos avisa quando a média vem de um abastecimento só", () => {
  assert.equal(rotuloAbastecimentos(1), "Baseado em 1 abastecimento");
  assert.equal(rotuloAbastecimentos(4), "4 abastecimentos");
});
