(function (global) {
  "use strict";

  // OnLoad dos forms que recebem o toque das notificações (push) do App Motoristas v2.
  // O conector Power Apps Notification V2, para app model-driven, só abre tabela/registro;
  // este script leva o motorista ao web resource do App já na tela certa do registro.
  var APP_UNIQUE_NAME = "new_AppMotoristasv2";
  var APP_WEBRESOURCE = "new_app-motoristas-v2";
  var GUARD_PREFIX = "betinhos:pushRedirect:";
  var GUARD_MS = 15000;

  var ROUTES = {
    new_comunicadodestinatario: function (id) { return "comunicadoId=" + id; },
    new_checklistveiculo: function (id) { return "checklistId=" + id; },
    cr40f_reservadeveculos: function (id) { return "servicoId=" + id + "&tipo=SERVICO"; },
    new_termomulta: function (id) { return "termoMultaId=" + id; },
    cr40f_treinamentoparticipacao: function (id) { return "treinamentoParticipacaoId=" + id; }
  };

  function getFormContext(executionContext) {
    return executionContext && typeof executionContext.getFormContext === "function"
      ? executionContext.getFormContext()
      : executionContext;
  }

  function readGuard(storage, key) {
    try { return Number(storage.getItem(key)) || 0; } catch (error) { return 0; }
  }

  function writeGuard(storage, key, value) {
    try { storage.setItem(key, String(value)); } catch (error) { /* storage indisponível: segue sem guarda */ }
  }

  // Só redireciona dentro do App Motoristas v2: a mesma tabela (ex.: reserva) é usada pela operação no app Interno.
  function isMotoristasApp() {
    var utility = global.Xrm && global.Xrm.Utility;
    var context = utility && typeof utility.getGlobalContext === "function" ? utility.getGlobalContext() : null;
    if (!context || typeof context.getCurrentAppProperties !== "function") return Promise.resolve(false);
    return Promise.resolve(context.getCurrentAppProperties())
      .then(function (props) { return Boolean(props) && props.uniqueName === APP_UNIQUE_NAME; })
      .catch(function () { return false; });
  }

  function onLoad(executionContext) {
    var entity = getFormContext(executionContext);
    entity = entity && entity.data && entity.data.entity;
    if (!entity) return Promise.resolve(null);
    var route = ROUTES[entity.getEntityName()];
    var id = (entity.getId() || "").replace(/[{}]/g, "").toLowerCase();
    if (!route || !id) return Promise.resolve(null);

    return isMotoristasApp().then(function (inApp) {
      if (!inApp) return null;
      // Ao tocar em Voltar no app, o form recarrega; a guarda evita redirecionar em loop.
      var storage = global.sessionStorage;
      var key = GUARD_PREFIX + id;
      var now = Date.now();
      if (storage && now - readGuard(storage, key) < GUARD_MS) return null;
      if (storage) writeGuard(storage, key, now);
      return global.Xrm.Navigation.navigateTo(
        { pageType: "webresource", webresourceName: APP_WEBRESOURCE, data: route(id) },
        { target: 1 }
      );
    });
  }

  global.Betinhos = global.Betinhos || {};
  global.Betinhos.PushRedirect = { onLoad: onLoad, GUARD_MS: GUARD_MS, APP_UNIQUE_NAME: APP_UNIQUE_NAME };
})(typeof window !== "undefined" ? window : globalThis);
