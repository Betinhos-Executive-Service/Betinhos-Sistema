import assert from "node:assert/strict";
import test from "node:test";
import { rotaAte, encaixarPosicao } from "../src/infleet.mjs";

async function comFetch(resposta, fn) {
  const original = globalThis.fetch, urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify(typeof resposta === "function" ? resposta(String(u)) : resposta)); };
  try { return { valor: await fn(), urls }; } finally { globalThis.fetch = original; }
}
const o = { lat: -23.444, lon: -46.435 }, d = { lat: -23.43, lon: -46.48 };
const tomtom = { routes: [{ summary: { lengthInMeters: 5000, travelTimeInSeconds: 600, trafficDelayInSeconds: 0 }, legs: [{ points: [{ latitude: o.lat, longitude: o.lon }, { latitude: d.lat, longitude: d.lon }] }] }] };

test("rotaAte manda vehicleHeading ao TomTom só com rumo", async () => {
  const com = await comFetch(tomtom, () => rotaAte(o, d, "k", { tomtom: "https://tt" }, { rumo: 271.6 }));
  assert.match(com.urls[0], /[?&]vehicleHeading=272(&|$)/);
  assert.equal(com.valor.fonte, "tomtom");
  const sem = await comFetch(tomtom, () => rotaAte(o, d, "k", { tomtom: "https://tt" }));
  assert.doesNotMatch(sem.urls[0], /vehicleHeading/);
});

test("rotaAte manda bearings ao OSRM com rumo; sem rumo, sem bearings", async () => {
  const osrm = { code: "Ok", routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [[o.lon, o.lat], [d.lon, d.lat]] } }] };
  const r = await comFetch(osrm, () => rotaAte(o, d, null, { osrm: "https://os" }, { rumo: 360 }));
  assert.match(r.urls[0], /[?&]bearings=0,45;(&|$)/);
  assert.equal(r.valor.fonte, "osrm");
  const sem = await comFetch(osrm, () => rotaAte(o, d, null, { osrm: "https://os" }, { rumo: null }));
  assert.doesNotMatch(sem.urls[0], /bearings/);
});

test("encaixarPosicao: último tracepoint e rumo da linha encaixada", async () => {
  const T = Date.parse("2026-11-12T19:00:00Z");
  const pts = [0, 1, 2].map((i) => ({ lat: -23.444, lon: -46.435 - i * 0.002, fixTime: new Date(T + i * 10000).toISOString() }));
  const match = { code: "Ok", tracepoints: [{ location: [-46.435, -23.4442], matchings_index: 0 }, null, { location: [-46.439, -23.4442], matchings_index: 0 }],
    matchings: [{ geometry: { coordinates: [[-46.435, -23.4442], [-46.437, -23.4442], [-46.439, -23.4442]] } }] };
  const r = await comFetch(match, () => encaixarPosicao(pts, "https://os"));
  assert.match(r.urls[0], /\/match\/v1\/driving\//);
  assert.match(r.urls[0], /timestamps=/);
  assert.deepEqual([r.valor.lat, r.valor.lon], [-23.4442, -46.439]);
  assert.ok(Math.abs(r.valor.rumo - 270) < 1);
  assert.equal(await encaixarPosicao(pts.slice(0, 2), "https://os"), null);
  const falha = await comFetch({ code: "NoMatch" }, () => encaixarPosicao(pts, "https://os"));
  assert.equal(falha.valor, null);
});
