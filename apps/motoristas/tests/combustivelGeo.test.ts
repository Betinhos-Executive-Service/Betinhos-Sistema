import assert from "node:assert/strict";
import test from "node:test";
import { brasilApiUrl, haversineMeters, normalizeCnpj, nominatimUrl, parseBrasilApi, parseNominatim, summarize, verdict } from "../scripts/combustivel/geo.ts";

test("normalizeCnpj aceita pontuação e rejeita DV inválido", () => {
  assert.equal(normalizeCnpj("07.108.241/0001-06"), "07108241000106");
  assert.equal(normalizeCnpj("07.108.241/0001-07"), null);
  assert.equal(normalizeCnpj("11111111111111"), null);
  assert.equal(normalizeCnpj(null), null);
});

test("brasilApiUrl usa só dígitos", () => {
  assert.equal(brasilApiUrl("07108241000106"), "https://brasilapi.com.br/api/cnpj/v1/07108241000106");
});

test("parseBrasilApi junta tipo e logradouro e prefere nome fantasia", () => {
  const e = parseBrasilApi({ razao_social: "AUTO POSTO X LTDA", nome_fantasia: "Posto X", descricao_tipo_de_logradouro: "AVENIDA", logradouro: "PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "SP", cep: "01310100" });
  assert.deepEqual(e, { nome: "Posto X", logradouro: "AVENIDA PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "SP", cep: "01310100" });
  assert.equal(parseBrasilApi({ message: "CNPJ não encontrado" }), null);
});

test("nominatimUrl monta busca estruturada no Brasil", () => {
  const url = new URL(nominatimUrl({ nome: "Posto X", logradouro: "AVENIDA PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "SP", cep: "01310100" }));
  assert.equal(url.origin + url.pathname, "https://nominatim.openstreetmap.org/search");
  assert.equal(url.searchParams.get("street"), "1000 AVENIDA PAULISTA");
  assert.equal(url.searchParams.get("city"), "SAO PAULO");
  assert.equal(url.searchParams.get("state"), "SP");
  assert.equal(url.searchParams.get("postalcode"), "01310100");
  assert.equal(url.searchParams.get("countrycodes"), "br");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("limit"), "1");
});

test("parseNominatim classifica precisão pelo place_rank", () => {
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 30 }]), { lat: -23.56, lon: -46.65, precisao: "rua" });
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 26 }]), { lat: -23.56, lon: -46.65, precisao: "rua" });
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 20 }]), { lat: -23.56, lon: -46.65, precisao: "bairro" });
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 12 }]), { lat: -23.56, lon: -46.65, precisao: "cidade" });
  assert.equal(parseNominatim([]), null);
});

test("haversineMeters mede ~1,11 km por 0,01° de latitude", () => {
  const d = haversineMeters({ lat: -23.55, lon: -46.63 }, { lat: -23.56, lon: -46.63 });
  assert.ok(Math.abs(d - 1112) < 5, String(d));
});

test("summarize conta encontrados, geocodificados e nível de rua", () => {
  assert.deepEqual(summarize([
    { cnpj: "a", brasilApi: true, geo: { lat: 0, lon: 0, precisao: "rua" } },
    { cnpj: "b", brasilApi: true, geo: { lat: 0, lon: 0, precisao: "bairro" } },
    { cnpj: "c", brasilApi: true, geo: null },
    { cnpj: "d", brasilApi: false, geo: null }
  ]), { total: 4, encontrados: 3, geocodificados: 2, rua: 1 });
});

test("verdict aprova com 85% abaixo de 300 m", () => {
  const ok = [...Array(17).fill(120), 450, 900, 2000];
  assert.deepEqual(verdict(ok), { ok: true, share: 0.85 });
  const ruim = [...Array(16).fill(120), 450, 900, 2000, 3000];
  assert.deepEqual(verdict(ruim), { ok: false, share: 0.8 });
});
