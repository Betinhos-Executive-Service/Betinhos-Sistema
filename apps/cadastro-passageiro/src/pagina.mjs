// HTML da página. O token fica no fragmento (#t=) e é lido só no navegador.
import { VERSAO } from "./version.mjs";
import { TOKEN_RE } from "../public/validacao.mjs";

// ?v= muda a cada build: o Worker serve esses arquivos com cache longo (immutable).
const V = encodeURIComponent(VERSAO);

// Dispara o "ler" antes de o app.js chegar (poupa uma ida e volta no 3G); fica no topo do <head>, antes do CSS inline,
// para sair nos primeiros bytes. O app.js consome `__ler`.
// Mudou este texto? O hash da CSP é recalculado pelo Worker, nada a ajustar.
export const SCRIPT_INICIAL = `var t=new URLSearchParams(location.hash.slice(1)).get("t");if(t&&/${TOKEN_RE.source}/.test(t))window.__ler=fetch("/api/ler",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t}),priority:"high"}).catch(function(){return null});`;

const SK_CARD = `<div class="card sk-card"><div class="card-topo"><span class="sk sk-foto"></span><div class="card-id"><span class="sk sk-nome"></span><span class="sk sk-badge"></span></div></div><div class="sk-dados"><span class="sk sk-linha"></span><span class="sk sk-linha"></span></div></div>`;
// Esqueleto já no HTML: a forma da lista aparece com o primeiro desenho, antes do JS (o app.js guarda uma cópia).
const ESQUELETO = `<div class="esqueleto" role="status" aria-label="Carregando os passageiros"><div class="cabecalho"><div class="card-id"><span class="sk sk-titulo"></span><span class="sk sk-data"></span></div></div><div class="lista">${SK_CARD}${SK_CARD}${SK_CARD}</div></div>`;

const atributo = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// `css` inline (com hash na CSP) quando o Worker conseguiu ler o app.css; senão, <link> normal.
// `contato` = { whatsapp: "5511…" (só dígitos), email } vem das vars do Worker e aparece na tela de link vencido.
export function paginaHtml({ css = "", contato = {} } = {}) {
  const estilo = css ? `<style>${css}</style>` : `<link rel="stylesheet" href="/app.css?v=${V}">`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>${SCRIPT_INICIAL}</script>
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#FFFFFF">
<title>Cadastro do passageiro · Betinhos</title>
<link rel="icon" href="/logo-b.png">
<link rel="preload" href="/manrope.woff2" as="font" type="font/woff2" crossorigin>
<link rel="modulepreload" href="/app.js?v=${V}">
<link rel="modulepreload" href="/validacao.mjs">
${estilo}
</head>
<body>
<header class="topo"><img src="/logo-b.png" alt="Betinhos Executive Service" class="logo" width="36" height="36"></header>
<p class="offline" id="offline" role="status" hidden>Sem conexão. O que você preencher fica aqui até a internet voltar.</p>
<main id="app" data-whatsapp="${atributo(contato.whatsapp)}" data-email="${atributo(contato.email)}">${ESQUELETO}</main>
<div class="versao" aria-hidden="true">${VERSAO}</div>
<script type="module" src="/app.js?v=${V}"></script>
</body>
</html>`;
}
