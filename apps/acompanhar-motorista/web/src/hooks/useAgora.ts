import { useSyncExternalStore } from "react";

// Um único relógio de 1 s para a página inteira (idade da posição, conexão). Parado com a aba oculta.
let agora = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const ouvintes = new Set<() => void>();
function assinar(f: () => void) {
  ouvintes.add(f);
  if (ouvintes.size === 1) {
    agora = Date.now();
    timer = setInterval(() => { if (document.hidden) return; agora = Date.now(); ouvintes.forEach((o) => o()); }, 1000);
  }
  return () => { ouvintes.delete(f); if (!ouvintes.size) clearInterval(timer); };
}
export const useAgora = () => useSyncExternalStore(assinar, () => agora);
