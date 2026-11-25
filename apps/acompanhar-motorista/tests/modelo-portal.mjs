// Dublê do binding ASSETS: devolve um portal.html com os mesmos marcadores do build (<!--BT_HEAD-->, <!--BT_ROOT-->).
export const MODELO = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Acompanhe sua viagem · Betinhos</title>
<!--BT_HEAD-->
<script type="module" crossorigin src="/assets/portal-teste.js"></script><link rel="stylesheet" crossorigin href="/assets/portal-teste.css"></head>
<body ontouchstart=""><div id="root"><!--BT_ROOT--></div></body></html>`;
export const ASSETS = { fetch: async (req) => (new URL(req.url).pathname === "/portal.html" ? new Response(MODELO, { headers: { "Content-Type": "text/html" } }) : new Response("não encontrado", { status: 404 })) };
