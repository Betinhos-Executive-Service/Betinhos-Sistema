// Página pública de acompanhamento. A interface é um app React (web/, build em web-dist/); o Worker só devolve
// o `portal.html` do build com as metatags da prévia (WhatsApp, redes) e o bootstrap do link injetados.
// Link expirado/revogado leva o texto no HTML (legível sem JS) e metatags genéricas, e não carrega o mapa.
import { VERSAO } from "./version.mjs";
import { pt } from "./idiomas.mjs";

const atributo = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// JSON seguro dentro de <script>: "<" nunca fecha a tag.
const jsonSeguro = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

// Descrição da prévia do link (WhatsApp, redes): "Embarque às HH:mm · Modelo cor", partes ausentes omitidas.
export function descricaoPrevia(t) {
  const h = Date.parse(t?.horarioAgendado);
  const hora = Number.isFinite(h) ? `Embarque às ${new Date(h).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}` : null;
  const carro = [t?.modeloVeiculo, t?.corVeiculo && String(t.corVeiculo).toLowerCase()].filter(Boolean).join(" ");
  return [hora, carro].filter(Boolean).join(" · ") || null;
}

// Prévia: a ativa mostra horário e carro; expirada e revogada, só o nome da empresa (nada do serviço).
function metaPrevia(valido, cfg) {
  const titulo = valido ? "Acompanhe sua viagem · Betinhos" : "Betinhos Executive Service";
  const descricao = valido ? cfg.previa || "Acompanhe o seu motorista ao vivo" : "Transporte executivo";
  return `<meta property="og:site_name" content="Betinhos Executive Service">
<meta property="og:type" content="website">
<meta property="og:title" content="${atributo(titulo)}">
<meta property="og:description" content="${atributo(descricao)}">
${cfg.origem ? `<meta property="og:image" content="${atributo(cfg.origem)}/og-betinhos.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">` : ""}
<meta name="twitter:card" content="summary_large_image">
<link rel="apple-touch-icon" href="/logo-b.png">
${valido && cfg.manifest ? `<link rel="manifest" href="${atributo(cfg.manifest)}">` : ""}`;
}

// Texto do link inválido já no HTML (o React o substitui ao montar, com o mesmo conteúdo).
function raizInvalida(estado) {
  const k = estado === "revogado" ? "revogado" : "expirado";
  return `<main class="vazio"><div><h1>${pt(`${k}.titulo`)}</h1><p>${pt(`${k}.texto`)}</p></div></main>`;
}

/** `modelo`: o portal.html do build (Static Assets). `estado`: "ativo" | "expirado" | "revogado". */
export function paginaHtml(modelo, estado, cfg) {
  const valido = estado === "ativo";
  const boot = {
    estado: valido ? "ativo" : estado === "revogado" ? "revogado" : "expirado",
    versao: VERSAO,
    cfg: { tomtom: Boolean(cfg.tomtom), telefone: cfg.telefone || null, whatsapp: cfg.whatsapp || null, aoVivo: Boolean(cfg.aoVivo), vapid: cfg.vapid || null, completo: Boolean(cfg.completo) },
  };
  const cabeca = `${metaPrevia(valido, cfg)}
${valido ? '<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin>\n' : ""}<script>window.__BT__=${jsonSeguro(boot)}</script>`;
  return modelo
    .replace(/<title>[^<]*<\/title>/, `<title>${pt("titulo.pagina")}</title>`)
    .replace("<!--BT_HEAD-->", () => cabeca)
    .replace("<!--BT_ROOT-->", () => (valido ? "" : raizInvalida(estado)));
}
