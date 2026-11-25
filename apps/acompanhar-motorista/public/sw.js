// Service worker dos avisos do link de acompanhamento (registrado pela página com escopo /r/<id>).
// Só mostra o aviso que o Worker manda e, no toque, foca a aba do link ou a abre. Sem cache, sem offline.
self.addEventListener("push", function (e) {
  var d = {};
  try { d = (e.data && e.data.json()) || {}; } catch (x) { d = {}; }
  // userVisibleOnly: todo push precisa virar notificação, mesmo com corpo ilegível.
  e.waitUntil(self.registration.showNotification(d.titulo || "Betinhos Executive Service", {
    body: d.corpo || "",
    tag: d.tag || undefined,
    data: { url: d.url || "/" },
    icon: "/logo-b-128.png",
    badge: "/logo-b-128.png",
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var bruto = (e.notification.data && e.notification.data.url) || "/";
  var url = self.location.origin + (typeof bruto === "string" && bruto.charAt(0) === "/" && bruto.charAt(1) !== "/" ? bruto : "/");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].url.split("?")[0].split("#")[0] === url && lista[i].focus) return lista[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
