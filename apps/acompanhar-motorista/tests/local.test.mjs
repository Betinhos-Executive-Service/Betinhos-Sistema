import assert from "node:assert/strict";
import test from "node:test";
import { areaDoLugar, chegouAoLocal, dentroDaArea, inferirEmViagem, marcosDoTrajeto, saiuDoLocal } from "../src/local.mjs";

// GRU como o Nominatim devolve: centro a ~1 km do meio-fio do Terminal 2.
const gru = { class: "aeroway", type: "aerodrome", lat: "-23.4378590", lon: "-46.4805562", boundingbox: ["-23.4577851", "-23.4179030", "-46.4939891", "-46.4375520"] };
const terminal2 = { lat: -23.4356, lon: -46.4731 };
const rodoviaForaDoAeroporto = { lat: -23.4700, lon: -46.4600 };

test("aeroporto vira área; rua, cidade e caixa minúscula não", () => {
  assert.deepEqual(areaDoLugar(gru), { sul: -23.4577851, norte: -23.417903, oeste: -46.4939891, leste: -46.437552 });
  assert.equal(areaDoLugar({ class: "highway", boundingbox: gru.boundingbox }), null);
  assert.equal(areaDoLugar({ class: "place", type: "city", boundingbox: ["-23.6", "-23.3", "-46.9", "-46.3"] }), null);
  assert.equal(areaDoLugar({ class: "amenity", boundingbox: ["-23.6", "-23.3", "-46.9", "-46.3"] }), null, "caixa de cidade estoura o teto");
  assert.equal(areaDoLugar({ class: "amenity", boundingbox: ["-23.5001", "-23.5000", "-46.6001", "-46.6000"] }), null, "caixa menor que o raio padrão");
  assert.equal(areaDoLugar({ class: "amenity", boundingbox: ["x", "1", "2", "3"] }), null);
  assert.equal(areaDoLugar(null), null);
});

test("dentro da área, com e sem margem", () => {
  const area = areaDoLugar(gru);
  assert.equal(dentroDaArea(terminal2, area), true);
  assert.equal(dentroDaArea(rodoviaForaDoAeroporto, area), false);
  // 200 m ao sul da borda: fora sem margem, dentro com folga de 300 m
  const bordaSul = { lat: -23.4577851 - 200 / 111320, lon: -46.47 };
  assert.equal(dentroDaArea(bordaSul, area), false);
  assert.equal(dentroDaArea(bordaSul, area, 300), true);
  assert.equal(dentroDaArea(terminal2, null), false);
});

test("chegou e saiu consideram ponto e área", () => {
  const embarque = { lat: Number(gru.lat), lon: Number(gru.lon), area: areaDoLugar(gru) };
  assert.equal(chegouAoLocal(terminal2, embarque), true, "no terminal, longe do centro geocodificado");
  assert.equal(saiuDoLocal(terminal2, embarque), false);
  assert.equal(saiuDoLocal(rodoviaForaDoAeroporto, embarque), true);
  const semArea = { lat: -23.5, lon: -46.6 };
  assert.equal(chegouAoLocal({ lat: -23.5005, lon: -46.6 }, semArea), true, "~55 m do ponto");
  assert.equal(chegouAoLocal({ lat: -23.503, lon: -46.6 }, semArea), false, "~330 m do ponto");
  assert.equal(saiuDoLocal({ lat: -23.503, lon: -46.6 }, semArea), true);
  assert.equal(chegouAoLocal(null, semArea), false);
});

test("link gerado com o serviço em andamento vira em viagem", () => {
  const base = { horarioAgendado: "2026-10-16T16:40:00.000Z", quando: "2026-10-16T17:10:00Z", agora: new Date("2026-10-16T17:10:30Z") };
  // Antes do horário, ou dentro do embarque: nada a inferir.
  assert.equal(inferirEmViagem({ ...base, estado: {}, agora: new Date("2026-10-16T16:00:00Z"), dEmb: 25000, dFim: 44000 }), null);
  assert.equal(inferirEmViagem({ ...base, estado: {}, dEmb: 120, dFim: 44000 }), null);
  // Primeira leitura ainda ambígua (mais perto do embarque): só guarda a observação.
  const obs = inferirEmViagem({ ...base, estado: {}, dEmb: 25000, dFim: 44000 });
  assert.deepEqual(obs, { observado: { dEmb: 25000, dFim: 44000, em: base.quando } });
  // Segunda leitura afastando do embarque e aproximando do destino: em viagem, com os marcos inferidos.
  const r = inferirEmViagem({ ...base, estado: obs, quando: "2026-10-16T17:11:00Z", dEmb: 26000, dFim: 43000 });
  assert.equal(r.inferido, "servico_em_andamento");
  assert.equal(r.chegouEmbarqueEm, base.horarioAgendado);
  assert.equal(r.saiuEmbarqueEm, "2026-10-16T17:11:00Z");
  assert.equal("observado" in r, false);
  // Atrasado indo buscar: aproxima do embarque, segue a caminho (observação atualizada).
  const tarde = inferirEmViagem({ ...base, estado: obs, dEmb: 24000, dFim: 45000 });
  assert.equal(tarde.chegouEmbarqueEm, undefined);
  assert.equal(tarde.observado.dEmb, 24000);
  // Mais perto do destino que do embarque: decide na primeira leitura.
  assert.equal(inferirEmViagem({ ...base, estado: {}, dEmb: 40000, dFim: 5000 }).inferido, "servico_em_andamento");
  // Marcos já vistos ou sem destino final: não mexe.
  assert.equal(inferirEmViagem({ ...base, estado: { chegouEmbarqueEm: "x" }, dEmb: 40000, dFim: 5000 }), null);
  assert.equal(inferirEmViagem({ ...base, estado: {}, dEmb: 40000, dFim: null }), null);
});

test("marcos reconstruídos pelo trajeto, na ordem em que aconteceram", () => {
  const embarque = { lat: -23.2247, lon: -45.8560, area: null };
  const gruFinal = { lat: Number(gru.lat), lon: Number(gru.lon), area: areaDoLugar(gru) };
  const pts = [
    { lat: -23.2600, lon: -45.9000, fixTime: "2026-10-16T16:20:00Z" }, // longe, indo buscar
    { lat: -23.2250, lon: -45.8562, fixTime: "2026-10-16T16:38:00Z" }, // chegou (~40 m)
    { lat: -23.2251, lon: -45.8561, fixTime: "2026-10-16T16:50:00Z" }, // parado esperando
    { lat: -23.2300, lon: -45.8700, fixTime: "2026-10-16T16:58:00Z" }, // saiu (>300 m)
    { lat: -23.3524, lon: -46.0557, fixTime: "2026-10-16T17:10:00Z" }, // rodovia
  ];
  assert.deepEqual(marcosDoTrajeto(pts, embarque, gruFinal), { chegouEmbarqueEm: "2026-10-16T16:38:00Z", saiuEmbarqueEm: "2026-10-16T16:58:00Z" });
  // Chegando ao destino final (dentro da área do GRU) fecha o serviço.
  const comFim = [...pts, { lat: -23.4356, lon: -46.4731, fixTime: "2026-10-16T17:45:00Z" }];
  assert.equal(marcosDoTrajeto(comFim, embarque, gruFinal).concluidoEm, "2026-10-16T17:45:00Z");
  // Ordem embaralhada não muda o resultado; sem passar pelo embarque, nada é marcado.
  assert.deepEqual(marcosDoTrajeto([...comFim].reverse(), embarque, gruFinal), marcosDoTrajeto(comFim, embarque, gruFinal));
  assert.deepEqual(marcosDoTrajeto([pts[0], pts[4]], embarque, gruFinal), {});
  assert.deepEqual(marcosDoTrajeto([], embarque, gruFinal), {});
  assert.deepEqual(marcosDoTrajeto(pts, null, gruFinal), {});
});

test("embarque sem número: parada de alguns minutos perto do ponto vale como embarque", () => {
  // Ponto geocodificado da avenida a ~740 m de onde o carro parou 18 min (caso OS-10427).
  const embarque = { lat: -23.2247164, lon: -45.8560489, area: null };
  const casa = { lat: -23.2300, lon: -45.8600 };
  const pts = [
    { lat: -23.2600, lon: -45.9000, fixTime: "2026-10-16T16:20:00Z" },
    { lat: casa.lat, lon: casa.lon, fixTime: "2026-10-16T16:31:00Z" },
    { lat: casa.lat + 0.0002, lon: casa.lon, fixTime: "2026-10-16T16:40:00Z" },
    { lat: casa.lat, lon: casa.lon + 0.0002, fixTime: "2026-10-16T16:49:00Z" },
    { lat: -23.2400, lon: -45.8800, fixTime: "2026-10-16T16:53:00Z" },
    { lat: -23.3524, lon: -46.0557, fixTime: "2026-10-16T17:10:00Z" },
  ];
  const m = marcosDoTrajeto(pts, embarque, null);
  assert.equal(m.chegouEmbarqueEm, "2026-10-16T16:31:00Z");
  assert.equal(m.saiuEmbarqueEm, "2026-10-16T16:53:00Z");
  assert.equal(m.embarqueAproximado, true);
  // Parada curta (1 min) não conta; passagem direta também não.
  const curta = [pts[0], pts[1], { ...pts[2], fixTime: "2026-10-16T16:32:00Z" }, pts[4], pts[5]];
  assert.deepEqual(marcosDoTrajeto(curta, embarque, null), {});
  assert.deepEqual(marcosDoTrajeto([pts[0], pts[4], pts[5]], embarque, null), {});
});
