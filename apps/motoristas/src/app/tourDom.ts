import type { TourStep } from "./tour";

function isRenderable(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function normalizedText(element: HTMLElement) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

const matchers = new Map<string, RegExp>();
function matcherFor(source: string) {
  let matcher = matchers.get(source);
  if (!matcher) {
    matcher = new RegExp(source, "i");
    matchers.set(source, matcher);
  }
  return matcher;
}

/** Elemento real do passo na tela atual (ou null). Ignora elementos sem caixa de layout. */
export function findTourTarget(step: Pick<TourStep, "target" | "match" | "within">, root: ParentNode = document): HTMLElement | null {
  if (!step.target) return null;
  const matcher = step.match ? matcherFor(step.match) : null;
  let found: HTMLElement | null = null;
  // Texto primeiro (barato); a caixa de layout só é medida nos que casam, e para no primeiro renderizável.
  for (const candidate of root.querySelectorAll<HTMLElement>(step.target)) {
    if (matcher && !matcher.test(normalizedText(candidate))) continue;
    if (isRenderable(candidate)) { found = candidate; break; }
  }
  if (!found || !step.within) return found;
  const wider = step.within === "parent" ? found.parentElement : found.closest<HTMLElement>(step.within);
  return wider && isRenderable(wider) ? wider : found;
}

export function hasTourProbe(selector: string, root: ParentNode = document) {
  for (const candidate of root.querySelectorAll<HTMLElement>(selector)) {
    if (isRenderable(candidate)) return true;
  }
  return false;
}
