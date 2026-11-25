import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.mjs";
import { ASSETS } from "./modelo-portal.mjs";

test("dados com a chave concluido:<id> e track sem flag → concluído sem chamar a Infleet", async () => {
  const id = "b".repeat(64);
  const m = new Map([
    [`track:${id}`, JSON.stringify({ modo: "completo", placa: "ABC1D23", titulo: "T", etapas: [{ tipo: "saida", lat: 1, lon: 1 }, { tipo: "destino", lat: 2, lon: 2 }], expiraEm: "2099-01-01T00:00:00Z" })],
    [`concluido:${id}`, "2026-10-22T12:00:00.000Z"],
  ]);
  const env = { TRACK_KV: { get: async (k) => m.get(k) ?? null } }; // sem INFLEET_TOKEN: consultar a Infleet lançaria erro
  const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), env);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.fase, "concluido");
  assert.equal(j.posicao, null);
});

test("link antigo (sem modo) com a chave concluido → concluído sem Infleet", async () => {
  const id = "c".repeat(64);
  const m = new Map([[`track:${id}`, JSON.stringify({ placa: "ABC1D23", expiraEm: "2099-01-01T00:00:00Z" })], [`concluido:${id}`, "2026-10-22T12:00:00.000Z"]]);
  const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { TRACK_KV: { get: async (k) => m.get(k) ?? null } });
  assert.equal((await r.json()).fase, "concluido");
});

test("concluído não expõe o telefone do motorista", async () => {
  const id = "d".repeat(64);
  const m = new Map([[`track:${id}`, JSON.stringify({ modo: "completo", motorista: { nome: "Carlos", telefone: "11999990000" }, etapas: [], expiraEm: "2099-01-01T00:00:00Z", concluidoPor: "dataverse" })]]);
  const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { TRACK_KV: { get: async (k) => m.get(k) ?? null } });
  const j = await r.json();
  assert.equal(j.motorista.nome, "Carlos");
  assert.equal(j.motorista.telefone, null);
});

test("foto servida com nosniff, CSP e só tipos de imagem seguros", async () => {
  const id = "e".repeat(64);
  const mk = (tipo) => ({ TRACK_KV: { get: async () => "{}", getWithMetadata: async () => ({ value: new Uint8Array([1]).buffer, metadata: { tipo } }) } });
  const r = await worker.fetch(new Request(`https://w/r/${id}/foto/motorista`), mk("image/svg+xml"));
  assert.equal(r.headers.get("Content-Type"), "image/jpeg");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(r.headers.get("Content-Security-Policy"), "default-src 'none'");
  assert.equal((await worker.fetch(new Request(`https://w/r/${id}/foto/motorista`), mk("image/webp"))).headers.get("Content-Type"), "image/webp");
});

test("rotas públicas /r aceitam id novo (12 base62) e antigo (64 hex) e recusam outros", async () => {
  const novo = "aB3dE5gH7jK9", antigo = "e".repeat(64);
  const m = new Map([[`track:${novo}`, JSON.stringify({ placa: "A", expiraEm: "2099-01-01T00:00:00Z" })], [`track:${antigo}`, JSON.stringify({ placa: "A", expiraEm: "2099-01-01T00:00:00Z" })]]);
  const env = { ASSETS, TRACK_KV: { get: async (k) => m.get(k) ?? null, getWithMetadata: async () => ({ value: null, metadata: null }) } };
  for (const id of [novo, antigo]) {
    assert.equal((await worker.fetch(new Request(`https://w/r/${id}`), env)).status, 200, id);
    assert.equal((await worker.fetch(new Request(`https://w/r/${id}/foto/motorista`), env)).status, 404, id);
  }
  for (const id of ["aB3dE5gH7jK", "aB3dE5gH7jK9m", "aB3dE5gH7j-9", "E".repeat(64)]) {
    const r = await worker.fetch(new Request(`https://w/r/${id}`), env);
    assert.notEqual(r.status, 200, id);
  }
});

test("/dados nunca expõe o texto bruto (nome de passageiro, apto) em nenhum modo, inclusive link antigo", async () => {
  const brutoSaida = "1. Fulano - Golden Tulip Colinas Hotel - Av. São João, 2200 - Jardim das Colinas, São José dos Campos";
  const brutoDestino = "FABIANA - Rua Jacurici, 129, apto 172";
  const saida = { lat: -23.204, lon: -45.909, area: null, label: brutoSaida };
  const destino = { lat: -23.585, lon: -46.676, area: null, label: brutoDestino };
  const etapas = [{ ...saida, tipo: "saida", rotulo: brutoSaida }, { ...destino, tipo: "destino", rotulo: brutoDestino }];
  const base = { placa: "ABC1D23", vehicleId: "v1", embarque: brutoSaida, destino: saida, destinoFinal: destino, destinoTentadoEm: "x", expiraEm: "2099-01-01T00:00:00Z" };
  const casos = { antigo: base, simples: { ...base, modo: "simples", etapas, motivoSimples: "salto de 700 km" }, completo: { ...base, modo: "completo", etapas }, concluido: { ...base, modo: "completo", etapas, concluidoPor: "dataverse" } };
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location: null } } }));
  try {
    let n = 0;
    for (const [nome, t] of Object.entries(casos)) {
      const id = "0987"[n++].repeat(64); // ids próprios: o cache de /dados é por isolate
      const m = new Map([[`track:${id}`, JSON.stringify(t)]]);
      const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { INFLEET_TOKEN: "t", TRACK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => m.set(k, v) } });
      const texto = await r.text();
      assert.equal(r.status, 200, `${nome}: ${texto}`);
      // Horário e versão do servidor variam (ex.: "…01.172Z") e não vêm do texto bruto: ficam fora da busca.
      const { servidorEm: _s, versao: _v, ...publico } = JSON.parse(texto);
      const semRelogio = JSON.stringify(publico);
      for (const proibido of ["Fulano", "FABIANA", "apto", "172", "Jardim das Colinas"]) assert.ok(!semRelogio.includes(proibido), `${nome} expõe "${proibido}": ${texto}`);
      const j = JSON.parse(texto);
      assert.equal(j.embarque?.label, "Golden Tulip Colinas Hotel", `${nome}: ${texto}`);
      assert.equal(j.destinoFinal.label, "Rua Jacurici, 129", nome);
      if (j.etapas) assert.deepEqual(j.etapas.map((e) => e.rotulo), ["Golden Tulip Colinas Hotel", "Rua Jacurici, 129"], nome);
      if (nome === "simples") assert.equal(j.etapas, undefined, "modo simples continua sem etapas para o cliente");
    }
  } finally { globalThis.fetch = fetchOriginal; }
});

test("/dados mantém o rótulo já limpo na criação (marca rotuloLimpo), sem limpar de novo", async () => {
  const id = "6".repeat(64);
  const ritz = { lat: -22.98, lon: -43.22, label: "Ritz Leblon", rotuloLimpo: true };
  const t = { modo: "completo", placa: "ABC1D23", destino: { lat: -22.94, lon: -45.41, label: "Tenaris Confab", rotuloLimpo: true }, destinoFinal: ritz, concluidoPor: "dataverse", expiraEm: "2099-01-01T00:00:00Z",
    etapas: [{ tipo: "saida", lat: -22.94, lon: -45.41, rotulo: "Tenaris Confab", rotuloLimpo: true }, { tipo: "destino", ...ritz, rotulo: "Ritz Leblon" }] };
  const m = new Map([[`track:${id}`, JSON.stringify(t)]]);
  const j = await (await worker.fetch(new Request(`https://w/r/${id}/dados`), { TRACK_KV: { get: async (k) => m.get(k) ?? null } })).json();
  assert.equal(j.destinoFinal.label, "Ritz Leblon");
  assert.deepEqual(j.etapas.map((e) => e.rotulo), ["Tenaris Confab", "Ritz Leblon"]);
  assert.ok(!JSON.stringify(j).includes("rotuloLimpo"));
});

// Link com etapas Pindamonhangaba → GRU, criado depois do horário; o carro está a 109 km/h perto de Taubaté.
async function dadosOS10915(id, { trajeto, extra = {} }) {
  const t = { modo: "completo", placa: "ABC1D23", vehicleId: "v1", horarioAgendado: "2026-10-23T15:30:00Z", expiraEm: "2099-01-01T00:00:00Z",
    destino: { lat: -22.9352, lon: -45.4077, label: "Saída", rotuloLimpo: true }, destinoFinal: { lat: -23.4263, lon: -46.4818, label: "Aeroporto de Guarulhos", rotuloLimpo: true },
    etapas: [{ tipo: "saida", lat: -22.9352, lon: -45.4077, rotulo: "Saída", rotuloLimpo: true }, { tipo: "destino", lat: -23.4263, lon: -46.4818, rotulo: "Aeroporto de Guarulhos", rotuloLimpo: true }], ...extra };
  const m = new Map([[`track:${id}`, JSON.stringify(t)]]);
  const consultas = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const q = init?.body ? JSON.parse(init.body).query : "";
    // Percorrido e trilha recente da rota viva (query Recentes) não contam como leitura do trajeto.
    if (q.includes("query Percorrido") || q.includes("query Recentes")) return new Response(JSON.stringify({ data: { listVehiclePositions: [] } }));
    if (q.includes("listVehiclePositions")) { consultas.push("trajeto"); return trajeto ? new Response(JSON.stringify({ data: { listVehiclePositions: trajeto } })) : new Response("{}", { status: 500 }); }
    if (q.includes("getVehicle")) return new Response(JSON.stringify({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location: { latitude: -23.0116, longitude: -45.5215, speed: 109, address: "SP-070", fixTime: new Date().toISOString() } } } }));
    return new Response("{}", { status: 500 });
  };
  try {
    const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { INFLEET_TOKEN: "t", TRACK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => m.set(k, v) } });
    assert.equal(r.status, 200);
    return { j: await r.json(), salvo: JSON.parse(m.get(`track:${id}`)), consultas };
  } finally { globalThis.fetch = fetchOriginal; }
}
const agoraMenos = (min) => new Date(Date.now() - min * 60000).toISOString();

test("caso real OS-10915: histórico com ponto perto da saída → em viagem, evidência guardada", async () => {
  const { j, salvo, consultas } = await dadosOS10915("a2".repeat(32), { trajeto: [
    { latitude: -22.9400, longitude: -45.4100, fixTime: agoraMenos(40) }, { latitude: -22.98, longitude: -45.46, fixTime: agoraMenos(30) }] });
  assert.equal(j.fase, "em_viagem");
  assert.deepEqual(j.etapas.map((e) => e.visitada), [true, false]);
  assert.ok(salvo.trajetoLidoEm && salvo.saidaVistaEm);
  assert.equal(consultas.length, 1);
  // A linha percorrida reaproveita a mesma leitura, nasce no endereço de saída e termina na posição atual.
  assert.deepEqual(j.percorrido, [[-45.4077, -22.9352], [-45.41, -22.94], [-45.46, -22.98], [-45.5215, -23.0116]]);
});

test("motorista atrasado vindo de SP para Pinda, sem ponto perto da saída → a caminho", async () => {
  const { j, salvo } = await dadosOS10915("a4".repeat(32), { trajeto: [
    { latitude: -23.55, longitude: -46.63, fixTime: agoraMenos(60) }, { latitude: -23.30, longitude: -46.10, fixTime: agoraMenos(30) }] });
  assert.equal(j.fase, "a_caminho");
  assert.equal(j.percorrido, null, "deslocamento até o embarque não vira linha cinza");
  assert.equal(salvo.saidaVistaEm, null);
  assert.ok(salvo.trajetoLidoEm);
  assert.equal(salvo.etapas[0].inferido, undefined);
});

test("falha da Infleet no trajeto → a caminho; nova tentativa só após 5 min, no máximo 3", async () => {
  const r1 = await dadosOS10915("a5".repeat(32), { trajeto: null });
  assert.equal(r1.j.fase, "a_caminho");
  assert.equal(r1.salvo.trajetoLidoEm, undefined);
  assert.equal(r1.salvo.trajetoTentativas, 1);
  const cedo = await dadosOS10915("a6".repeat(32), { trajeto: null, extra: { trajetoTentadoEm: agoraMenos(2), trajetoTentativas: 1 } });
  assert.equal(cedo.consultas.length, 0, "menos de 5 min: não tenta");
  const depois = await dadosOS10915("a7".repeat(32), { trajeto: [{ latitude: -22.9352, longitude: -45.4077, fixTime: agoraMenos(30) }], extra: { trajetoTentadoEm: agoraMenos(6), trajetoTentativas: 1 } });
  assert.equal(depois.consultas.length, 1, "após 5 min tenta de novo");
  assert.equal(depois.j.fase, "em_viagem");
  const esgotou = await dadosOS10915("a8".repeat(32), { trajeto: null, extra: { trajetoTentadoEm: agoraMenos(60), trajetoTentativas: 3 } });
  assert.equal(esgotou.consultas.length, 0);
});

// Posição com fixTime controlado; devolve /dados e o que foi gravado.
async function dadosComPosicao(id, { lat, lon, velocidade = 0, idadeMin, fixTime, extra = {}, etapasIni }) {
  const s = { lat: -22.9352, lon: -45.4077 }, f = { lat: -23.4263, lon: -46.4818 };
  const t = { modo: "completo", placa: "ABC1D23", vehicleId: "v1", expiraEm: "2099-01-01T00:00:00Z", trajetoLidoEm: "2026-10-23T00:00:00Z",
    destino: { ...s, label: "Saída", rotuloLimpo: true }, destinoFinal: { ...f, label: "Destino", rotuloLimpo: true },
    etapas: etapasIni ?? [{ tipo: "saida", ...s, rotulo: "Saída", rotuloLimpo: true }, { tipo: "destino", ...f, rotulo: "Destino", rotuloLimpo: true }], ...extra };
  const m = new Map([[`track:${id}`, JSON.stringify(t)]]);
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_u, init) => {
    const q = init?.body ? JSON.parse(init.body).query : "";
    if (q.includes("getVehicle")) return new Response(JSON.stringify({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location: { latitude: lat, longitude: lon, speed: velocidade, address: "x", fixTime: fixTime ?? agoraMenos(idadeMin) } } } }));
    return new Response("{}", { status: 500 });
  };
  try {
    const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { INFLEET_TOKEN: "t", TRACK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => m.set(k, v) } });
    return { j: await r.json(), salvo: JSON.parse(m.get(`track:${id}`)) };
  } finally { globalThis.fetch = fetchOriginal; }
}

test("reforço no /dados: posição anterior parada no local + nova a 10 m, 30 min depois → no local", async () => {
  const ant = { lat: -22.9352, lon: -45.4077, fixTime: agoraMenos(32) };
  const { j, salvo } = await dadosComPosicao("b1".repeat(32), { lat: -22.93525, lon: -45.4077, idadeMin: 1, extra: { ultimaPos: ant } });
  assert.equal(j.fase, "no_local");
  assert.equal(j.sinalAtrasadoMin, null);
  assert.ok(salvo.etapas[0].chegouEm);
  assert.equal(salvo.ultimaPos.fixTime !== ant.fixTime, true, "ultimaPos atualizada");
});

test("velocidade 0 isolada longe do local não muda nada no /dados", async () => {
  const { j } = await dadosComPosicao("b2".repeat(32), { lat: -23.2, lon: -45.8, velocidade: 0, idadeMin: 1 });
  assert.equal(j.fase, "a_caminho");
  assert.equal(j.etapas[0].visitada, false);
});

test("posição velha longe do local não avança nada; sinalAtrasadoMin e ETA escondido", async () => {
  const { j, salvo } = await dadosComPosicao("b3".repeat(32), { lat: -23.2, lon: -45.8, idadeMin: 10 });
  assert.equal(j.sinalAtrasadoMin, 10);
  assert.equal(j.eta, null);
  assert.equal(j.fase, "a_caminho");
  assert.equal(salvo.etapas[0].chegouEm, undefined);
});

test("posições esparsas velhas: 15 min atrás no local + nova 10 min depois no mesmo lugar → chegada; mesma posição relida não muda", async () => {
  const ant = { lat: -22.9352, lon: -45.4077, fixTime: agoraMenos(25) };
  const r = await dadosComPosicao("b6".repeat(32), { lat: -22.9352, lon: -45.4077, idadeMin: 15, extra: { ultimaPos: ant } });
  assert.equal(r.j.fase, "no_local");
  assert.equal(r.j.sinalAtrasadoMin, 15);
  assert.equal(r.j.eta, null);
  assert.equal(r.salvo.etapas[0].chegouEm, ant.fixTime);
  // mesma posição (mesmo fixTime) lida de novo: nada é reprocessado
  const igual = { lat: -22.9352, lon: -45.4077, fixTime: agoraMenos(15) };
  const r2 = await dadosComPosicao("b7".repeat(32), { lat: igual.lat, lon: igual.lon, idadeMin: 15, fixTime: igual.fixTime, extra: { ultimaPos: igual } });
  assert.equal(r2.salvo.etapas[0].dentroDesde, undefined);
  assert.equal(r2.salvo.etapas[0].chegouEm, undefined);
  assert.equal(r2.j.fase, "a_caminho");
});

test("posição recente: sinalAtrasadoMin é null; link antigo sem etapas segue sem o campo novo e não quebra", async () => {
  const { j } = await dadosComPosicao("b4".repeat(32), { lat: -23.2, lon: -45.8, idadeMin: 1 });
  assert.equal(j.sinalAtrasadoMin, null);
  const id = "b5".repeat(32);
  const m = new Map([[`track:${id}`, JSON.stringify({ placa: "A", vehicleId: "v1", destino: { lat: -22.9, lon: -45.4 }, destinoFinal: { lat: -23.4, lon: -46.4 }, expiraEm: "2099-01-01T00:00:00Z" })]]);
  const fo = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { getVehicle: { plate: "A", hasSignal: true, driver: null, location: { latitude: -23, longitude: -45.5, speed: 0, address: "x", fixTime: agoraMenos(20) } } } }));
  try {
    const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { INFLEET_TOKEN: "t", TRACK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => m.set(k, v) } });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).fase);
  } finally { globalThis.fetch = fo; }
});

// ---- Contrato único do /dados: chegando por geofence, ETA, link antigo, reserva quando a Infleet cai, revogado ----

const semCache = (() => { let n = 0; return () => { const real = Date.now; Date.now = () => real() + 60000 * ++n; return () => { Date.now = real; }; }; })();
const kvMapa = (m) => ({ get: async (k) => m.get(k) ?? null, put: async (k, v) => m.set(k, v) });
const veiculo = (pos, extra = {}) => ({ plate: "ABC1D23", brand: "Toyota", model: "Corolla", hasSignal: true, driver: { name: "Carlos Silva", profilePictures: [{ url: "https://infleet/foto.jpg" }] }, location: pos && { latitude: pos.lat, longitude: pos.lon, speed: 40, address: "Av. X", fixTime: new Date().toISOString() }, ...extra });
const osrm = (min) => ({ code: "Ok", routes: [{ distance: min * 800, duration: min * 60, geometry: { coordinates: [[-46.6, -23.5], [-46.61, -23.51]] } }] });
function mockFetch({ pos, osrmMin = 20, falhar = false }) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (falhar) throw new Error("rede fora");
    if (String(url).includes("/route/v1/")) return new Response(JSON.stringify(osrm(osrmMin)));
    const q = init?.body ? JSON.parse(init.body).query : "";
    if (q.includes("getVehicle")) return new Response(JSON.stringify({ data: { getVehicle: veiculo(pos) } }));
    return new Response("{}", { status: 500 });
  };
  return () => { globalThis.fetch = original; };
}
const saidaSP = { lat: -23.5614, lon: -46.6559 }, destinoSP = { lat: -23.6267, lon: -46.6554 };
const aoNorte = (p, m) => ({ lat: p.lat + m / 111320, lon: p.lon });
const linkCompleto = (id) => new Map([[`track:${id}`, JSON.stringify({ modo: "completo", placa: "ABC1D23", vehicleId: "v1", expiraEm: "2099-01-01T00:00:00Z", titulo: "OS-1",
  destino: { ...saidaSP, label: "Saída", rotuloLimpo: true }, destinoFinal: { ...destinoSP, label: "Destino", rotuloLimpo: true },
  etapas: [{ tipo: "saida", ...saidaSP, rotulo: "Av. Paulista, 1000", rotuloLimpo: true }, { tipo: "destino", ...destinoSP, rotulo: "Aeroporto de Congonhas", rotuloLimpo: true }] })]]);
async function dados(id, m) {
  const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { INFLEET_TOKEN: "t", TRACK_KV: kvMapa(m) });
  assert.equal(r.status, 200);
  return r.json();
}

test("modo completo: a caminho longe sem chegando; entra em chegando a 900 m; segue chegando a 1,5 km (histerese) e grava a marca", async () => {
  const id = "GeoFence0001", m = linkCompleto(id);
  const restaurar = semCache();
  let desfazer = mockFetch({ pos: aoNorte(saidaSP, 6000), osrmMin: 20 });
  try {
    let j = await dados(id, m);
    assert.equal(j.fase, "a_caminho"); assert.equal(j.chegando, false);
    assert.deepEqual(j.eta, { minutos: 20, faixa: [20, 27], transito: false, km: 16 }, "OSRM → faixa, sem trânsito");
    assert.equal(j.motorista.foto, "https://infleet/foto.jpg", "sem foto enviada usa a da Infleet");
    assert.equal(j.veiculo.modelo, "Toyota Corolla");
    desfazer(); desfazer = mockFetch({ pos: aoNorte(saidaSP, 900), osrmMin: 3 });
    j = await dados(id, m);
    assert.equal(j.chegando, true);
    assert.ok(JSON.parse(m.get(`track:${id}`)).etapas[0].chegandoEm, "marca gravada na etapa alvo");
    assert.ok(!JSON.stringify(j).includes("chegandoEm"), "a marca não sai no /dados");
    desfazer(); desfazer = mockFetch({ pos: aoNorte(saidaSP, 1500), osrmMin: 6 });
    j = await dados(id, m);
    assert.equal(j.chegando, true, "oscilou para 1,5 km: continua chegando");
    assert.equal(j.fase, "a_caminho");
  } finally { desfazer(); restaurar(); }
});

test("Infleet fora: /dados devolve a última leitura marcada como fonteIndisponivel; sem leitura anterior, 502", async () => {
  const id = "ReservaKV001", m = linkCompleto(id);
  const restaurar = semCache();
  let desfazer = mockFetch({ pos: aoNorte(saidaSP, 6000) });
  try {
    const antes = await dados(id, m);
    desfazer(); desfazer = mockFetch({ falhar: true });
    const j = await dados(id, m);
    assert.equal(j.fonteIndisponivel, true);
    assert.deepEqual(j.posicao, antes.posicao);
    assert.ok(j.servidorEm);
    const semHistorico = await worker.fetch(new Request(`https://w/r/ReservaKV002/dados`), { INFLEET_TOKEN: "t", TRACK_KV: kvMapa(linkCompleto("ReservaKV002")) });
    assert.equal(semHistorico.status, 502);
  } finally { desfazer(); restaurar(); }
});

test("link antigo (sem modo): etapas sintetizadas de saída e destino, ETA e cartão no mesmo contrato", async () => {
  const id = "a".repeat(64);
  const m = new Map([[`track:${id}`, JSON.stringify({ placa: "ABC1D23", vehicleId: "v1", expiraEm: "2099-01-01T00:00:00Z", destinoTentadoEm: "x",
    destino: { ...saidaSP, area: null, label: "Av. Paulista, 1000" }, destinoFinal: { ...destinoSP, area: null, label: "Aeroporto de Congonhas" } })]]);
  const restaurar = semCache();
  const desfazer = mockFetch({ pos: aoNorte(saidaSP, 700), osrmMin: 4 });
  try {
    const j = await dados(id, m);
    assert.equal(j.modo, "completo");
    assert.deepEqual(j.etapas.map((e) => [e.tipo, e.visitada, e.atual]), [["saida", false, true], ["destino", false, false]]);
    assert.equal(j.chegando, true);
    assert.equal(JSON.parse(m.get(`track:${id}`)).estado.chegandoEm !== undefined, true);
    assert.equal(j.eta.transito, false);
    assert.equal(j.veiculo.placa, "ABC1D23");
  } finally { desfazer(); restaurar(); }
});

test("link revogado: página própria (404) e /dados com revogado:true; expirado continua 'Link expirado'", async () => {
  const id = "Revogado0001";
  const env = { ASSETS, TRACK_KV: { get: async (k) => (k === `revogado:${id}` ? "2026-11-02T12:00:00Z" : null) } };
  const pag = await worker.fetch(new Request(`https://w/r/${id}`), env);
  assert.equal(pag.status, 404);
  const html = await pag.text();
  assert.ok(html.includes("Acompanhamento encerrado"), html.slice(0, 200));
  assert.ok(!html.includes("Link expirado"));
  assert.deepEqual(await (await worker.fetch(new Request(`https://w/r/${id}/dados`), env)).json(), { expirado: true, revogado: true });
  const exp = await worker.fetch(new Request(`https://w/r/Expirado0001`), { ASSETS, TRACK_KV: { get: async () => null } });
  assert.ok((await exp.text()).includes("Link expirado"));
});

test("link antigo: saída da Kenvue geocodificada na Dutra volta para o ponto fixo pelo título", async () => {
  const { corrigirSaidaFixa } = await import("../src/worker.mjs");
  const t = { titulo: "Embarque Fábrica Band-Aid → Golden Tulip", destino: { lat: -23.1901118, lon: -45.8613899, label: "Rodovia Presidente Dutra" } };
  assert.equal(corrigirSaidaFixa(t), true);
  assert.deepEqual(t.destino, { lat: -23.236095, lon: -45.9252233, label: "Kenvue", area: null });
  assert.equal(corrigirSaidaFixa(t), false, "já corrigido: não grava de novo");
  assert.equal(corrigirSaidaFixa({ titulo: "Embarque Hotel Ibis → Kenvue", destino: { lat: -23.2, lon: -45.9 } }), false, "Kenvue no destino não mexe na saída");
});

test("diagnostico só sai com ?debug=1 e a rota usa o terminal do aeroporto", async () => {
  const id = "f".repeat(64);
  const agora = new Date().toISOString();
  const link = { modo: "completo", vehicleId: "v1", expiraEm: "2099-01-01T00:00:00Z",
    etapas: [{ tipo: "saida", lat: -23.44, lon: -46.40, rotulo: "Becooper", saiuEm: agora, chegouEm: agora }, { tipo: "destino", lat: -23.4356, lon: -46.4731, rotulo: "Aeroporto de Guarulhos" }] };
  const m = new Map([[`track:${id}`, JSON.stringify(link)]]);
  const env = { INFLEET_TOKEN: "x", TRACK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } } };
  const urls = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    const s = String(u); urls.push(s);
    if (s.includes("/route/v1/")) return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 8000, duration: 600, geometry: { coordinates: [[-46.43, -23.444], [-46.48, -23.427]] } }] }));
    if (s.includes("/match/v1/")) return new Response(JSON.stringify({ code: "NoMatch" }));
    const q = JSON.parse(init?.body ?? "{}").query ?? "";
    if (q.includes("listVehiclePositions")) return new Response(JSON.stringify({ data: { listVehiclePositions: [] } }));
    return new Response(JSON.stringify({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location: { latitude: -23.444, longitude: -46.43, address: null, speed: 70, fixTime: agora } } } }));
  };
  try {
    const sem = await (await worker.fetch(new Request(`https://w/r/${id}/dados`), env)).json();
    assert.equal(sem.diagnostico, undefined);
    assert.ok(sem.rota);
    const rota = urls.find((u) => u.includes("/route/v1/"));
    assert.match(rota, /-46\.480203\d*,-23\.427153\d*/); // destino = T2, não o centro do aeroporto
    const com = await (await worker.fetch(new Request(`https://w/r/${id}/dados?debug=1`), env)).json();
    assert.equal(typeof com.diagnostico.decisao, "string");
    assert.ok(Array.isArray(com.diagnostico.trilha));
    assert.equal(JSON.stringify(com).includes("chegada"), false);
  } finally { globalThis.fetch = fetchOriginal; }
});

test("D1: /dados antes de horário − 2 h → agendado, sem Infleet, também em modo simples; sem horário segue como hoje", async () => {
  const futuro = (h) => new Date(Date.now() + h * 3600000).toISOString();
  const ler = async (id, t) => {
    const m = new Map([[`track:${id}`, JSON.stringify({ placa: "ABC1D23", vehicleId: "v1", expiraEm: "2099-01-01T00:00:00Z", ...t })]]);
    // sem INFLEET_TOKEN: consultar a Infleet lançaria erro
    const r = await worker.fetch(new Request(`https://w/r/${id}/dados`), { TRACK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => m.set(k, v) } });
    return { status: r.status, j: await r.json() };
  };
  const completo = await ler("d1".repeat(32), { modo: "completo", horarioAgendado: futuro(5), etapas: [{ tipo: "saida", lat: 1, lon: 1, rotulo: "A" }, { tipo: "destino", lat: 2, lon: 2, rotulo: "B" }] });
  assert.equal(completo.status, 200);
  assert.equal(completo.j.fase, "agendado");
  assert.equal(completo.j.posicao, null);
  assert.equal(completo.j.rota, null);
  assert.ok(!completo.j.etapas?.some((e) => e.atual), "nenhuma etapa atual");
  const simples = await ler("d2".repeat(32), { modo: "simples", horarioAgendado: futuro(5) });
  assert.equal(simples.j.fase, "agendado");
  // Sem horário: consulta a Infleet (aqui falha por falta de token).
  const sem = await ler("d3".repeat(32), { modo: "simples" }).catch(() => ({ status: 502 }));
  assert.notEqual(sem.j?.fase, "agendado");
});
