import assert from "node:assert/strict";
import test from "node:test";
import {
  TOUR_STEPS,
  clearTourSeen,
  hasSeenTour,
  markTourSeen,
  placeTourCard,
  resolveTourSteps,
  spotlightBox,
  tourProgressLabel,
  tourStorageKey
} from "../src/app/tour.ts";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data
  };
}

test("tour tem entre 6 e 8 passos, com ids únicos e textos curtos em pt-BR", () => {
  assert.ok(TOUR_STEPS.length >= 6 && TOUR_STEPS.length <= 8, `passos: ${TOUR_STEPS.length}`);
  assert.equal(new Set(TOUR_STEPS.map((step) => step.id)).size, TOUR_STEPS.length);
  for (const step of TOUR_STEPS) {
    assert.ok(step.title.length <= 32, step.title);
    assert.ok(step.text.length <= 170, step.id);
    assert.ok(step.anchor.length > 0, step.id);
  }
});

test("tour cobre as áreas pedidas: serviços, etapas/voucher, troca de carro, checklist, gastos e comunicados", () => {
  const texto = TOUR_STEPS.map((step) => `${step.title} ${step.text}`).join(" ").toLowerCase();
  for (const termo of ["serviços", "voucher", "troca de carro", "vistoria", "gasto", "comunicado"]) {
    assert.ok(texto.includes(termo), termo);
  }
});

test("primeiro acesso: não visto; após marcar, visto; chave é por motorista", () => {
  const storage = memoryStorage();
  assert.equal(hasSeenTour(storage, "m1"), false);
  markTourSeen(storage, "m1");
  assert.equal(hasSeenTour(storage, "m1"), true);
  assert.equal(hasSeenTour(storage, "m2"), false);
  assert.equal(storage.data.get(tourStorageKey("m1")), "visto");
  clearTourSeen(storage, "m1");
  assert.equal(hasSeenTour(storage, "m1"), false);
});

test("storage indisponível não quebra: marcar é silencioso e ler trata como visto", () => {
  const broken = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); }
  };
  assert.doesNotThrow(() => markTourSeen(broken, "m1"));
  assert.doesNotThrow(() => clearTourSeen(broken, "m1"));
  assert.equal(hasSeenTour(broken, "m1"), true);
});

test("passo sem elemento na tela é pulado sem erro; ordem é preservada", () => {
  const presentes = new Set(["servicos", "comunicados"]);
  const steps = resolveTourSteps(TOUR_STEPS, (anchor) => presentes.has(anchor));
  assert.deepEqual(steps.map((step) => step.id), ["servicos", "etapas", "comunicados"]);
  assert.deepEqual(resolveTourSteps(TOUR_STEPS, () => { throw new Error("DOM indisponível"); }), []);
});

test("spotlight ganha folga e não sai da viewport", () => {
  const viewport = { width: 360, height: 640 };
  assert.deepEqual(spotlightBox({ top: 100, left: 16, width: 328, height: 80 }, viewport), { top: 94, left: 10, width: 340, height: 92 });
  assert.deepEqual(spotlightBox({ top: -10, left: 0, width: 360, height: 40 }, viewport), { top: 0, left: 0, width: 360, height: 36 });
});

test("cartão fica abaixo quando cabe, acima quando não cabe e no rodapé sem destaque", () => {
  const viewportHeight = 640;
  assert.deepEqual(placeTourCard({ top: 100, left: 0, width: 360, height: 80 }, 220, viewportHeight), { side: "below", top: 192 });
  assert.deepEqual(placeTourCard({ top: 500, left: 0, width: 360, height: 80 }, 220, viewportHeight), { side: "above", top: 268 });
  assert.deepEqual(placeTourCard(null, 220, viewportHeight), { side: "bottom", top: 408 });
  // Destaque alto demais para caber acima ou abaixo: cartão no rodapé, ainda dentro da tela.
  const placement = placeTourCard({ top: 60, left: 0, width: 360, height: 500 }, 220, viewportHeight);
  assert.equal(placement.side, "bottom");
  assert.ok(placement.top + 220 <= viewportHeight);
});

test("rótulo de progresso em pt-BR", () => {
  assert.equal(tourProgressLabel(0, 7), "Passo 1 de 7");
  assert.equal(tourProgressLabel(6, 7), "Passo 7 de 7");
});
