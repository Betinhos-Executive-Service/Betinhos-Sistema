import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// O service worker é um arquivo estático (public/sw.js): carregado com um `self` falso, sem navegador.
const codigo = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function carregar(clientes = []) {
  const ouvintes = {}, mostradas = [], abertas = [], focadas = [];
  const self = {
    location: { origin: "https://acompanhar.betinhos.com.br" },
    addEventListener: (tipo, fn) => { ouvintes[tipo] = fn; },
    registration: { showNotification: async (titulo, opcoes) => { mostradas.push({ titulo, opcoes }); } },
    clients: {
      matchAll: async () => clientes.map((url) => ({ url, focus: async () => { focadas.push(url); } })),
      openWindow: async (url) => { abertas.push(url); },
    },
  };
  new Function("self", codigo)(self);
  const disparar = async (tipo, evento) => {
    let espera;
    ouvintes[tipo]({ ...evento, waitUntil: (p) => { espera = p; } });
    await espera;
  };
  return { disparar, mostradas, abertas, focadas };
}

test("sw.js: push mostra a notificação com título, corpo, tag e url", async () => {
  const sw = carregar();
  const aviso = { titulo: "Motorista chegando", corpo: "Carlos chega em 5 min", url: "/r/aB3dE5gH7jK8", tag: "aB3dE5gH7jK8:chegando_embarque" };
  await sw.disparar("push", { data: { json: () => aviso } });
  assert.equal(sw.mostradas.length, 1);
  assert.equal(sw.mostradas[0].titulo, "Motorista chegando");
  assert.equal(sw.mostradas[0].opcoes.body, "Carlos chega em 5 min");
  assert.equal(sw.mostradas[0].opcoes.tag, aviso.tag);
  assert.equal(sw.mostradas[0].opcoes.data.url, "/r/aB3dE5gH7jK8");
  assert.equal(sw.mostradas[0].opcoes.icon, "/logo-b-128.png");
});

test("sw.js: push sem corpo legível ainda mostra uma notificação (exigência do userVisibleOnly)", async () => {
  const sw = carregar();
  await sw.disparar("push", { data: { json: () => { throw new Error("não é JSON"); } } });
  assert.equal(sw.mostradas.length, 1);
  assert.equal(sw.mostradas[0].titulo, "Betinhos Executive Service");
});

test("sw.js: toque foca a aba já aberta no link; sem ela, abre o link; url de fora vira a raiz", async () => {
  const fechada = [];
  const notificacao = (url) => ({ data: { url }, close: () => fechada.push(url) });
  const aberta = carregar(["https://acompanhar.betinhos.com.br/r/aB3dE5gH7jK8?idioma=en"]);
  await aberta.disparar("notificationclick", { notification: notificacao("/r/aB3dE5gH7jK8") });
  assert.deepEqual(aberta.focadas, ["https://acompanhar.betinhos.com.br/r/aB3dE5gH7jK8?idioma=en"]);
  assert.deepEqual(aberta.abertas, []);
  const nenhuma = carregar([]);
  await nenhuma.disparar("notificationclick", { notification: notificacao("/r/aB3dE5gH7jK8") });
  assert.deepEqual(nenhuma.abertas, ["https://acompanhar.betinhos.com.br/r/aB3dE5gH7jK8"]);
  const fora = carregar([]);
  await fora.disparar("notificationclick", { notification: notificacao("https://malicioso.example/r/x") });
  assert.deepEqual(fora.abertas, ["https://acompanhar.betinhos.com.br/"]);
  assert.equal(fechada.length, 3);
});
