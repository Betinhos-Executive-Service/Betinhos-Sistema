import assert from "node:assert/strict";
import { test } from "node:test";
import { areaAfastadaDemais, CENTRO_PADRAO, consultaPostosNaArea, distanciaKm, LIMITE_POSTOS, mapearPosto, maisProximos, origemDasDistancias, rotuloKm, rotuloOrigem, tituloLista, urlGoogleMaps, urlWaze, ZOOM_MAXIMO_FOCO, ZOOM_MINIMO_BUSCA, zoomDoFoco, type Posto } from "../src/features/postos/postosProximos.ts";
import { POSTOS_MOCK } from "../src/features/postos/remoto.ts";

const posto = (id: string, lat: number, lon: number, nome = id): Posto => ({ id, nome, endereco: "", lat, lon });

test("consultaPostosNaArea filtra rede CTF, exclui Pendente e limita ao retângulo visível", () => {
  const consulta = consultaPostosNaArea({ sul: -23.25, norte: -23.15, oeste: -45.95, leste: -45.8 });
  assert.equal(consulta, "$select=new_postocombustivelid,new_name,new_logradouro,new_numero,new_bairro,new_municipio,new_uf,new_latitude,new_longitude"
    + "&$filter=new_aceitactf eq true and new_statusgeo ne 100000000 and new_latitude ge -23.250000 and new_latitude le -23.150000 and new_longitude ge -45.950000 and new_longitude le -45.800000"
    + `&$top=${LIMITE_POSTOS}`);
});

test("consultaPostosNaArea aceita outro limite", () => {
  assert.match(consultaPostosNaArea({ sul: 0, norte: 1, oeste: 0, leste: 1 }, 50), /&\$top=50$/);
});

test("areaAfastadaDemais pede para aproximar abaixo do zoom mínimo", () => {
  assert.equal(areaAfastadaDemais(ZOOM_MINIMO_BUSCA - 1), true);
  assert.equal(areaAfastadaDemais(ZOOM_MINIMO_BUSCA), false);
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
  assert.equal(rotuloOrigem(comGps), "de você");
  const semGps = origemDasDistancias(null);
  assert.deepEqual(semGps, { ponto: CENTRO_PADRAO, doMotorista: false });
  assert.equal(tituloLista(semGps), "Mais próximos do centro do mapa");
  assert.equal(rotuloOrigem(semGps), "do centro do mapa");
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
