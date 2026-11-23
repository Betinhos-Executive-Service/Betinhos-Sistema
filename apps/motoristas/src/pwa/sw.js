// Service worker do App Motoristas (web resource new_app-motoristas-v2-sw, escopo /WebResources/).
// Guarda só o HTML do app para abrir sem rede. Dados do Dataverse, fotos e demais chamadas
// nunca passam por aqui (sem listener = rede direta), então nada sensível fica em disco.
// Também recebe o Web Push: título, texto e deep link (?servicoId=...) vêm do emissor; nada é guardado.
const CACHE = "app-motoristas-shell-v3";
const APP_PATH = "/WebResources/new_app-motoristas-v2";

function isAppPage(url) {
  return url.origin === self.location.origin && url.pathname.replace(/^\/%7B[^/]+%7D/i, "") === APP_PATH;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode !== "navigate" || !isAppPage(url)) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Só guarda resposta direta do app; redirecionamento (login da Microsoft) nunca entra no cache.
        if (response.ok && !response.redirected && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(APP_PATH, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.open(CACHE).then((cache) => cache.match(APP_PATH)).then((cached) => cached || Response.error()))
  );
});

// Ícone (logo B, src/assets/pwa/icon-192.png) e selo monocromático da barra de status
// (src/assets/pwa/badge-96.png) embutidos: o SW não enxerga os assets do bundle do app.
const NOTIFICATION_ICON = "data:image/png;base64,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";
const NOTIFICATION_BADGE = "data:image/png;base64,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";

// Web Push: o emissor (Custom API) manda JSON { title, body, url, tag }. Sem dados sensíveis além do texto da notificação.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (error) { data = { body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "App Motoristas");
  const options = {
    body: String(data.body || ""),
    icon: data.icon ? String(data.icon) : NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    timestamp: Date.now(),
    vibrate: [120, 60, 120],
    data: { url: String(data.url || "") },
  };
  // Mesma tag substitui o aviso anterior do mesmo registro; renotify faz o celular avisar de novo.
  if (data.tag) { options.tag = String(data.tag); options.renotify = true; }
  event.waitUntil(self.registration.showNotification(title, options));
});

// Só abre o próprio app: URL de outra origem ou de outro web resource cai na abertura padrão.
function resolveTarget(rawUrl) {
  try {
    const target = new URL(rawUrl, self.location.origin);
    return isAppPage(target) ? target.href : self.location.origin + APP_PATH;
  } catch (error) {
    return self.location.origin + APP_PATH;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = resolveTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => isAppPage(new URL(client.url)));
      if (open && "navigate" in open) return open.navigate(target).then((client) => client && client.focus());
      return self.clients.openWindow(target);
    })
  );
});
