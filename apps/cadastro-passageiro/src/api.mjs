// Lógica do /api: validação, hash do token e repasse ao flow. Importável nos testes.
import { emailValido, telefoneValido } from "../public/validacao.mjs";

export const LIMITE_CORPO = 4 * 1024 * 1024; // 4 MB
const STATUS_REPASSADOS = new Set([200, 400, 404, 410, 429, 500]);
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes em base64url sem padding

export function tokenValido(token) {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export async function sha256Hex(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function json(status, corpo, extras = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extras },
  });
}

const erro = (status, codigo) => json(status, { erro: codigo });

// `wrangler dev` reescreve a URL para o domínio da rota; por isso o script `dev` passa MODO_LOCAL=1.
function ehLocal(url, env) {
  return env.MODO_LOCAL === "1" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

// Lê o corpo respeitando o limite, mesmo sem Content-Length confiável.
async function lerCorpo(request) {
  const declarado = Number(request.headers.get("Content-Length") || 0);
  if (declarado > LIMITE_CORPO) return { grande: true };
  const buf = await request.arrayBuffer();
  if (buf.byteLength > LIMITE_CORPO) return { grande: true };
  try {
    return { dados: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { dados: null };
  }
}

async function limiteTaxa(request, env) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") return true; // sem binding: não bloqueia
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  try {
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    return success;
  } catch {
    return true;
  }
}

// JPEG 96×96 (silhueta) só para o modo local mostrar a foto atual.
const FOTO_MOCK = "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";

function mockResposta(op, corpo) {
  if (op === "ler") {
    return json(200, {
      dataServico: new Date(Date.now() + 86400000).toISOString(),
      passageiros: [
        { id: "00000000-0000-0000-0000-000000000001", primeiroNome: "Mariana", temFoto: true, foto: { mimeType: "image/jpeg", base64: FOTO_MOCK } },
        { id: "00000000-0000-0000-0000-000000000002", primeiroNome: "Carlos", temFoto: false },
      ],
    });
  }
  return json(200, { ok: true, passageiroId: corpo.passageiroId });
}

// Monta o payload de "salvar" só com campos válidos e preenchidos. Retorna null se inválido.
export function payloadSalvar(corpo) {
  const { passageiroId, fotoBase64, telefone, email } = corpo;
  if (typeof passageiroId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(passageiroId)) return null;
  const p = { passageiroId };
  if (fotoBase64 != null && fotoBase64 !== "") {
    if (typeof fotoBase64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(fotoBase64)) return null;
    p.fotoBase64 = fotoBase64;
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

export async function tratarApi(request, env, url, fetcher = fetch) {
  if (request.method !== "POST") return erro(405, "metodo");
  const origem = request.headers.get("Origin");
  const local = ehLocal(url, env);
  if (origem && origem !== url.origin && !local) return erro(403, "origem");
  if (!(await limiteTaxa(request, env))) return erro(429, "limite");

  const op = url.pathname === "/api/ler" ? "ler" : url.pathname === "/api/salvar" ? "salvar" : null;
  if (!op) return erro(404, "rota");

  const { grande, dados } = await lerCorpo(request);
  if (grande) return erro(413, "grande");
  if (!dados || typeof dados !== "object" || !tokenValido(dados.token)) return erro(400, "invalido");

  let extra = {};
  if (op === "salvar") {
    extra = payloadSalvar(dados);
    if (!extra) return erro(400, "invalido");
  }

  if (!env.FLOW_URL) return local ? mockResposta(op, dados) : erro(500, "config");

  const hash = await sha256Hex(dados.token);
  let resp;
  try {
    resp = await fetcher(env.FLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, hash, ...extra }),
    });
  } catch {
    return erro(500, "falha");
  }
  if (!STATUS_REPASSADOS.has(resp.status)) return erro(500, "falha");
  // Erros viram código genérico: detalhes internos do flow nunca chegam ao navegador.
  if (resp.status !== 200) return erro(resp.status, CODIGOS[resp.status]);
  try {
    return json(200, await resp.json());
  } catch {
    return erro(500, "falha");
  }
}

const CODIGOS = { 400: "invalido", 404: "nao-encontrado", 410: "expirado", 429: "limite", 500: "falha" };
