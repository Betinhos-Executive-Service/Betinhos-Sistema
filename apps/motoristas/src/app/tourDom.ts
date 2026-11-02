import type { TourStep } from "./tour";

function isRenderable(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function normalizedText(element: HTMLElement) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Elemento real do passo na tela atual (ou null). Ignora elementos sem caixa de layout. */
export function findTourTarget(step: Pick<TourStep, "target" | "match" | "within">, root: ParentNode = document): HTMLElement | null {
  if (!step.target) return null;
  const candidates = [...root.querySelectorAll<HTMLElement>(step.target)].filter(isRenderable);
  const matcher = step.match ? new RegExp(step.match, "i") : null;
  const found = matcher ? candidates.find((element) => matcher.test(normalizedText(element))) : candidates[0];
  if (!found) return null;
  if (!step.within) return found;
  const wider = step.within === "parent" ? found.parentElement : found.closest<HTMLElement>(step.within);
  return wider && isRenderable(wider) ? wider : found;
}

export function hasTourProbe(selector: string, root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLElement>(selector)].some(isRenderable);
}
