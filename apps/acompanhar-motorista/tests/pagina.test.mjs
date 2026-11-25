import assert from "node:assert/strict";
import test from "node:test";
import { descricaoPrevia, paginaHtml } from "../src/pagina.mjs";
import { VERSAO } from "../src/version.mjs";
import worker from "../src/worker.mjs";
import { ASSETS, MODELO } from "./modelo-portal.mjs";

// A interface é um app React (web/, testado com Vitest). Aqui fica o contrato do Worker com ele: o HTML do build
// recebe as metatags da prévia e o bootstrap do link, e o link inválido nunca leva o mapa.
const cfgBase = { telefone: null, whatsapp: null, tomtom: false, completo: true };
const bootstrap = (html) => JSON.parse(html.match(/<script>window\.__BT__=(.*?)<\/script>/)[1]);

test("página ativa: bootstrap com versão e configuração, raiz vazia para o React e preconnect do mapa", () => {
  for (const completo of [true, false]) {
    const html = paginaHtml(MODELO, "ativo", { ...cfgBase, completo, tomtom: true });
    const b = bootstrap(html);
    assert.equal(b.estado, "ativo");
    assert.equal(b.versao, VERSAO);
    assert.equal(b.cfg.completo, completo);
    assert.equal(b.cfg.tomtom, true);
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /rel="preconnect" href="https:\/\/tiles\.openfreemap\.org"/);
    assert.doesNotMatch(html, /BT_HEAD|BT_ROOT/, "marcadores consumidos");
  }
});

test("página revogada/expirada: texto no HTML, sem preconnect do mapa e sem a biblioteca", () => {
  for (const [estado, texto] of [["revogado", /encerrado/i], ["expirado", /expirado/i]]) {
    const html = paginaHtml(MODELO, estado, cfgBase);
    assert.equal(bootstrap(html).estado, estado);
    assert.match(html, /<main class="vazio">/);
    assert.match(html, texto);
    assert.doesNotMatch(html, /openfreemap|maplibre/i, estado);
  }
});

test("bootstrap: aoVivo e VAPID só quando o Worker os oferece; texto do cfg nunca fecha o script", () => {
  const com = bootstrap(paginaHtml(MODELO, "ativo", { ...cfgBase, aoVivo: true, vapid: "BPub_chave-1" }));
  const sem = bootstrap(paginaHtml(MODELO, "ativo", cfgBase));
  assert.equal(com.cfg.aoVivo, true); assert.equal(com.cfg.vapid, "BPub_chave-1");
  assert.equal(sem.cfg.aoVivo, false); assert.equal(sem.cfg.vapid, null);
  const html = paginaHtml(MODELO, "ativo", { ...cfgBase, telefone: "</script><b>x" });
  assert.equal((html.match(/<\/script>/g) ?? []).length, 2, "só o do bootstrap e o do build");
  assert.equal(bootstrap(html).cfg.telefone, "</script><b>x");
});

test("prévia: descrição com horário e carro, partes ausentes omitidas", () => {
  assert.equal(descricaoPrevia({ horarioAgendado: "2026-11-13T15:30:00Z", modeloVeiculo: "Corolla", corVeiculo: "PRATA" }), "Embarque às 12:30 · Corolla prata");
  assert.equal(descricaoPrevia({ horarioAgendado: "2026-11-13T15:30:00Z" }), "Embarque às 12:30");
  assert.equal(descricaoPrevia({ modeloVeiculo: "Corolla" }), "Corolla");
  assert.equal(descricaoPrevia({}), null);
});

test("prévia: metatags OG, manifest e noindex na ativa; expirada e revogada só genéricas", () => {
  const cfg = { ...cfgBase, origem: "https://acompanhar.betinhos.com.br", manifest: "/r/aB3dE5gH7jK8/manifest.webmanifest", previa: "Embarque às 12:30 · Corolla prata" };
  const ativa = paginaHtml(MODELO, "ativo", cfg);
  assert.match(ativa, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(ativa, /<meta property="og:title" content="Acompanhe sua viagem · Betinhos">/);
  assert.match(ativa, /<meta property="og:description" content="Embarque às 12:30 · Corolla prata">/);
  assert.match(ativa, /<meta property="og:image" content="https:\/\/acompanhar\.betinhos\.com\.br\/og-betinhos\.png">/);
  assert.match(ativa, /<meta property="og:type" content="website">/);
  assert.match(ativa, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(ativa, /<link rel="apple-touch-icon" href="\/logo-b\.png">/);
  assert.match(ativa, /<link rel="manifest" href="\/r\/aB3dE5gH7jK8\/manifest\.webmanifest">/);
  for (const estado of ["expirado", "revogado"]) {
    const html = paginaHtml(MODELO, estado, cfg);
    assert.match(html, /<meta property="og:title" content="Betinhos Executive Service">/);
    assert.doesNotMatch(html, /Corolla|12:30|manifest/, estado);
    assert.match(html, /noindex, nofollow/);
  }
});

test("idioma: dicionário completo (pt, en, es) e textos novos de passageiros e agendado", async () => {
  const { TEXTOS, IDIOMAS } = await import("../src/idiomas.mjs");
  for (const [chave, lista] of Object.entries(TEXTOS)) {
    assert.equal(lista.length, IDIOMAS.length, chave);
    lista.forEach((s, i) => assert.ok(s, `${chave}[${i}]`));
  }
  const chaves = Object.keys(TEXTOS).filter((c) => /^(pax\.|agendado\.)/.test(c));
  assert.ok(chaves.length >= 28);
  assert.match(TEXTOS["agendado.texto"][0], /\{dia\}.*\{h\}/);
});

test("Worker: /r/<id> busca o portal.html nos Static Assets; sem o build, 503 sem cache", async () => {
  const id = "aB3dE5gH7jK8";
  const kv = { get: async (k) => (k === `track:${id}` ? JSON.stringify({ modo: "completo", expiraEm: "2099-01-01T00:00:00Z" }) : null) };
  const visitados = [];
  const assets = { fetch: async (req) => { visitados.push(new URL(req.url).pathname); return ASSETS.fetch(req); } };
  const ok = await worker.fetch(new Request(`https://w/r/${id}`), { TRACK_KV: kv, ASSETS: assets });
  assert.equal(ok.status, 200);
  assert.deepEqual(visitados, ["/portal.html"]);
  assert.equal(bootstrap(await ok.text()).estado, "ativo");
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  const semBuild = await worker.fetch(new Request(`https://w/r/${id}`), { TRACK_KV: kv });
  assert.equal(semBuild.status, 503);
  assert.equal(semBuild.headers.get("Cache-Control"), "no-store");
  const semArquivo = await worker.fetch(new Request(`https://w/r/${id}`), { TRACK_KV: kv, ASSETS: { fetch: async () => new Response("x", { status: 404 }) } });
  assert.equal(semArquivo.status, 503);
});

test("Worker: link inválido devolve 404 com texto e metatags genéricas, sem preconnect nem manifest", async () => {
  const res = await worker.fetch(new Request("https://w/r/Expirado0001"), { TRACK_KV: { get: async () => null }, ASSETS });
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.equal(bootstrap(html).estado, "expirado");
  assert.match(html, /Link expirado/);
  assert.doesNotMatch(html, /openfreemap|manifest/);
  assert.match(html, /og:title" content="Betinhos Executive Service"/);
});
