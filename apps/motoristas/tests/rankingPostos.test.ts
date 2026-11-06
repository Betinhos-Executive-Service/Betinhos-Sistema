import assert from "node:assert/strict";
import { test } from "node:test";
import { nomePosto, parseRankingPostos, postosProximos, rotuloAbastecimentos, rotuloDistancia, rotuloMelhor, separarMelhor, urlMaps } from "../src/features/despesas/rankingPostos.ts";

const origem = { lat: -23, lon: -45 };
const posto = (nome: string, precoLitro: number, lat: number, lon = -45, aproximada = false) => ({ nome, precoLitro, abastecimentos: 2, ultimoAbastecimento: "2026-11-03", lat, lon, aproximada, endereco: "RUA A, 10 - TAUBATE/SP", historico: [] });

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

test("separarMelhor destaca o menor preço e, no empate, o mais perto", () => {
  const lista = postosProximos([posto("Caro perto", 6.8, -23.01), posto("Barato", 6.09, -23.03), posto("Barato longe", 6.09, -23.05)], origem);
  const { melhor, outros } = separarMelhor(lista);
  assert.equal(melhor.nome, "Barato");
  assert.deepEqual(outros.map((p) => p.nome), ["Caro perto", "Barato longe"]);
});

test("rotuloMelhor só chama de melhor opção quem está dentro da meta", () => {
  assert.equal(rotuloMelhor("verde"), "Melhor opção perto de você");
  assert.equal(rotuloMelhor("vermelho"), "Menor preço perto de você");
});

test("parseRankingPostos entrega o nome já limpo", () => {
  const ranking = parseRankingPostos(JSON.stringify({ ok: true, dias: 30, postos: [posto("AUTO POSTO DA GRUTA LTDA", 6.19, -23)] }));
  assert.equal(ranking.postos[0].nome, "Auto Posto da Gruta");
});

test("nomePosto limpa a razão social em caixa alta e preserva nome já escrito", () => {
  assert.equal(nomePosto("AUTO POSTO DA GRUTA LTDA"), "Auto Posto da Gruta");
  assert.equal(nomePosto("Posto Sol da Dutra"), "Posto Sol da Dutra");
});

test("nomePosto limpa sufixos compostos da razão social", () => {
  for (const nome of ["AUTO POSTO DA GRUTA LTDA - ME", "AUTO POSTO DA GRUTA LTDA ME", "AUTO POSTO DA GRUTA LTDA-EPP", "AUTO POSTO DA GRUTA LTDA."]) {
    assert.equal(nomePosto(nome), "Auto Posto da Gruta");
  }
});

test("nomePosto mantém siglas em caixa alta", () => {
  assert.equal(nomePosto("POSTO BR-116 JK"), "Posto BR-116 JK");
});

test("urlMaps pesquisa pelo nome e pelo endereço", () => {
  const url = new URL(urlMaps({ nome: "Posto A", endereco: "RUA A, 10 - TAUBATE/SP", lat: -23, lon: -45 }));
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "Posto A RUA A, 10 - TAUBATE/SP");
});

test("urlMaps usa a coordenada quando o posto não tem endereço", () => {
  const url = new URL(urlMaps({ nome: "Posto A", endereco: "", lat: -23.5, lon: -45.25 }));
  assert.equal(url.searchParams.get("query"), "-23.5,-45.25");
});

test("parseRankingPostos aceita a resposta do plugin sem endereço e histórico", () => {
  const { endereco: _endereco, historico: _historico, ...antigo } = posto("A", 6.19, -23);
  const ranking = parseRankingPostos(JSON.stringify({ ok: true, dias: 30, postos: [antigo] }));
  assert.equal(ranking.postos[0].endereco, "");
  assert.deepEqual(ranking.postos[0].historico, []);
});
