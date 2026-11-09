var Cr40fGerarPagantes = (function () {
  'use strict';

  var OVERLAY_ID = 'cr40f-gerar-pagantes-native-overlay';
  var OVERLAY_STYLE_ID = 'cr40f-gerar-pagantes-native-overlay-style';
  var CLOSE_MESSAGE = 'cr40f-gerar-pagantes:close';
  var REQUEST_CLOSE_MESSAGE = 'cr40f-gerar-pagantes:request-close';
  var REQUEST_CLOSE_ACK = 'cr40f-gerar-pagantes:request-close-ack';
  var ERROR_LOG_TABLE = 'new_appmotoristaslog';

  function getXrm() {
    if (window.Xrm) return window.Xrm;
    try { return window.parent !== window ? window.parent.Xrm : null; }
    catch (error) { return null; }
  }

  function truncate(value, limit) { value = String(value || ''); return value.length <= limit ? value : value.slice(0, limit); }

  function serialize(value) {
    try { return JSON.stringify(value) || '{}'; }
    catch (error) { return '{}'; }
  }

  function writeError(error, context) {
    var api = getXrm();
    if (!api || !api.WebApi || !api.WebApi.createRecord) return Promise.resolve();
    var normalized = error instanceof Error ? error : new Error(typeof error === 'string' ? error : serialize(error));
    var action = context.action || 'runtime-error';
    var raw = serialize({ name: normalized.name, message: normalized.message, stack: normalized.stack || normalized.toString() });
    var record = {
      new_name: truncate('Tela Gerar Pagantes - ' + action, 160),
      new_occurredat: new Date().toISOString(),
      new_severity: 'error',
      new_source: context.source || 'Command Bar',
      new_action: truncate(action, 180),
      new_phase: context.phase || 'runtime',
      new_component: context.component || 'Cr40fGerarPagantes',
      new_detailid: context.detailId || '',
      new_detailtype: context.detailType || '',
      new_message: truncate(normalized.message || 'Erro sem mensagem.', 20000),
      new_stack: truncate(normalized.stack || normalized.toString(), 100000),
      new_errorname: truncate(normalized.name || 'Error', 220),
      new_errorcode: truncate(context.errorCode || '', 120),
      new_appname: 'Tela Gerar Pagantes',
      new_payloadjson: truncate(serialize(context.payload || {}), 100000),
      new_rawjson: truncate(raw, 100000)
    };
    try {
      return api.WebApi.createRecord(ERROR_LOG_TABLE, record).catch(function (loggingError) {
        console.error('[Cr40fGerarPagantes] Falha ao gravar erro na tabela de logs.', loggingError);
      });
    } catch (loggingError) {
      console.error('[Cr40fGerarPagantes] Falha ao preparar erro para a tabela de logs.', loggingError);
      return Promise.resolve();
    }
  }

  function getRecordId(selectedItemIds) {
    if (!selectedItemIds) return null;
    if (Array.isArray(selectedItemIds)) {
      if (selectedItemIds.length !== 1) return { count: selectedItemIds.length };
      var item = selectedItemIds[0];
      return typeof item === 'string' ? item : item && (item.Id || item.id);
    }
    return typeof selectedItemIds === 'string' ? selectedItemIds : (selectedItemIds.Id || selectedItemIds.id);
  }

  function alert(title, text) { return Xrm.Navigation.openAlertDialog({ title: title, text: text }); }

  function refreshHost() {
    try {
      if (Xrm.Page && Xrm.Page.data) Xrm.Page.data.refresh(false);
    } catch (error) {
      void writeError(error, { action: 'refreshHost', phase: 'host-refresh' });
      console.warn('[Cr40fGerarPagantes] Nao foi possivel atualizar o formulario', error);
    }
  }

  // Backdrop e webresource sao irmaos: iframe transparente deixa o blur revelar o app.
  function openNativeOverlay(recordId) {
    var hostWindow = window.top;
    var hostDocument = hostWindow.document;
    var existing = hostDocument.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    var oldStyle = hostDocument.getElementById(OVERLAY_STYLE_ID);
    if (oldStyle) oldStyle.remove();

    var style = hostDocument.createElement('style');
    style.id = OVERLAY_STYLE_ID;
    style.textContent =
      '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;isolation:isolate;opacity:0;transition:opacity 180ms cubic-bezier(.23,1,.32,1)}' +
      '#' + OVERLAY_ID + '.is-visible{opacity:1}' +
      '#' + OVERLAY_ID + ' .bt-gerar-pagantes-backdrop{position:absolute;inset:0;z-index:0;background:rgba(0,26,61,.22);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}' +
      '#' + OVERLAY_ID + ' iframe{position:relative;z-index:1;display:block;width:min(1180px,calc(100% - 48px));height:min(900px,calc(100% - 40px));border:0;border-radius:14px;background:transparent;box-shadow:none;outline:0}' +
      '@media(max-width:820px){#' + OVERLAY_ID + ' iframe{width:100%;height:100%;border-radius:0;box-shadow:none}}';

    var overlay = hostDocument.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Gerar pagantes');
    var backdrop = hostDocument.createElement('div');
    backdrop.className = 'bt-gerar-pagantes-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    var frame = hostDocument.createElement('iframe');
    frame.title = 'Gerar pagantes';
    frame.setAttribute('allowtransparency', 'true');
    frame.setAttribute('allow', 'clipboard-write');
    var clientUrl = Xrm.Utility.getGlobalContext().getClientUrl().replace(/\/$/, '');
    frame.src = clientUrl + '/WebResources/Tela_GerarPagantes/index.html?recordId=' + encodeURIComponent(recordId) + '&embedded=1&cacheBust=' + Date.now();
    overlay.appendChild(backdrop);
    overlay.appendChild(frame);
    (hostDocument.head || hostDocument.documentElement).appendChild(style);
    hostDocument.body.appendChild(overlay);

    var closed = false;
    function close(shouldRefresh) {
      if (closed) return;
      closed = true;
      if (requestTimer) hostWindow.clearTimeout(requestTimer);
      hostWindow.removeEventListener('message', onMessage);
      hostWindow.removeEventListener('keydown', onKeyDown, true);
      overlay.classList.remove('is-visible');
      hostWindow.setTimeout(function () {
        overlay.remove();
        style.remove();
        if (shouldRefresh) refreshHost();
      }, 160);
    }
    function onMessage(event) {
      if (event.origin !== hostWindow.location.origin || event.source !== frame.contentWindow || !event.data) return;
      if (event.data.type === REQUEST_CLOSE_ACK) {
        if (requestTimer) hostWindow.clearTimeout(requestTimer);
        requestTimer = null;
        return;
      }
      if (event.data.type === CLOSE_MESSAGE) close(Boolean(event.data.refresh));
    }
    // Esc e clique fora pedem o fechamento à tela, que confirma se houver alteração não salva.
    // Sem resposta (tela travada ou ainda carregando), fecha mesmo assim.
    var requestTimer = null;
    function requestClose() {
      if (closed || requestTimer) return;
      try { frame.contentWindow.postMessage({ type: REQUEST_CLOSE_MESSAGE }, hostWindow.location.origin); } catch (error) { close(false); return; }
      requestTimer = hostWindow.setTimeout(function () { requestTimer = null; close(false); }, 1500);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    }
    backdrop.addEventListener('mousedown', requestClose);
    hostWindow.addEventListener('message', onMessage);
    hostWindow.addEventListener('keydown', onKeyDown, true);
    frame.addEventListener('load', function () { frame.focus(); }, { once: true });
    hostWindow.requestAnimationFrame(function () { overlay.classList.add('is-visible'); });
    return close;
  }

  async function abrirPainelRateio(selectedItemIds) {
    try {
      var selected = getRecordId(selectedItemIds);
      if (!selected || (selected && selected.count === 0)) { await alert('Nenhuma OP selecionada', 'Selecione uma OP antes de gerar os pagantes.'); return; }
      if (selected && selected.count > 1) { await alert('Selecao multipla', 'Selecione somente uma OP para gerar os pagantes.'); return; }
      var recordId = String(selected).replace(/[{}]/g, '').trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) { await alert('OP invalida', 'Nao foi possivel identificar o registro selecionado.'); return; }

      openNativeOverlay(recordId);
    } catch (error) {
      await writeError(error, { action: 'abrirPainelRateio', phase: 'open-web-resource' });
      console.error('[Cr40fGerarPagantes] Falha ao abrir web resource', error);
      await alert('Nao foi possivel abrir a cobranca', 'Tente novamente. Se o problema continuar, informe o horario desta tentativa ao suporte.');
    }
  }

  return { abrirPainelRateio: abrirPainelRateio };
}());
