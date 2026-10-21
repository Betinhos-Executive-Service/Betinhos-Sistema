import assert from "node:assert/strict";
import test from "node:test";
import { createCameraScroll, createScrollMemory, isLayoutSettled, nearestScrollTop, restoreScroll, SCROLL_SNAPSHOT_TTL_MS } from "../src/app/cameraScroll.ts";

// ---------- Restauração e ligação ao formulário (sem DOM: contêiner e quadros falsos) ----------

function fakeScheduler() {
  let clock = 0;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  return {
    scheduler: {
      now: () => clock,
      frame: (callback: () => void) => { const id = nextId++; frames.set(id, callback); return id; },
      cancelFrame: (id: number) => { frames.delete(id); },
      timer: (callback: () => void) => { const id = nextId++; timers.set(id, callback); return id; },
      clearTimer: (id: number) => { timers.delete(id); }
    },
    // Um quadro: avança 16 ms e dispara os callbacks de quadro pendentes.
    step() {
      clock += 16;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    pendingCount: () => frames.size + timers.size
  };
}

function fakeContainer(options: { scrollHeight: number; clientHeight: number; anchors?: Record<string, { top: number; height: number }> }) {
  const listeners = new Map<string, () => void>();
  const container = {
    scrollTop: 0,
    scrollHeight: options.scrollHeight,
    clientHeight: options.clientHeight,
    getBoundingClientRect: () => ({ top: 0 }) as DOMRect,
    addEventListener: (type: string, listener: () => void) => { listeners.set(type, listener); },
    removeEventListener: (type: string) => { listeners.delete(type); },
    // A posição dos blocos é relativa ao conteúdo; o retângulo na tela desconta o scrollTop atual.
    querySelectorAll: () => Object.entries(options.anchors ?? {}).map(([name, box]) => ({
      getAttribute: () => name,
      getBoundingClientRect: () => ({ top: box.top - container.scrollTop, height: box.height }) as DOMRect
    })),
    touch: () => listeners.get("touchstart")?.(),
    listenerCount: () => listeners.size
  };
  return container;
}

const snapshotAt = (top: number, anchor = "") => ({ top, anchor, savedAt: 0 });

test("restauração aplica a posição na hora e termina quando a altura estabiliza", () => {
  const frames = fakeScheduler();
  const container = fakeContainer({ scrollHeight: 2000, clientHeight: 600 });
  const cancel = restoreScroll(container as never, snapshotAt(520), frames.scheduler);
  assert.equal(container.scrollTop, 520);
  container.scrollTop = 0; // o navegador zera no redesenho; o quadro seguinte reaplica
  frames.step();
  assert.equal(container.scrollTop, 520);
  for (let index = 0; index < 4; index += 1) frames.step();
  assert.equal(frames.pendingCount(), 0, "terminou e não agenda mais quadros");
  assert.equal(container.listenerCount(), 0, "solta os ouvintes de toque");
  assert.equal(cancel(), false, "cancelar depois de terminar não devolve a posição");
});

test("restauração leva o bloco da foto para a tela com o critério nearest", () => {
  const frames = fakeScheduler();
  const container = fakeContainer({ scrollHeight: 2600, clientHeight: 600, anchors: { lateral: { top: 1500, height: 200 } } });
  restoreScroll(container as never, snapshotAt(800, "lateral"), frames.scheduler);
  for (let index = 0; index < 6; index += 1) frames.step();
  assert.equal(container.scrollTop, 1112);
});

test("toque do motorista interrompe a restauração", () => {
  const frames = fakeScheduler();
  const container = fakeContainer({ scrollHeight: 2000, clientHeight: 600 });
  const cancel = restoreScroll(container as never, snapshotAt(400), frames.scheduler);
  container.touch();
  container.scrollTop = 90;
  frames.step();
  assert.equal(container.scrollTop, 90, "não volta a forçar a posição");
  assert.equal(cancel(), false);
});

test("cancelar no meio da restauração informa que ainda estava pendente", () => {
  const frames = fakeScheduler();
  const container = fakeContainer({ scrollHeight: 2000, clientHeight: 600 });
  const cancel = restoreScroll(container as never, snapshotAt(400), frames.scheduler);
  assert.equal(cancel(), true);
  assert.equal(frames.pendingCount(), 0);
});

test("formulário que sai antes de terminar devolve a posição para a memória", () => {
  const memory = createScrollMemory(() => 0);
  let pending = true;
  const restore = () => () => pending;
  const binding = createCameraScroll("checklist:1", memory, restore as never);
  const form = fakeContainer({ scrollHeight: 2000, clientHeight: 600 });
  binding.attach(form as never);
  form.scrollTop = 520;
  binding.remember("lateral");
  binding.attach(null);
  binding.attach(form as never); // aparece por um instante (câmera -> formulário -> prévia)
  binding.attach(null);
  assert.deepEqual(memory.take("checklist:1"), { top: 520, anchor: "lateral", savedAt: 0 }, "voltou para a memória");

  memory.save("checklist:1", 300);
  pending = false;
  binding.attach(form as never);
  binding.attach(null);
  assert.equal(memory.take("checklist:1"), null, "restauração terminada não volta");
});

test("ligação só restaura com posição guardada e grava a rolagem atual", () => {
  const memory = createScrollMemory(() => 0);
  const calls: number[] = [];
  const restore = (_container: unknown, snapshot: { top: number }) => { calls.push(snapshot.top); return () => false; };
  const binding = createCameraScroll("gastos", memory, restore as never);
  const form = fakeContainer({ scrollHeight: 1200, clientHeight: 600 });
  binding.attach(form as never);
  assert.deepEqual(calls, [], "sem posição guardada não restaura");
  form.scrollTop = 332;
  binding.remember("comprovantes");
  binding.attach(null);
  binding.attach(form as never);
  assert.deepEqual(calls, [332]);
  binding.remember();
  binding.attach(null);
  binding.attach(null);
  assert.equal(memory.take("gastos")?.top, 332, "desmontar duas vezes não perde a posição");
});

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
