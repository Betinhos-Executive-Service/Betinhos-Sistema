import assert from "node:assert/strict";
import test from "node:test";
import { proximoAlarme, RAPIDO_MS, LENTO_MS, LIMPEZA_MS, JANELA_MS } from "../src/ritmo.mjs";

const agoraMs = Date.parse("2026-11-13T12:00:00Z");
const base = { agoraMs, conectados: 0, inscricoes: 0, fase: "a_caminho", distanciaAlvoM: 20000, horarioAgendado: null, encerrado: false };
const em = (min) => new Date(agoraMs + min * 60000).toISOString();
const caso = (nome, entrada, esperado) => test(nome, () => assert.deepEqual(proximoAlarme({ ...base, ...entrada }), esperado));

caso("encerrado → limpeza em 24 h", { encerrado: true, conectados: 2 }, { emMs: agoraMs + LIMPEZA_MS, limpar: true });
caso("concluído → limpeza em 24 h", { fase: "concluido", inscricoes: 1 }, { emMs: agoraMs + LIMPEZA_MS, limpar: true });
caso("WebSocket conectado, longe, sem inscrição → 15 s", { conectados: 1 }, { emMs: agoraMs + RAPIDO_MS, limpar: false });
caso("ninguém olhando e sem inscrição, a 1 km → sem alarm", { distanciaAlvoM: 1000 }, { emMs: null, limpar: false });
caso("inscrição, a 2 km → 15 s", { inscricoes: 1, distanciaAlvoM: 2000 }, { emMs: agoraMs + RAPIDO_MS, limpar: false });
caso("inscrição, no local → 15 s", { inscricoes: 1, fase: "no_local", distanciaAlvoM: null }, { emMs: agoraMs + RAPIDO_MS, limpar: false });
caso("inscrição, 30 min antes, a 20 km → 60 s", { inscricoes: 1, horarioAgendado: em(30) }, { emMs: agoraMs + LENTO_MS, limpar: false });
caso("inscrição, 3 h antes → 60 min antes do horário", { inscricoes: 1, horarioAgendado: em(180) }, { emMs: agoraMs + 180 * 60000 - JANELA_MS, limpar: false });
caso("inscrição, sem horário, em viagem → 60 s", { inscricoes: 1, fase: "em_viagem" }, { emMs: agoraMs + LENTO_MS, limpar: false });
caso("inscrição, horário já passou → 60 s", { inscricoes: 1, horarioAgendado: em(-20) }, { emMs: agoraMs + LENTO_MS, limpar: false });
