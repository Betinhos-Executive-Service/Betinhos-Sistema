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

function mockResposta(op, corpo) {
  if (op === "ler") {
    return json(200, {
      dataServico: new Date(Date.now() + 86400000).toISOString(),
      passageiros: [
        { id: "00000000-0000-0000-0000-000000000001", primeiroNome: "Mariana", temFoto: true },
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
