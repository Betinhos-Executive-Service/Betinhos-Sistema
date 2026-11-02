import { createContext, useContext } from "react";
import { SystemIcon } from "../icons/SystemIcon";

// Contexto do botão "?" dos cabeçalhos: só existe valor quando a tela atual tem um capítulo do tour.
export type TourHelpValue = { open: () => void } | null;

export const TourHelpContext = createContext<TourHelpValue>(null);

export function TourHelpButton({ className = "" }: { className?: string }) {
  const help = useContext(TourHelpContext);
  if (!help) return null;
  return (
    <button type="button" className={`tour-help-button ${className}`.trim()} aria-label="Ajuda desta tela" onClick={help.open}>
      <SystemIcon name="help" />
    </button>
  );
}
