// Acesso mínimo à API GraphQL da Infleet e ao roteamento (TomTom com trânsito; OSRM como reserva).
// Os endpoints podem ser trocados por variáveis (INFLEET_URL, TOMTOM_URL, OSRM_URL) para o dev local com mock.
import { metrosEntre, rumo } from "./movimento.mjs";

const ENDPOINT = "https://api.infleet.com.br/v1/graphql";
const UA = { "User-Agent": "betinhos-acompanhar-motorista" };
// Rumo do carro em graus inteiros 0..359 para os roteadores.
const grau = (r) => ((Math.round(r) % 360) + 360) % 360;

export async function gqlInfleet(token, query, variables, endpoint = ENDPOINT) {
  if (!token) throw new Error("INFLEET_TOKEN não configurado");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(`Infleet HTTP ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`);
  return body.data;
}

// Mantém no máximo `max` pontos do trajeto para a página continuar leve
function reduzir(coords, max = 300) {
  if (coords.length <= max) return coords;
  const passo = Math.ceil(coords.length / max);
  return coords.filter((_, i) => i % passo === 0 || i === coords.length - 1);
}

// TomTom Routing: tempo com trânsito ao vivo. Plano free: 2.500 consultas/dia.
// Com o rumo (vehicleHeading) o TomTom não encaixa o carro na pista contrária de rodovia de pistas separadas.
async function rotaTomTom(origem, destino, chave, base = "https://api.tomtom.com", rumoCarro = null) {
  const url = `${base}/routing/1/calculateRoute/${origem.lat},${origem.lon}:${destino.lat},${destino.lon}/json` +
    `?key=${encodeURIComponent(chave)}&traffic=true&travelMode=car&routeRepresentation=polyline` +
    (rumoCarro != null ? `&vehicleHeading=${grau(rumoCarro)}` : "");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom HTTP ${res.status}`);
  const r = (await res.json()).routes?.[0];
  if (!r) throw new Error("TomTom sem rota");
  const s = r.summary;
  return {
    km: Math.round(s.lengthInMeters / 100) / 10,
    minutos: Math.round(s.travelTimeInSeconds / 60),
    atrasoTransitoMin: Math.round((s.trafficDelayInSeconds ?? 0) / 60),
    coords: reduzir(r.legs.flatMap((l) => l.points.map((p) => [p.longitude, p.latitude]))),
    fonte: "tomtom",
  };
}

// OSRM público: gratuito, sem trânsito. `bearings=<rumo>,45;` restringe a origem ao sentido do carro (destino livre).
async function rotaOsrm(origem, destino, base = "https://router.project-osrm.org", rumoCarro = null) {
  const url = `${base}/route/v1/driving/${origem.lon},${origem.lat};${destino.lon},${destino.lat}?overview=simplified&geometries=geojson` +
    (rumoCarro != null ? `&bearings=${grau(rumoCarro)},45;` : "");
  const j = await (await fetch(url, { headers: UA })).json();
  const r = j.code === "Ok" && j.routes?.[0];
  if (!r) throw new Error("OSRM sem rota");
  return { km: Math.round(r.distance / 100) / 10, minutos: Math.round(r.duration / 60), atrasoTransitoMin: null, coords: r.geometry.coordinates, fonte: "osrm" };
}

// OSRM Match: encaixa nas ruas o trajeto já feito (pontos [lon, lat] em ordem), para a linha percorrida seguir
// a estrada em vez de cortar curvas. O servidor público aceita só 10 pontos por consulta: o trajeto é reduzido a
// 46 pontos e encaixado em até 5 blocos (que se tocam no ponto da emenda). Bloco que falha entra cru.
const MATCH_BLOCO = 10;
async function encaixarBloco(pts, base) {
  const url = `${base}/match/v1/driving/${pts.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(";")}` +
    "?geometries=geojson&overview=full&gaps=split";
  try {
    const j = await (await fetch(url, { headers: UA })).json();
    const linha = j.code === "Ok" ? (j.matchings ?? []).flatMap((m) => m.geometry?.coordinates ?? []) : [];
    return linha.length >= 2 ? linha : null;
  } catch { return null; }
}

export async function encaixarNasRuas(coords, base = "https://router.project-osrm.org") {
  const pts = reduzir(coords, 46);
  if (pts.length < 2) return null;
  const blocos = [];
  for (let i = 0; i < pts.length - 1; i += MATCH_BLOCO - 1) blocos.push(pts.slice(i, i + MATCH_BLOCO));
  const linhas = await Promise.all(blocos.map((b) => encaixarBloco(b, base)));
  if (linhas.every((l) => !l)) return null;
  return reduzir(linhas.flatMap((l, i) => l ?? blocos[i]), 500);
}

// Encaixe da posição atual pelas últimas leituras (OSRM Match com horários): três pontos seguidos no mesmo
// sentido não cabem na pista contrária. Devolve o último ponto encaixado e o rumo da linha encaixada nele.
export async function encaixarPosicao(pontos, base = "https://router.project-osrm.org") {
  const pts = (pontos ?? []).slice(-6);
  if (pts.length < 3) return null;
  const ts = pts.map((p) => Math.round(Date.parse(p.fixTime) / 1000));
  if (ts.some((x) => !Number.isFinite(x))) return null;
  const url = `${base}/match/v1/driving/${pts.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";")}` +
    `?geometries=geojson&overview=full&timestamps=${ts.join(";")}&radiuses=${pts.map(() => 30).join(";")}`;
  try {
    const j = await (await fetch(url, { headers: UA })).json();
    const ultimo = j.code === "Ok" ? j.tracepoints?.at(-1) : null;
    if (!ultimo?.location) return null;
    const [lon, lat] = ultimo.location, fim = { lat, lon };
    const geo = j.matchings?.[ultimo.matchings_index]?.geometry?.coordinates ?? [];
    let rumoEnc = null;
    for (let i = geo.length - 1; i >= 0; i--) {
      const q = { lat: geo[i][1], lon: geo[i][0] };
      if (metrosEntre(q, fim) >= 20) { rumoEnc = rumo(q, fim); break; }
    }
    return { lat, lon, rumo: rumoEnc };
  } catch { return null; }
}

// `opcoes.rumo` (graus) vai ao roteador para a rota sair no sentido em que o carro anda.
export async function rotaAte(origem, destino, chaveTomTom, urls = {}, opcoes = {}) {
  const rumoCarro = Number.isFinite(opcoes.rumo) ? opcoes.rumo : null;
  if (chaveTomTom) {
    try { return await rotaTomTom(origem, destino, chaveTomTom, urls.tomtom, rumoCarro); } catch (e) { console.warn(e.message); }
  }
  try { return await rotaOsrm(origem, destino, urls.osrm, rumoCarro); } catch { return null; }
}

export function distanciaMetros(lat1, lon1, lat2, lon2) {
  return Math.round(metrosEntre({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }));
}
