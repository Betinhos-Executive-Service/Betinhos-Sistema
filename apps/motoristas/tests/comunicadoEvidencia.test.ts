import assert from "node:assert/strict";
import test from "node:test";
import { abrirComunicado, assinarComunicado } from "../src/features/comunicados/comunicados.ts";
import { montarEvidencia, type Evidencia } from "../src/features/comunicados/evidencia.ts";

const stamp = { ip: "203.0.113.7", ts: "2026-11-10T13:40:00.000Z", sig: "assinatura" };
const okFetch = (async () => new Response(JSON.stringify(stamp), { status: 200 })) as typeof fetch;
const position = { coords: { latitude: -23.18, longitude: -45.88, accuracy: 29.6 } };
const geoOk = { getCurrentPosition: (success: (p: typeof position) => void) => success(position) };
const geoError = (code: number) => ({ getCurrentPosition: (_s: unknown, error: (e: { code: number }) => void) => error({ code }) });
const base = {
  appVersion: "v2.1.860",
  now: () => new Date("2026-11-10T13:40:01.000Z"),
  navigator: { userAgent: "UA", userAgentData: { platform: "Android", getHighEntropyValues: async () => ({ model: "Pixel 8" }) }, geolocation: geoOk }
};
const parse = (json: string) => JSON.parse(json) as Evidencia;

test("evidência completa: versão, aparelho, carimbo do Worker e GPS", async () => {
  const evidencia = parse(await montarEvidencia({ ...base, fetchImpl: okFetch, stampUrl: "https://w.example/carimbo-ip" }));
  assert.deepEqual(evidencia, {
    v: 1, appVersion: "2.1.860", userAgent: "UA", platform: "Android", model: "Pixel 8", ipStamp: stamp,
    geo: { status: "ok", lat: -23.18, lon: -45.88, accuracy: 30, ts: "2026-11-10T13:40:01.000Z" }
  });
});

test("GPS negado, indisponível e sem API viram estados, e a ação segue", async () => {
  const run = async (geolocation: unknown) => parse(await montarEvidencia({ ...base, fetchImpl: okFetch, navigator: { ...base.navigator, geolocation: geolocation as never } }));
  assert.deepEqual((await run(geoError(1))).geo, { status: "negada" });
  assert.deepEqual((await run(geoError(2))).geo, { status: "indisponivel" });
  assert.deepEqual((await run(geoError(3))).geo, { status: "tempo-esgotado" });
  assert.deepEqual((await run(undefined)).geo, { status: "indisponivel" });
  assert.equal((await run(geoError(1))).ipStamp?.ip, stamp.ip);
});

test("Worker fora do ar, com erro ou com resposta inválida: ipStamp null e o GPS continua", async () => {
  const run = async (fetchImpl: typeof fetch) => parse(await montarEvidencia({ ...base, fetchImpl }));
  for (const fetchImpl of [
    (async () => { throw new Error("rede"); }) as typeof fetch,
    (async () => new Response("{}", { status: 503 })) as typeof fetch,
    (async () => new Response(JSON.stringify({ ip: "1.1.1.1" }), { status: 200 })) as typeof fetch
  ]) {
    const evidencia = await run(fetchImpl);
    assert.equal(evidencia.ipStamp, null);
    assert.equal(evidencia.geo.status, "ok");
  }
});

test("sem resposta do GPS e do Worker, a espera termina em até 8 s com tempo-esgotado e ipStamp null", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const hang = { getCurrentPosition: () => {} };
  const never = (() => new Promise(() => {})) as unknown as typeof fetch;
  const pending = montarEvidencia({ ...base, fetchImpl: never, navigator: { userAgent: "UA", geolocation: hang } });
  t.mock.timers.tick(3000);
  await Promise.resolve();
  t.mock.timers.tick(5000);
  const evidencia = parse(await pending);
  assert.equal(evidencia.ipStamp, null);
  assert.deepEqual(evidencia.geo, { status: "tempo-esgotado" });
  assert.equal(evidencia.platform, "");
  assert.equal(evidencia.model, "");
});

test("nunca lança erro, mesmo com navigator quebrado", async () => {
  const broken = { get userAgent(): string { throw new Error("boom"); } };
  assert.equal(await montarEvidencia({ navigator: broken, fetchImpl: okFetch }), "");
});

test("userAgent enorme é cortado e o JSON cabe nos 4.000 caracteres da coluna", async () => {
  const json = await montarEvidencia({ ...base, fetchImpl: okFetch, navigator: { ...base.navigator, userAgent: "x".repeat(9000) } });
  assert.ok(json.length <= 4000);
  assert.equal(parse(json).userAgent.length, 400);
});

test("Abrir e Registrar ciência enviam new_EvidenciaJson só quando há evidência", async () => {
  const previous = (globalThis as any).window;
  const requests: Record<string, any>[] = [];
  (globalThis as any).window = {
    location: { hostname: "org.crm2.dynamics.com" },
    parent: { Xrm: { WebApi: { online: { execute: async (request: Record<string, any>) => { requests.push(request); return new Response(null, { status: 204 }); } } } } }
  };
  try {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const evidencia = await montarEvidencia({ ...base, fetchImpl: okFetch });
    await abrirComunicado(id, evidencia);
    await abrirComunicado(id);
    await assinarComunicado(id, [[[0.1, 0.1], [0.5, 0.5]]], " ok ", evidencia);
    const [abrir, abrirAntigo, ciencia] = requests;
    assert.equal(abrir.getMetadata().operationName, "new_AbrirComunicadoMotorista");
    assert.equal(abrir.new_EvidenciaJson, evidencia);
    assert.equal(abrir.getMetadata().parameterTypes.new_EvidenciaJson.typeName, "Edm.String");
    assert.equal("new_EvidenciaJson" in abrirAntigo, false);
    assert.equal(ciencia.getMetadata().operationName, "new_RegistrarCienciaComunicado");
    assert.equal(ciencia.new_EvidenciaJson, evidencia);
    assert.equal(ciencia.new_Observacao, "ok");
  } finally {
    (globalThis as any).window = previous;
  }
});
