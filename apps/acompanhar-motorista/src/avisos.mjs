// Avisos por web push nos marcos da viagem: validação da inscrição, eventos novos e textos (pt/en/es).
// Puro: o Viagem guarda as inscrições e o que já foi enviado; aqui só se decide e se monta.
import { AVISOS, CORES, IDIOMAS } from "./idiomas.mjs";
import { fromBase64Url, PUSH_HOSTS } from "./webpush.mjs";

export const MAX_INSCRICOES = 5;
const IDS = IDIOMAS.map((l) => l.id);
// Ordem da viagem: de vários eventos novos na mesma leitura, só o mais adiantado é enviado.
export const EVENTOS = ["chegando_embarque", "chegou_embarque", "viagem_iniciada", "chegando_destino", "concluido"];

const bytes = (b64) => { try { return fromBase64Url(String(b64)).length; } catch { return -1; } };

/** `{ inscricao }` pronta para guardar, ou `{ erro }`. */
export function validarInscricao(corpo) {
  const { endpoint, p256dh, auth, idioma } = corpo ?? {};
  let url = null;
  try { url = typeof endpoint === "string" && endpoint.length <= 1024 ? new URL(endpoint) : null; } catch { /* inválida */ }
  if (!url || url.protocol !== "https:" || !PUSH_HOSTS.test(url.hostname)) return { erro: "endpoint inválido" };
  if (typeof p256dh !== "string" || bytes(p256dh) !== 65) return { erro: "p256dh inválida" };
  if (typeof auth !== "string" || bytes(auth) !== 16) return { erro: "auth inválida" };
  return { inscricao: { endpoint, p256dh, auth, idioma: IDS.includes(idioma) ? idioma : "pt", em: Date.now() } };
}

/** Mesma `endpoint` substitui; acima de 5, sai a mais antiga. */
export function guardarInscricao(lista, nova) {
  return [...(lista ?? []).filter((i) => i.endpoint !== nova.endpoint), nova].slice(-MAX_INSCRICOES);
}

function gatilhos(d) {
  const etapas = d?.etapas ?? [], atual = etapas.find((e) => e.atual);
  const naUltima = !atual || atual === etapas.at(-1);
  return {
    chegando_embarque: d?.fase === "a_caminho" && Boolean(d.chegando),
    chegou_embarque: d?.fase === "no_local",
    viagem_iniciada: d?.fase === "em_viagem" || Boolean(d?.marcos?.saiuEmbarqueEm && d?.fase !== "concluido"),
    chegando_destino: d?.fase === "em_viagem" && Boolean(d.chegando) && naUltima,
    concluido: d?.fase === "concluido",
  };
}

/** Eventos cujo gatilho vale nesta leitura e ainda não constam em `enviados`, na ordem da viagem. */
export function eventosNovos(dados, enviados = {}) {
  const g = gatilhos(dados);
  return EVENTOS.filter((e) => g[e] && !enviados[e]);
}

function corNoIdioma(cor, idioma) {
  const s = String(cor ?? "").trim(), l = CORES[s.toLowerCase()];
  return idioma === "pt" || !l ? s : l[idioma === "en" ? 0 : 1];
}

const preencher = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "").replace(/\s+/g, " ").trim();

function horaPrevista(dados, idioma, agora) {
  const min = dados?.eta?.minutos;
  if (!Number.isFinite(min)) return null;
  const local = IDIOMAS.find((l) => l.id === idioma)?.local ?? "pt-BR";
  return new Intl.DateTimeFormat(local, { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(agora + min * 60000));
}

/** `{ titulo, corpo }` do evento no idioma da inscrição (pt quando não reconhecido). */
export function textoAviso(evento, dados, idioma = "pt", agora = Date.now()) {
  const i = Math.max(0, IDS.indexOf(idioma)), lang = IDS[i];
  const txt = (chave, vars = {}) => (AVISOS[`${evento}.${chave}`] ? preencher(AVISOS[`${evento}.${chave}`][i], vars) : "");
  const v = dados?.veiculo ?? {}, motorista = dados?.motorista?.nome ?? null;
  const veiculo = [v.modelo, corNoIdioma(v.cor, lang)].filter(Boolean).join(" ");
  if (evento === "chegando_embarque") {
    return { titulo: motorista ? txt("titulo", { motorista }) : txt("semNome"), corpo: txt("corpo", { veiculo, placa: v.placa }) };
  }
  if (evento === "chegou_embarque") {
    const corpo = veiculo && v.placa ? "corpo" : veiculo ? "semPlaca" : v.placa ? "soPlaca" : null;
    return { titulo: txt("titulo"), corpo: corpo ? txt(corpo, { veiculo, placa: v.placa }) : "" };
  }
  if (evento === "viagem_iniciada") {
    const hora = horaPrevista(dados, lang, agora);
    return { titulo: txt("titulo"), corpo: hora ? txt("corpo", { hora }) : "" };
  }
  return { titulo: txt("titulo"), corpo: txt("corpo") };
}

/** Conteúdo do push: o service worker mostra e, no toque, abre/foca o link. */
export function payloadAviso(id, evento, dados, idioma, agora = Date.now()) {
  return { ...textoAviso(evento, dados, idioma, agora), url: `/r/${id}`, tag: `${id}:${evento}` };
}
