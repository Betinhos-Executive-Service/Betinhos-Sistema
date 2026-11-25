// Criação de link de acompanhamento pela Operacional (via Custom API do Dataverse).
import { distanciaMetros, gqlInfleet } from "./infleet.mjs";
import { geocodificarCampos, interpretarEndereco, lugarConhecido, provedoresPadrao, provedorNominatim, rotuloDe, rotuloSeguro, espacado } from "./geocodificar.mjs";
import { montarConsulta, normalizarEnderecos } from "./normalizar.mjs";
import { avaliarTrajeto } from "./confianca.mjs";
import { terminalDoTexto } from "./chegada.mjs";

const FOTO_MAX = 400 * 1024;
// Tira o prefixo data:...;base64, valida e decodifica uma vez. Devolve { bytes, tipo } ou null se inválida.
function decodificarFoto(v) {
  const m = String(v).match(/^data:([^;,]+)?;base64,/i);
  const b64 = (m ? String(v).slice(m[0].length) : String(v)).trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 === 1) return null;
  const tipo = (m?.[1] || "image/jpeg").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(tipo)) return null;
  try { return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), tipo }; } catch { return null; }
}

const norm = (s) => String(s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

export function autorizado(request, segredo) {
  if (!segredo) return false;
  const recebido = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (recebido.length !== segredo.length) return false;
  let diff = 0;
  for (let i = 0; i < segredo.length; i++) diff |= recebido.charCodeAt(i) ^ segredo.charCodeAt(i);
  return diff === 0;
}

export function validarPedido(body) {
  // Sem placa (motorista em definição ou sem carro atual) ou com `rastreio: false` (terceiro, carro sem Infleet),
  // o link nasce sem veículo da Infleet: sem mapa nem ETA. Plugin antigo não manda `rastreio` e sempre tem placa.
  const placa = norm(body?.placa) || null;
  if (body?.rastreio === true && !placa) return { erro: "placa obrigatória para rastreio" };
  const rastreio = body?.rastreio !== false;
  const embarque = String(body?.embarque ?? "").trim();
  if (!embarque) return { erro: "embarque obrigatório" };
  let horarioAgendado = null;
  if (body.horarioAgendado) {
    const d = new Date(body.horarioAgendado);
    if (isNaN(d)) return { erro: "horarioAgendado inválido" };
    horarioAgendado = d.toISOString();
  }
  const horas = Number(body.validadeHoras);
  const validadeHoras = Math.min(336, Math.max(0.5, Number.isFinite(horas) ? horas : 4));
  // Credencial de cadastro (hash do token do link de cadastro): só do servidor, nunca vai a /dados nem à página.
  let cadastro = null;
  if (body.cadastro != null) {
    const { hash, ambiente } = body.cadastro;
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash) || !["dev", "prod"].includes(ambiente)) return { erro: "cadastro inválido" };
    cadastro = { hash, ambiente };
  }
  const texto = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
  const paradas = Array.isArray(body.paradas) ? body.paradas.map(texto).filter(Boolean).slice(0, 8) : [];
  const fotos = [];
  const foto = (v) => {
    if (typeof v !== "string" || !v) return null;
    const f = decodificarFoto(v);
    fotos.push(f);
    return f;
  };
  const motorista = body.motorista ? { nome: texto(body.motorista.nome), telefone: texto(body.motorista.telefone), foto: foto(body.motorista.fotoBase64) } : null;
  const veiculo = { foto: foto(body.veiculo?.fotoBase64) };
  if (fotos.some((f) => !f)) return { erro: "foto inválida" };
  if (fotos.some((f) => f.bytes.length > FOTO_MAX)) return { erro: "foto acima de 400 KB" };
  return { dados: { placa, rastreio, embarque, destinoFinal: texto(body.destinoFinal), paradas, observacoes: texto(body.observacoes), trajeto: texto(body.trajeto), motorista, veiculo, horarioAgendado, titulo: texto(body.titulo), tipoServico: texto(body.tipoServico), corVeiculo: texto(body.corVeiculo), modeloVeiculo: texto(body.modeloVeiculo), marcaVeiculo: texto(body.marcaVeiculo), validadeHoras, cadastro } };
}

export { candidatosEndereco, cidadeDoTexto, lugaresConhecidos } from "./geocodificar.mjs";

const comoProvedor = (geocode) => Object.assign(async (q) => { const r = await geocode(q); return r ? [r] : []; }, { nome: geocode.nome ?? null });

/** Geocodifica o texto bruto (links antigos e reenvio): { lat, lon, area, label } com rótulo limpo, ou null. */
export async function geocodeTolerante(texto, geocode, padrao = "Saída") {
  const campos = interpretarEndereco(texto);
  const r = await geocodificarCampos(campos, [comoProvedor(geocode)]);
  if (!r) return null;
  const { fonte, ...ponto } = r;
  return { ...ponto, label: rotuloDe(campos) ?? padrao };
}

/** Melhor resultado específico do Nominatim (usado pelo Worker para completar a área de links antigos). */
export async function geocodeNominatim(endereco) {
  const hit = (await provedorNominatim()(endereco)).find((h) => !h.generico);
  if (!hit) throw new Error(`Endereço não encontrado: ${endereco}`);
  return { lat: hit.lat, lon: hit.lon, label: endereco, area: hit.area, cidade: hit.cidade };
}

export function acharVeiculoInfleet(token, endpoint) {
  return async (placa) => {
    const d = await gqlInfleet(token, "query($f: ListVehiclesFilterInput){ listVehicles(filter:$f, limit:5){ id plate } }", { f: { plateOrDisplayName: placa } }, endpoint);
    const v = d.listVehicles.find((x) => norm(x.plate) === norm(placa));
    if (!v) throw new Error(`Veículo ${placa} não encontrado na Infleet`);
    return v;
  };
}

// Orçamento total de geocodificação por criação (a Custom API do Dataverse espera a resposta).
const ORCAMENTO_GEO_MS = 45000;
// A IA conta dentro do orçamento; a nova tentativa dela só sai se ainda sobrar esta folga para geocodificar.
const RESERVA_GEO_MS = 15000;
const TIMEOUT_IA_MS = 12000;
const USO_IA = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
const camposDaIa = (e) => ({ local: e.local, logradouro: e.logradouro, cidade: e.cidade, uf: e.uf, bairro: null, termo: null, lugar: lugarConhecido(e.local ?? e.logradouro) });
const mesmasEtapas = (a, b) => Array.isArray(b) && b.length === a.length && b.every((e, i) => e.tipo === a[i].tipo);
const padraoEtapa = (tipo, i) => (tipo === "saida" ? "Saída" : tipo === "destino" ? "Destino" : `Parada ${i}`);

// Campos de cada etapa: da IA quando ela respondeu; senão da limpeza determinística do texto bruto.
// O rótulo público nunca é o texto bruto: vem da IA/limpeza, ou "Saída", "Parada N", "Destino".
async function etapasDoPedido(dados, deps) {
  const agora = deps.agora ?? (() => new Date());
  const prazo = +agora() + ORCAMENTO_GEO_MS;
  const contexto = { titulo: dados.titulo, horarioAgendado: dados.horarioAgendado, tipoServico: dados.tipoServico };
  const r = await (deps.normalizar ?? (async () => null))({ saida: dados.embarque, paradas: dados.paradas, destino: dados.destinoFinal, observacoes: dados.observacoes, trajeto: dados.trajeto },
    { contexto, prazo: prazo - RESERVA_GEO_MS, agora });
  const ia = r?.ia ?? null;
  const n = r?.etapas ? r : null;
  const textos = [["saida", dados.embarque], ...dados.paradas.map((p) => ["parada", p]), ...(dados.destinoFinal ? [["destino", dados.destinoFinal]] : [])];
  const brutas = n?.etapas
    // A IA já separou o estabelecimento: o local dela vale como rótulo mesmo sem palavra de lugar.
    ? n.etapas.map((e) => ({ tipo: e.tipo, campos: camposDaIa(e), rotulo: e.local && e.rotulo === e.local ? e.local : rotuloSeguro(e.rotulo, null) }))
    : textos.map(([tipo, t]) => { const campos = interpretarEndereco(t); return { tipo, campos, rotulo: rotuloDe(campos) }; });
  let paradas = 0;
  for (const e of brutas) e.rotulo ||= padraoEtapa(e.tipo, e.tipo === "parada" ? ++paradas : 0);
  // Texto para achar o terminal (o bruto não é guardado): rótulo, consulta montada e, com a mesma contagem, o texto original.
  const textoChegada = (i) => [brutas[i].rotulo, montarConsulta(brutas[i].campos), brutas.length === textos.length ? textos[i][1] : null].filter(Boolean).join(" ");
  const comChegada = (g, i) => { const c = terminalDoTexto(textoChegada(i), g); return c ? { ...g, chegada: c } : g; };
  const provedores = deps.provedores ?? [espacado(comoProvedor(deps.geocode), deps)];
  const geo = [];
  let vizinho = null;
  for (const [i, e] of brutas.entries()) {
    const r = await geocodificarCampos(e.campos, provedores, { vizinho, prazo, agora });
    // rotuloLimpo: o /dados não precisa limpar de novo (só links antigos, sem a marca, passam pela limpeza).
    geo.push(r ? comChegada({ ...r, tipo: e.tipo, rotulo: e.rotulo, label: e.rotulo, rotuloLimpo: true }, i) : null);
    if (r) vizinho = r;
  }
  let confianca = n ? n.confianca : null;
  // Reanálise (uma, effort high): confiança baixa ou etapa sem geocode, só se a chamada e a nova geocodificação couberem no orçamento.
  const falhas = n ? brutas.flatMap((e, i) => (geo[i] ? [] : [{ i, tipo: e.tipo, rotulo: e.rotulo, consulta: montarConsulta(e.campos) }])) : [];
  if (n && ia && (confianca === "baixa" || falhas.length) && +agora() + TIMEOUT_IA_MS + RESERVA_GEO_MS <= prazo) {
    const r2 = await deps.normalizar({ saida: dados.embarque, paradas: dados.paradas, destino: dados.destinoFinal, observacoes: dados.observacoes, trajeto: dados.trajeto },
      { contexto, prazo: prazo - RESERVA_GEO_MS, agora, effort: "high", maxTentativas: 1, falhas: falhas.map(({ i, ...f }) => f) });
    const i2 = r2?.ia ?? {};
    let melhorou = false;
    if (r2?.etapas && mesmasEtapas(brutas, r2.etapas)) {
      confianca = r2.confianca;
      for (const { i } of falhas) {
        const vizinhoAntes = geo.slice(0, i).findLast(Boolean) ?? null;
        const g = await geocodificarCampos(camposDaIa(r2.etapas[i]), provedores, { vizinho: vizinhoAntes, prazo, agora });
        if (g) { geo[i] = comChegada({ ...g, tipo: brutas[i].tipo, rotulo: brutas[i].rotulo, label: brutas[i].rotulo, rotuloLimpo: true }, i); melhorou = true; }
      }
    }
    ia.reanalise = { ok: Boolean(i2.ok && r2?.etapas), motivo: i2.motivo ?? null, ms: i2.ms ?? 0, ...Object.fromEntries(USO_IA.map((k) => [k, i2[k] ?? 0])), melhorou };
  }
  const avaliado = avaliarTrajeto(geo, brutas.map((e) => e.rotulo));
  const { modo } = avaliado;
  const motivo = modo === "simples" && geo.some((g) => !g) && +agora() >= prazo ? "tempo esgotado" : avaliado.motivo;
  return { etapas: geo.filter(Boolean), modo, motivoSimples: motivo, confianca, ia };
}

const doB64 = (f) => (f?.fotoBase64 ? decodificarFoto(f.fotoBase64) : null);
const fotosDoPedido = (dados) => ({ motorista: dados.motorista?.foto ?? doB64(dados.motorista), veiculo: dados.veiculo?.foto ?? doB64(dados.veiculo) });

async function gravarFotos(env, id, fotos, ttl) {
  for (const [qual, f] of Object.entries(fotos)) {
    if (f) await env.TRACK_KV.put(`foto:${id}:${qual}`, f.bytes, { ...ttl, metadata: { tipo: f.tipo } });
  }
}

// Campos do link que vêm do pedido (criação e atualização usam o mesmo formato).
function camposDoPedido(veiculo, dados, calculo, fotos) {
  const { etapas, modo, motivoSimples, confianca, ia } = calculo;
  return {
    vehicleId: veiculo.id, placa: veiculo.plate,
    destino: etapas.find((e) => e.tipo === "saida") ?? null, destinoFinal: etapas.findLast((e) => e.tipo === "destino") ?? null,
    embarque: dados.embarque, titulo: dados.titulo,
    horarioAgendado: dados.horarioAgendado, corVeiculo: dados.corVeiculo, modeloVeiculo: dados.modeloVeiculo, marcaVeiculo: dados.marcaVeiculo,
    // Modo simples guarda as etapas achadas e o motivo (diagnóstico); a página continua sem etapas.
    etapas, modo, motivoSimples, confianca,
    ...(ia ? { ia } : {}), // uso da IA (diagnóstico interno); o /dados não o publica
    motorista: dados.motorista ? { nome: dados.motorista.nome, telefone: dados.motorista.telefone, temFoto: Boolean(fotos.motorista) } : null,
    veiculoTemFoto: Boolean(fotos.veiculo),
  };
}

const comRastreio = (dados) => Boolean(dados.placa) && dados.rastreio !== false;
const veiculoDoPedido = (dados, deps) => (comRastreio(dados) ? deps.acharVeiculo(dados.placa) : { id: null, plate: dados.placa ?? null });

const camposCadastro = (dados) => (dados.cadastro ? { cadastroHash: dados.cadastro.hash, cadastroAmbiente: dados.cadastro.ambiente } : {});

export async function criarLink(env, origem, dados, deps) {
  const veiculo = await veiculoDoPedido(dados, deps);
  const calculo = await etapasDoPedido(dados, deps);
  const id = deps.novoId();
  const expiraEm = new Date(deps.agora().getTime() + dados.validadeHoras * 3600e3).toISOString();
  const ttl = { expirationTtl: Math.round(dados.validadeHoras * 3600) };
  const fotos = fotosDoPedido(dados);
  await gravarFotos(env, id, fotos, ttl);
  await env.TRACK_KV.put(`track:${id}`, JSON.stringify({ ...camposDoPedido(veiculo, dados, calculo, fotos), ...camposCadastro(dados), expiraEm, criadoPor: "operacional" }), ttl);
  return { link: `${origem}/r/${id}`, expiraEm };
}

const MESMO_PONTO_M = 150;
const PROGRESSO = ["chegouEm", "saiuEm", "chegandoEm", "pulada", "dentroDesde"];
const perto = (a, b) => Boolean(a && b) && distanciaMetros(a.lat, a.lon, b.lat, b.lon) < MESMO_PONTO_M;

/**
 * Reserva editada no Dataverse: recalcula as etapas do mesmo link (mesmo id, mesma validade).
 * Etapa que continua no mesmo lugar mantém o progresso (chegou/saiu); saída nova zera os marcos do serviço.
 * Devolve { atualizado } | { concluido } | null (link inexistente ou expirado).
 */
export async function atualizarLink(env, id, dados, deps) {
  const raw = await env.TRACK_KV.get(`track:${id}`);
  if (!raw) return null;
  const t = JSON.parse(raw);
  if (t.concluidoPor === "dataverse" || await env.TRACK_KV.get(`concluido:${id}`)) return { concluido: true };
  const restoS = Math.round((new Date(t.expiraEm).getTime() - deps.agora().getTime()) / 1000);
  if (!(restoS >= 60)) return null;
  const veiculo = comRastreio(dados) && t.vehicleId && norm(dados.placa) === norm(t.placa) ? { id: t.vehicleId, plate: t.placa } : await veiculoDoPedido(dados, deps);
  const calculo = await etapasDoPedido(dados, deps);
  const antigas = Array.isArray(t.etapas) ? t.etapas : [];
  calculo.etapas = calculo.etapas.map((e, i) => {
    const g = antigas[i];
    if (!g || g.tipo !== e.tipo || !perto(g, e)) return e;
    return { ...e, ...Object.fromEntries(PROGRESSO.filter((k) => g[k] != null).map((k) => [k, g[k]])) };
  });
  const ttl = { expirationTtl: restoS };
  const fotos = fotosDoPedido(dados);
  await gravarFotos(env, id, fotos, ttl);
  const novo = camposDoPedido(veiculo, dados, calculo, fotos);
  // Foto não reenviada continua valendo para o mesmo motorista/veículo; trocou e veio sem foto, a antiga sai.
  const mesmoMotorista = Boolean(novo.motorista && t.motorista && novo.motorista.nome === t.motorista.nome);
  if (!fotos.motorista && t.motorista?.temFoto) {
    if (mesmoMotorista) novo.motorista.temFoto = true; else await env.TRACK_KV.delete(`foto:${id}:motorista`);
  }
  if (!fotos.veiculo && t.veiculoTemFoto) {
    if (novo.vehicleId === t.vehicleId && norm(novo.placa) === norm(t.placa)) novo.veiculoTemFoto = true; else await env.TRACK_KV.delete(`foto:${id}:veiculo`);
  }
  const mesmaSaida = perto(t.destino, novo.destino);
  // Credencial de cadastro trocada: a lista guardada (inclusive "encerrado") é da credencial antiga; a próxima leitura vai ao flow.
  if (dados.cadastro && dados.cadastro.hash !== t.cadastroHash) await env.TRACK_KV.delete(`pax:${id}`);
  await env.TRACK_KV.put(`track:${id}`, JSON.stringify({
    ...t, ...novo, ...camposCadastro(dados), // sem `cadastro` no corpo, o do link segue valendo
    estado: mesmaSaida && novo.vehicleId === t.vehicleId ? t.estado ?? {} : {},
    atualizadoEm: deps.agora().toISOString(),
  }), ttl);
  return { atualizado: true, mesmaSaida };
}

// Formato novo: 12 caracteres base62. Antigo (links ainda abertos): 64 hexadecimais minúsculos.
export const ID_LINK = /^(?:[0-9A-Za-z]{12}|[0-9a-f]{64})$/;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function novoIdLink() {
  let id = "";
  while (id.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && id.length < 12) id += BASE62[b % 62]; // 248 = 4 × 62: descarta o resto para não enviesar
    }
  }
  return id;
}

const REVOGADO_TTL_S = 24 * 3600;

// Revogado ≠ expirado para quem abre o link depois: a lápide `revogado:<id>` (24 h) faz a página explicar
// que o acompanhamento foi encerrado pela Betinhos, em vez de "Link expirado".
export async function revogarLink(request, env, id) {
  if (!autorizado(request, env.LINK_API_SECRET)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  if (!ID_LINK.test(id)) return Response.json({ erro: "id inválido" }, { status: 400 });
  await env.TRACK_KV.delete(`track:${id}`);
  // Passageiros do portal (lista mascarada e fotos em cache) não ficam no KV depois da revogação.
  try {
    const pax = JSON.parse((await env.TRACK_KV.get(`pax:${id}`)) || "null");
    for (const p of pax?.passageiros ?? []) await env.TRACK_KV.delete(`paxfoto:${id}:${p.id}`);
    await env.TRACK_KV.delete(`pax:${id}`);
  } catch { /* o que sobrar expira com o TTL */ }
  await env.TRACK_KV.put(`revogado:${id}`, "1", { expirationTtl: REVOGADO_TTL_S });
  return Response.json({ revogado: true });
}

export async function concluirLink(request, env, id, agora = new Date()) {
  if (!autorizado(request, env.LINK_API_SECRET)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  if (!ID_LINK.test(id)) return Response.json({ erro: "id inválido" }, { status: 400 });
  const raw = await env.TRACK_KV.get(`track:${id}`);
  if (!raw) return Response.json({ erro: "link não encontrado" }, { status: 404 });
  let t;
  try { t = JSON.parse(raw); } catch { return Response.json({ erro: "link não encontrado" }, { status: 404 }); }
  t.concluidoEm ??= agora.toISOString();
  t.concluidoPor = "dataverse";
  t.expiraEm = new Date(agora.getTime() + 7200e3).toISOString(); // leituras concorrentes do /dados recalculam o TTL daqui
  const ttl = { expirationTtl: 7200 };
  await env.TRACK_KV.put(`track:${id}`, JSON.stringify(t), ttl);
  await env.TRACK_KV.put(`concluido:${id}`, t.concluidoEm, ttl); // chave separada: o GPS não a regrava
  for (const qual of ["motorista", "veiculo"]) {
    const { value, metadata } = await env.TRACK_KV.getWithMetadata(`foto:${id}:${qual}`, "arrayBuffer");
    if (value) await env.TRACK_KV.put(`foto:${id}:${qual}`, value, { ...ttl, metadata });
  }
  return Response.json({ concluido: true });
}

const depsReais = (env) => ({
  provedores: provedoresPadrao(env),
  normalizar: (t, o) => normalizarEnderecos(t, { ...o, chave: env.ANTHROPIC_API_KEY_ACOMPANHAMENTO }),
  acharVeiculo: acharVeiculoInfleet(env.INFLEET_TOKEN, env.INFLEET_URL),
  agora: () => new Date(),
  novoId: novoIdLink
});

// PUT /api/links/:id com o mesmo corpo do POST: 200 atualizado, 409 já concluído, 404 inexistente/expirado.
async function atualizarPelaApi(request, env, id, deps = depsReais(env)) {
  if (!autorizado(request, env.LINK_API_SECRET)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  if (!ID_LINK.test(id)) return Response.json({ erro: "id inválido" }, { status: 400 });
  const { dados, erro } = validarPedido(await request.json().catch(() => null));
  if (erro) return Response.json({ erro }, { status: 400 });
  try {
    const r = await atualizarLink(env, id, dados, deps);
    if (!r) return Response.json({ erro: "link não encontrado" }, { status: 404 });
    if (r.concluido) return Response.json({ erro: "serviço já concluído" }, { status: 409 });
    return Response.json(r);
  } catch (e) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 200) }, { status: 502 });
  }
}

export async function rotaApiLinks(request, env, url) {
  const c = url.pathname.match(/^\/api\/links\/([^/]+)\/concluir$/);
  if (c) return request.method === "POST" ? concluirLink(request, env, c[1]) : new Response("Método não permitido", { status: 405 });
  const m = url.pathname.match(/^\/api\/links\/([^/]+)$/);
  if (m) {
    if (request.method === "PUT") return atualizarPelaApi(request, env, m[1]);
    if (request.method !== "DELETE") return new Response("Método não permitido", { status: 405 });
    return revogarLink(request, env, m[1]);
  }
  if (url.pathname !== "/api/links") return null;
  if (request.method !== "POST") return new Response("Método não permitido", { status: 405 });
  if (!autorizado(request, env.LINK_API_SECRET)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  const { dados, erro } = validarPedido(await request.json().catch(() => null));
  if (erro) return Response.json({ erro }, { status: 400 });
  try {
    return Response.json(await criarLink(env, url.origin, dados, depsReais(env)));
  } catch (e) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 200) }, { status: 502 });
  }
}
