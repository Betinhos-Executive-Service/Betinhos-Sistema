import { createContext, useContext } from "react";
import { SystemIcon } from "../icons/SystemIcon";

// Contexto do botão "?" dos cabeçalhos: o valor é a função que abre o capítulo, e só existe quando a tela atual tem um.
export const TourHelpContext = createContext<(() => void) | null>(null);

export function useTourHelp() {
  return useContext(TourHelpContext);
}

export function TourHelpButton({ className = "" }: { className?: string }) {
  const openHelp = useTourHelp();
  if (!openHelp) return null;
  return (
    <button type="button" className={`tour-help-button ${className}`.trim()} aria-label="Ajuda desta tela" onClick={openHelp}>
      <SystemIcon name="help" />
    </button>
  );
}
