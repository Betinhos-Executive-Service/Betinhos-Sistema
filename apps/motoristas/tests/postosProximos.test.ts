import assert from "node:assert/strict";
import { test } from "node:test";
import { areaEmVolta, comFriccao, guardadoValido, medidasGaveta, posicaoAposArrasto, posicaoAposToque, rotuloSemConexao, VALIDADE_GUARDADO_MS, areaJaCarregada, CENTRO_PADRAO, consultaPostosNaArea, candidatosDaLista, LIMITE_POSTOS, mapearPosto, maisProximos, origemDasDistancias, proximoRaio, RAIOS_LISTA_KM, rotuloKm, rotuloOrigem, tituloLista, urlGoogleMaps, urlWaze, ZOOM_MAXIMO_FOCO, zoomDoFoco, type Posto } from "../src/features/postos/postosProximos.ts";
import { distanciaKm } from "../src/features/despesas/rankingPostos.ts";
import { comGuardado, ehFalhaDeRede, POSTOS_MOCK } from "../src/features/postos/remoto.ts";
import { guardar, lerGuardado } from "../src/features/postos/guardados.ts";

const posto = (id: string, lat: number, lon: number, nome = id): Posto => ({ id, nome, endereco: "", lat, lon });

test("consultaPostosNaArea filtra rede CTF, exclui Pendente (aceita sem status) e limita ao retângulo visível", () => {
  const consulta = consultaPostosNaArea({ sul: -23.25, norte: -23.15, oeste: -45.95, leste: -45.8 });
  assert.equal(consulta, "$select=new_postocombustivelid,new_name,new_logradouro,new_numero,new_bairro,new_municipio,new_uf,new_latitude,new_longitude"
    + "&$filter=new_aceitactf eq true and (new_statusgeo eq null or new_statusgeo ne 100000000) and new_latitude ge -23.250000 and new_latitude le -23.150000 and new_longitude ge -45.950000 and new_longitude le -45.800000"
    + `&$top=${LIMITE_POSTOS}`);
});

test("consultaPostosNaArea aceita outro limite", () => {
  assert.match(consultaPostosNaArea({ sul: 0, norte: 1, oeste: 0, leste: 1 }, 50), /&\$top=50$/);
});

test("distanciaKm (haversine): zero no mesmo ponto e ~111 km por grau de latitude", () => {
  assert.equal(distanciaKm(CENTRO_PADRAO, CENTRO_PADRAO), 0);
  const km = distanciaKm({ lat: -23, lon: -45 }, { lat: -24, lon: -45 });
  assert.ok(Math.abs(km - 111.19) < 0.1, `veio ${km}`);
  // simétrica
  assert.equal(distanciaKm({ lat: -23, lon: -45 }, { lat: -23.5, lon: -45.7 }), distanciaKm({ lat: -23.5, lon: -45.7 }, { lat: -23, lon: -45 }));
});

test("maisProximos ordena por distância e corta nos 10 primeiros", () => {
  const origem = { lat: -23, lon: -45 };
  const postos = Array.from({ length: 15 }, (_, i) => posto(`p${i}`, -23 - (15 - i) * 0.01, -45));
  const lista = maisProximos(postos, origem);
  assert.equal(lista.length, 10);
  assert.deepEqual(lista.map((p) => p.id), ["p14", "p13", "p12", "p11", "p10", "p9", "p8", "p7", "p6", "p5"]);
  assert.ok(lista.every((p, i) => i === 0 || lista[i - 1].distanciaKm <= p.distanciaKm));
});

test("maisProximos desempata pelo nome e não altera a lista recebida", () => {
  const postos = [posto("b", -23.1, -45, "Zeta"), posto("a", -23.1, -45, "Alfa")];
  assert.deepEqual(maisProximos(postos, { lat: -23, lon: -45 }).map((p) => p.nome), ["Alfa", "Zeta"]);
  assert.deepEqual(postos.map((p) => p.id), ["b", "a"]);
});

test("origem das distâncias: GPS do motorista; sem GPS, o centro padrão", () => {
  const gps = { lat: -23.2, lon: -45.9 };
  const comGps = origemDasDistancias(gps);
  assert.deepEqual(comGps, { ponto: gps, doMotorista: true });
  assert.equal(tituloLista(comGps), "Mais próximos de você");
  assert.equal(tituloLista(comGps, true), "Recomendados perto de você");
  assert.equal(rotuloOrigem(comGps), "de você");
  const semGps = origemDasDistancias(null);
  assert.deepEqual(semGps, { ponto: CENTRO_PADRAO, doMotorista: false });
  assert.equal(tituloLista(semGps), "Mais próximos do centro de SJC");
  assert.equal(tituloLista(semGps, true), "Recomendados perto do centro de SJC");
  assert.equal(rotuloOrigem(semGps), "do centro de São José dos Campos");
});

test("a lista mede do motorista: a ordem e as distâncias não mudam com o posto tocado nem com o mapa arrastado", () => {
  const motorista = { lat: -23.2, lon: -45.9 };
  const postos = [posto("perto", -23.201, -45.9), posto("meio", -23.22, -45.9), posto("longe", -23.3, -45.9)];
  const lista = maisProximos(postos, origemDasDistancias(motorista).ponto);
  assert.deepEqual(lista.map((p) => p.id), ["perto", "meio", "longe"]);
  // Nenhum item mede de si mesmo: a distância ao motorista nunca é 0 m para postos fora do ponto do GPS.
  assert.ok(lista.every((p) => p.distanciaKm > 0.05));
  assert.equal(rotuloKm(lista[0].distanciaKm), "111 m");
  // Sem GPS a medida parte do centro padrão, não do centro de onde o mapa foi arrastado.
  const semGps = maisProximos(postos, origemDasDistancias(null).ponto);
  assert.equal(semGps[0].distanciaKm, distanciaKm(CENTRO_PADRAO, postos.find((p) => p.id === semGps[0].id)!));
});

test("areaEmVolta: a caixa tem meia-largura do raio em latitude e longitude", () => {
  const area = areaEmVolta(CENTRO_PADRAO, 10);
  const norte = distanciaKm(CENTRO_PADRAO, { lat: area.norte, lon: CENTRO_PADRAO.lon });
  const leste = distanciaKm(CENTRO_PADRAO, { lat: CENTRO_PADRAO.lat, lon: area.leste });
  assert.ok(Math.abs(norte - 10) < 0.2, `norte ${norte}`);
  assert.ok(Math.abs(leste - 10) < 0.2, `leste ${leste}`);
});

test("proximoRaio amplia de 10 para 30 km até ter 10 postos no raio e para ao bater o limite ou no maior raio", () => {
  const origem = { lat: -23, lon: -45 };
  const emFila = (n: number, passoKm: number) => Array.from({ length: n }, (_, i) => posto(`p${i}`, -23 - ((i + 1) * passoKm) / 111.32, -45));
  const [medio, grande] = RAIOS_LISTA_KM;
  assert.deepEqual(RAIOS_LISTA_KM, [10, 30]);
  // 10 postos, o último a 1 km: já basta em 10 km.
  assert.equal(proximoRaio(emFila(10, 0.1), origem, medio), null);
  // só 9 postos: precisa ampliar.
  assert.equal(proximoRaio(emFila(9, 0.1), origem, medio), grande);
  // 10 postos, mas o 10º a 15 km: fora dos 10 km, amplia.
  assert.equal(proximoRaio(emFila(10, 1.5), origem, medio), grande);
  // no maior raio não há o que tentar.
  assert.equal(proximoRaio(emFila(3, 1), origem, grande), null);
  // bateu o limite: ampliar só piora o recorte arbitrário.
  assert.equal(proximoRaio(emFila(5, 1), origem, medio, 5), null);
});

test("candidatosDaLista: todos os postos a até 10 km; com menos de 10, até 30 km", () => {
  const origem = { lat: -23, lon: -45 };
  const emKm = (id: string, km: number) => posto(id, -23 - km / 111.32, -45);
  const muitos = [...Array.from({ length: 12 }, (_, i) => emKm(`p${i}`, i + 0.5)), emKm("longe", 20)];
  assert.deepEqual(candidatosDaLista(muitos, origem).map((p) => p.id), Array.from({ length: 10 }, (_, i) => `p${i}`));
  const poucos = [emKm("a", 2), emKm("b", 25), emKm("fora", 40)];
  assert.deepEqual(candidatosDaLista(poucos, origem).map((p) => p.id), ["a", "b"]);
});

test("areaJaCarregada só reaproveita área contida e que não bateu o limite", () => {
  const carregada = { sul: -23.3, norte: -23.1, oeste: -46, leste: -45.8 };
  const dentro = { sul: -23.25, norte: -23.15, oeste: -45.95, leste: -45.85 };
  assert.equal(areaJaCarregada(dentro, { area: carregada, cheia: false }), true);
  assert.equal(areaJaCarregada(dentro, { area: carregada, cheia: true }), false);
  assert.equal(areaJaCarregada({ ...dentro, norte: -23.05 }, { area: carregada, cheia: false }), false);
});

test("zoomDoFoco mantém o zoom atual e limita em 15", () => {
  assert.equal(ZOOM_MAXIMO_FOCO, 15);
  assert.equal(zoomDoFoco(12.4), 12.4);
  assert.equal(zoomDoFoco(15), 15);
  assert.equal(zoomDoFoco(17.2), 15);
});

test("mapearPosto monta nome e endereço legíveis; sem coordenada não vira pino", () => {
  const ok = mapearPosto({ new_postocombustivelid: "x1", new_name: "AUTO POSTO EXEMPLO LTDA", new_logradouro: "AVENIDA EXEMPLO", new_numero: "10", new_bairro: "CENTRO", new_municipio: "SAO JOSE DOS CAMPOS", new_uf: "SP", new_latitude: -23.18, new_longitude: -45.88 });
  assert.equal(ok?.nome, "Auto Posto Exemplo");
  assert.equal(ok?.endereco, "Avenida Exemplo, 10 - Centro - Sao Jose dos Campos/SP");
  assert.equal(mapearPosto({ new_postocombustivelid: "x2", new_name: "A", new_latitude: null, new_longitude: -45 }), null);
  assert.equal(mapearPosto({ new_postocombustivelid: "x3", new_name: "A" }), null);
  assert.equal(mapearPosto({ new_name: "A", new_latitude: -23, new_longitude: -45 }), null);
});

test("links de navegação usam a coordenada do posto", () => {
  assert.equal(urlWaze({ lat: -23.1, lon: -45.9 }), "https://waze.com/ul?ll=-23.1,-45.9&navigate=yes");
  assert.equal(urlGoogleMaps({ lat: -23.1, lon: -45.9 }), "https://www.google.com/maps/search/?api=1&query=-23.1%2C-45.9");
});

test("rotuloKm usa metros abaixo de 1 km", () => {
  assert.equal(rotuloKm(0.45), "450 m");
  assert.equal(rotuloKm(2.34), "2,3 km");
});

test("conjunto fictício do modo local fica na região de São José dos Campos", () => {
  assert.ok(POSTOS_MOCK.length >= 10);
  assert.ok(POSTOS_MOCK.every((p) => distanciaKm(CENTRO_PADRAO, p) < 40 && p.id && p.nome));
});

// ---------------- Preço e recomendação (postosDados) ----------------
import { idMenorPreco, podeAvaliar, recomendados, indexarRanking, indicadorNoMapa, juntarDados, notaDoPosto, rotuloBaseDoPreco, rotuloDia, rotuloPrecoLitro, rotuloPrecoMapa } from "../src/features/postos/postosDados.ts";
import { SEM_AVALIACOES } from "../src/features/despesas/avaliacaoPostos.ts";
import type { RankingPostos } from "../src/features/despesas/rankingPostos.ts";

const itemRanking = (postoId: string, precoLitro: number, avaliacoes = SEM_AVALIACOES) => ({ postoId, nome: postoId, precoLitro, abastecimentos: 5, ultimoAbastecimento: "2026-11-03", lat: 0, lon: 0, aproximada: false, endereco: "", historico: [], avaliacoes });
const ranking = (...postos: ReturnType<typeof itemRanking>[]): RankingPostos => ({ dias: 30, convite: null, postos });
const aval = (total: number, recomendam: number, contagemMotivos: Record<string, number> = {}) => ({ ...SEM_AVALIACOES, total, recomendam, contagemMotivos, motivos: Object.keys(contagemMotivos) });

test("juntarDados casa posto e ranking pelo id; ausente fica sem dados", () => {
  const dados = indexarRanking(ranking(itemRanking("a", 6.09, aval(12, 11)), itemRanking("b", 6.89)));
  const juntos = juntarDados([posto("a", 0, 0), posto("c", 0, 0)], dados);
  assert.equal(juntos[0].dados?.precoLitro, 6.09);
  assert.equal(juntos[0].dados?.avaliacoes.total, 12);
  assert.equal(juntos[0].dados?.cor, "verde");
  assert.equal(juntos[1].dados, null);
});

test("juntarDados com ranking que falhou (null) devolve os postos sem preço nem nota", () => {
  assert.deepEqual(juntarDados([posto("a", 0, 0)], null).map((p) => p.dados), [null]);
  assert.equal(indexarRanking(null).size, 0);
});

test("indexarRanking ignora postoId vazio (plugin antigo) e preço inválido, e colore pelo semáforo da meta", () => {
  const dados = indexarRanking(ranking(itemRanking("", 6), itemRanking("x", 0), itemRanking("v", 6.1), itemRanking("m", 6.2), itemRanking("r", 6.5)));
  assert.deepEqual([...dados.keys()], ["v", "m", "r"]);
  assert.deepEqual(["v", "m", "r"].map((id) => dados.get(id)?.cor), ["verde", "amarelo", "vermelho"]);
  assert.equal(dados.get("v")?.dias, 30);
});

test("formatação de preço: vírgula, /L e etiqueta curta do mapa", () => {
  assert.equal(rotuloPrecoLitro(6.19), "R$ 6,19/L");
  assert.equal(rotuloPrecoLitro(6), "R$ 6,00/L");
  assert.equal(rotuloPrecoMapa(5.9), "R$ 5,90");
});

test("rotuloDia e rotuloBaseDoPreco dizem quando e com base em quê", () => {
  assert.equal(rotuloDia("2026-11-03"), "03/11");
  assert.equal(rotuloDia(""), "");
  assert.equal(rotuloBaseDoPreco({ abastecimentos: 5, dias: 30, ultimoAbastecimento: "2026-11-03" }), "Média de 5 abastecimentos em 30 dias · último em 03/11");
  assert.equal(rotuloBaseDoPreco({ abastecimentos: 1, dias: 30, ultimoAbastecimento: "2026-11-03" }), "1 abastecimento em 30 dias · último em 03/11");
});

test("notaDoPosto: percentual e total; sem avaliações some; maioria que não recomenda vira alerta", () => {
  assert.deepEqual(notaDoPosto(aval(12, 11)), { texto: "92%", total: 12, alerta: false });
  assert.equal(notaDoPosto(SEM_AVALIACOES), null);
  assert.equal(notaDoPosto(aval(7, 2))?.alerta, true);
  assert.equal(notaDoPosto(aval(1, 0))?.alerta, true, "0% nunca aparece com polegar positivo");
  assert.equal(notaDoPosto(aval(1, 1))?.alerta, false);
  assert.equal(notaDoPosto(aval(4, 2))?.alerta, false, "metade recomendando não alerta");
});

test("indicadorNoMapa só marca aprovação clara ou alerta", () => {
  assert.equal(indicadorNoMapa(aval(12, 11)), "bom");
  assert.equal(indicadorNoMapa(aval(7, 2)), "alerta");
  assert.equal(indicadorNoMapa(aval(1, 1)), null);
  assert.equal(indicadorNoMapa(SEM_AVALIACOES), null);
});

test("idMenorPreco destaca o mais barato só com 2 ou mais preços diferentes", () => {
  const dados = indexarRanking(ranking(itemRanking("a", 6.2), itemRanking("b", 5.99), itemRanking("c", 6.5)));
  const com = juntarDados([posto("a", 0, 0), posto("sem", 0, 0), posto("b", 0, 0), posto("c", 0, 0)], dados);
  assert.equal(idMenorPreco(com), "b");
  assert.equal(idMenorPreco(com.filter((p) => p.id === "b")), "", "um só preço não é menor");
  const iguais = juntarDados([posto("a", 0, 0), posto("d", 0, 0)], indexarRanking(ranking(itemRanking("a", 6), itemRanking("d", 6))));
  assert.equal(idMenorPreco(iguais), "", "empate total não destaca");
  assert.equal(idMenorPreco([]), "");
});

test("medidasGaveta: aberta deixa livre a faixa dos botões do mapa; meio fica entre recolhida e aberta", () => {
  const g = medidasGaveta(600);
  assert.equal(g.visivel.recolhida, 76);
  assert.ok(g.visivel.aberta <= 600 - 148);
  assert.ok(g.visivel.meio > g.visivel.recolhida && g.visivel.meio < g.visivel.aberta);
  assert.deepEqual([g.deslocamento.aberta, g.deslocamento.meio > 0, g.deslocamento.recolhida > g.deslocamento.meio], [0, true, true]);
  assert.ok(medidasGaveta(100).total >= 76);
});

test("comFriccao: dentro dos limites acompanha o dedo; fora, só 25% da distância", () => {
  assert.equal(comFriccao(50, 0, 100), 50);
  assert.equal(comFriccao(-40, 0, 100), -10);
  assert.equal(comFriccao(140, 0, 100), 110);
});

test("posicaoAposArrasto: sem flick vai à mais próxima; com flick, à próxima na direção do gesto", () => {
  const g = medidasGaveta(600);
  const { meio, recolhida } = g.deslocamento;
  assert.equal(posicaoAposArrasto(meio - 5, 0, g), "meio");
  assert.equal(posicaoAposArrasto(5, 0.02, g), "aberta");
  assert.equal(posicaoAposArrasto(recolhida - 4, 0, g), "recolhida");
  assert.equal(posicaoAposArrasto(meio + 10, 0.2, g), "recolhida");
  assert.equal(posicaoAposArrasto(meio - 10, -0.2, g), "aberta");
  assert.equal(posicaoAposArrasto(5, -0.5, g), "aberta");
  assert.equal(posicaoAposArrasto(recolhida - 2, 0.5, g), "recolhida");
});

test("posicaoAposToque alterna meio e aberta; recolhida e aberta vão ao meio", () => {
  assert.deepEqual((["recolhida", "meio", "aberta"] as const).map(posicaoAposToque), ["meio", "aberta", "meio"]);
});

test("guardadoValido: vale por 7 dias e recusa data futura ou inválida", () => {
  const agora = Date.UTC(2026, 10, 11, 12);
  assert.equal(guardadoValido(agora - VALIDADE_GUARDADO_MS, agora), true);
  assert.equal(guardadoValido(agora - VALIDADE_GUARDADO_MS - 1, agora), false);
  assert.equal(guardadoValido(agora + 1, agora), false);
  assert.equal(guardadoValido(Number.NaN, agora), false);
});

test("rotuloSemConexao usa o fuso de São Paulo", () => {
  assert.equal(rotuloSemConexao(Date.UTC(2026, 10, 10, 17, 32)), "Sem conexão · dados de 10/11 14:32");
  assert.equal(rotuloSemConexao(Date.UTC(2026, 10, 11, 2, 5)), "Sem conexão · dados de 10/11 23:05");
});

test("podeAvaliar: só o posto do convite, de 0 a 7 dias atrás (dia de São Paulo)", () => {
  const agora = new Date("2026-11-11T15:00:00Z");
  assert.equal(podeAvaliar({ postoId: "a", data: "2026-11-11" }, "a", agora), true);
  assert.equal(podeAvaliar({ postoId: "a", data: "2026-11-04" }, "a", agora), true);
  assert.equal(podeAvaliar({ postoId: "a", data: "2026-11-03" }, "a", agora), false);
  assert.equal(podeAvaliar({ postoId: "a", data: "2026-11-12" }, "a", agora), false);
  assert.equal(podeAvaliar({ postoId: "a", data: "2026-11-10" }, "b", agora), false);
  assert.equal(podeAvaliar(null, "a", agora), false);
  assert.equal(podeAvaliar({ postoId: "a", data: "2026-11-10" }, "a", new Date("2026-11-11T01:00:00Z")), true);
});

// localStorage de mentira: o node não tem um.
function comArmazenamento(corpo: (dados: Map<string, string>) => void | Promise<void>) {
  const dados = new Map<string, string>();
  const antes = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => { dados.set(k, v); } } });
  return Promise.resolve(corpo(dados)).finally(() => { if (antes) Object.defineProperty(globalThis, "localStorage", antes); else delete (globalThis as { localStorage?: unknown }).localStorage; });
}

test("guardar e lerGuardado: ida e volta, separados por motorista, sem id não guarda nem lê", () => comArmazenamento((dados) => {
  guardar("m1", "area", [1, 2]);
  assert.deepEqual(lerGuardado<number[]>("m1", "area")?.dados, [1, 2]);
  assert.equal(lerGuardado("m2", "area"), null);
  guardar("", "area", [9]);
  assert.equal(lerGuardado("", "area"), null);
  assert.deepEqual([...dados.keys()], ["app-motoristas-postos:m1:area"]);
}));

test("lerGuardado: cópia vencida, de formato inesperado ou ilegível vira null", () => comArmazenamento((dados) => {
  dados.set("app-motoristas-postos:m1:area", JSON.stringify({ salvoEm: Date.now() - VALIDADE_GUARDADO_MS - 1000, dados: [1] }));
  assert.equal(lerGuardado("m1", "area"), null);
  dados.set("app-motoristas-postos:m1:area", JSON.stringify({ salvoEm: Date.now(), dados: "x" }));
  assert.equal(lerGuardado("m1", "area"), null);
  dados.set("app-motoristas-postos:m1:area", "{não é json");
  assert.equal(lerGuardado("m1", "area"), null);
}));

test("comGuardado: sucesso guarda; falha de rede usa a cópia do motorista; outro erro não usa a cópia", () => comArmazenamento(async () => {
  assert.deepEqual(await comGuardado("m1", "area", async () => [1], (d) => d, (d) => d), { dados: [1], desde: null });
  const offline = await comGuardado("m1", "area", async () => { throw new TypeError("Failed to fetch"); }, (d) => d, (d) => d);
  assert.deepEqual(offline.dados, [1]);
  assert.equal(typeof offline.desde, "number");
  await assert.rejects(comGuardado("m1", "area", async () => { throw Object.assign(new Error("403 Forbidden"), { code: 403 }); }, (d) => d, (d) => d), /403/);
  await assert.rejects(comGuardado("m2", "area", async () => { throw new TypeError("Failed to fetch"); }, (d) => d, (d) => d), /Failed to fetch/);
}));

test("ehFalhaDeRede: fetch e tempo esgotado sim; 401, 403 e 500 não", () => {
  assert.equal(ehFalhaDeRede(new TypeError("Failed to fetch")), true);
  assert.equal(ehFalhaDeRede({ message: "Network request failed" }), true);
  assert.equal(ehFalhaDeRede({ message: "The request timed out" }), true);
  assert.equal(ehFalhaDeRede({ message: "Unauthorized (401)" }), false);
  assert.equal(ehFalhaDeRede(new Error("Internal Server Error 500")), false);
});
test("paraFicha leva preço, histórico e avaliações do ranking para a ficha; sem ranking, preço 0 e sem avaliações", async () => {
  const { paraFicha } = await import("../src/features/postos/postosDados.ts");
  const dados = indexarRanking(ranking({ ...itemRanking("a", 6.09, aval(3, 2)), historico: [{ data: "2026-11-03", precoLitro: 6.09 }] }));
  const [comDados, semDados] = juntarDados([posto("a", -23.19, -45.88), posto("b", -23.2, -45.9)], dados);
  const ficha = paraFicha(comDados, 1.2);
  assert.equal(ficha.postoId, "a");
  assert.equal(ficha.precoLitro, 6.09);
  assert.equal(ficha.distanciaKm, 1.2);
  assert.equal(ficha.historico.length, 1);
  assert.equal(ficha.avaliacoes.total, 3);
  const vazia = paraFicha(semDados, 4, aval(1, 1));
  assert.equal(vazia.precoLitro, 0);
  assert.equal(vazia.historico.length, 0);
  assert.equal(vazia.avaliacoes.total, 1);
});

const candidato = (id: string, km: number, preco: number | null, avaliacoes = SEM_AVALIACOES) => {
  const dados = preco === null ? null : indexarRanking(ranking(itemRanking(id, preco, avaliacoes))).get(id)!;
  return { ...posto(id, 0, 0), distanciaKm: km, dados };
};

test("recomendados: o mais barato e bem avaliado passa na frente do mais perto", () => {
  const lista = recomendados([candidato("perto", 0.3, 6.6), candidato("barato", 4, 5.9, aval(10, 9)), candidato("meio", 2, 6.2)]);
  // "meio" é R$ 0,40 mais barato que "perto": 1,7 km a mais não compensa.
  assert.deepEqual(lista.map((p) => p.id), ["barato", "meio", "perto"]);
  assert.equal(lista[0].motivo, "Menor preço");
  assert.ok(lista.every((p) => p.pontos !== null && p.pontos >= 0 && p.pontos <= 100));
});

test("recomendados: maioria que não recomenda derruba a nota; motivo é o critério que mais pesou", () => {
  const lista = recomendados([candidato("ruim", 1, 6.2, aval(10, 1)), candidato("bom", 1, 6.5, aval(10, 10)), candidato("caro", 0.1, 6.9)]);
  assert.equal(lista[0].id, "bom");
  assert.equal(lista[0].motivo, "Bem avaliado");
  assert.ok(lista.find((p) => p.id === "ruim")!.pontos! < lista[0].pontos!);
  assert.equal(lista.find((p) => p.id === "caro")!.motivo, "Mais perto");
});

test("recomendados: sem preço vai para o fim, por distância, com 'Sem preço recente'; corta em 10", () => {
  const semPreco = [candidato("sp-longe", 3, null), candidato("sp-perto", 0.2, null)];
  const lista = recomendados([...semPreco, candidato("caro", 9, 6.9)]);
  assert.deepEqual(lista.map((p) => p.id), ["caro", "sp-perto", "sp-longe"]);
  assert.deepEqual(lista.slice(1).map((p) => [p.pontos, p.motivo]), [[null, "Sem preço recente"], [null, "Sem preço recente"]]);
  assert.equal(recomendados(Array.from({ length: 15 }, (_, i) => candidato(`p${i}`, i, 6))).length, 10);
});
