import { test } from "node:test";
import assert from "node:assert/strict";
import { textoVersao } from "../scripts/bump-version.mjs";
import { versaoDoHtml, versaoPublicada } from "../scripts/versao-publicada.mjs";

const html = (versao) => `<head><script>window.__BT__=${JSON.stringify({ estado: "expirado", versao })}</script></head>`;

test("texto da versão em America/Sao_Paulo", () => {
  assert.equal(textoVersao("0.0.48", new Date("2026-11-24T18:21:00Z")), "v0.0.48 · 24/11/2026 15:21");
});

test("versão publicada lida do bootstrap da página", async () => {
  assert.equal(versaoDoHtml(html("v0.0.47 · 24/11/2026 15:21")), "0.0.47");
  assert.equal(versaoDoHtml("<html>sem bootstrap</html>"), null);
  assert.equal(versaoDoHtml(html("")), null);
  assert.equal(await versaoPublicada("https://w/", { fetch: async (u) => new Response(html("v0.1.9 · x"), { status: u.endsWith("/r/CheckDeploy0") ? 404 : 200 }) }), "0.1.9");
  assert.equal(await versaoPublicada("https://w", { fetch: async () => { throw new Error("rede"); } }), null);
});
