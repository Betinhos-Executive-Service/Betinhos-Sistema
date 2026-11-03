// Service worker do App Motoristas (web resource new_app-motoristas-v2-sw, escopo /WebResources/).
// Guarda só o HTML do app para abrir sem rede. Dados do Dataverse, fotos e demais chamadas
// nunca passam por aqui (sem listener = rede direta), então nada sensível fica em disco.
// Também recebe o Web Push: título, texto e deep link (?servicoId=...) vêm do emissor; nada é guardado.
const CACHE = "app-motoristas-shell-v2";
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

// Web Push: o emissor (Custom API) manda JSON { title, body, url, tag }. Sem dados sensíveis além do texto da notificação.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (error) { data = { body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "App Motoristas");
  const options = { body: String(data.body || ""), data: { url: String(data.url || "") } };
  if (data.tag) options.tag = String(data.tag);
  if (data.icon) options.icon = String(data.icon);
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
