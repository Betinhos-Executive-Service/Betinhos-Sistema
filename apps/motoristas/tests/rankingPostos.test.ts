import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicarMinhaAvaliacao, maioriaNaoRecomenda, motivoPositivo, nomeCurto, percentualRecomenda, rotuloMotivo, rotuloRecomendacoes, SEM_AVALIACOES } from "../src/lib/avaliacaoPostos.ts";
import { comLimite, enderecoLegivel, nomePosto, parseRankingPostos, postosProximos, rotuloAbastecimentos, rotuloDistancia, rotuloMelhor, separarMelhor, urlMaps } from "../src/lib/rankingPostos.ts";

const origem = { lat: -23, lon: -45 };
const posto = (nome: string, precoLitro: number, lat: number, lon = -45, aproximada = false) => ({ postoId: nome, avaliacoes: SEM_AVALIACOES, nome, precoLitro, abastecimentos: 2, ultimoAbastecimento: "2026-11-03", lat, lon, aproximada, endereco: "RUA A, 10 - TAUBATE/SP", historico: [] });

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
  assert.equal(rotuloMelhor("verde", true), "Menor preço perto de você");
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

test("urlMaps pesquisa como posto de gasolina, com nome e endereço", () => {
  const url = new URL(urlMaps({ nome: "Posto A", endereco: "RUA A, 10 - TAUBATE/SP", lat: -23, lon: -45 }));
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "Posto de gasolina Posto A RUA A, 10 - TAUBATE/SP");
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

test("parseRankingPostos aceita o plugin anterior, sem id nem avaliações, para a ficha seguir abrindo", () => {
  const { postoId: _id, avaliacoes: _avaliacoes, ...antigo } = posto("A", 6.19, -23);
  const [lido] = parseRankingPostos(JSON.stringify({ ok: true, dias: 30, postos: [antigo] })).postos;
  assert.equal(lido.postoId, "");
  assert.deepEqual(lido.avaliacoes, SEM_AVALIACOES);
});

test("rotuloRecomendacoes concorda com o total e some sem avaliações", () => {
  assert.equal(rotuloRecomendacoes({ total: 0, recomendam: 0 }), "");
  assert.equal(rotuloRecomendacoes({ total: 1, recomendam: 1 }), "1 de 1 recomenda");
  assert.equal(rotuloRecomendacoes({ total: 5, recomendam: 4 }), "4 de 5 recomendam");
});

test("percentualRecomenda arredonda e não divide por zero", () => {
  assert.equal(percentualRecomenda({ total: 0, recomendam: 0 }), 0);
  assert.equal(percentualRecomenda({ total: 3, recomendam: 2 }), 67);
});

test("nomeCurto fica com o primeiro e o último nome", () => {
  assert.equal(nomeCurto("Maria Aparecida da Silva"), "Maria Silva");
  assert.equal(nomeCurto("Maria Silva"), "Maria Silva");
  assert.equal(nomeCurto("  Renan "), "Renan");
});

test("enderecoLegivel tira a caixa alta e mantém a UF", () => {
  assert.equal(enderecoLegivel("AVENIDA BENEDITO DE MATARAZZO, 9183 - SAO JOSE DOS CAMPOS/SP"), "Avenida Benedito de Matarazzo, 9183 - Sao Jose dos Campos/SP");
  assert.equal(enderecoLegivel("Rua Já Escrita, 10"), "Rua Já Escrita, 10");
});

test("motivos têm rótulo e sentido próprios", () => {
  assert.equal(rotuloMotivo("fila_grande"), "Fila grande");
  assert.equal(motivoPositivo("sem_fila"), true);
  assert.equal(motivoPositivo("fila_grande"), false);
});

test("avaliar de novo no mock substitui a avaliação em vez de contar em dobro", () => {
  const primeira = aplicarMinhaAvaliacao({ ...SEM_AVALIACOES, total: 2, recomendam: 1 }, { recomenda: true, motivos: ["sem_fila"], comentario: "Boa" }, "Eu", "2026-11-06");
  assert.deepEqual([primeira.total, primeira.recomendam, primeira.comentarios.length], [3, 2, 1]);
  const segunda = aplicarMinhaAvaliacao(primeira, { recomenda: false, motivos: ["fila_grande"], comentario: "" }, "Eu", "2026-11-06");
  assert.deepEqual([segunda.total, segunda.recomendam, segunda.comentarios.length], [3, 1, 0]);
  assert.deepEqual(segunda.motivos, ["fila_grande"]);
});

test("maioriaNaoRecomenda só alerta com duas opiniões ou mais e menos da metade recomendando", () => {
  assert.equal(maioriaNaoRecomenda({ total: 1, recomendam: 0 }), false);
  assert.equal(maioriaNaoRecomenda({ total: 2, recomendam: 1 }), false);
  assert.equal(maioriaNaoRecomenda({ total: 3, recomendam: 1 }), true);
  assert.equal(maioriaNaoRecomenda({ total: 2, recomendam: 0 }), true);
});

test("parseRankingPostos lê o convite e limpa o nome, e aceita plugin sem convite", () => {
  const comConvite = parseRankingPostos(JSON.stringify({ ok: true, dias: 30, postos: [], convite: { postoId: "1", nome: "POSTO A LTDA", data: "2026-11-04" } }));
  assert.equal(comConvite.convite?.nome, "Posto A");
  assert.equal(parseRankingPostos(JSON.stringify({ ok: true, dias: 30, postos: [] })).convite, null);
});

test("comLimite recusa quando a resposta passa do tempo e devolve quando chega antes", async () => {
  await assert.rejects(comLimite(new Promise(() => {}), 5), /Tempo esgotado/);
  assert.equal(await comLimite(Promise.resolve("ok"), 50), "ok");
});
