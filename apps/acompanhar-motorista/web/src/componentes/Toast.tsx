import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// Aviso curto no rodapé (3 s). O texto só é limpo depois do fade de saída; role=status avisa o leitor de tela.
const Contexto = createContext<(texto: string) => void>(() => {});
export const useToast = () => useContext(Contexto);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [texto, setTexto] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mostrar = useCallback((t: string) => {
    clearTimeout(timer.current);
    setTexto(t); setOn(true);
    timer.current = setTimeout(() => { setOn(false); timer.current = setTimeout(() => setTexto(""), 220); }, 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div className={"toast" + (on ? " on" : "")} id="toast" role="status" aria-live="polite">{texto}</div>
    </Contexto.Provider>
  );
}
