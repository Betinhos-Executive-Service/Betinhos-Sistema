// Mock local da Infleet (GraphQL), do OSRM e da TomTom para o `wrangler dev` sem credenciais nem rede externa.
// Uso: node scripts/mock-servicos.mjs [porta=36490]. O cenário é controlado por HTTP:
//   GET  /cenario                      → estado atual
//   POST /cenario { lat, lon, speed, fixTime, semPosicao, falhar, tomtomFalha, foto }  (campos opcionais, mescla)
// Aponte o Worker com INFLEET_URL=http://127.0.0.1:36490/v1/graphql, OSRM_URL e TOMTOM_URL=http://127.0.0.1:36490.
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import { distanciaMetros } from "../src/infleet.mjs";

const porta = Number(process.argv[2] || 36490);
// foto: true = retrato simulado (SVG 96 px); "pixel" = JPEG 1x1 (imagem sem conteúdo); "quebrada" = 404.
const FOTOS = { true: "foto.svg", pixel: "foto.jpg", quebrada: "foto-inexistente.jpg" };
const FOTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#c9d6e6"/><circle cx="48" cy="38" r="18" fill="#7a5a46"/><path d="M14 96c4-22 18-32 34-32s30 10 34 32z" fill="#33475f"/></svg>';
const cenario = { lat: -23.5505, lon: -46.6333, speed: 40, fixTime: null, semPosicao: false, falhar: false, tomtomFalha: false, foto: false, trajeto: [] };
const PIXEL_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

const ler = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

// Rota reta com 12 pontos; 30 km/h sem trânsito. Formato de coordenadas: [lon, lat].
function rota(de, para) {
  const coords = Array.from({ length: 12 }, (_, i) => [de[0] + (para[0] - de[0]) * i / 11, de[1] + (para[1] - de[1]) * i / 11]);
  const dist = distanciaMetros(de[1], de[0], para[1], para[0]) * 1.25;
  return { coords, dist, seg: dist / (30 / 3.6) };
}

// Flow falso do cadastro de passageiros (POST /flow { hash, op: ler | foto | salvar }), em memória.
// hash "dd…d" (64 d) → lista aberta; qualquer outro hash → 404. Dados fictícios; a foto é um PNG gerado aqui.
const HASH_FLOW = "d".repeat(64);
const crc = (b) => { let c, r = ~0; for (const x of b) { c = (r ^ x) & 255; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; r = (r >>> 8) ^ c; } return ~r >>> 0; };
const bloco = (tipo, dados) => { const t = Buffer.from(tipo), l = Buffer.alloc(4), k = Buffer.alloc(4); l.writeUInt32BE(dados.length); k.writeUInt32BE(crc(Buffer.concat([t, dados]))); return Buffer.concat([l, t, dados, k]); };
function pngRetrato(cor) {
  const n = 96, linhas = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = y * (n * 3 + 1) + 1 + x * 3, dentro = (x - 48) ** 2 + (y - 38) ** 2 < 324 || (y > 62 && (x - 48) ** 2 / 1600 + (y - 96) ** 2 / 700 < 1);
    linhas.set(dentro ? cor : [201, 214, 230], o);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(linhas)), bloco("IEND", Buffer.alloc(0))]).toString("base64");
}
const oculta = { tel: (v) => { const d = String(v).replace(/\D/g, ""); return d.length >= 8 ? `(${d.slice(-11, -9)}) •••••-${d.slice(-4)}` : ""; }, email: (v) => { const a = String(v).indexOf("@"); return a < 1 ? "" : v.slice(0, 2) + "•••" + v.slice(a); } };
const passageirosFlow = [
  { id: "00000000-0000-4000-8000-000000000001", primeiroNome: "Mariana", ordem: 1, foto: pngRetrato([122, 90, 70]), telefone: "+5511987654321", email: "mariana@exemplo.com" },
  { id: "00000000-0000-4000-8000-000000000002", primeiroNome: "Roberto", ordem: 2, foto: null, telefone: "+5511912345678", email: "" },
  { id: "00000000-0000-4000-8000-000000000003", primeiroNome: "Ana", ordem: 3, foto: null, telefone: "", email: "" },
];
function flow(c) {
  if (c.hash !== HASH_FLOW) return [404, {}];
  const p = passageirosFlow.find((x) => x.id === c.passageiroId);
  if (c.op === "ler") return [200, { passageiros: passageirosFlow.map((x) => ({ id: x.id, primeiroNome: x.primeiroNome, ordem: x.ordem, temFoto: Boolean(x.foto), foto: x.foto, temTelefone: Boolean(x.telefone), telefoneMascarado: oculta.tel(x.telefone), temEmail: Boolean(x.email), emailMascarado: oculta.email(x.email) })) }];
  if (!p) return [404, {}];
  if (c.op === "foto") return p.foto ? [200, { foto: { mimeType: "image/png", base64: p.foto } }] : [200, { foto: null }];
  if (c.op === "salvar") { if (c.fotoBase64) p.foto = c.fotoBase64; if (c.telefone) p.telefone = c.telefone; if (c.email) p.email = c.email; return [200, { ok: true }]; }
  return [400, {}];
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/cenario") {
    if (req.method === "POST") Object.assign(cenario, JSON.parse(await ler(req) || "{}"));
    return json(res, 200, cenario);
  }
  if (url.pathname === "/flow" && req.method === "POST") { const [status, corpo] = flow(JSON.parse(await ler(req) || "{}")); return json(res, status, corpo); }
  if (url.pathname === "/foto.jpg") { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(PIXEL_JPEG); }
  if (url.pathname === "/foto.svg") { res.writeHead(200, { "Content-Type": "image/svg+xml" }); return res.end(FOTO_SVG); }
  if (cenario.falhar) { res.writeHead(503); return res.end("mock: fora do ar"); }
  if (url.pathname === "/v1/graphql") {
    const { query, variables } = JSON.parse(await ler(req) || "{}");
    if (query.includes("listVehicles(")) return json(res, 200, { data: { listVehicles: [{ id: "veic-mock", plate: variables?.f?.plateOrDisplayName ?? "MOCK123" }] } });
    if (query.includes("listVehiclePositions")) return json(res, 200, { data: { listVehiclePositions: cenario.trajeto } });
    const location = cenario.semPosicao ? null : { latitude: cenario.lat, longitude: cenario.lon, address: "Av. Paulista, 1578 - Bela Vista", speed: cenario.speed, fixTime: cenario.fixTime || new Date().toISOString() };
    return json(res, 200, { data: { getVehicle: { plate: "MOCK123", brand: "Toyota", model: "Corolla Altis", hasSignal: true, driver: { name: "Carlos Eduardo", profilePictures: cenario.foto ? [{ url: `http://127.0.0.1:${porta}/${FOTOS[cenario.foto] ?? FOTOS.true}` }] : [] }, location } } });
  }
  let m = url.pathname.match(/^\/route\/v1\/driving\/(-?[\d.]+),(-?[\d.]+);(-?[\d.]+),(-?[\d.]+)/);
  if (m) {
    const r = rota([+m[1], +m[2]], [+m[3], +m[4]]);
    return json(res, 200, { code: "Ok", routes: [{ distance: r.dist, duration: r.seg, geometry: { type: "LineString", coordinates: r.coords } }] });
  }
  m = url.pathname.match(/^\/match\/v1\/driving\/(.+)$/);
  if (m) {
    // Encaixe de mentira: devolve os próprios pontos (tracepoints servem ao encaixe da posição da rota viva).
    const pts = m[1].split(";").map((c) => c.split(",").map(Number));
    return json(res, 200, { code: "Ok", tracepoints: pts.map((location) => ({ location, matchings_index: 0 })), matchings: [{ geometry: { type: "LineString", coordinates: pts } }] });
  }
  m = url.pathname.match(/^\/routing\/1\/calculateRoute\/(-?[\d.]+),(-?[\d.]+):(-?[\d.]+),(-?[\d.]+)\/json/);
  if (m) {
    if (cenario.tomtomFalha) { res.writeHead(500); return res.end("mock: TomTom fora"); }
    const r = rota([+m[2], +m[1]], [+m[4], +m[3]]);
    return json(res, 200, { routes: [{ summary: { lengthInMeters: r.dist, travelTimeInSeconds: r.seg * 0.8, trafficDelayInSeconds: 120 }, legs: [{ points: r.coords.map(([longitude, latitude]) => ({ latitude, longitude })) }] }] });
  }
  res.writeHead(404); res.end("mock: rota desconhecida " + url.pathname);
}).listen(porta, "127.0.0.1", () => console.log(`Mock Infleet/OSRM/TomTom em http://127.0.0.1:${porta}`));
