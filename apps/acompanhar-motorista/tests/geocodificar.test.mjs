import assert from "node:assert/strict";
import test from "node:test";
import { candidatosEndereco, cidadeDoTexto, expandirAbreviacoes, geocodificarCampos, interpretarEndereco, limparTexto, pertoDe, provedorNominatim, provedorPhoton, provedorTomTom, rotuloSeguro } from "../src/geocodificar.mjs";

const KENVUE = "Kenvue JK - Av. Pres. Juscelino Kubitschek, 2041 - São Paulo/SP";
const RITZ = "Rio de Janeiro - Ritz Leblon";
const FASANO = "Hotel Fasano Sao Paulo - R. Vittorio Fasano, 88";
const TULIP = "1. Fulano - Golden Tulip Colinas Hotel - Av. São João, 2200 - Jardim das Colinas, São José dos Campos";
const FABIANA = "FABIANA - Rua Jacurici, 129, apto 172";
const GRU = "Aerop. Guarulhos";

// Respostas no formato real de cada API (campos reduzidos).
const json = (corpo) => ({ ok: true, json: async () => corpo });
const tt = (type, lat, lon, extra = {}) => ({ type, score: 10, position: { lat, lon }, address: { municipality: extra.cidade, freeformAddress: extra.end ?? "" }, ...extra.r });
const fetchFalso = (rotas) => async (url) => { for (const [re, corpo] of rotas) if (re.test(decodeURIComponent(url))) return json(corpo); return json({ results: [], features: [] }); };

test("expande abreviações e limpa nome, apto e prefixo numerado", () => {
  assert.equal(expandirAbreviacoes("Av. Pres. Juscelino Kubitschek"), "Avenida Presidente Juscelino Kubitschek");
  assert.equal(expandirAbreviacoes("R. Vittorio Fasano, Al. Santos, Dr. X, Prof. Y, Brig. Z, Eng. W, Pça. K, Rod. A, Estr. B"), "Rua Vittorio Fasano, Alameda Santos, Doutor X, Professor Y, Brigadeiro Z, Engenheiro W, Praça K, Rodovia A, Estrada B");
  assert.equal(limparTexto(FABIANA), "Rua Jacurici, 129");
  assert.equal(limparTexto(TULIP), "Golden Tulip Colinas Hotel - Avenida São João, 2200 - Jardim das Colinas, São José dos Campos");
  assert.equal(limparTexto("07:30 - MUHIDINOV, RAKHIMOV - Rua A, 10 - bloco B"), "Rua A, 10");
  assert.equal(limparTexto("Rua Apinajés, 10"), "Rua Apinajés, 10", "'ap' dentro de palavra fica");
});

test("cidadeDoTexto reconhece Cidade/UF, Cidade - UF, Cidade, UF e '- Cidade' no fim", () => {
  assert.deepEqual(cidadeDoTexto(KENVUE), { cidade: "São Paulo", uf: "SP" });
  assert.deepEqual(cidadeDoTexto("Rua X, 10 - Pindamonhangaba - SP"), { cidade: "Pindamonhangaba", uf: "SP" });
  assert.deepEqual(cidadeDoTexto("Rua X, 10, Campinas, SP"), { cidade: "Campinas", uf: "SP" });
  assert.deepEqual(cidadeDoTexto(TULIP), { cidade: "São José dos Campos", uf: "SP" });
  assert.deepEqual(cidadeDoTexto(RITZ), { cidade: "Rio de Janeiro", uf: "RJ" });
  assert.equal(cidadeDoTexto("Rua A, 10"), null);
});

test("candidatos não repetem a cidade e tiram o bairro da consulta principal", () => {
  const c = candidatosEndereco("Av. Pres. JK, 2041 - Itaim Bibi, São Paulo, SP");
  assert.equal(c[0], "Avenida Presidente JK, 2041, São Paulo, SP");
  assert.ok(c.every((x) => (x.match(/São Paulo/g) ?? []).length === 1), c.join(" | "));
  assert.ok(c.length <= 3);
  assert.equal(candidatosEndereco(KENVUE)[0], "Avenida Presidente Juscelino Kubitschek, 2041, São Paulo, SP");
  assert.equal(candidatosEndereco(RITZ)[0], "Ritz Leblon, Rio de Janeiro, RJ");
  assert.equal(candidatosEndereco(GRU)[0], "Aeroporto Internacional de Guarulhos");
});

test("rótulos públicos limpos nos 6 casos", () => {
  assert.equal(rotuloSeguro(KENVUE, "Destino"), "Avenida Presidente Juscelino Kubitschek, 2041", "sem palavra de lugar, o pedaço não vira rótulo");
  assert.equal(rotuloSeguro(RITZ, "Destino"), "Destino");
  assert.equal(rotuloSeguro(FASANO, "Saída"), "Hotel Fasano Sao Paulo");
  assert.equal(rotuloSeguro(TULIP, "Saída"), "Golden Tulip Colinas Hotel");
  assert.equal(rotuloSeguro(FABIANA, "Destino"), "Rua Jacurici, 129");
  assert.equal(rotuloSeguro(GRU, "Destino"), "Aeroporto de Guarulhos");
  assert.equal(rotuloSeguro("", "Parada 1"), "Parada 1");
  assert.equal(rotuloSeguro("MARIA", "Saída"), "Saída", "só nome de pessoa → padrão");
});

test("Kenvue JK: ponto de ônibus em Sorocaba é recusado; acha o de São Paulo", async () => {
  const nominatim = provedorNominatim(fetchFalso([[/Kenvue/, []], [/Juscelino/, [
    { lat: "-23.506", lon: "-47.461", class: "highway", type: "bus_stop", addresstype: "highway", display_name: "Av. Pres. JK de Oliveira, Sorocaba, São Paulo, Brasil", address: { city: "Sorocaba", state: "São Paulo" } },
    { lat: "-23.591", lon: "-46.690", class: "place", type: "house", addresstype: "place", display_name: "2041, Av. Pres. JK, Itaim Bibi, São Paulo", address: { city: "São Paulo" } }]]]));
  const r = await geocodificarCampos(interpretarEndereco(KENVUE), [nominatim]);
  assert.equal(r.lat, -23.591);
  assert.equal(r.lon, -46.69);
});

test("Ritz Leblon: centro do Brasil (país) é recusado; Photon acha no Rio", async () => {
  const nominatim = provedorNominatim(fetchFalso([[/Ritz/, [{ lat: "-14.97", lon: "-54.05", class: "boundary", type: "administrative", addresstype: "country", display_name: "Brasil" }]]]));
  const photon = provedorPhoton(fetchFalso([[/Ritz/, { features: [{ geometry: { coordinates: [-43.224, -22.985] }, properties: { countrycode: "BR", type: "house", osm_value: "hotel", name: "Ritz Leblon", city: "Rio de Janeiro" } }] }]]));
  const r = await geocodificarCampos(interpretarEndereco(RITZ), [nominatim, photon]);
  assert.equal(r.fonte, "photon");
  assert.equal(r.lat, -22.985);
});

test("Fasano: TomTom acha o POI; sem cidade e sem vizinho não há viés (não assume São Paulo)", async () => {
  const urls = [];
  const f = async (url) => { urls.push(url); return json({ results: /Fasano/.test(decodeURIComponent(url)) ? [tt("Geography", -23.55, -46.63, { r: { entityType: "Municipality" }, cidade: "São Paulo" }), tt("POI", -23.565, -46.669, { cidade: "São Paulo", r: { poi: { name: "Hotel Fasano" } } })] : [] }); };
  const r = await geocodificarCampos(interpretarEndereco(FASANO), [provedorTomTom("k", f)]);
  assert.equal(r.lat, -23.565);
  assert.equal(r.fonte, "tomtom");
  assert.doesNotMatch(urls[0], /[?&]lat=/);
});

test("rua sem cidade: viés no embarque e rejeita a homônima de outra cidade (Av. Nove de Julho, SJC x SP)", async () => {
  const embarque = { lat: -23.2326, lon: -45.9246 }; // Jacareí/SJC
  const campos = { local: null, logradouro: "Avenida Nove de Julho, 417", cidade: null, uf: null, bairro: null, termo: null, lugar: null };
  assert.deepEqual(pertoDe(campos, embarque), embarque);
  assert.equal(pertoDe(campos), null);
  const hits = [{ lat: -23.5496, lon: -46.6419, generico: false, nome: "Avenida Nove de Julho, São Paulo" }, { lat: -23.2, lon: -45.9, generico: false, nome: "Avenida Nove de Julho, São José dos Campos" }];
  const r = await geocodificarCampos(campos, [Object.assign(async () => hits, { nome: "x" })], { vizinho: embarque });
  assert.equal(r.lat, -23.2);
  const so = await geocodificarCampos(campos, [Object.assign(async () => [hits[0]], { nome: "x" })], { vizinho: embarque });
  assert.equal(so, null, "só a homônima de São Paulo: não aceita");
});

test("Golden Tulip SJC, Rua Jacurici e Aerop. Guarulhos geocodificam (aeroporto com área)", async () => {
  const tomtom = provedorTomTom("k", fetchFalso([
    [/Golden Tulip/, { results: [tt("POI", -23.204, -45.909, { cidade: "São José dos Campos" })] }],
    [/Jacurici/, { results: [tt("Point Address", -23.585, -46.676, { cidade: "São Paulo" })] }],
    [/Aeroporto Internacional de Guarulhos/, { results: [tt("POI", -23.4356, -46.4731, { cidade: "Guarulhos", r: { poi: { name: "Aeroporto GRU", categories: ["airport"] }, viewport: { topLeftPoint: { lat: -23.415, lon: -46.50 }, btmRightPoint: { lat: -23.445, lon: -46.45 } } } })] }],
  ]));
  const sjc = await geocodificarCampos(interpretarEndereco(TULIP), [tomtom]);
  assert.equal(sjc.lat, -23.204);
  const fab = await geocodificarCampos(interpretarEndereco(FABIANA), [tomtom]);
  assert.equal(fab.lat, -23.585);
  const gru = await geocodificarCampos(interpretarEndereco(GRU), [tomtom]);
  assert.deepEqual(gru.area, { sul: -23.445, norte: -23.415, oeste: -46.5, leste: -46.45 });
});

test("resultado a mais de 600 km da etapa anterior é recusado; cai no próximo provedor", async () => {
  const longe = Object.assign(async () => [{ lat: -3.1, lon: -60.0, cidade: null }], { nome: "a" });
  const perto = Object.assign(async () => [{ lat: -23.56, lon: -46.65, cidade: null }], { nome: "b" });
  const r = await geocodificarCampos(interpretarEndereco("Rua Augusta, 100"), [longe, perto], { vizinho: { lat: -23.5, lon: -46.6 } });
  assert.equal(r.fonte, "b");
});

test("no máximo 3 variações por provedor", async () => {
  let n = 0;
  const p = Object.assign(async () => { n++; return []; }, { nome: "x" });
  await geocodificarCampos(interpretarEndereco(TULIP), [p]);
  assert.ok(n <= 3, String(n));
});

test("Fasano homônimo: prefere o resultado na rua citada (Photon real devolve o Fasano Itaim primeiro)", async () => {
  const photon = provedorPhoton(fetchFalso([[/Fasano/, { features: [
    { geometry: { coordinates: [-46.677376, -23.5814351] }, properties: { countrycode: "BR", type: "house", osm_value: "hotel", name: "Hotel Fasano São Paulo Itaim", street: "Rua Pedroso Alvarenga", city: "São Paulo" } },
    { geometry: { coordinates: [-46.6695253, -23.56445] }, properties: { countrycode: "BR", type: "house", osm_value: "hotel", name: "Hotel Fasano", street: "Rua Vitório Fasano", city: "São Paulo" } }] }]]));
  const r = await geocodificarCampos(interpretarEndereco(FASANO), [photon]);
  assert.equal(r.lat, -23.56445);
});

test("nome em caixa mista não vira rótulo: com ' - ', sem ' - ' e em link antigo", () => {
  assert.equal(rotuloSeguro("Fabiana - Rua Jacurici, 129", "Destino"), "Rua Jacurici, 129");
  assert.equal(rotuloSeguro("Fabiana Rua Jacurici 129", "Destino"), "Rua Jacurici 129");
  assert.equal(rotuloSeguro("Carlos Eduardo - Av. Paulista, 1000 - Bela Vista", "Saída"), "Avenida Paulista, 1000");
  assert.equal(rotuloSeguro("Fabiana", "Destino"), "Destino");
  assert.equal(rotuloSeguro("Fabiana - Hotel Unique", "Destino"), "Hotel Unique");
  assert.equal(rotuloSeguro("Restaurante Fasano - Rua X, 1", "Destino"), "Restaurante Fasano");
  assert.equal(interpretarEndereco("Fabiana - Rua Jacurici, 129").local, null);
});

test("lugar sem palavra de lugar entra só na consulta, nunca no rótulo", () => {
  const c = interpretarEndereco(RITZ);
  assert.equal(rotuloSeguro(RITZ, "Destino"), "Destino");
  assert.equal(candidatosEndereco(RITZ)[0], "Ritz Leblon, Rio de Janeiro, RJ");
  assert.equal(c.local, null);
});

test("orçamento de tempo: ao estourar, para de consultar e avisa", async () => {
  let agora = 0, n = 0;
  const lento = Object.assign(async () => { n++; agora += 20000; return []; }, { nome: "x" });
  const r = await geocodificarCampos(interpretarEndereco(TULIP), [lento], { prazo: 30000, agora: () => agora });
  assert.equal(r, null);
  assert.equal(n, 2, "a 3ª variação já passaria do prazo");
});

test("TomTom 429/403: provedor fica indisponível e o próximo assume sem nova chamada à TomTom", async () => {
  let chamadasTomTom = 0;
  const tomtom = provedorTomTom("k", async () => { chamadasTomTom++; return { ok: false, status: 429 }; });
  const photon = Object.assign(async () => [{ lat: -23.585, lon: -46.676, cidade: "São Paulo" }], { nome: "photon" });
  const a = await geocodificarCampos(interpretarEndereco(FABIANA), [tomtom, photon]);
  const b = await geocodificarCampos(interpretarEndereco(TULIP), [tomtom, Object.assign(async () => [{ lat: -23.204, lon: -45.909, cidade: "São José dos Campos" }], { nome: "photon" })]);
  assert.equal(a.fonte, "photon");
  assert.equal(b.fonte, "photon");
  assert.equal(chamadasTomTom, 1);
});

test("todo fetch de geocodificação vai com timeout", async () => {
  const sinais = [];
  const f = async (_u, init) => { sinais.push(init?.signal); return { ok: true, json: async () => ({ results: [], features: [] }) }; };
  await provedorTomTom("k", f)("x");
  await provedorPhoton(f)("x");
  await provedorNominatim(async (_u, init) => { sinais.push(init?.signal); return { ok: true, json: async () => [] }; })("x");
  assert.equal(sinais.length, 3);
  assert.ok(sinais.every((s) => s instanceof AbortSignal));
});

test("Embraer SJC: apelidos de prédio e avenida caem no ponto fixo, sem consultar provedor", async () => {
  const falha = Object.assign(async () => { throw new Error("não devia consultar"); }, { nome: "x" });
  for (const t of ["Embraer F300", "Embraer - F11", "F46", "Embraer Osires Silva", "Av. Brigadeiro Faria Lima, Embraer", "Embraer"]) {
    const r = await geocodificarCampos(interpretarEndereco(t), [falha]);
    assert.equal(r?.fonte, "fixo", t);
    assert.equal(r.lat, -23.2324983, t);
    assert.equal(rotuloSeguro(t, "x"), "Embraer", t);
  }
  assert.equal(interpretarEndereco("Av. Brigadeiro Faria Lima, 3477, São Paulo").lugar, null, "Faria Lima de SP não é Embraer");
  assert.equal(interpretarEndereco("Embraer Gavião Peixoto").lugar, null, "outra unidade");
});

test("Kenvue SJC (J&J, Band-Aid, Meditech) cai no ponto fixo dentro da fábrica", async () => {
  const falha = Object.assign(async () => { throw new Error("não devia consultar"); }, { nome: "x" });
  for (const t of ["Fábrica Band-Aid", "Kenvue - Rod. Pres. Dutra, km 154", "Johnson & Johnson SJC", "J&J São José dos Campos", "Meditech"]) {
    const r = await geocodificarCampos(interpretarEndereco(t), [falha]);
    assert.equal(r?.fonte, "fixo", t);
    assert.equal(r.lat, -23.236095, t);
    assert.equal(rotuloSeguro(t, "x"), "Kenvue", t);
  }
  assert.equal(interpretarEndereco("Johnson & Johnson, Avenida X, São Paulo").lugar, null, "escritório de SP não é a fábrica");
});
