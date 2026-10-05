/*
 * Botão "Escala FDS" da grade de Reservas de Veículos.
 * Abre a escala de fim de semana como drawer sobre o app (overlay no window.top, como o Gerar Recibo),
 * com a tela cr40f_EscalaFDS.html em iframe. Fecha por X, Esc e clique fora; com alteração não salva
 * (avisada pela tela via postMessage) pede "Descartar alterações?" antes de fechar.
 */
var Betinhos = window.Betinhos || {};
Betinhos.EscalaFds = (function () {
  var ID = "bt-escalafds";
  var RESOURCE = "cr40f_EscalaFDS.html";
  var FONT = "font-family:'Manrope','Segoe UI',sans-serif;";

  function topDoc() { try { return window.top.document; } catch (e) { return document; } }
  function topWin() { try { return window.top.document && window.top; } catch (e) { return window; } }

  function estilos(doc) {
    if (doc.getElementById(ID + "-css")) return;
    var st = doc.createElement("style");
    st.id = ID + "-css";
    st.textContent =
      "#" + ID + "{position:fixed;inset:0;z-index:2147483000;background:rgba(0,26,61,.48);opacity:0;transition:opacity .22s cubic-bezier(.32,.72,0,1)}" +
      "#" + ID + ".is-open{opacity:1}" +
      "#" + ID + " .fds-panel{position:absolute;top:0;right:0;bottom:0;width:520px;max-width:100vw;display:flex;flex-direction:column;background:#f0f0f0;" +
      "box-shadow:-24px 0 70px rgba(0,18,45,.22);transform:translateX(24px);opacity:0;transition:transform .22s cubic-bezier(.32,.72,0,1),opacity .22s cubic-bezier(.32,.72,0,1)}" +
      "#" + ID + ".is-open .fds-panel{transform:none;opacity:1}" +
      "#" + ID + " .fds-head{flex:0 0 64px;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 20px;background:#fff;border-bottom:1px solid #e2e8f0;" + FONT + "}" +
      "#" + ID + " .fds-eyebrow{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b}" +
      "#" + ID + " .fds-title{margin:0;font-size:20px;line-height:25px;font-weight:800;color:#001a3d}" +
      "#" + ID + " .fds-close{width:40px;height:40px;display:grid;place-items:center;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#475569;cursor:pointer}" +
      "#" + ID + " .fds-close:active{transform:scale(.97)}" +
      "#" + ID + " .fds-close:focus-visible,#" + ID + " .fds-btn:focus-visible{outline:0;border-color:#6c91e8;box-shadow:0 0 0 3px rgba(33,89,210,.11)}" +
      "#" + ID + " iframe{flex:1;width:100%;border:0;background:#f0f0f0}" +
      "#" + ID + " .fds-confirm{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,26,61,.48);padding:16px}" +
      "#" + ID + " .fds-box{width:100%;max-width:380px;padding:20px;background:#fff;border-radius:12px;box-shadow:0 18px 42px rgba(15,23,42,.18);" + FONT + "}" +
      "#" + ID + " .fds-box h3{margin:0 0 6px;font-size:17px;font-weight:800;color:#001a3d}" +
      "#" + ID + " .fds-box p{margin:0 0 16px;font-size:13px;line-height:20px;color:#64748b}" +
      "#" + ID + " .fds-actions{display:flex;justify-content:flex-end;gap:8px}" +
      "#" + ID + " .fds-btn{height:40px;padding:0 16px;border-radius:10px;font:700 13px 'Manrope','Segoe UI',sans-serif;cursor:pointer;border:1px solid #e2e8f0;background:#fff;color:#0b2d5a}" +
      "#" + ID + " .fds-btn--danger{background:#c12f45;border-color:#c12f45;color:#fff}" +
      "@media (max-width:560px){#" + ID + " .fds-panel{width:100vw}}" +
      "@media (prefers-reduced-motion:reduce){#" + ID + ",#" + ID + " .fds-panel{transition-duration:.01ms}}";
    (doc.head || doc.body).appendChild(st);
  }

  function open() {
    var doc = topDoc();
    var win = topWin();
    if (doc.getElementById(ID)) return;
    estilos(doc);

    var anterior = doc.activeElement;
    var sujo = false;
    var overlay = doc.createElement("div");
    overlay.id = ID;
    overlay.innerHTML =
      '<section class="fds-panel" role="dialog" aria-modal="true" aria-labelledby="' + ID + '-title">' +
      '<header class="fds-head"><div><span class="fds-eyebrow">Reservas de veículos</span>' +
      '<h2 class="fds-title" id="' + ID + '-title">Escala fim de semana</h2></div>' +
      '<button type="button" class="fds-close" aria-label="Fechar escala">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
      "</button></header>" +
      '<iframe title="Escala fim de semana"></iframe></section>';
    var panel = overlay.querySelector(".fds-panel");
    var frame = overlay.querySelector("iframe");
    var clientUrl = Xrm.Utility.getGlobalContext().getClientUrl().replace(/\/+$/, "");
    frame.src = clientUrl + "/WebResources/" + RESOURCE;

    function onMessage(event) {
      if (event.source === frame.contentWindow && event.data && event.data.type === "escala-fds:dirty") sujo = !!event.data.dirty;
    }
    function onKey(event) {
      if (event.key === "Escape") { event.preventDefault(); pedirFechar(); }
    }
    function fechar() {
      win.removeEventListener("message", onMessage);
      doc.removeEventListener("keydown", onKey, true);
      overlay.classList.remove("is-open");
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 170);
      try { if (anterior && anterior.focus) anterior.focus(); } catch (e) { /* elemento já saiu da tela */ }
    }
    function pedirFechar() {
      if (overlay.querySelector(".fds-confirm")) return;
      if (!sujo) { fechar(); return; }
      var confirm = doc.createElement("div");
      confirm.className = "fds-confirm";
      confirm.innerHTML =
        '<div class="fds-box" role="alertdialog" aria-modal="true" aria-labelledby="' + ID + '-c">' +
        '<h3 id="' + ID + '-c">Descartar alterações?</h3><p>A escala tem alterações que ainda não foram salvas.</p>' +
        '<div class="fds-actions"><button type="button" class="fds-btn" data-a="voltar">Continuar editando</button>' +
        '<button type="button" class="fds-btn fds-btn--danger" data-a="descartar">Descartar</button></div></div>';
      confirm.addEventListener("click", function (event) {
        var acao = event.target.closest && event.target.closest("[data-a]");
        if (event.target === confirm || (acao && acao.getAttribute("data-a") === "voltar")) { confirm.remove(); return; }
        if (acao) { sujo = false; fechar(); }
      });
      panel.appendChild(confirm);
      confirm.querySelector("[data-a=voltar]").focus();
    }

    overlay.addEventListener("mousedown", function (event) { if (event.target === overlay) pedirFechar(); });
    overlay.querySelector(".fds-close").addEventListener("click", pedirFechar);
    win.addEventListener("message", onMessage);
    doc.addEventListener("keydown", onKey, true);
    doc.body.appendChild(overlay);
    overlay.getBoundingClientRect();
    overlay.classList.add("is-open");
    overlay.querySelector(".fds-close").focus();
  }

  return { open: open };
})();
window.Betinhos = Betinhos;
