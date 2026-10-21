import assert from "node:assert/strict";
import test from "node:test";
import { createScrollMemory, isLayoutSettled, nearestScrollTop, SCROLL_SNAPSHOT_TTL_MS } from "../src/app/cameraScroll.ts";

test("memória de rolagem devolve a posição uma única vez", () => {
  const memory = createScrollMemory(() => 1000);
  memory.save("gastos", 412.6, "fotos");
  assert.deepEqual(memory.take("gastos"), { top: 413, anchor: "fotos", savedAt: 1000 });
  assert.equal(memory.take("gastos"), null);
});

test("memória de rolagem separa formulários e ignora posição negativa", () => {
  const memory = createScrollMemory(() => 0);
  memory.save("colisoes", -20);
  memory.save("receber", 90, "comprovantes");
  assert.equal(memory.take("colisoes")?.top, 0);
  assert.equal(memory.take("receber")?.anchor, "comprovantes");
  assert.equal(memory.take("checklist"), null);
});

test("posição não aplicada volta para a memória com a mesma idade", () => {
  let now = 0;
  const memory = createScrollMemory(() => now);
  memory.save("checklist:1", 520, "chave");
  const snapshot = memory.take("checklist:1");
  assert.ok(snapshot);
  memory.put("checklist:1", snapshot);
  now = 5_000;
  assert.deepEqual(memory.take("checklist:1"), { top: 520, anchor: "chave", savedAt: 0 });
});

test("memória de rolagem descarta posição velha", () => {
  let now = 0;
  const memory = createScrollMemory(() => now);
  memory.save("finalizar", 300);
  now = SCROLL_SNAPSHOT_TTL_MS + 1;
  assert.equal(memory.take("finalizar"), null);
});

const base = { viewportHeight: 600, maxScrollTop: 2000, margin: 12 };

test("bloco já visível mantém exatamente a posição restaurada", () => {
  assert.equal(nearestScrollTop({ ...base, scrollTop: 800, itemTop: 900, itemHeight: 200 }), 800);
});

test("bloco abaixo da área visível rola o mínimo para mostrá-lo", () => {
  // 1500 + 200 + 12 - 600 = 1112
  assert.equal(nearestScrollTop({ ...base, scrollTop: 800, itemTop: 1500, itemHeight: 200 }), 1112);
});

test("bloco acima da área visível alinha pelo topo com margem", () => {
  assert.equal(nearestScrollTop({ ...base, scrollTop: 800, itemTop: 300, itemHeight: 100 }), 288);
});

test("bloco maior que a tela só rola quando está fora da área visível", () => {
  assert.equal(nearestScrollTop({ ...base, scrollTop: 800, itemTop: 700, itemHeight: 900 }), 800);
  assert.equal(nearestScrollTop({ ...base, scrollTop: 0, itemTop: 1200, itemHeight: 900 }), 1188);
});

test("posição calculada respeita os limites do contêiner", () => {
  assert.equal(nearestScrollTop({ ...base, maxScrollTop: 500, scrollTop: 500, itemTop: 1500, itemHeight: 100 }), 500);
  assert.equal(nearestScrollTop({ ...base, scrollTop: 50, itemTop: 5, itemHeight: 40 }), 0);
});

test("layout estabiliza por quadros sem mudança ou por tempo", () => {
  assert.equal(isLayoutSettled(0, 100), false);
  assert.equal(isLayoutSettled(3, 100), true);
  assert.equal(isLayoutSettled(1, 900), true);
});
