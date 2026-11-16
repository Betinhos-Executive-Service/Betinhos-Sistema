import { useEffect } from "react";
import { provaCaptura } from "./provaCaptura";

/** Reenvia as provas de captura pendentes ao abrir o app e quando a rede volta. */
export function useReenvioProvas() {
  useEffect(() => {
    const reenviar = () => void provaCaptura().reenviarPendentes();
    reenviar();
    window.addEventListener("online", reenviar);
    return () => window.removeEventListener("online", reenviar);
  }, []);
}
