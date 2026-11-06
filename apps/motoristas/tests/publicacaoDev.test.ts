import assert from "node:assert/strict";
import test from "node:test";
import { mudancasDev } from "../scripts/mudancas-dev.mjs";
import versaoBuild from "../scripts/versao-build.cjs";

const { maiorVersao, proximaVersao } = versaoBuild;

test("mudança só no service worker publica só a peça sw", () => {
  assert.deepEqual(mudancasDev(["src/pwa/sw.js"]), { app: false, sw: true });
});

test("mudança só no código do app publica só a peça app", () => {
  assert.deepEqual(mudancasDev(["src/screens/AgendaScreen.tsx"]), { app: true, sw: false });
});

test("mudança nas duas peças publica as duas", () => {
  assert.deepEqual(mudancasDev(["src/pwa/sw.js", "src/main.tsx"]), { app: true, sw: true });
});

test("script de publicação republica as duas peças", () => {
  assert.deepEqual(mudancasDev(["scripts/push-front-dev.ps1"]), { app: true, sw: true });
});

test("plugin, schema, documentação e testes não publicam nada", () => {
  const nada = { app: false, sw: false };
  assert.deepEqual(mudancasDev(["plugins/DriverRecordSharing/FuelMath.cs"]), nada);
  assert.deepEqual(mudancasDev(["scripts/provision-checklists.ps1"]), nada);
  assert.deepEqual(mudancasDev(["README.md", "docs/deploy-prod.md", "tests/media.test.ts"]), nada);
  assert.deepEqual(mudancasDev([""]), nada);
});

test("sem base conhecida publica as duas peças", () => {
  assert.deepEqual(mudancasDev(null), { app: true, sw: true });
});

test("versão do build parte da maior entre repositório e publicada e nunca retrocede", () => {
  assert.equal(proximaVersao("2.1.839", "2.1.900"), "2.1.901");
  assert.equal(proximaVersao("2.1.900", "2.1.839"), "2.1.901");
  assert.equal(proximaVersao("2.1.839", ""), "2.1.840");
  assert.equal(proximaVersao("2.1.839", undefined), "2.1.840");
  assert.equal(proximaVersao("2.1.9", "2.1.10"), "2.1.11");
  assert.equal(maiorVersao("2.10.0", "2.9.9"), "2.10.0");
});

test("versão inválida é recusada", () => {
  assert.throws(() => proximaVersao("2.1", "2.1.1"), /Versao invalida/);
});
