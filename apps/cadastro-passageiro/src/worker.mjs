// Worker do link público de cadastro do passageiro (foto, telefone e e-mail).
// A página e os arquivos estáticos vêm de ./public; /api/* repassa ao flow HTTP (secret FLOW_URL).
import { tratarApi } from "./api.mjs";
import { paginaHtml } from "./pagina.mjs";

const SEGURANCA = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; " +
    "font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function comSeguranca(resp) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(SEGURANCA)) r.headers.set(k, v);
  return r;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return comSeguranca(await tratarApi(request, env, url));
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (request.method !== "GET" && request.method !== "HEAD") return comSeguranca(new Response(null, { status: 405 }));
      return comSeguranca(new Response(paginaHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      }));
    }
    const asset = env.ASSETS ? await env.ASSETS.fetch(request) : new Response("Não encontrado", { status: 404 });
    return comSeguranca(asset);
  },
};
