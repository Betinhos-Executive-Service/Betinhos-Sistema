import { useCallback, useRef } from "react";

// Ao abrir a câmera (ou a prévia da foto), o formulário sai da tela e o contêiner que rola é
// desmontado. Este módulo guarda a rolagem antes de sair e a devolve quando o formulário volta,
// levando o bloco da foto recém-tirada para a área visível sem mexer no resto.

type ScrollSnapshot = { top: number; anchor: string; savedAt: number };

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

const memory = createScrollMemory();

function scrollToAnchor(container: HTMLElement, anchor: string) {
  if (!anchor) return;
  const target = [...container.querySelectorAll<HTMLElement>(`[${SCROLL_ANCHOR_ATTR}]`)]
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

// Retorna o cancelamento; ele responde se a restauração ainda estava pendente.
function restoreScroll(container: HTMLElement, snapshot: ScrollSnapshot) {
  const started = performance.now();
  let frame = 0;
  let timer = 0;
  let lastHeight = -1;
  let stableFrames = 0;
  let pending = true;
  const stop = () => {
    pending = false;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
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
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      tick();
    };
    frame = window.requestAnimationFrame(run);
    timer = window.setTimeout(run, 32);
  };
  const tick = () => {
    container.scrollTop = snapshot.top;
    const height = container.scrollHeight;
    stableFrames = height === lastHeight ? stableFrames + 1 : 0;
    lastHeight = height;
    if (isLayoutSettled(stableFrames, performance.now() - started)) {
      scrollToAnchor(container, snapshot.anchor);
      stop();
      return;
    }
    schedule();
  };
  // A primeira aplicação é imediata: o conteúdo já montado costuma ter a altura final.
  container.scrollTop = snapshot.top;
  schedule();
  return () => {
    const wasPending = pending;
    stop();
    return wasPending;
  };
}

// Uso: `const cameraScroll = useCameraScroll("gastos")`, `ref={cameraScroll.ref}` no contêiner que rola
// (.finalize-scroll) e `cameraScroll.remember("fotos")` logo antes de abrir a câmera ou a prévia.
// O bloco da foto recebe `data-scroll-anchor="fotos"`.
export function useCameraScroll(key: string) {
  const elementRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef<{ cancel: () => boolean; snapshot: ScrollSnapshot } | null>(null);

  const ref = useCallback((element: HTMLElement | null) => {
    // O formulário pode aparecer por um instante entre a câmera e a prévia; se sair antes de
    // terminar, a posição volta para a memória e vale na próxima montagem.
    const previous = restoreRef.current;
    restoreRef.current = null;
    if (previous?.cancel()) memory.put(key, previous.snapshot);
    elementRef.current = element;
    if (!element) return;
    const snapshot = memory.take(key);
    if (snapshot) restoreRef.current = { cancel: restoreScroll(element, snapshot), snapshot };
  }, [key]);

  const remember = useCallback((anchor = "") => {
    const element = elementRef.current;
    if (element) memory.save(key, element.scrollTop, anchor);
  }, [key]);

  return { ref, remember };
}
