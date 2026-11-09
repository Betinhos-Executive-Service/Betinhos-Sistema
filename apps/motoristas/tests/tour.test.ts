import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearAllChaptersSeen,
  fitSpotlight,
  missingRequiredSteps,
  hasSeenChapter,
  markChapterSeen,
  pickChapter,
  placeTourCard,
  TOUR_ALL_CHAPTERS,
  resolveTourSteps,
  sameBox,
  spotlightBox,
  tourProgressLabel,
  tourStorageKey,
  type TourChapter
} from "../src/app/tour.ts";
import { closesWhenReadingEnds } from "../src/app/tour.ts";
import { TOUR_CHAPTERS, tourChaptersForScreen, tourScreensWithChapters } from "../src/app/tourChapters.ts";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data
  };
}

test("capítulos têm ids únicos e passos com ids únicos, título e texto curtos em pt-BR", () => {
  assert.equal(new Set(TOUR_CHAPTERS.map((chapter) => chapter.id)).size, TOUR_CHAPTERS.length);
  for (const chapter of TOUR_CHAPTERS) {
    assert.ok(chapter.title.length > 0 && chapter.title.length <= 40, chapter.id);
    assert.ok(chapter.steps.length >= 3, `${chapter.id}: poucos passos`);
    assert.equal(new Set(chapter.steps.map((step) => step.id)).size, chapter.steps.length, `${chapter.id}: ids repetidos`);
    for (const step of chapter.steps) {
      const where = `${chapter.id}/${step.id}`;
      assert.ok(step.title.length > 0 && step.title.length <= 48, `${where}: título`);
      assert.ok(step.text.length >= 1 && step.text.length <= 4, `${where}: parágrafos`);
      for (const paragraph of step.text) assert.ok(paragraph.length > 0 && paragraph.length <= 300, `${where}: parágrafo longo (${paragraph.length})`);
      if (step.match) assert.doesNotThrow(() => new RegExp(step.match as string, "i"), `${where}: regex`);
      if (step.within) assert.ok(step.target, `${where}: within sem target`);
    }
  }
});

test("o tour é completo: dezenas de capítulos e mais de cem passos", () => {
  const steps = TOUR_CHAPTERS.reduce((total, chapter) => total + chapter.steps.length, 0);
  assert.ok(TOUR_CHAPTERS.length >= 25, `capítulos: ${TOUR_CHAPTERS.length}`);
  assert.ok(steps >= 100, `passos: ${steps}`);
});

test("toda tela do app tem capítulo, e todo capítulo pertence a alguma tela", () => {
  const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
  const block = types.slice(types.indexOf("export type Screen"), types.indexOf(";", types.indexOf("export type Screen")));
  const screens = [...block.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]);
  assert.ok(screens.length > 20, "não achou as telas em types.ts");
  const covered = new Set(tourScreensWithChapters());
  assert.deepEqual(screens.filter((screen) => !covered.has(screen)), [], "telas sem capítulo");
  assert.deepEqual([...covered].filter((screen) => !screens.includes(screen)), [], "capítulos para telas que não existem");
  const used = new Set(screens.flatMap((screen) => tourChaptersForScreen(screen).map((chapter) => chapter.id)));
  assert.deepEqual(TOUR_CHAPTERS.filter((chapter) => !used.has(chapter.id)).map((chapter) => chapter.id), [], "capítulos órfãos");
});

test("capítulos candidatos: o específico (com probe) vem antes do geral", () => {
  for (const screen of tourScreensWithChapters()) {
    const candidates = tourChaptersForScreen(screen);
    candidates.slice(0, -1).forEach((chapter) => assert.ok(chapter.probe, `${screen}: ${chapter.id} deveria ter probe`));
  }
});

test("pickChapter escolhe o primeiro cujo probe existe; sem probe vale sempre", () => {
  const geral: TourChapter = { id: "lista", title: "Lista", steps: [] };
  const detalhe: TourChapter = { id: "detalhe", title: "Detalhe", probe: ".detalhe", steps: [] };
  assert.equal(pickChapter([detalhe, geral], (probe) => probe === ".detalhe")?.id, "detalhe");
  assert.equal(pickChapter([detalhe, geral], () => false)?.id, "lista");
  assert.equal(pickChapter([detalhe], () => false), null);
  assert.equal(pickChapter([detalhe, geral], () => { throw new Error("seletor inválido"); })?.id, "lista");
});

test("preferência é por motorista e por capítulo", () => {
  const storage = memoryStorage();
  assert.equal(hasSeenChapter(storage, "m1", "inicio"), false);
  markChapterSeen(storage, "m1", "inicio");
  assert.equal(hasSeenChapter(storage, "m1", "inicio"), true);
  assert.equal(hasSeenChapter(storage, "m1", "servicos"), false);
  assert.equal(hasSeenChapter(storage, "m2", "inicio"), false);
  assert.equal(storage.data.get(tourStorageKey("m1", "inicio")), "visto");
});

test("a marcação coringa dispensa todos os capítulos daquele motorista e some em clearAllChaptersSeen", () => {
  const storage = memoryStorage();
  markChapterSeen(storage, "m1", TOUR_ALL_CHAPTERS);
  assert.equal(hasSeenChapter(storage, "m1", "servicos"), true);
  assert.equal(hasSeenChapter(storage, "m2", "servicos"), false);
  clearAllChaptersSeen(storage, "m1");
  assert.equal(hasSeenChapter(storage, "m1", "servicos"), false);
});

test("clearAllChaptersSeen apaga só os capítulos do motorista", () => {
  const storage = memoryStorage();
  markChapterSeen(storage, "m1", "inicio");
  markChapterSeen(storage, "m1", "servicos");
  markChapterSeen(storage, "m2", "inicio");
  storage.setItem("app-motoristas-local-v1", "{}");
  clearAllChaptersSeen(storage, "m1");
  assert.equal(hasSeenChapter(storage, "m1", "inicio"), false);
  assert.equal(hasSeenChapter(storage, "m1", "servicos"), false);
  assert.equal(hasSeenChapter(storage, "m2", "inicio"), true);
  assert.equal(storage.getItem("app-motoristas-local-v1"), "{}");
});

test("storage indisponível não quebra: marcar e limpar são silenciosos e ler trata como visto", () => {
  const broken = {
    length: 1,
    key: () => { throw new Error("blocked"); },
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); }
  };
  assert.doesNotThrow(() => markChapterSeen(broken, "m1", "inicio"));
  assert.doesNotThrow(() => clearAllChaptersSeen(broken, "m1"));
  assert.equal(hasSeenChapter(broken, "m1", "inicio"), true);
});

test("passo sem elemento é pulado sem erro; passo sem seletor sempre fica; ordem preservada", () => {
  const steps = TOUR_CHAPTERS.find((chapter) => chapter.id === "inicio")!.steps;
  const presentes = new Set(["servicos", "comunicados"]);
  const resolved = resolveTourSteps(steps, (step) => presentes.has(String(step.target).replace(/\[data-tour="(.+)"\]/, "$1")));
  const semSeletor = steps.filter((step) => !step.target).map((step) => step.id);
  assert.deepEqual(resolved.map((step) => step.id), steps.filter((step) => !step.target || ["servicos", "comunicados"].includes(step.id)).map((step) => step.id));
  semSeletor.forEach((id) => assert.ok(resolved.some((step) => step.id === id), id));
  assert.deepEqual(resolveTourSteps(steps, () => { throw new Error("DOM indisponível"); }).map((step) => step.id), semSeletor);
});

test("spotlight ganha folga e não sai da viewport", () => {
  const viewport = { width: 360, height: 640 };
  assert.deepEqual(spotlightBox({ top: 100, left: 16, width: 328, height: 80 }, viewport), { top: 94, left: 10, width: 340, height: 92 });
  assert.deepEqual(spotlightBox({ top: -10, left: 0, width: 360, height: 40 }, viewport), { top: 0, left: 0, width: 360, height: 36 });
});

test("cartão fica abaixo quando cabe, acima quando não cabe, no rodapé quando nada cabe e centralizado sem destaque", () => {
  const viewportHeight = 640;
  assert.deepEqual(placeTourCard({ top: 100, left: 0, width: 360, height: 80 }, 220, viewportHeight), { side: "below", top: 192 });
  assert.deepEqual(placeTourCard({ top: 500, left: 0, width: 360, height: 80 }, 220, viewportHeight), { side: "above", top: 268 });
  assert.deepEqual(placeTourCard(null, 220, viewportHeight), { side: "center", top: 210 });
  const placement = placeTourCard({ top: 60, left: 0, width: 360, height: 500 }, 220, viewportHeight);
  assert.equal(placement.side, "bottom");
  assert.ok(placement.top + 220 <= viewportHeight);
});

test("destaque alto é recortado acima do cartão do rodapé; nos demais casos fica como está", () => {
  const alto = { top: 60, left: 0, width: 360, height: 500 };
  const rodape = { side: "bottom" as const, top: 400 };
  assert.deepEqual(fitSpotlight(alto, rodape), { top: 60, left: 0, width: 360, height: 332 });
  assert.deepEqual(fitSpotlight({ top: 60, left: 0, width: 360, height: 100 }, rodape), { top: 60, left: 0, width: 360, height: 100 });
  assert.equal(fitSpotlight(alto, { side: "below", top: 600 }), alto);
  assert.equal(fitSpotlight(null, rodape), null);
  assert.equal(fitSpotlight({ top: 390, left: 0, width: 360, height: 100 }, rodape)?.height, 48);
});

test("missingRequiredSteps lista só os passos obrigatórios cujo elemento ainda não apareceu", () => {
  const steps = TOUR_CHAPTERS.find((chapter) => chapter.id === "servicos")!.steps;
  const obrigatorios = steps.filter((step) => !step.optional && step.target).map((step) => step.id);
  assert.ok(obrigatorios.length >= 3);
  assert.deepEqual(missingRequiredSteps(steps, () => true), []);
  assert.deepEqual(missingRequiredSteps(steps, () => false), obrigatorios);
  assert.deepEqual(missingRequiredSteps(steps, (step) => step.id !== "titulo"), ["titulo"]);
});

test("capítulos de telas mostradas ao passageiro não abrem sozinhos", () => {
  for (const id of ["assinatura", "cobranca-qr", "camera", "foto-previa"]) {
    assert.equal(TOUR_CHAPTERS.find((chapter) => chapter.id === id)?.auto, false, id);
  }
});

test("sameBox compara por valor", () => {
  assert.equal(sameBox({ top: 1, left: 2, width: 3, height: 4 }, { top: 1, left: 2, width: 3, height: 4 }), true);
  assert.equal(sameBox({ top: 1, left: 2, width: 3, height: 4 }, { top: 1, left: 2, width: 3, height: 5 }), false);
  assert.equal(sameBox(null, null), true);
  assert.equal(sameBox(null, { top: 0, left: 0, width: 0, height: 0 }), false);
});

test("rótulo de progresso em pt-BR", () => {
  assert.equal(tourProgressLabel(0, 7), "Passo 1 de 7");
  assert.equal(tourProgressLabel(6, 7), "Passo 7 de 7");
});

test("o tour do comprovante fecha ao sair da leitura e só ele", () => {
  assert.equal(closesWhenReadingEnds("comprovante", false), true);
  assert.equal(closesWhenReadingEnds("comprovante", true), false);
  assert.equal(closesWhenReadingEnds("gastos", false), false);
  assert.equal(closesWhenReadingEnds(undefined, false), false);
});
