// App instalável (PWA) pela URL direta do web resource. Dentro do Power Apps/model-driven (iframe)
// e fora do host do Dataverse (localhost/mock) nada é registrado.
import icon192 from "../assets/pwa/icon-192.png";
import icon512 from "../assets/pwa/icon-512.png";
import iconMaskable512 from "../assets/pwa/icon-maskable-512.png";
import appleTouch180 from "../assets/pwa/apple-touch-180.png";

import { buildManifest, isPwaContext, PWA_SW_NAME, THEME_COLOR } from "./pwaManifest.ts";

function addHead(tag: string, attrs: Record<string, string>) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  document.head.appendChild(el);
}

export function installPwa() {
  if (!isPwaContext()) return;
  const { origin, pathname } = window.location;

  const manifest = buildManifest(origin, pathname, { icon192, icon512, iconMaskable512 });
  addHead("link", { rel: "manifest", href: `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}` });
  addHead("meta", { name: "theme-color", content: THEME_COLOR });
  addHead("link", { rel: "apple-touch-icon", href: appleTouch180 });
  addHead("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
  addHead("meta", { name: "mobile-web-app-capable", content: "yes" });
  addHead("meta", { name: "apple-mobile-web-app-status-bar-style", content: "default" });

  addHead("meta", { name: "apple-mobile-web-app-title", content: manifest.short_name });
  if ("serviceWorker" in navigator) {
    // Registro antigo com escopo /WebResources/ inteiro controlava também o Sistema Betinhos.
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.filter((r) => r.scope === `${origin}/WebResources/`).forEach((r) => r.unregister()))
      .catch(() => {});
    navigator.serviceWorker
      .register(`${origin}/WebResources/${PWA_SW_NAME}`, { scope: manifest.scope })
      .catch((error) => console.warn("[pwa] service worker não registrado", error));
  }
}
