// Decide se o link mostra status, etapas e ETA (modo completo) ou só o carro (modo simples).
import { distanciaMetros } from "./infleet.mjs";

// Serviços intermunicipais (Pindamonhangaba → Rio) passam de 300 km; acima de 600 km é geocode errado.
export const SALTO_MAX_M = 600000;

/** `etapasGeo` alinhado às etapas pedidas (null = não geocodificou). Devolve { modo, motivo }. */
export function avaliarTrajeto(etapasGeo, rotulos = []) {
  if (!Array.isArray(etapasGeo) || etapasGeo.length < 2) return { modo: "simples", motivo: "menos de duas etapas" };
  const falha = etapasGeo.findIndex((p) => !p);
  if (falha >= 0) return { modo: "simples", motivo: `etapa sem endereço: ${rotulos[falha] ?? `etapa ${falha + 1}`}` };
  for (let i = 1; i < etapasGeo.length; i++) {
    const a = etapasGeo[i - 1], b = etapasGeo[i];
    const d = distanciaMetros(a.lat, a.lon, b.lat, b.lon);
    if (d > SALTO_MAX_M) return { modo: "simples", motivo: `salto de ${Math.round(d / 1000)} km` };
  }
  return { modo: "completo", motivo: null };
}

// A confiança do Haiku é só diagnóstico: o que decide é tudo geocodificado e sem salto absurdo.
export const trajetoConfiavel = (etapasGeo) => avaliarTrajeto(etapasGeo).modo === "completo";
