// HTML da página. O token fica no fragmento (#t=) e é lido só pelo app.js no navegador.
import { VERSAO } from "./version.mjs";

export function paginaHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Cadastro do passageiro · Betinhos</title>
<link rel="icon" href="/logo-b.png">
<link rel="preload" href="/manrope.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header class="topo"><img src="/logo-b.png" alt="Betinhos Executive Service" class="logo" width="36" height="36"></header>
<main id="app">
  <p class="sr-only" role="status">Carregando os passageiros…</p>
</main>
<div class="versao" aria-hidden="true">${VERSAO}</div>
<script type="module" src="/app.js"></script>
</body>
</html>`;
}
