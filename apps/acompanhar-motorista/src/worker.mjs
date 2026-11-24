// Worker do link público de acompanhamento de motorista.
// Os links são criados pela ferramenta `link_acompanhamento` do conector Infleet,
// que grava `track:<id>` no KV compartilhado (ver README). Aqui se lê o link e
// se gravam apenas os marcos do serviço (chegou, saiu, concluiu): no máximo 3 escritas por link.
import { descricaoPrevia, paginaHtml } from "./pagina.mjs";
import { VERSAO } from "./version.mjs";
import { rotaApiLinks } from "./api-links.mjs";
import { calcularDados, gravarNoKv, publicarDados } from "./dados.mjs";
import { jaAvaliado, postAvaliacao, reenviarPendentes } from "./avaliacao.mjs";
import { vapidDoEnv } from "./webpush.mjs";
import { ROTA_PASSAGEIROS, rotaPassageiros } from "./passageiros.mjs";

// Caches curtos por isolate: evitam consultar Infleet e roteador a cada visualizador. Quando a Infleet
// não responde, a última leitura (até 15 min) é devolvida marcada como `fonteIndisponivel`, em vez de erro.
const cacheDados = new Map();
const DADOS_FRESCOS_MS = 12000;
const DADOS_RESERVA_MS = 15 * 60000;

function lembrarDados(id, dados) {
  const em = Date.now();
  if (cacheDados.size > 200) for (const [k, c] of cacheDados) if (em - c.em > DADOS_RESERVA_MS) cacheDados.delete(k);
  cacheDados.set(id, { em, dados });
}

function config(env) {
  // Chave pública VAPID só com os três segredos e o Viagem: sem ela a página não mostra o sino.
  const vapid = env.VIAGEM && vapidDoEnv(env) ? env.VAPID_PUBLIC_KEY : null;
  return { telefone: env.CENTRAL_TELEFONE || null, whatsapp: env.CENTRAL_WHATSAPP || null, tomtom: Boolean(env.TOMTOM_KEY), aoVivo: Boolean(env.VIAGEM), vapid };
}

// Estado da rota por isolate (caminho sem Durable Object; nunca no KV: o link tem cota de escritas).
const trilhas = new Map();         // id → { pontos, rejeitada, semeadaEm }
const estadosRota = new Map();     // id → estado de decidirRota
const cachePercorrido = new Map(); // id → { em, pontos, casado, ate }
const ESTADOS_MAX = 300;
const PERCORRIDOS_MAX = 200;

// `est` de calcularDados apoiado nos Map do isolate (leituras concorrentes do mesmo link enxergam o mesmo estado).
function estadoDoIsolate(id) {
  if (trilhas.size > ESTADOS_MAX) trilhas.clear();
  if (estadosRota.size > ESTADOS_MAX) estadosRota.clear();
  return {
    get trilha() { return trilhas.get(id); },
    set trilha(v) { trilhas.set(id, v); },
    get estadoRota() { return estadosRota.get(id); },
    set estadoRota(v) { if (v) estadosRota.set(id, v); else estadosRota.delete(id); },
    get percorrido() { return cachePercorrido.get(id); },
    set percorrido(v) { if (!cachePercorrido.has(id) && cachePercorrido.size > PERCORRIDOS_MAX) cachePercorrido.clear(); cachePercorrido.set(id, v); },
  };
}

// Caminho principal: o Viagem do link responde (uma leitura da Infleet por viagem). Sem binding, com erro
// ou resposta não ok, `null`: /dados segue pelo caminho por isolate, e a página nunca fica sem dados.
const viagem = (env, id) => env.VIAGEM.get(env.VIAGEM.idFromName(id));

async function dadosPeloViagem(env, id, raw) {
  if (!env.VIAGEM) return null;
  try {
    const r = await viagem(env, id).fetch(`https://viagem/dados?id=${id}`, { method: "POST", body: raw });
    return r.ok ? await r.json() : null;
  } catch (e) {
    console.warn(`Viagem indisponível, seguindo sem ele: ${e?.message}`);
    return null;
  }
}

async function dadosAcompanhamento(id, raw, env) {
  const t = JSON.parse(raw);
  const concluido = t.concluidoPor === "dataverse" || Boolean(await env.TRACK_KV.get(`concluido:${id}`));
  return calcularDados(id, t, env, estadoDoIsolate(id), { concluido, gravar: (link, opcoes) => gravarNoKv(env, id, link, opcoes) });
}

const TIPOS_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);

async function fotoAcompanhamento(env, id, qual) {
  const nao = () => new Response("Não encontrado", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  if (!(await env.TRACK_KV.get(`track:${id}`))) return nao();
  const { value, metadata } = await env.TRACK_KV.getWithMetadata(`foto:${id}:${qual}`, "arrayBuffer");
  if (!value) return nao();
  const tipo = TIPOS_FOTO.has(metadata?.tipo) ? metadata.tipo : "image/jpeg";
  return new Response(value, { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
}

// O Viagem só acorda para um link que existe no KV (uma leitura): id inexistente não cria Durable Object.
const linkExiste = async (env, id) => Boolean(await env.TRACK_KV.get(`track:${id}`));

// WebSocket ao vivo: o Viagem do link aceita e transmite a cada leitura. Sem binding ou sem link, 404 (a página nem tenta).
async function aoVivo(request, env, url, id) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Esperado WebSocket", { status: 426, headers: { Upgrade: "websocket" } });
  if (!env.VIAGEM || !(await linkExiste(env, id))) return new Response("Não encontrado", { status: 404 });
  const debug = url.searchParams.get("debug") === "1" ? "1" : "";
  return viagem(env, id).fetch(new Request(`https://viagem/ao-vivo?id=${id}&debug=${debug}`, request));
}

// Manifest por link: na tela de início (iPhone), o ícone abre direto este acompanhamento e recebe os avisos.
async function manifesto(env, id) {
  if (!(await env.TRACK_KV.get(`track:${id}`))) return new Response("Não encontrado", { status: 404 });
  const inicio = `/r/${id}`;
  return new Response(JSON.stringify({
    id: inicio, name: "Betinhos · Acompanhe sua viagem", short_name: "Betinhos", start_url: inicio, scope: inicio,
    display: "standalone", background_color: "#ffffff", theme_color: "#ffffff",
    icons: [{ src: "/logo-b-128.png", sizes: "128x128", type: "image/png" }, { src: "/logo-b.png", sizes: "500x500", type: "image/png" }],
  }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=300" } });
}

// HTML do build servido pelos Static Assets (binding ASSETS). Sem o binding ou sem o arquivo: `null`.
async function modeloPortal(env, url) {
  if (!env.ASSETS) return null;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL("/portal.html", url), { redirect: "follow" }));
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

async function rotaAcompanhamento(request, env, url) {
  const m = url.pathname.match(/^\/r\/([0-9A-Za-z]{12}|[0-9a-f]{64})(\/ao-vivo|\/manifest\.webmanifest|\/foto\/motorista|\/foto\/veiculo|\/dados)?$/);
  if (!m) return null;
  const [, id, sub] = m;
  if (sub === "/ao-vivo") return aoVivo(request, env, url, id);
  if (sub === "/manifest.webmanifest") return manifesto(env, id);
  if (sub?.startsWith("/foto/")) return fotoAcompanhamento(env, id, sub.slice(6));
  const raw = await env.TRACK_KV.get(`track:${id}`);
  // Sem a chave: revogado (lápide de 24 h gravada pelo DELETE) ou expirado; cada um tem a sua tela.
  const estado = raw ? "ativo" : (await env.TRACK_KV.get(`revogado:${id}`)) ? "revogado" : "expirado";
  if (!sub) {
    const t = raw ? JSON.parse(raw) : null;
    const extras = t ? {
      completo: t.modo !== "simples", // só para o esqueleto do ETA aparecer no primeiro paint (o painel não salta)
      manifest: `/r/${id}/manifest.webmanifest`,
      previa: descricaoPrevia(t),
    } : { completo: false };
    // O app React é o `portal.html` do build (Static Assets); o Worker injeta metatags e bootstrap do link.
    const modelo = await modeloPortal(env, url);
    if (!modelo) return new Response("Página indisponível", { status: 503, headers: { "Cache-Control": "no-store" } });
    return new Response(paginaHtml(modelo, estado, { ...config(env), origem: url.origin, ...extras }), {
      status: raw ? 200 : 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "strict-origin" },
    });
  }
  if (!raw) return Response.json({ expirado: true, revogado: estado === "revogado" }, { status: 404 });

  let dados = await dadosPeloViagem(env, id, raw);
  const hit = dados ? null : cacheDados.get(id);
  if (!dados && hit && Date.now() - hit.em < DADOS_FRESCOS_MS) dados = hit.dados;
  if (!dados) {
    try {
      dados = await dadosAcompanhamento(id, raw, env);
      lembrarDados(id, dados);
    } catch (e) {
      // Infleet/rede fora: a última leitura deste isolate segue valendo, marcada, em vez de tela de erro.
      if (!hit || Date.now() - hit.em > DADOS_RESERVA_MS) throw e;
      console.warn(`Infleet indisponível, servindo última leitura: ${e?.message}`);
      dados = { ...hit.dados, fonteIndisponivel: true };
    }
  }
  // Fora do cache, para refletir a avaliação recém-enviada; só o fato, nunca o conteúdo.
  const avaliado = dados.fase === "concluido" && await jaAvaliado(env, id);
  // Diagnóstico da rota (rumo, trilha, encaixe) só com ?debug=1.
  const debug = url.searchParams.get("debug") === "1";
  return Response.json(publicarDados(dados, { debug, avaliado, versao: VERSAO }), { headers: { "Cache-Control": "no-store" } });
}

// Depois da API gravar no KV: edição e conclusão mandam ao Viagem o link relido neste isolate (sem esperar a
// consistência do KV); revogação encerra o Viagem. Criação não precisa: o primeiro acesso cria o DO.
async function avisarViagem(request, env, url) {
  const m = url.pathname.match(/^\/api\/links\/([0-9A-Za-z]{12}|[0-9a-f]{64})(\/concluir)?$/);
  if (!m) return;
  const [, id, concluir] = m;
  const stub = viagem(env, id);
  if (request.method === "DELETE" && !concluir) return stub.fetch(`https://viagem/encerrar?id=${id}`, { method: "POST" });
  if (!(request.method === "PUT" || (concluir && request.method === "POST"))) return;
  const raw = await env.TRACK_KV.get(`track:${id}`);
  if (raw) return stub.fetch(`https://viagem/recarregar?id=${id}`, { method: "POST", body: raw });
}

const ROTA_AVALIACAO = /^\/r\/([0-9A-Za-z]{12}|[0-9a-f]{64})\/avaliacao$/;
const ROTA_AVISOS = /^\/r\/([0-9A-Za-z]{12}|[0-9a-f]{64})\/avisos$/;
const AVISOS_MAX_BYTES = 4096;

// Inscrição (POST) e cancelamento (DELETE) dos avisos; quem guarda e envia é o Viagem do link.
async function rotaAvisos(request, env, id) {
  if (!env.VIAGEM || !vapidDoEnv(env)) return new Response("Não encontrado", { status: 404 });
  if (request.method !== "POST" && request.method !== "DELETE") return new Response("Método não permitido", { status: 405 });
  const corpo = await request.text();
  if (new TextEncoder().encode(corpo).length > AVISOS_MAX_BYTES) return Response.json({ erro: "Corpo grande demais" }, { status: 413 });
  if (!(await linkExiste(env, id))) return new Response("Não encontrado", { status: 404 });
  return viagem(env, id).fetch(`https://viagem/avisos?id=${id}`, { method: request.method, body: corpo });
}

// Nenhuma resposta de /r/ entra em buscador (JSON, manifest, erros). O 101 do WebSocket passa intacto.
function semIndice(r) {
  if (!r || r.status === 101 || r.headers.get("X-Robots-Tag")) return r;
  const copia = new Response(r.body, r);
  copia.headers.set("X-Robots-Tag", "noindex");
  return copia;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const r = await rotear(request, env, ctx, url);
    return url.pathname.startsWith("/r/") ? semIndice(r) : r;
  },
  // Cron (wrangler.jsonc, a cada 15 min): reenvia ao Flow as avaliações que não chegaram.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(reenviarPendentes(env).then((r) => console.log(JSON.stringify({ evento: "avaliacao_reenvio", ...r }))));
  },
};

async function rotear(request, env, ctx, url) {
  const api = await rotaApiLinks(request, env, url);
  if (api) {
    if (api.ok && env.VIAGEM && ctx) ctx.waitUntil(avisarViagem(request, env, url).catch((e) => console.warn(`Aviso ao Viagem falhou: ${e?.message}`)));
    return api;
  }
  const av = url.pathname.match(ROTA_AVALIACAO);
  if (av) {
    if (request.method !== "POST") return new Response("Método não permitido", { status: 405 });
    return postAvaliacao(request, env, ctx, av[1]).catch((e) => {
      console.error(`Avaliação: ${e?.message}`);
      return Response.json({ erro: "Falha ao registrar a avaliação" }, { status: 502 });
    });
  }
  const avisos = url.pathname.match(ROTA_AVISOS);
  if (avisos) {
    return rotaAvisos(request, env, avisos[1]).catch((e) => {
      console.error(`Avisos: ${e?.message}`);
      return Response.json({ erro: "Falha ao registrar o aviso" }, { status: 502 });
    });
  }
  const pax = url.pathname.match(ROTA_PASSAGEIROS);
  if (pax) {
    return rotaPassageiros(request, env, url, pax, ctx).catch((e) => {
      console.error(`Passageiros: ${e?.name}`);
      return Response.json({ erro: "Falha ao consultar os passageiros" }, { status: 502 });
    });
  }
  if (request.method !== "GET") return new Response("Método não permitido", { status: 405 });
  const r = await rotaAcompanhamento(request, env, url).catch((e) => {
    console.error(e);
    return Response.json({ erro: "Falha ao consultar a posição" }, { status: 502 });
  });
  return r ?? new Response("Não encontrado", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
}

export { corrigirSaidaFixa } from "./dados.mjs";
export { Viagem } from "./viagem.mjs";
