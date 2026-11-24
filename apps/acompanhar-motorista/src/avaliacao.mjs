// Avaliação do serviço pelo passageiro: só depois de concluído, uma por link.
// Grava `avaliacao:<id>` no KV (30 dias) e envia ao Flow do Dataverse; o que falhar o cron reenvia.
import { faseDasEtapas } from "./etapas.mjs";
import { chamarFerramenta, USO } from "./normalizar.mjs";

const MODELO = "claude-haiku-5-5";
const TTL_AVALIACAO = 30 * 86400;
const LIMITE_POR_HORA = 5;
const MAX_COMENTARIO = 1000;
const MAX_TENTATIVAS = 5;
const POR_EXECUCAO = 20;
const TIMEOUT_IA_MS = 8000;
const TIMEOUT_FLOW_MS = 10000;
const CLASSES = ["elogio", "sugestao", "reclamacao"];

export function validarAvaliacao(body) {
  const nota = body?.nota;
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) return { erro: "nota deve ser um inteiro de 1 a 5" };
  const c = body.comentario;
  if (c != null && typeof c !== "string") return { erro: "comentário inválido" };
  const comentario = c?.trim() || null;
  if (comentario && comentario.length > MAX_COMENTARIO) return { erro: `comentário acima de ${MAX_COMENTARIO} caracteres` };
  return { dados: { nota, comentario } };
}

export const regraReserva = (nota) => (nota >= 4 ? "elogio" : nota <= 2 ? "reclamacao" : "sugestao");

const PROMPT = `Você classifica a avaliação que um passageiro deixou depois de um serviço de transporte executivo.
Considere a nota (1 a 5) junto com o comentário:
- "elogio": o passageiro só aprova o serviço.
- "sugestao": aprova ou é neutro, mas propõe uma melhoria (ex.: nota 5 com "poderia ter água no carro").
- "reclamacao": relata um problema ou insatisfação (ex.: nota 2 com "o motorista atrasou").
"resumo": uma frase curta (até 120 caracteres) em português, sem nome de pessoa nem telefone.`;
const FERRAMENTA = {
  name: "avaliacao",
  description: "Classificação da avaliação do serviço.",
  input_schema: { type: "object", required: ["classificacao", "resumo"], properties: { classificacao: { enum: CLASSES }, resumo: { type: "string" } } },
};
const valida = (r) => CLASSES.includes(r?.classificacao) && typeof r.resumo === "string" && r.resumo.trim() !== "";

/** { classificacao, resumo, ia }: a IA classifica o comentário; qualquer falha cai na regra pela nota. */
export async function classificarAvaliacao({ nota, comentario }, { chave, fetch = globalThis.fetch, timeoutMs = TIMEOUT_IA_MS, agora = Date.now } = {}) {
  if (!comentario) return { classificacao: "sem_comentario", resumo: null, ia: null };
  const inicio = +agora();
  const ia = { ok: false, motivo: null, ms: 0, ...Object.fromEntries(USO.map((k) => [k, 0])) };
  let r = { motivo: "sem_chave" };
  if (chave) {
    const corpo = JSON.stringify({
      model: MODELO, max_tokens: 256, system: PROMPT, tools: [FERRAMENTA], tool_choice: { type: "tool", name: "avaliacao" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: `Nota: ${nota} de 5\nComentário: ${JSON.stringify(comentario)}` }],
    });
    r = await chamarFerramenta(corpo, { chave, fetch, timeoutMs, validar: valida });
  }
  for (const k of USO) ia[k] = Number(r.usage?.[k]) || 0;
  ia.ok = Boolean(r.input);
  ia.motivo = r.input ? null : r.motivo;
  ia.ms = +agora() - inicio;
  console.log(JSON.stringify({ evento: "ia_avaliacao", ...ia }));
  if (r.input) return { classificacao: r.input.classificacao, resumo: r.input.resumo.trim().slice(0, 200), ia };
  return { classificacao: regraReserva(nota), resumo: null, ia };
}

/** Concluído pelo Dataverse (flag ou chave `concluido:<id>`) ou pelo GPS (etapas todas feitas / estado.concluidoEm). */
export async function servicoConcluido(env, id, t) {
  if (t.concluidoPor === "dataverse" || await env.TRACK_KV.get(`concluido:${id}`)) return true;
  if (t.modo === "completo" && t.etapas?.length) return faseDasEtapas(t.etapas, false).fase === "concluido";
  return Boolean(t.estado?.concluidoEm);
}

// Janela fixa de 1 h a partir do primeiro POST: o TTL encolhe a cada escrita, não renova.
async function estourouLimite(env, id, agora) {
  const k = `limite-avaliacao:${id}`;
  let c = null;
  try { c = JSON.parse(await env.TRACK_KV.get(k)); } catch { /* recomeça */ }
  if (!c || agora - c.inicio >= 3600e3) c = { n: 0, inicio: agora };
  if (c.n >= LIMITE_POR_HORA) return true;
  c.n++;
  await env.TRACK_KV.put(k, JSON.stringify(c), { expirationTtl: Math.max(60, Math.round((c.inicio + 3600e3 - agora) / 1000)) });
  return false;
}

async function gravar(env, id, reg) {
  const restante = Math.round((Date.parse(reg.avaliadoEm) + TTL_AVALIACAO * 1000 - Date.now()) / 1000);
  const pendente = !reg.envio.ok && reg.envio.tentativas < MAX_TENTATIVAS;
  await env.TRACK_KV.put(`avaliacao:${id}`, JSON.stringify(reg), { expirationTtl: Math.min(TTL_AVALIACAO, Math.max(60, restante)), metadata: { pendente } });
}

/** Uma tentativa de envio ao Flow; atualiza `reg.envio` e grava. Sem a URL não gasta tentativa. Nunca loga a URL. */
async function enviar(env, id, reg, fetch) {
  const url = env.AVALIACAO_FLOW_URL;
  if (!url) { reg.envio.ultimoErro = "sem_url"; await gravar(env, id, reg); return false; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_FLOW_MS);
  let erro = null;
  try {
    const res = await fetch(url, {
      method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({ linkId: id, titulo: reg.titulo ?? null, nota: reg.nota, comentario: reg.comentario, classificacao: reg.classificacao, avaliadoEm: reg.avaliadoEm }),
    });
    if (!res.ok) erro = `http_${res.status}`;
  } catch { erro = ctrl.signal.aborted ? "timeout" : "rede"; } finally { clearTimeout(timer); }
  reg.envio.tentativas++;
  reg.envio.ultimoErro = erro;
  if (!erro) { reg.envio.ok = true; reg.envio.enviadoEm = new Date().toISOString(); }
  console.log(JSON.stringify({ evento: "avaliacao_envio", ok: !erro, tentativas: reg.envio.tentativas, erro }));
  await gravar(env, id, reg);
  return !erro;
}

/** POST /r/<id>/avaliacao. O envio ao Flow vai em `ctx.waitUntil`: o 200 sai assim que o KV grava. */
export async function postAvaliacao(request, env, ctx, id, { fetch = globalThis.fetch } = {}) {
  const raw = await env.TRACK_KV.get(`track:${id}`);
  let t = null;
  try { t = raw && JSON.parse(raw); } catch { /* trata como inexistente */ }
  if (!t) return Response.json({ erro: "link não encontrado" }, { status: 404 });
  if (await estourouLimite(env, id, Date.now())) return Response.json({ erro: "muitas tentativas, tente mais tarde" }, { status: 429 });
  const { dados, erro } = validarAvaliacao(await request.json().catch(() => null));
  if (erro) return Response.json({ erro }, { status: 400 });
  if (!(await servicoConcluido(env, id, t))) return Response.json({ erro: "serviço ainda não concluído" }, { status: 409 });
  if (await env.TRACK_KV.get(`avaliacao:${id}`)) return Response.json({ jaAvaliado: true }, { status: 409 });
  const c = await classificarAvaliacao(dados, { chave: env.ANTHROPIC_API_KEY_ACOMPANHAMENTO, fetch });
  // A IA leva até 8 s: confere de novo antes de gravar, para uma segunda aba não sobrescrever a primeira.
  if (await env.TRACK_KV.get(`avaliacao:${id}`)) return Response.json({ jaAvaliado: true }, { status: 409 });
  const reg = { ...dados, ...c, titulo: t.titulo ?? null, avaliadoEm: new Date().toISOString(), envio: { ok: false, tentativas: 0, ultimoErro: null, enviadoEm: null } };
  await gravar(env, id, reg);
  const envio = enviar(env, id, reg, fetch).catch((e) => console.error(`Envio da avaliação falhou: ${e?.message}`));
  if (ctx?.waitUntil) ctx.waitUntil(envio);
  return Response.json({ ok: true });
}

export async function jaAvaliado(env, id) {
  return Boolean(await env.TRACK_KV.get(`avaliacao:${id}`));
}

/** Cron: reenvia até 20 avaliações pendentes por execução (marcadas na metadata da chave). */
export async function reenviarPendentes(env, { fetch = globalThis.fetch } = {}) {
  const r = { tentadas: 0, enviadas: 0 };
  if (!env.AVALIACAO_FLOW_URL) return r;
  let cursor;
  do {
    const pagina = await env.TRACK_KV.list({ prefix: "avaliacao:", cursor });
    for (const { name, metadata } of pagina.keys) {
      if (r.tentadas >= POR_EXECUCAO) return r;
      if (!metadata?.pendente) continue;
      let reg;
      try { reg = JSON.parse(await env.TRACK_KV.get(name)); } catch { continue; }
      if (!reg || reg.envio?.ok || reg.envio?.tentativas >= MAX_TENTATIVAS) continue;
      r.tentadas++;
      if (await enviar(env, name.slice("avaliacao:".length), reg, fetch)) r.enviadas++;
    }
    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
  return r;
}
