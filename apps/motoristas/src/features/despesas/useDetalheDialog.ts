import { useEffect, useRef } from "react";

/** Painel modal: trava a rolagem, fecha no Esc, foca o X ao abrir e devolve o foco ao fechar. */
export function useDetalheDialog(onClose: () => void) {
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    fecharRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", esc);
      anterior?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return fecharRef;
}
