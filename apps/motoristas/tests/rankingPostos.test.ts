import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRankingPostos, postosProximos, rotuloAbastecimentos, rotuloDistancia } from "../src/lib/rankingPostos.ts";

const origem = { lat: -23, lon: -45 };
const posto = (nome: string, precoLitro: number, lat: number, lon = -45, aproximada = false) => ({ nome, precoLitro, abastecimentos: 2, ultimoAbastecimento: "2026-11-03", lat, lon, aproximada });

test("parseRankingPostos lê a resposta da Custom API", () => {
  const ranking = parseRankingPostos(JSON.stringify({ ok: true, dias: 30, postos: [posto("A", 6.19, -23)] }));
  assert.equal(ranking.dias, 30);
  assert.equal(ranking.postos[0].precoLitro, 6.19);
});

test("parseRankingPostos falha quando o plugin não acha o motorista, para a tela mostrar erro e não lista vazia", () => {
  assert.throws(() => parseRankingPostos(JSON.stringify({ ok: false, motivo: "sem_motorista" })), /indisponíveis/);
  assert.throws(() => parseRankingPostos(""), /indisponíveis/);
});

test("postosProximos ordena pela distância e deixa de fora quem passa de 10 km", () => {
  const lista = postosProximos([posto("Longe", 5.5, -23.2), posto("Médio", 6, -23.05), posto("Perto", 7, -23.01)], origem);
  assert.deepEqual(lista.map((p) => p.nome), ["Perto", "Médio"]);
});

test("postosProximos usa a meta do relatório no semáforo", () => {
  const lista = postosProximos([posto("Na meta", 6.1, -23.001), posto("No limite", 6.22, -23.002), posto("Acima", 6.23, -23.003)], origem);
  assert.deepEqual(lista.map((p) => p.cor), ["verde", "amarelo", "vermelho"]);
});

test("rotuloDistancia usa metros abaixo de 1 km e avisa quando o ponto é aproximado", () => {
  assert.equal(rotuloDistancia({ distanciaKm: 0.4321, aproximada: false }), "432 m");
  assert.equal(rotuloDistancia({ distanciaKm: 0.9996, aproximada: false }), "1,0 km");
  assert.equal(rotuloDistancia({ distanciaKm: 2.34, aproximada: false }), "2,3 km");
  assert.equal(rotuloDistancia({ distanciaKm: 2.34, aproximada: true }), "cerca de 2,3 km");
});

test("rotuloAbastecimentos avisa quando a média vem de um abastecimento só", () => {
  assert.equal(rotuloAbastecimentos(1), "Baseado em 1 abastecimento");
  assert.equal(rotuloAbastecimentos(4), "4 abastecimentos");
});
