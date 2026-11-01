// Worker do link público de cadastro do passageiro (foto, telefone e e-mail).
// A página e os arquivos estáticos vêm de ./public; /api/* repassa ao flow HTTP (secret FLOW_URL).
import { tratarApi, sha256 } from "./api.mjs";
import { paginaHtml, SCRIPT_INICIAL } from "./pagina.mjs";
import { emailValido, soDigitos } from "../public/validacao.mjs";

const SEGURANCA = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
// Só o CSS inline e o script inicial da página (ambos por hash) saem do 'self'.
const csp = (hashes = {}) =>
  `default-src 'self'; img-src 'self' data: blob:; script-src ${["'self'", hashes.script].filter(Boolean).join(" ")}; ` +
  `style-src ${["'self'", hashes.style].filter(Boolean).join(" ")}; connect-src 'self'; font-src 'self'; object-src 'none'; ` +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const CSP_PADRAO = csp();

function comSeguranca(resp, cspHtml = CSP_PADRAO) {
  const r = new Response(resp.body, resp);
  r.headers.set("Content-Security-Policy", cspHtml);
  for (const [k, v] of Object.entries(SEGURANCA)) r.headers.set(k, v);
  return r;
}

const hashCsp = async (texto) => `'sha256-${btoa(String.fromCharCode(...await sha256(texto)))}'`;

// O app.css vai inline no HTML (uma ida e volta a menos no 3G). Lido uma vez por isolate; sem ASSETS, cai no <link>.
let pagina = null;
async function montarPagina(env, request) {
  if (pagina) return pagina;
  const [css, script] = await Promise.all([lerCss(env, request), hashCsp(SCRIPT_INICIAL)]);
  const contato = { whatsapp: soDigitos(env.CONTATO_WHATSAPP), email: emailValido(env.CONTATO_EMAIL) ? env.CONTATO_EMAIL : "" };
  const html = paginaHtml({ css, contato });
  const cspHtml = csp({ script, style: css && await hashCsp(css) });
  // Guarda só quando o CSS veio (senão tenta de novo no próximo pedido); no dev relê sempre, para ver mudanças no CSS.
  if (css && env.MODO_LOCAL !== "1") pagina = { html, cspHtml };
  return { html, cspHtml };
}

async function lerCss(env, request) {
  try {
    const r = env.ASSETS ? await env.ASSETS.fetch(new URL("/app.css", request.url)) : null;
    return r?.ok ? (await r.text()).replace(/<\/style/gi, "<\\/style") : "";
  } catch { return ""; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return comSeguranca(await tratarApi(request, env, url, fetch, ctx));
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (request.method !== "GET" && request.method !== "HEAD") return comSeguranca(new Response(null, { status: 405 }));
      const { html, cspHtml } = await montarPagina(env, request);
      return comSeguranca(new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      }), cspHtml);
    }
    const asset = env.ASSETS ? await env.ASSETS.fetch(request) : new Response("Não encontrado", { status: 404 });
    const resp = comSeguranca(asset);
    // Arquivo pedido com ?v=<versão> (app.css, app.js) não muda nessa URL: cache de 1 ano no navegador.
    // Módulo sem ?v= (validacao.mjs, importado pelo app.js) sempre revalida, para não ficar velho ao lado de um app.js novo.
    if (resp.ok) {
      if (url.searchParams.has("v")) resp.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      else if (url.pathname.endsWith(".mjs")) resp.headers.set("Cache-Control", "no-cache");
    }
    return resp;
  },
};
