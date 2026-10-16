(function (global) {
  "use strict";

  // Form principal de new_comunicadodestinatario: o push do Power Apps so consegue abrir
  // tabela/registro do app model-driven. Este OnLoad leva o motorista direto ao App Motoristas
  // (web resource) com o comunicado aberto, em vez de deixar o form padrao na tela.
  var APP_WEBRESOURCE = "new_app-motoristas-v2";
  var GUARD_PREFIX = "betinhos:comunicadoRedirect:";
  var GUARD_MS = 15000;

  function getFormContext(executionContext) {
    return executionContext && typeof executionContext.getFormContext === "function"
      ? executionContext.getFormContext()
      : executionContext;
  }

  function getId(formContext) {
    var id = formContext && formContext.data && formContext.data.entity && formContext.data.entity.getId();
    return (id || "").replace(/[{}]/g, "").toLowerCase();
  }

  function readGuard(storage, key) {
    try { return Number(storage.getItem(key)) || 0; } catch (error) { return 0; }
  }

  function writeGuard(storage, key, value) {
    try { storage.setItem(key, String(value)); } catch (error) { /* storage indisponivel: segue sem guarda */ }
  }

  function onLoad(executionContext) {
    var id = getId(getFormContext(executionContext));
    if (!id) return null;

    // Ao tocar em Voltar no app, o form recarrega; a guarda evita redirecionar em loop.
    var storage = global.sessionStorage;
    var key = GUARD_PREFIX + id;
    var now = Date.now();
    if (storage && now - readGuard(storage, key) < GUARD_MS) return null;
    if (storage) writeGuard(storage, key, now);

    return global.Xrm.Navigation.navigateTo(
      { pageType: "webresource", webresourceName: APP_WEBRESOURCE, data: "comunicadoId=" + id },
      { target: 1 }
    );
  }

  global.Betinhos = global.Betinhos || {};
  global.Betinhos.ComunicadoRedirect = { onLoad: onLoad, GUARD_MS: GUARD_MS };
})(typeof window !== "undefined" ? window : globalThis);
