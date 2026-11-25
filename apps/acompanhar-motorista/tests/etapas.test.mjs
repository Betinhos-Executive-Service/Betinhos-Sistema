import assert from "node:assert/strict";
import test from "node:test";
import { avancarEtapas, faseDasEtapas, etaPublico, etapasVisiveis, mesclarEtapas } from "../src/etapas.mjs";
import { areaDoLugar } from "../src/local.mjs";
import { distanciaMetros } from "../src/infleet.mjs";

const saida = { tipo: "saida", lat: -23.5614, lon: -46.6559 };
const parada = { tipo: "parada", lat: -23.5700, lon: -46.6900 };
const destino = { tipo: "destino", lat: -23.6267, lon: -46.6554 };
const longe = { lat: -23.50, lon: -46.60 };
const t = (s) => new Date(Date.UTC(2026, 9, 22, 12, 0, s)).toISOString();
const novas = () => [saida, parada, destino].map((e) => ({ ...e }));

test("a caminho → no local só após 60 s no raio → em viagem ao sair", () => {
  const e = novas();
  avancarEtapas(e, longe, t(0));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "a_caminho", atual: 0 });
  avancarEtapas(e, saida, t(10));
  assert.equal(faseDasEtapas(e, false).fase, "a_caminho", "dentro do raio há menos de 60 s");
  avancarEtapas(e, saida, t(75));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "no_local", atual: 0 });
  avancarEtapas(e, longe, t(200));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "em_viagem", atual: 1 });
});

test("parada visitada avança para o destino; chegar no destino conclui", () => {
  const e = novas();
  for (const [p, s] of [[saida, 0], [saida, 70], [longe, 100], [parada, 200], [parada, 270], [longe, 300], [destino, 400], [destino, 470]]) avancarEtapas(e, p, t(s));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "concluido", atual: null });
});

test("sair do raio antes de 60 s zera a contagem", () => {
  const e = novas();
  avancarEtapas(e, saida, t(0)); avancarEtapas(e, longe, t(30)); avancarEtapas(e, saida, t(50)); avancarEtapas(e, saida, t(90));
  assert.equal(faseDasEtapas(e, false).fase, "a_caminho");
});

test("Dataverse concluído prevalece", () => assert.deepEqual(faseDasEtapas(novas(), true), { fase: "concluido", atual: null }));
test("sem posição não muda nada", () => assert.equal(avancarEtapas(novas(), null, t(0)), false));

test("sem etapas ou lista inválida → a caminho, sem atual", () => {
  assert.deepEqual(faseDasEtapas([], false), { fase: "a_caminho", atual: null });
  assert.deepEqual(faseDasEtapas(null, false), { fase: "a_caminho", atual: null });
  assert.deepEqual(faseDasEtapas(undefined, false), { fase: "a_caminho", atual: null });
  assert.deepEqual(faseDasEtapas([], true), { fase: "concluido", atual: null }, "Dataverse concluído ainda prevalece");
});

test("carro já na parada: a saída anterior é pulada e a parada começa a contar", () => {
  const e = novas();
  avancarEtapas(e, parada, t(0));
  assert.equal(e[0].pulada, true);
  assert.equal(e[0].chegouEm, t(0));
  assert.equal(e[0].saiuEm, t(0));
  assert.equal(e[1].dentroDesde, t(0));
  avancarEtapas(e, parada, t(70));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "no_local", atual: 1 });
});

test("carro chega direto no destino: saída e parada puladas, concluído após 60 s", () => {
  const e = novas();
  avancarEtapas(e, destino, t(0));
  assert.equal(e[0].pulada, true);
  assert.equal(e[1].pulada, true);
  assert.equal(e[2].dentroDesde, t(0));
  avancarEtapas(e, destino, t(60));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "concluido", atual: null });
});

test("parada intermediária chegada e ainda sem saída → no local, não em viagem", () => {
  const e = novas();
  avancarEtapas(e, saida, t(0)); avancarEtapas(e, saida, t(70));
  avancarEtapas(e, longe, t(100));
  avancarEtapas(e, parada, t(200)); avancarEtapas(e, parada, t(270));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "no_local", atual: 1 });
});

test("saída = destino (ida e volta): carro na saída não pula nada e conclui a permanência em 60 s", () => {
  const e = [{ ...saida }, { ...parada }, { tipo: "destino", lat: saida.lat, lon: saida.lon }];
  avancarEtapas(e, saida, t(0));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "a_caminho", atual: 0 });
  assert.equal(e.some((x) => x.pulada), false);
  avancarEtapas(e, saida, t(60));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "no_local", atual: 0 });
  assert.equal(e.some((x) => x.pulada), false);
});

test("parada a 100 m da saída com o carro na saída não pula a saída", () => {
  const perto = { tipo: "parada", lat: -23.5605, lon: -46.6559 };
  const e = [{ ...saida }, perto, { ...destino }];
  avancarEtapas(e, saida, t(0));
  assert.equal(e[0].pulada, undefined);
  assert.equal(e[1].pulada, undefined);
  assert.deepEqual(faseDasEtapas(e, false), { fase: "a_caminho", atual: 0 });
});

test("chegar dentro da área do lugar a mais de 150 m do ponto conta como no local", () => {
  const gru = { class: "aeroway", boundingbox: ["-23.4577851", "-23.4179030", "-46.4939891", "-46.4375520"] };
  const area = areaDoLugar(gru);
  const centro = { lat: -23.4378590, lon: -46.4805562 };
  const dentroDaArea = { lat: -23.4480, lon: -46.4900 };
  assert.ok(distanciaMetros(centro.lat, centro.lon, dentroDaArea.lat, dentroDaArea.lon) > 150, "ponto de teste fora do raio");
  const e = [{ tipo: "saida", ...centro, area }, { tipo: "destino", lat: -23.6267, lon: -46.6554 }];
  avancarEtapas(e, dentroDaArea, t(0));
  avancarEtapas(e, dentroDaArea, t(70));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "no_local", atual: 0 });
});

test("ETA: exato com TomTom e posição recente; faixa com OSRM ou posição com mais de 90 s; nada sem rota, velha ou no local", () => {
  const agora = new Date("2026-10-22T12:00:00Z");
  const base = { modo: "completo", fase: "a_caminho", rota: { fonte: "tomtom", minutos: 13, km: 8.2 }, posFixTime: "2026-10-22T11:58:30Z", agora };
  assert.deepEqual(etaPublico(base), { minutos: 13, faixa: null, transito: true, km: 8.2 });
  assert.equal(etaPublico({ ...base, rota: { fonte: "tomtom", minutos: 0 } }).minutos, 1);
  assert.deepEqual(etaPublico({ ...base, rota: { fonte: "osrm", minutos: 13 } }), { minutos: 13, faixa: [13, 18], transito: false, km: null });
  assert.deepEqual(etaPublico({ ...base, rota: { fonte: "osrm", minutos: 2 } }).faixa, [2, 4], "faixa mínima de 2 min");
  assert.deepEqual(etaPublico({ ...base, posFixTime: "2026-10-22T11:58:00Z" }).faixa, [13, 18], "posição com 2 min → faixa mesmo com TomTom");
  assert.equal(etaPublico({ ...base, posFixTime: "2026-10-22T11:56:00Z" }), null);
  assert.equal(etaPublico({ ...base, posFixTime: null }), null);
  assert.equal(etaPublico({ ...base, rota: null }), null);
  assert.equal(etaPublico({ ...base, fase: "no_local" }), null);
  assert.equal(etaPublico({ ...base, fase: "em_viagem" }).minutos, 13);
  assert.equal(etaPublico({ ...base, modo: undefined }).minutos, 13, "link antigo (sem modo) tem ETA");
});

test("etapasVisiveis marca visitada, atual e pulada sem expor horários", () => {
  const e = [
    { tipo: "saida", rotulo: "A", lat: 1, lon: 2, chegouEm: "x", saiuEm: "y", pulada: true },
    { tipo: "parada", rotulo: "B", lat: 3, lon: 4, chegouEm: "x", saiuEm: "y" },
    { tipo: "destino", rotulo: "C", lat: 5, lon: 6 },
  ];
  assert.deepEqual(etapasVisiveis(e, 2), [
    { tipo: "saida", rotulo: "A", lat: 1, lon: 2, visitada: true, atual: false, pulada: true },
    { tipo: "parada", rotulo: "B", lat: 3, lon: 4, visitada: true, atual: false },
    { tipo: "destino", rotulo: "C", lat: 5, lon: 6, visitada: false, atual: true },
  ]);
  assert.equal(etapasVisiveis(e, null)[2].atual, false);
});

test("etaPublico com fixTime inválido → null", () => {
  const rota = { fonte: "tomtom", minutos: 5 };
  assert.equal(etaPublico({ fase: "a_caminho", rota, posFixTime: "lixo", agora: new Date("2026-10-22T12:00:00Z") }), null);
});

test("mesclarEtapas mantém o marco mais antigo e a pulada já gravados", () => {
  const g = [{ chegouEm: t(5), saiuEm: t(9) }, { pulada: true, chegouEm: t(9), saiuEm: t(9) }, {}];
  const m = [{ chegouEm: t(7) }, { dentroDesde: t(20) }, { dentroDesde: t(30) }];
  const r = mesclarEtapas(g, m);
  assert.deepEqual(r[0], { chegouEm: t(5), saiuEm: t(9) });
  assert.deepEqual(r[1], { pulada: true, chegouEm: t(9), saiuEm: t(9) });
  assert.deepEqual(r[2], { dentroDesde: t(30) });
  assert.equal(mesclarEtapas(null, m), m);
  assert.equal(mesclarEtapas([{ chegandoEm: t(3) }], [{}])[0].chegandoEm, t(3), "marca de chegando de outro isolate não se perde");
  assert.equal(mesclarEtapas([{ chegandoEm: t(8) }], [{ chegandoEm: t(4) }])[0].chegandoEm, t(4), "a entrada mais antiga vence");
});

// ---- Serviço já em curso quando o link nasce (caso real OS-10915, link btuygOcsAwe2) ----
import { precisaLerTrajeto, reconstruirEtapas, inferirSaidaFeita, saidaVistaNoTrajeto } from "../src/etapas.mjs";
const pinda = { tipo: "saida", lat: -22.9352, lon: -45.4077 };
const gru = { tipo: "destino", lat: -23.4263, lon: -46.4818 };
const taubate = { lat: -23.0116, lon: -45.5215 };
const HORARIO = "2026-10-23T15:30:00Z";

test("lê o trajeto só com a saída pendente, depois do horário e uma vez", () => {
  const es = () => [{ ...pinda }, { ...gru }];
  assert.equal(precisaLerTrajeto({ etapas: es(), horarioAgendado: HORARIO }, new Date("2026-10-23T16:00:00Z")), true);
  assert.equal(precisaLerTrajeto({ etapas: es(), horarioAgendado: HORARIO }, new Date("2026-10-23T15:00:00Z")), false, "antes do horário");
  assert.equal(precisaLerTrajeto({ etapas: es(), horarioAgendado: HORARIO, trajetoLidoEm: "x" }, new Date("2026-10-23T16:00:00Z")), false, "já lido");
  assert.equal(precisaLerTrajeto({ etapas: [{ ...pinda, chegouEm: "x" }, { ...gru }], horarioAgendado: HORARIO }, new Date("2026-10-23T16:00:00Z")), false);
  assert.equal(precisaLerTrajeto({ etapas: es() }, new Date("2026-10-23T16:00:00Z")), false, "sem horário");
  const falhou = { etapas: es(), horarioAgendado: HORARIO, trajetoTentadoEm: "2026-10-23T16:00:00Z", trajetoTentativas: 1 };
  assert.equal(precisaLerTrajeto(falhou, new Date("2026-10-23T16:04:00Z")), false, "falhou há menos de 5 min");
  assert.equal(precisaLerTrajeto(falhou, new Date("2026-10-23T16:05:00Z")), true, "nova tentativa após 5 min");
  assert.equal(precisaLerTrajeto({ ...falhou, trajetoTentativas: 3 }, new Date("2026-10-23T17:00:00Z")), false, "no máximo 3 tentativas");
});

test("reconstrói chegada e saída pela ordem do histórico, com a mesma permanência", () => {
  const es = [{ ...pinda }, { ...gru }];
  const pontos = [
    { lat: taubate.lat, lon: taubate.lon, fixTime: "2026-10-23T15:50:00Z" },
    { lat: pinda.lat, lon: pinda.lon, fixTime: "2026-10-23T15:25:00Z" },
    { lat: pinda.lat, lon: pinda.lon, fixTime: "2026-10-23T15:31:00Z" },
    { lat: -22.96, lon: -45.44, fixTime: "2026-10-23T15:35:00Z" },
  ];
  reconstruirEtapas(es, pontos);
  assert.equal(es[0].chegouEm, "2026-10-23T15:25:00Z");
  assert.equal(es[0].saiuEm, "2026-10-23T15:35:00Z");
  assert.equal(faseDasEtapas(es, false).fase, "em_viagem");
});

test("evidência da saída no histórico: ponto a até 2 km dela", () => {
  const es = [{ ...pinda }, { ...gru }];
  assert.equal(saidaVistaNoTrajeto(es, [{ lat: taubate.lat, lon: taubate.lon, fixTime: "b" }, { lat: -22.945, lon: -45.41, fixTime: "a" }]), "a");
  assert.equal(saidaVistaNoTrajeto(es, [{ lat: -23.55, lon: -46.63, fixTime: "a" }, { lat: taubate.lat, lon: taubate.lon, fixTime: "b" }]), null, "vindo de SP sem passar por Pinda");
  assert.equal(saidaVistaNoTrajeto(es, []), null);
});

test("caso real: 109 km/h perto de Taubaté indo para GRU, depois do horário → saída inferida, em viagem", () => {
  const es = [{ ...pinda }, { ...gru }];
  const ok = inferirSaidaFeita(es, { pos: taubate, velocidadeKmh: 109, agora: new Date("2026-10-23T16:05:00Z"), horarioAgendado: HORARIO, quando: "2026-10-23T16:05:00Z", saidaVistaEm: "2026-10-23T15:20:00Z" });
  assert.equal(ok, true);
  assert.equal(es[0].inferido, true);
  const { fase, atual } = faseDasEtapas(es, false);
  assert.equal(fase, "em_viagem");
  assert.equal(atual, 1);
  const vis = etapasVisiveis(es, atual);
  assert.equal(vis[0].visitada, true);
  assert.ok(!("chegouEm" in vis[0]) && !("saiuEm" in vis[0]), "sem horário público");
});

test("nunca infere antes do horário agendado nem perto da saída", () => {
  const es = [{ ...pinda }, { ...gru }];
  assert.equal(inferirSaidaFeita(es, { pos: taubate, velocidadeKmh: 109, agora: new Date("2026-10-23T15:00:00Z"), horarioAgendado: HORARIO, quando: "q", saidaVistaEm: "x" }), false);
  assert.equal(inferirSaidaFeita(es, { pos: { lat: -22.94, lon: -45.41 }, velocidadeKmh: 60, agora: new Date("2026-10-23T16:00:00Z"), horarioAgendado: HORARIO, quando: "q", saidaVistaEm: "x" }), false, "a menos de 2 km");
  assert.equal(inferirSaidaFeita(es, { pos: taubate, velocidadeKmh: 109, agora: new Date("2026-10-23T16:00:00Z"), horarioAgendado: null, quando: "q" }), false, "sem horário");
  assert.equal(es[0].chegouEm, undefined);
});

test("sem evidência da saída no histórico nunca infere: motorista atrasado vindo de SP para Pinda", () => {
  const es = [{ ...pinda }, { ...gru }];
  assert.equal(inferirSaidaFeita(es, { pos: taubate, velocidadeKmh: 109, agora: new Date("2026-10-23T16:05:00Z"), horarioAgendado: HORARIO, quando: "q", saidaVistaEm: null }), false);
  assert.equal(faseDasEtapas(es, false).fase, "a_caminho");
});

test("carro indo buscar (mais longe do destino que a saída) e devagar → não infere; rápido se afastando → infere", () => {
  const indo = { lat: -22.80, lon: -45.20 }; // além de Pinda, do lado oposto a GRU
  const base = { agora: new Date("2026-10-23T16:00:00Z"), horarioAgendado: HORARIO, quando: "q", saidaVistaEm: "2026-10-23T15:20:00Z" };
  assert.equal(inferirSaidaFeita([{ ...pinda }, { ...gru }], { ...base, pos: indo, velocidadeKmh: 10 }), false);
  assert.equal(inferirSaidaFeita([{ ...pinda }, { ...gru }], { ...base, pos: indo, velocidadeKmh: 80, anterior: { lat: -22.85, lon: -45.28 } }), true, "afastando da saída a 80 km/h");
  assert.equal(inferirSaidaFeita([{ ...pinda }, { ...gru }], { ...base, pos: indo, velocidadeKmh: 80, anterior: { lat: -22.75, lon: -45.10 } }), false, "aproximando da saída");
});

import { reforcarChegada } from "../src/etapas.mjs";
const perto = (m) => ({ lat: saida.lat + m / 111320, lon: saida.lon });

test("reforço: duas posições esparsas (>= 2 min, <= 50 m) dentro do raio marcam a chegada sem os 60 s contínuos", () => {
  const e = novas();
  const ultima = { ...saida, fixTime: t(0) };
  assert.equal(reforcarChegada(e, ultima, perto(20), t(30 * 60)), true);
  assert.deepEqual(faseDasEtapas(e, false), { fase: "no_local", atual: 0 });
  assert.equal(e[0].chegouEm, t(0));
});

test("reforço não vale: intervalo curto, distantes, fora do raio ou sem posição anterior", () => {
  assert.equal(reforcarChegada(novas(), { ...saida, fixTime: t(0) }, saida, t(60)), false, "menos de 2 min");
  assert.equal(reforcarChegada(novas(), { ...saida, fixTime: t(0) }, perto(80), t(600)), false, "mais de 50 m");
  assert.equal(reforcarChegada(novas(), { ...longe, fixTime: t(0) }, longe, t(600)), false, "fora do raio");
  assert.equal(reforcarChegada(novas(), null, saida, t(600)), false);
});

test("velocidade 0 isolada não muda etapa nem fase (avancarEtapas ignora velocidade)", () => {
  const e = novas();
  avancarEtapas(e, { ...longe, velocidadeKmh: 0 }, t(0));
  avancarEtapas(e, { ...longe, velocidadeKmh: 0 }, t(600));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "a_caminho", atual: 0 });
  assert.equal(e[0].chegouEm, undefined);
});
