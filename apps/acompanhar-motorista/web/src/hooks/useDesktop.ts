import { useSyncExternalStore } from "react";

const CONSULTA = "(min-width: 1024px)";
const assinar = (avisar: () => void) => {
  const m = matchMedia(CONSULTA);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
};

// Desktop (≥1024 px): faixa fina com reserva, idioma e compartilhar; cards em duas colunas.
export const useDesktop = () => useSyncExternalStore(assinar, () => matchMedia(CONSULTA).matches, () => false);
