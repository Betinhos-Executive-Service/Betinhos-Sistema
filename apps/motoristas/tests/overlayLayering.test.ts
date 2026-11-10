import test from "node:test";
import assert from "node:assert/strict";
import { getVisibleLoadingOverlay } from "../src/app/overlayLayering.ts";

const loading = { phase: "loading" as const, title: "Carregando dados", message: "Sincronizando agenda no Dataverse." };

test("overlay de carga aparece quando não há erro crítico", () => {
  assert.deepEqual(getVisibleLoadingOverlay(loading, ""), loading);
});

test("erro crítico esconde o overlay de carga para o aviso ficar legível", () => {
  assert.equal(getVisibleLoadingOverlay(loading, "Processo não foi concluído"), null);
});

test("sem carga e sem erro não mostra overlay", () => {
  assert.equal(getVisibleLoadingOverlay(null, ""), null);
});
