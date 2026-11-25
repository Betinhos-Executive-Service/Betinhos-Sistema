// Passageiros da reserva no link de acompanhamento: o Worker chama o flow `cadastro-passageiro-link` (Power Automate)
// com o hash da credencial de cadastro guardada em `track:<id>` e só repassa à página campos mascarados.
// O Worker não tem credencial do Dataverse; escopo, máscara, limite de envios e SharePoint são do flow.
// Nunca se loga telefone, e-mail, base64, hash nem a URL do flow (ela tem assinatura).
import { servicoConcluido } from "./avaliacao.mjs";
import { emailOculto, emailValido, telefoneOculto, telefoneValido } from "./validacao-cadastro.mjs";

export const ROTA_PASSAGEIROS = /^\/r\/([0-9A-Za-z]{12}|[0-9a-f]{64})\/passageiros(?:\/([0-9a-fA-F-]{36})(\/foto)?)?$/;

const LIMITE_CORPO = 4 * 1024 * 1024; // 4 MB
const LIMITE_MINIATURA = 300000;      // caracteres em base64 (o flow aceita até 400000)
const TIMEOUT_FLOW_MS = 15000;
const ATUALIZAR_A_CADA_MS = 30000;
const STATUS_REPASSADOS = new Set([200, 400, 404, 410, 429, 500]);
const TIPOS_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
const CODIGOS = { 400: "invalido", 404: "nao-encontrado", 410: "expirado", 429: "limite", 500: "falha", 502: "falha" };
const B64 = /^[A-Za-z0-9+/=]+$/;
const GUID = /^[0-9a-fA-F-]{36}$/;

const json = (status, corpo, extras = {}) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store", ...extras } });
const erro = (status) => json(status, { erro: CODIGOS[status] ?? "falha" });
const naoEncontrado = () => json(404, { erro: CODIGOS[404] });
const registrar = (evento, campos) => console.log(JSON.stringify({ evento, ...campos }));

// ---- limpeza do que o flow devolve ----

const mascarado = (v) => (typeof v === "string" && v.includes("•") ? v : "");
// E-mail só vale com "@" visível: "•••" sozinho não diz nada à pessoa e conta como e-mail ausente.
const emailMascarado = (v) => { const m = mascarado(v); return m.includes("@") ? m : ""; };
const ordemDe = (p) => (Number.isFinite(p?.ordem) ? p.ordem : Infinity);
const porOrdem = (a, b) => (a.ordem - b.ordem) || a.primeiroNome.localeCompare(b.primeiroNome, "pt-BR");

/** Lista limpa do `ler` do flow, na ordem da escala (D4; desempate por nome), ou null se o formato não é o esperado. */
export function limparLer(dados) {
  if (!dados || !Array.isArray(dados.passageiros)) return null;
  const passageiros = dados.passageiros
    .filter((p) => typeof p?.id === "string" && GUID.test(p.id))
    .map((p) => ({
      ordem: ordemDe(p), id: p.id.toLowerCase(), primeiroNome: String(p.primeiroNome ?? "").slice(0, 60),
      temFoto: Boolean(p.temFoto),
      temTelefone: Boolean(p.temTelefone), telefoneMascarado: mascarado(p.telefoneMascarado),
      temEmail: Boolean(p.temEmail) && Boolean(emailMascarado(p.emailMascarado)), emailMascarado: emailMascarado(p.emailMascarado),
    }))
    .sort(porOrdem)
    .filter((p, i, todos) => todos.findIndex((x) => x.id === p.id) === i) // mesmo passageiro repetido: fica o de menor ordem
    .map(({ ordem, ...resto }) => resto);
  return { passageiros };
}

/** Foto do `foto` do flow: só imagem em base64; qualquer outra coisa vira null. */
export function limparFoto(dados) {
  const f = dados?.foto;
  if (!f || typeof f.base64 !== "string" || !f.base64 || !B64.test(f.base64)) return null;
  return { tipo: TIPOS_FOTO.has(f.mimeType) ? f.mimeType : "image/jpeg", base64: f.base64 };
}

/** Corpo do `salvar` só com campos válidos e preenchidos (mesma regra do cadastro-passageiro); null se inválido. */
export function payloadSalvar(corpo, passageiroId) {
  if (!corpo || typeof corpo !== "object" || !GUID.test(passageiroId ?? "")) return null;
  const { fotoBase64, miniaturaBase64, telefone, email } = corpo;
  const p = { passageiroId: passageiroId.toLowerCase() };
  if (fotoBase64 != null && fotoBase64 !== "") {
    if (typeof fotoBase64 !== "string" || !B64.test(fotoBase64)) return null;
    p.fotoBase64 = fotoBase64;
    // Miniatura inválida ou grande demais é descartada e o flow grava a própria foto no lugar dela.
    if (typeof miniaturaBase64 === "string" && miniaturaBase64.length <= LIMITE_MINIATURA && B64.test(miniaturaBase64)) p.miniaturaBase64 = miniaturaBase64;
  }
  if (telefone != null && telefone !== "") {
    if (!telefoneValido(telefone)) return null;
    p.telefone = String(telefone);
  }
  if (email != null && email !== "") {
    if (!emailValido(email)) return null;
    p.email = String(email).trim();
  }
  return Object.keys(p).length > 1 ? p : null;
}

// ---- link, flow e KV ----

// Link com credencial de cadastro e URL do flow do ambiente dele; senão null (a página esconde a seção).
async function carregar(env, id) {
  const raw = await env.TRACK_KV.get(`track:${id}`);
  if (!raw) return null;
  let t;
  try { t = JSON.parse(raw); } catch { return null; }
  const url = ["dev", "prod"].includes(t.cadastroAmbiente) ? env[`CADASTRO_FLOW_URL_${t.cadastroAmbiente.toUpperCase()}`] : null;
  if (!/^[0-9a-f]{64}$/.test(t.cadastroHash ?? "") || !url) return null;
  const resto = Math.round((Date.parse(t.expiraEm) - Date.now()) / 1000);
  return { id, t, url, hash: t.cadastroHash, ttl: { expirationTtl: Math.max(60, Number.isFinite(resto) ? resto : 60) } };
}

// { status, dados }: falha de rede, tempo esgotado ou status fora da lista viram 502; nada do erro é logado.
async function chamarFlow(c, corpo, fetcher) {
  let r;
  try {
    r = await fetcher(c.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hash: c.hash, ...corpo }), signal: AbortSignal.timeout(TIMEOUT_FLOW_MS) });
  } catch (e) {
    registrar("passageiros_flow", { link: c.id, op: corpo.op, status: 502, causa: e?.name ?? "erro" });
    return { status: 502 };
  }
  if (r.status !== 200) registrar("passageiros_flow", { link: c.id, op: corpo.op, status: r.status });
  if (!STATUS_REPASSADOS.has(r.status)) return { status: 502 };
  if (r.status !== 200) return { status: r.status };
  try { return { status: 200, dados: await r.json() }; } catch { return { status: 502 }; }
}

// Base64 que passou no regex mas não decodifica (comprimento ou "=" fora do fim) vira null em vez de estourar.
const bytesDeBase64 = (b64) => { try { return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)); } catch { return null; } };

const lerJson = async (env, chave) => { try { return JSON.parse((await env.TRACK_KV.get(chave)) || "null"); } catch { return null; } };

// KV só é gravado quando o valor muda (cota diária de escritas).
async function gravarSeMudou(env, chave, doc, c) {
  const texto = JSON.stringify(doc);
  if ((await env.TRACK_KV.get(chave)) === texto) return;
  await env.TRACK_KV.put(chave, texto, c.ttl);
}

const ultimaAtualizacao = new Map(); // id → ms (por isolate): limita as idas ao flow nas leituras com cache

// Lê do flow e atualiza `pax:<id>`: 200 grava a lista; 410 mantém a última lista marcada como encerrada.
async function atualizarLista(env, c, fetcher) {
  ultimaAtualizacao.set(c.id, Date.now());
  if (ultimaAtualizacao.size > 300) ultimaAtualizacao.clear();
  const r = await chamarFlow(c, { op: "ler" }, fetcher);
  const antigo = await lerJson(env, `pax:${c.id}`);
  if (r.status === 200) {
    const doc = limparLer(r.dados);
    if (!doc) return { status: 502 };
    await gravarSeMudou(env, `pax:${c.id}`, doc, c);
    return { status: 200, doc };
  }
  if (r.status === 410) {
    const doc = { passageiros: antigo?.passageiros ?? [], fechado: "expirado" };
    await gravarSeMudou(env, `pax:${c.id}`, doc, c);
    return { status: 200, doc };
  }
  return { status: r.status };
}

// Trabalho depois da resposta: no Worker vai para o waitUntil; nos testes (sem ctx) roda antes de responder.
const depois = async (ctx, tarefa) => { if (ctx?.waitUntil) ctx.waitUntil(tarefa().catch(() => {})); else await tarefa().catch(() => {}); };

const publicar = (doc, concluido) => {
  const motivo = concluido ? "concluido" : doc.fechado ?? null;
  return json(200, { aberto: motivo === null, motivo, passageiros: doc.passageiros });
};

// ---- GET /r/<id>/passageiros ----

async function listar(env, c, ctx, fetcher) {
  const concluido = await servicoConcluido(env, c.id, c.t);
  const salvo = await lerJson(env, `pax:${c.id}`);
  if (salvo) {
    // A primeira abertura não espera o flow: serve o cache e o atualiza (no máx. a cada 30 s por isolate).
    const velho = Date.now() - (ultimaAtualizacao.get(c.id) ?? 0) > ATUALIZAR_A_CADA_MS;
    if (velho && !concluido && !salvo.fechado) await depois(ctx, () => atualizarLista(env, c, fetcher));
    return publicar(salvo, concluido);
  }
  const r = await atualizarLista(env, c, fetcher);
  return r.status === 200 ? publicar(r.doc, concluido) : erro(r.status === 500 ? 502 : r.status);
}

// ---- GET /r/<id>/passageiros/<guid>/foto ----

async function foto(env, c, guid, ctx, fetcher) {
  const chave = `paxfoto:${c.id}:${guid}`;
  let { value, metadata } = await env.TRACK_KV.getWithMetadata(chave, "arrayBuffer");
  if (!value) {
    const r = await chamarFlow(c, { op: "foto", passageiroId: guid }, fetcher);
    if (r.status === 404 || r.status === 410) return naoEncontrado();
    if (r.status !== 200) return erro(r.status === 500 ? 502 : r.status);
    const f = limparFoto(r.dados);
    if (!f) return naoEncontrado();
    value = bytesDeBase64(f.base64);
    if (!value) return naoEncontrado();
    metadata = { tipo: f.tipo };
    await depois(ctx, () => env.TRACK_KV.put(chave, value, { ...c.ttl, metadata }));
  }
  const tipo = TIPOS_FOTO.has(metadata?.tipo) ? metadata.tipo : "image/jpeg";
  return new Response(value, { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
}

// ---- POST /r/<id>/passageiros/<guid> ----

// Lê o corpo respeitando o limite, mesmo sem Content-Length confiável.
async function lerCorpo(request) {
  if (Number(request.headers.get("Content-Length") || 0) > LIMITE_CORPO) return { grande: true };
  const buf = await request.arrayBuffer();
  if (buf.byteLength > LIMITE_CORPO) return { grande: true };
  try { return { dados: JSON.parse(new TextDecoder().decode(buf)) }; } catch { return { dados: null }; }
}

async function dentroDoLimite(request, env, id) {
  if (typeof env.RATE_LIMITER?.limit !== "function") return true; // sem binding: não bloqueia
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  try { return (await env.RATE_LIMITER.limit({ key: `${ip}:${id}` })).success; } catch { return true; }
}

async function salvar(request, env, c, guid, ctx, fetcher) {
  if (await servicoConcluido(env, c.id, c.t)) return json(409, { erro: "concluido" });
  if (!(await dentroDoLimite(request, env, c.id))) return erro(429);
  const { grande, dados } = await lerCorpo(request);
  if (grande) return json(413, { erro: "grande" });
  const p = payloadSalvar(dados, guid);
  if (!p) return erro(400);

  const r = await chamarFlow(c, { op: "salvar", ...p }, fetcher);
  if (r.status !== 200) return erro(r.status);

  // Miniatura nova já vai para o cache da foto, sem passar pelo flow.
  if (p.fotoBase64) {
    // O flow já gravou: base64 que não decodifica só deixa de ir para o cache (a foto é lida do flow depois).
    const bytes = bytesDeBase64(p.miniaturaBase64 || p.fotoBase64);
    if (bytes) await depois(ctx, () => env.TRACK_KV.put(`paxfoto:${c.id}:${p.passageiroId}`, bytes, { ...c.ttl, metadata: { tipo: "image/jpeg" } }));
    else await env.TRACK_KV.delete(`paxfoto:${c.id}:${p.passageiroId}`).catch(() => {});
  }
  // Lista guardada ficou velha: relê do flow (já mascarada por ele). Se falhar, apaga o cache e devolve só o que foi enviado.
  const nova = await atualizarLista(env, c, fetcher).catch(() => ({ status: 502 }));
  const achado = nova.status === 200 ? nova.doc.passageiros.find((x) => x.id === p.passageiroId) : null;
  if (achado) return json(200, { ok: true, passageiro: achado });
  await env.TRACK_KV.delete(`pax:${c.id}`).catch(() => {});
  return json(200, { ok: true, passageiro: {
    id: p.passageiroId,
    ...(p.fotoBase64 ? { temFoto: true } : {}),
    ...(p.telefone ? { temTelefone: true, telefoneMascarado: telefoneOculto(p.telefone) } : {}),
    ...(p.email ? { temEmail: true, emailMascarado: emailOculto(p.email) } : {}),
  } });
}

/**
 * Rotas de passageiros. `m` = resultado de ROTA_PASSAGEIROS. 404 quando o link não tem cadastro (a página esconde a seção).
 * `fetcher` é injetável nos testes.
 */
export async function rotaPassageiros(request, env, url, m, ctx, fetcher = globalThis.fetch) {
  const [, id, guid, ehFoto] = m;
  const metodo = request.method;
  if (!(metodo === "GET" || (metodo === "POST" && guid && !ehFoto))) return new Response("Método não permitido", { status: 405 });
  if (metodo === "POST" && request.headers.get("Origin") !== url.origin) return erro(403);
  const c = await carregar(env, id);
  if (!c) return naoEncontrado();
  if (metodo === "POST") return salvar(request, env, c, guid.toLowerCase(), ctx, fetcher);
  if (!guid) return listar(env, c, ctx, fetcher);
  return ehFoto ? foto(env, c, guid.toLowerCase(), ctx, fetcher) : new Response("Não encontrado", { status: 404 });
}
