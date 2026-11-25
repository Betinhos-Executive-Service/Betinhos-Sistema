import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider } from "../componentes/Toast";
import { IdiomaProvider, type IdiomaId } from "../i18n";

// Renderiza dentro dos provedores reais (idioma e toast), como no main.tsx; o rerender mantém os provedores.
export function renderiza(ui: ReactElement, idInicial: IdiomaId = "pt") {
  const envolve = (x: ReactElement) => <IdiomaProvider idInicial={idInicial}><ToastProvider>{x}</ToastProvider></IdiomaProvider>;
  const r = render(envolve(ui));
  return { ...r, rerender: (novo: ReactElement) => r.rerender(envolve(novo)) };
}
