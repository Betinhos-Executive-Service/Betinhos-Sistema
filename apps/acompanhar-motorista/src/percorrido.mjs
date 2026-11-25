import { distanciaMetros } from "./infleet.mjs";
import { dentroDaArea } from "./local.mjs";

const VELOCIDADE_MAX_KMH = 250; // trecho mais rápido que isso é pulo de GPS (ou outro serviço), não caminho
const SALTO_MIN_METROS = 3000; // abaixo disso nunca é pulo, mesmo com fixTime repetido
const MAX_PONTOS = 300;
const RAIO_PERTO_SAIDA_M = 1000; // o GPS reporta esparso: o último ponto "na saída" pode estar a algumas centenas de metros

// Caminho já feito pelo carro (linha "percorrida", como no Waze): pontos da Infleet em ordem de tempo,
// sem pulos de GPS, reduzidos para a página continuar leve e terminando na posição atual. [lon, lat].
// Com `saida`, a linha nasce no próprio endereço de saída (e segue do último ponto perto dela): o que veio antes é deslocamento
// até o embarque, não parte do serviço. Carro que ainda não chegou à saída → sem linha.
// Com `ate` (ms), pontos depois dele ficam de fora: serviço concluído não mostra a volta do carro.
export function linhaPercorrida(pontos, atual = null, { saida = null, ate = null } = {}) {
  const ord = (pontos ?? [])
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && (ate === null || !(Date.parse(p.fixTime) > ate)))
    .sort((a, b) => Date.parse(a.fixTime) - Date.parse(b.fixTime));
  if (atual) ord.push({ ...atual, fixTime: atual.fixTime ?? new Date().toISOString() });
  // Mantém só o trecho contínuo mais recente: um pulo impossível (GPS ruim) reinicia a linha.
  let ini = 0;
  for (let i = 1; i < ord.length; i++) {
    const m = distanciaMetros(ord[i - 1].lat, ord[i - 1].lon, ord[i].lat, ord[i].lon);
    const h = (Date.parse(ord[i].fixTime) - Date.parse(ord[i - 1].fixTime)) / 3600e3;
    if (m > SALTO_MIN_METROS && !(h > 0 && m / 1000 / h <= VELOCIDADE_MAX_KMH)) ini = i;
  }
  let trecho = ord.slice(ini);
  if (saida && Number.isFinite(saida.lat) && Number.isFinite(saida.lon)) {
    const perto = (p) => distanciaMetros(p.lat, p.lon, saida.lat, saida.lon) <= RAIO_PERTO_SAIDA_M || dentroDaArea(p, saida.area, RAIO_PERTO_SAIDA_M);
    const i = trecho.findLastIndex(perto);
    if (i < 0) return null;
    trecho = [{ lat: saida.lat, lon: saida.lon, fixTime: trecho[i].fixTime }, ...trecho.slice(i)];
  }
  if (trecho.length < 2) return null;
  const passo = Math.ceil(trecho.length / MAX_PONTOS);
  return trecho.filter((_, i) => i % passo === 0 || i === trecho.length - 1).map((p) => [p.lon, p.lat]);
}
