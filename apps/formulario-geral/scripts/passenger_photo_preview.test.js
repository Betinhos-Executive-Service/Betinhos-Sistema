const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

// Checkout no Windows (core.autocrlf) traz CRLF; os trechos esperados usam LF.
function normalizeLineEndings(value) {
  return String(value).replace(/\r\n/g, "\n");
}

function includes(source, value, label = value) {
  assert.ok(normalizeLineEndings(source).includes(normalizeLineEndings(value)), `Esperado: ${label}`);
}

function excludes(source, value, label = value) {
  assert.ok(!normalizeLineEndings(source).includes(normalizeLineEndings(value)), `Nao esperado: ${label}`);
}

includes(html, "data-photo-preview-mode=\"confirm\"", "modal de foto deve suportar modo confirmacao");
includes(app, "function openPassengerPhotoViewer", "foto existente deve abrir popup view-only");
includes(app, "function debugPassengerPhoto", "preview de foto deve ter debug no console");
includes(app, "console.info(\"[TFG foto pax]\"", "debug de foto deve aparecer no console comum");
includes(app, "debugPassengerPhoto(\"viewer:open\"", "viewer deve logar abertura");
includes(app, "debugPassengerPhoto(\"viewer:image-error\"", "viewer deve logar falha de imagem");
includes(app, "debugPassengerPhoto(\"viewer:fallback\"", "viewer deve logar fallback por link");
includes(app, "debugPassengerPhoto(\"candidates\"", "viewer deve logar candidatos de URL");
includes(app, "function showPassengerPhotoLinkFallback", "link de foto deve ter fallback quando img nao renderiza");
includes(app, "function hydratePassengerPhotoImageElement", "header e hover devem reutilizar candidatos de URL");
includes(app, "hydratePassengerPhotoImageElement(img, data, \"header\")", "header nao deve depender de uma unica URL");
includes(app, "hydratePassengerPhotoImageElement(img, data, \"hover\")", "zoom no hover nao deve depender de uma unica URL");
includes(app, "const passengerPhotoImageCache = new Map();", "fotos de passageiros devem ter cache local por URL");
includes(app, "function preloadPassengerPhoto(passenger, reason = \"manual\")", "selecionar pax deve iniciar preload da foto");
includes(app, "function bestCachedPassengerPhotoCandidate(candidates)", "candidato ja carregado deve ser preferido nos previews");
includes(app, "function setPassengerPhotoImageSource(img, src, surface = \"image\")", "render de foto deve passar por helper com debug/cache");
includes(app, "render:cache-hit", "render deve logar cache hit");
includes(app, "render:cache-miss", "render deve logar cache miss");
includes(app, "render:loaded", "render deve logar quando imagem carregou");
includes(app, "render:failed", "render deve logar quando imagem falhou");
includes(app, "function markPassengerPhotoCandidateFailed", "falha de candidato deve entrar no cache");
includes(app, "preloadPassengerPhoto(selected, \"selected\")", "foto deve carregar em background ao selecionar pax");
includes(app, "preloadPassengerPhoto(item.passageiro, \"row-render\")", "pax selecionado/restaurado deve pre-carregar foto ao renderizar linha");
includes(app, "preloadPassengerPhoto(passenger, \"edit-open\")", "abrir edicao deve preparar foto em background");
includes(app, "preloadPassengerPhoto(updatedPassenger || { ...passenger, fotoUrl: photoUrl }, \"photo-upload\")", "foto enviada deve entrar no cache");
includes(app, "function passengerPhotoFrameUrl", "viewer deve tentar URL de frame para OneDrive/SharePoint");
includes(app, "function passengerPhotoSharePointPreviewUrl", "viewer deve tentar getpreview.ashx para link SharePoint");
includes(app, "function passengerPhotoSharePointDownloadUrl", "viewer deve tentar download.aspx para link SharePoint");
includes(app, "if (pathUrl) {\n      const sharePointPreview = passengerPhotoSharePointPreviewUrl(pathUrl);", "getpreview/download nao devem ser gerados para link compartilhado opaco");
includes(app, "status !== \"failed\"", "candidatos de foto com falha devem sair das proximas tentativas");
includes(app, "function photoFileNameFromContentDisposition", "nome do arquivo deve vir do header quando o link for compartilhamento");
includes(app, "function isOpaquePhotoFileName", "token opaco do link nao deve aparecer como nome de arquivo");
includes(app, "function passengerPhotoDisplayFileName", "metadata do popup deve esconder token de compartilhamento");
includes(app, "].filter(Boolean).join(\" - \");", "metadata deve mostrar apenas dados reais");
excludes(app, "Tamanho indisponivel pelo link", "preview nao deve mostrar tamanho indisponivel");
excludes(app, "Data indisponivel pelo link", "preview nao deve mostrar data indisponivel");
excludes(app, "Arquivo do OneDrive", "preview nao deve mostrar fallback generico de arquivo");
excludes(html, "Arquivo do OneDrive", "html nao deve conter fallback generico de arquivo");
includes(app, "img.onerror = () => {", "modal deve tratar erro de imagem renderizada por tentativa ativa");
includes(app, "metadata:head:skipped", "metadata por HEAD deve ser pulado para evitar CORS do SharePoint");
excludes(app, "fetch(data.url, { method: \"HEAD\"", "preview nao deve chamar HEAD em link SharePoint");
includes(html, "id=\"passengerPhotoPreviewFallback\"", "modal deve ter fallback visual para link");
includes(html, "id=\"passengerPhotoPreviewEyebrow\"", "eyebrow do popup deve ser dinamico");
includes(app, "el.passengerPhotoPreviewEyebrow.textContent = \"\";", "viewer nao deve duplicar nome no eyebrow");
includes(app, "el.passengerPhotoPreviewTitle.textContent = passengerPhotoViewerTitle(data);", "viewer deve mostrar nome do passageiro no titulo");
includes(app, "el.passengerPhotoPreviewTitle.textContent = passengerPhotoTitleFromPassenger(passenger);", "confirmacao de foto deve mostrar nome do passageiro");
includes(app, "function passengerPhotoTitleFromPassenger(passenger)", "titulo da confirmacao deve resolver nome do pax");
includes(app, "function passengerNameFromPhotoUrl(value)", "titulo deve buscar nome do pax pelo link da foto quando vier sem nome");
includes(app, "passengerNameFromPhotoUrl(data?.url || data?.src || \"\")", "viewer nao deve cair em Passageiro sem tentar resolver pelo link");
includes(app, "passengerNameFromPhotoUrl(savedUrl || src)", "dados do viewer devem preencher nome pelo link da foto");
excludes(app, "textContent = \"Confirmar imagem\"", "confirmacao nao deve manter titulo generico");
excludes(html, "Confirmar imagem", "html inicial nao deve conter titulo generico");
includes(app, "function openPassengerPhotoHoverZoom", "hover na foto do pax deve abrir zoom somente com imagem");
includes(app, "function buildPassengerPreviewPhotoHeader", "hover preview do passageiro deve ter header com foto");
includes(app, "closePassengerPreview();\n          openPassengerPhotoViewer(data);", "clique na foto deve fechar dados rapidos antes do popup maior");
includes(app, "const hasPhotoHeader = !!normalizePassengerPhotoUrl(passenger?.fotoUrl);", "header de foto deve depender do link salvo da foto");
includes(app, "if (hasPhotoHeader && (label === \"Nome\" || label === \"Cliente\")) return false;", "nome e cliente nao devem duplicar nas linhas quando header existe");
includes(app, "client.textContent = data.clientName || \"Cliente não informado\";", "header deve mostrar cliente abaixo do nome");
includes(app, "openPassengerPhotoViewer(photoViewerDataFromPassenger", "clique na foto deve abrir viewer com metadados");
includes(app, "if (openLockedPassengerEditPhotoViewer(wrap)) return;", "foto bloqueada no editar pax deve abrir preview em vez de toast");
includes(css, ".passenger-photo-preview-dialog.is-view-only", "modal view-only deve ter estilo proprio");
includes(css, ".passenger-photo-preview-fallback", "fallback do preview por link deve ter estilo proprio");
includes(css, ".passenger-preview-photo-header", "hover preview deve ter header de foto");
includes(css, ".passenger-photo-hover-zoom", "hover da mini foto deve ter zoom flutuante");
includes(css, ".passenger-preview-floating {\n  position: fixed;\n  left: 0;\n  top: 0;\n  z-index: 2147483646;", "popup de dados deve ficar abaixo do zoom da foto");
includes(css, ".passenger-photo-hover-zoom {\n  position: fixed;\n  left: 0;\n  top: 0;\n  z-index: 2147483647;", "zoom da foto deve ser camada mais alta");
includes(css, ".passenger-photo-preview-head {\n  position: relative;\n  display: block;", "cabecalho do preview deve permitir texto centralizado");
includes(css, ".passenger-photo-preview-head .passenger-picker-eyebrow:empty", "eyebrow vazio do preview deve sumir");

console.log("passenger_photo_preview: ok");
