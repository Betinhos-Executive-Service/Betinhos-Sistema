import { useMemo } from "react";

// Ao abrir a câmera (ou a prévia da foto), o formulário sai da tela e o contêiner que rola é
// desmontado. Este módulo guarda a rolagem antes de sair e a devolve quando o formulário volta,
// levando o bloco da foto recém-tirada para a área visível sem mexer no resto.

export type ScrollSnapshot = { top: number; anchor: string; savedAt: number };

export const SCROLL_SNAPSHOT_TTL_MS = 15 * 60_000;
const SCROLL_ANCHOR_ATTR = "data-scroll-anchor";
const ANCHOR_MARGIN_PX = 12;
const RESTORE_TIMEOUT_MS = 900;
const STABLE_FRAMES = 3;
const USER_SCROLL_EVENTS = ["touchstart", "wheel", "pointerdown", "keydown"] as const;

export function createScrollMemory(now: () => number = Date.now) {
  const entries = new Map<string, ScrollSnapshot>();
  return {
    save(key: string, top: number, anchor = "") {
      entries.set(key, { top: Math.max(0, Math.round(top)), anchor, savedAt: now() });
    },
    // Devolve uma posição que não chegou a ser aplicada (o formulário saiu da tela antes).
    put(key: string, snapshot: ScrollSnapshot) {
      entries.set(key, snapshot);
    },
    // Lê uma vez só: a rolagem guardada vale para a próxima volta ao formulário, não para sempre.
    take(key: string): ScrollSnapshot | null {
      const entry = entries.get(key);
      entries.delete(key);
      if (!entry || now() - entry.savedAt > SCROLL_SNAPSHOT_TTL_MS) return null;
      return entry;
    }
  };
}

type NearestInput = {
  scrollTop: number;
  viewportHeight: number;
  maxScrollTop: number;
  itemTop: number;
  itemHeight: number;
  margin?: number;
};

// Mesmo critério de scrollIntoView({ block: "nearest" }), só que no contêiner do formulário:
// se o bloco já aparece, a posição fica; se está fora, rola o mínimo para mostrá-lo.
export function nearestScrollTop({ scrollTop, viewportHeight, maxScrollTop, itemTop, itemHeight, margin = ANCHOR_MARGIN_PX }: NearestInput) {
  const clamp = (value: number) => Math.min(Math.max(0, maxScrollTop), Math.max(0, Math.round(value)));
  const itemBottom = itemTop + itemHeight;
  const viewBottom = scrollTop + viewportHeight;
  if (itemHeight + margin * 2 > viewportHeight) {
    const overlaps = itemBottom > scrollTop && itemTop < viewBottom;
    return clamp(overlaps ? scrollTop : itemTop - margin);
  }
  if (itemTop - margin < scrollTop) return clamp(itemTop - margin);
  if (itemBottom + margin > viewBottom) return clamp(itemBottom + margin - viewportHeight);
  return clamp(scrollTop);
}

// O layout está pronto quando a altura do conteúdo para de mudar por alguns quadros
// (fotos e listas carregadas) ou quando o tempo de espera acaba.
export function isLayoutSettled(stableFrames: number, elapsedMs: number) {
  return stableFrames >= STABLE_FRAMES || elapsedMs >= RESTORE_TIMEOUT_MS;
}

const sharedMemory = createScrollMemory();
type ScrollMemory = ReturnType<typeof createScrollMemory>;

// Só o que a restauração usa do contêiner; nos testes entra um objeto falso.
export type ScrollContainer = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight" | "getBoundingClientRect" | "addEventListener" | "removeEventListener"> & {
  querySelectorAll(selector: string): ArrayLike<Pick<Element, "getAttribute" | "getBoundingClientRect">>;
};

export type FrameScheduler = {
  now(): number;
  frame(callback: () => void): number;
  cancelFrame(id: number): void;
  timer(callback: () => void, ms: number): number;
  clearTimer(id: number): void;
};

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  frame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  timer: (callback, ms) => window.setTimeout(callback, ms),
  clearTimer: (id) => window.clearTimeout(id)
};

function scrollToAnchor(container: ScrollContainer, anchor: string) {
  if (!anchor) return;
  const target = Array.from(container.querySelectorAll(`[${SCROLL_ANCHOR_ATTR}]`))
    .find((element) => element.getAttribute(SCROLL_ANCHOR_ATTR) === anchor);
  if (!target) return;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  container.scrollTop = nearestScrollTop({
    scrollTop: container.scrollTop,
    viewportHeight: container.clientHeight,
    maxScrollTop: container.scrollHeight - container.clientHeight,
    itemTop: targetRect.top - containerRect.top + container.scrollTop,
    itemHeight: targetRect.height
  });
}

// Aplica a posição na hora e reaplica a cada quadro até a altura estabilizar; depois mostra a âncora.
// Retorna o cancelamento, que responde se a restauração ainda estava pendente.
export function restoreScroll(container: ScrollContainer, snapshot: ScrollSnapshot, scheduler: FrameScheduler = browserScheduler) {
  const started = scheduler.now();
  let frame = 0;
  let timer = 0;
  let lastHeight = -1;
  let stableFrames = 0;
  let pending = true;
  const stop = () => {
    pending = false;
    scheduler.cancelFrame(frame);
    scheduler.clearTimer(timer);
    for (const type of USER_SCROLL_EVENTS) container.removeEventListener(type, stop);
  };
  // Se o motorista começar a rolar, a restauração para e não briga com o dedo dele.
  for (const type of USER_SCROLL_EVENTS) container.addEventListener(type, stop, { passive: true });
  // Quadro de animação com reserva por timer: alguns WebViews pausam o requestAnimationFrame.
  const schedule = () => {
    let ran = false;
    const run = () => {
      if (ran) return;
      ran = true;
      scheduler.cancelFrame(frame);
      scheduler.clearTimer(timer);
      tick();
    };
    frame = scheduler.frame(run);
    timer = scheduler.timer(run, 32);
  };
  const tick = () => {
    container.scrollTop = snapshot.top;
    const height = container.scrollHeight;
    stableFrames = height === lastHeight ? stableFrames + 1 : 0;
    lastHeight = height;
    if (isLayoutSettled(stableFrames, scheduler.now() - started)) {
      scrollToAnchor(container, snapshot.anchor);
      stop();
      return;
    }
    schedule();
  };
  container.scrollTop = snapshot.top;
  schedule();
  return () => {
    const wasPending = pending;
    stop();
    return wasPending;
  };
}

// Liga um formulário (chave) ao contêiner que rola. `attach` é o ref do contêiner.
// Se o formulário sair da tela antes de a restauração terminar, a posição volta para a memória.
export function createCameraScroll(key: string, memory: ScrollMemory = sharedMemory, restore: typeof restoreScroll = restoreScroll) {
  let element: ScrollContainer | null = null;
  let active: { cancel: () => boolean; snapshot: ScrollSnapshot } | null = null;
  return {
    attach(next: ScrollContainer | null) {
      const previous = active;
      active = null;
      if (previous?.cancel()) memory.put(key, previous.snapshot);
      element = next;
      if (!next) return;
      const snapshot = memory.take(key);
      if (snapshot) active = { cancel: restore(next, snapshot), snapshot };
    },
    remember(anchor = "") {
      if (element) memory.save(key, element.scrollTop, anchor);
    }
  };
}

// Uso: `const cameraScroll = useCameraScroll("gastos")`, `ref={cameraScroll.ref}` no contêiner que rola
// (.finalize-scroll) e `cameraScroll.remember("fotos")` logo antes de abrir a câmera ou a prévia.
// O bloco da foto recebe `data-scroll-anchor="fotos"`.
export function useCameraScroll(key: string) {
  const binding = useMemo(() => createCameraScroll(key), [key]);
  return { ref: binding.attach, remember: binding.remember };
}
