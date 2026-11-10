import { useEffect } from "react";

const GUARD_KEY = "appMotoristasBackGuard";
const BACK_BUTTON_SELECTOR = 'button[aria-label="Voltar"], button[aria-label="Início"]';

function hasGuardEntry() {
  return Boolean((window.history.state as Record<string, unknown> | null)?.[GUARD_KEY]);
}

function pushGuardEntry() {
  if (hasGuardEntry()) return;
  window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, "", window.location.href);
}

// Retorna o botão de voltar do cabeçalho da tela visível (a última <main> montada durante transições).
export function findVisibleBackButton(root: ParentNode = document) {
  const mains = [...root.querySelectorAll("main")];
  const main = mains[mains.length - 1];
  return main?.querySelector<HTMLButtonElement>(BACK_BUTTON_SELECTOR) ?? null;
}

// Gesto/botão Voltar do celular: volta uma tela dentro do app em vez de sair do webresource.
// Mantém no máximo uma entrada extra no histórico e reaproveita o Voltar de cada tela,
// que já sabe para onde ir e fica desabilitado durante envios.
export function useHardwareBackGuard(screen: string, enabled: boolean, homeScreen = "inicio") {
  useEffect(() => {
    if (!enabled) return;
    if (screen === homeScreen) {
      if (hasGuardEntry()) window.history.back();
      return;
    }

    pushGuardEntry();
    const onPopState = () => {
      const openDialog = document.querySelector('[role="dialog"]');
      if (openDialog) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      } else {
        const backButton = findVisibleBackButton();
        if (backButton && !backButton.disabled) backButton.click();
      }
      pushGuardEntry();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled, homeScreen, screen]);
}
