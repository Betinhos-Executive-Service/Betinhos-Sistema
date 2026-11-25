// Ponto de chegada para o roteamento em aeroportos: o centro do aeroporto cai no pátio e a rota termina numa via
// de serviço. O centro do prédio do terminal (OpenStreetMap, aeroway=terminal, consultado em 12/11/2026) faz o
// roteador encaixar no meio-fio do terminal. Só o roteamento usa: "chegou"/"chegando" seguem o ponto geocodificado.
import { metrosEntre } from "./movimento.mjs";

const AEROPORTOS = [
  { texto: /\b(gru|cumbica)\b|aeroporto[^,;]*guarulhos|guarulhos[^,;]*aeroporto/i, padrao: 2,
    terminais: { 1: { lat: -23.4296966, lon: -46.4893132 }, 2: { lat: -23.4271535, lon: -46.4802039 }, 3: { lat: -23.4257371, lon: -46.4740626 } } },
  { texto: /\b(cgh|congonhas)\b/i, padrao: 1, terminais: { 1: { lat: -23.625256, lon: -46.659837 } } },
  { texto: /\b(vcp|viracopos)\b/i, padrao: 1, terminais: { 1: { lat: -23.0075041, lon: -47.148967 } } },
  { texto: /\bsjk\b|urbano ernesto stumpf|aeroporto[^,;]*s[aã]o jos[eé] dos campos/i, padrao: 1, terminais: { 1: { lat: -23.2252881, lon: -45.8615911 } } },
  { texto: /\b(sdu|santos dumont)\b/i, padrao: 1, terminais: { 1: { lat: -22.9129283, lon: -43.1666027 } } },
  { texto: /\b(gig|gale[aã]o)\b/i, padrao: 2, terminais: { 1: { lat: -22.8109475, lon: -43.2511351 }, 2: { lat: -22.8144499, lon: -43.245939 } } },
];
const RAIO_AEROPORTO_M = 4000; // o ponto geocodificado tem de estar no aeroporto, senão o texto engana
const NAO_E_TERMINAL = /\b(hotel|flat|pousada|residencial|condom[ií]nio|estacionamento|hangar|cargas?|pullman|ibis|marriott|tryp)\b/i;
const NUMERO_TERMINAL = /\b(?:terminal|term\.?|t)\s*-?\s*([1-3])\b/i;

/** Terminal do aeroporto citado no texto, se o ponto geocodificado estiver nele; senão null. */
export function terminalDoTexto(texto, ponto) {
  const s = String(texto ?? "");
  if (!s || NAO_E_TERMINAL.test(s) || !ponto || !Number.isFinite(ponto.lat)) return null;
  const a = AEROPORTOS.find((x) => x.texto.test(s));
  if (!a) return null;
  const n = Number(s.match(NUMERO_TERMINAL)?.[1]);
  const t = a.terminais[n] ?? a.terminais[a.padrao];
  return metrosEntre(ponto, t) <= RAIO_AEROPORTO_M ? { lat: t.lat, lon: t.lon } : null;
}

/** Alvo para o roteador: com `chegada` gravada na criação ou terminal pelo rótulo; senão o próprio alvo. */
export function pontoDeChegada(alvo) {
  if (!alvo) return alvo;
  const c = alvo.chegada && Number.isFinite(alvo.chegada.lat) ? alvo.chegada : terminalDoTexto(alvo.rotulo ?? alvo.label, alvo);
  return c ? { ...alvo, lat: c.lat, lon: c.lon } : alvo;
}
