// Service worker do App Motoristas (web resource new_app-motoristas-v2-sw, escopo /WebResources/).
// Guarda só o HTML do app para abrir sem rede. Dados do Dataverse, fotos e demais chamadas
// nunca passam por aqui (sem listener = rede direta), então nada sensível fica em disco.
const CACHE = "app-motoristas-shell-v1";
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
