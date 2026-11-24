import assert from "node:assert/strict";
import test from "node:test";
import { terminalDoTexto, pontoDeChegada } from "../src/chegada.mjs";

const gru = { lat: -23.4356, lon: -46.4731 }; // centro do aeroporto (pátio)

test("terminal do texto em Guarulhos; sem terminal, o T2", () => {
  assert.deepEqual(terminalDoTexto("Aeroporto de Guarulhos T3 - LATAM", gru), { lat: -23.4257371, lon: -46.4740626 });
  assert.deepEqual(terminalDoTexto("GRU terminal 1", gru), { lat: -23.4296966, lon: -46.4893132 });
  assert.deepEqual(terminalDoTexto("Aeroporto de Guarulhos", gru), { lat: -23.4271535, lon: -46.4802039 });
});

test("não troca hotel perto do aeroporto, cidade sem aeroporto nem ponto longe", () => {
  assert.equal(terminalDoTexto("Hotel Pullman GRU", gru), null);
  assert.equal(terminalDoTexto("Rua Dom Pedro II, Guarulhos", gru), null);
  assert.equal(terminalDoTexto("Aeroporto de Guarulhos", { lat: -23.55, lon: -46.63 }), null);
});

test("pontoDeChegada: usa a chegada gravada, senão o rótulo; mantém o resto do alvo", () => {
  const gravada = pontoDeChegada({ ...gru, rotulo: "Destino", chegada: { lat: -23.4257371, lon: -46.4740626 }, area: null });
  assert.deepEqual([gravada.lat, gravada.lon, gravada.rotulo], [-23.4257371, -46.4740626, "Destino"]);
  const peloRotulo = pontoDeChegada({ ...gru, rotulo: "Aeroporto de Guarulhos" });
  assert.equal(peloRotulo.lat, -23.4271535);
  const comum = { lat: -23.2, lon: -45.9, rotulo: "Kenvue" };
  assert.equal(pontoDeChegada(comum), comum);
  assert.equal(pontoDeChegada(null), null);
});
