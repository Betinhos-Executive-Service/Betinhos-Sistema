// "No local" por área do lugar, não só por raio: em aeroportos, shoppings, estádios e
// hotéis grandes o ponto geocodificado fica a centenas de metros do meio-fio onde o
// carro para. Quando o Nominatim devolve um lugar desse tipo, usamos a caixa dele.
import { distanciaMetros } from "./infleet.mjs";

export const RAIO_LOCAL = 150;   // metros: considera "no local" (ponto)
export const RAIO_SAIDA = 300;   // metros: saiu do embarque = em viagem (ponto)
const DIAGONAL_MAX = 8000;       // metros: caixa maior que isso é bairro/cidade, não um lugar
const CLASSES_LUGAR = new Set(["aeroway", "amenity", "building", "leisure", "office", "railway", "shop", "tourism", "man_made", "public_transport"]);
const GRAUS_POR_METRO_LAT = 1 / 111320;

/** Caixa sul/norte/oeste/leste válida como área de um lugar; `null` se pequena, grande ou malformada. */
export function caixaDoLugar(sul, norte, oeste, leste) {
  [sul, norte, oeste, leste] = [sul, norte, oeste, leste].map(Number);
  if ([sul, norte, oeste, leste].some(Number.isNaN) || sul >= norte || oeste >= leste) return null;
  const diagonal = distanciaMetros(sul, oeste, norte, leste);
  // Caixa menor que o raio padrão não acrescenta nada; maior que o teto não é um lugar.
  if (diagonal < RAIO_LOCAL * 2 || diagonal > DIAGONAL_MAX) return null;
  return { sul, norte, oeste, leste };
}

/** Área útil do resultado do Nominatim; `null` quando é endereço comum, rua ou região. */
export function areaDoLugar(hit) {
  const bb = hit?.boundingbox;
  if (!CLASSES_LUGAR.has(String(hit?.class)) || !Array.isArray(bb) || bb.length !== 4) return null;
  return caixaDoLugar(...bb);
}

/** Ponto dentro da caixa, com margem em metros para fora (0 = exata). */
export function dentroDaArea(pos, area, margemMetros = 0) {
  if (!pos || !area) return false;
  const dLat = margemMetros * GRAUS_POR_METRO_LAT;
  const dLon = dLat / Math.max(0.2, Math.cos(((area.sul + area.norte) / 2) * Math.PI / 180));
  return pos.lat >= area.sul - dLat && pos.lat <= area.norte + dLat && pos.lon >= area.oeste - dLon && pos.lon <= area.leste + dLon;
}

const distancia = (pos, ponto) => distanciaMetros(pos.lat, pos.lon, ponto.lat, ponto.lon);

/** Chegou: dentro do raio do ponto ou dentro da área do lugar. */
export function chegouAoLocal(pos, ponto) {
  if (!pos || !ponto) return false;
  return distancia(pos, ponto) <= RAIO_LOCAL || dentroDaArea(pos, ponto.area);
}

/** Saiu: fora do raio de saída e, se houver área, fora dela com a mesma folga. */
export function saiuDoLocal(pos, ponto) {
  if (!pos || !ponto) return false;
  return distancia(pos, ponto) > RAIO_SAIDA && !dentroDaArea(pos, ponto.area, RAIO_SAIDA);
}

// Link criado com o serviço já em andamento: nenhum marco foi visto, mas o horário do embarque passou e o
// carro está longe dele. Não dá para distinguir "atrasado indo buscar" de "já saiu com o passageiro" numa
// leitura só; por isso compara duas leituras: afastando do embarque e aproximando do destino = em viagem.
// Mais perto do destino do que do embarque decide na hora.
const DESLOCAMENTO_MIN = 300; // metros entre leituras para contar como tendência

/** Devolve os marcos inferidos (`chegouEmbarqueEm`/`saiuEmbarqueEm`, com `inferido`) ou `null` para manter. */
export function inferirEmViagem({ estado, agora, horarioAgendado, dEmb, dFim, quando }) {
  if (!estado || estado.chegouEmbarqueEm || estado.saiuEmbarqueEm) return null;
  if (!horarioAgendado || dEmb == null || dFim == null) return null;
  const inicio = new Date(horarioAgendado).getTime();
  if (Number.isNaN(inicio) || agora.getTime() < inicio || dEmb <= RAIO_SAIDA) return null;
  const antes = estado.observado;
  const afastando = antes && dEmb - antes.dEmb > DESLOCAMENTO_MIN && antes.dFim - dFim > DESLOCAMENTO_MIN;
  if (dFim < dEmb || afastando) {
    const { observado, ...resto } = estado;
    return { ...resto, chegouEmbarqueEm: horarioAgendado, saiuEmbarqueEm: quando, inferido: "servico_em_andamento" };
  }
  return { ...estado, observado: { dEmb, dFim, em: quando } };
}

// Reconstrução pelo trajeto: com o histórico de posições desde antes do horário agendado, os marcos são
// lidos na ordem em que aconteceram (chegou ao embarque, saiu dele, chegou ao destino), sem adivinhar.
// Endereço sem número ou rua longa: o ponto geocodificado pode ficar a centenas de metros do portão. Uma
// parada de alguns minutos perto do embarque é o passageiro entrando no carro.
const PARADA_RAIO_EMBARQUE = 1500; // metros do ponto geocodificado para a parada contar como embarque
const PARADA_DESLOCAMENTO = 60;    // metros: dentro disso o carro está parado
const PARADA_MIN_MS = 3 * 60000;   // tempo mínimo parado

/** Primeira parada de ≥3 min a até 1,5 km do embarque: { chegouEm, ponto, fimIndice } ou null. */
export function paradaPertoDoEmbarque(ordem, embarque) {
  for (let i = 0; i < ordem.length; i++) {
    const inicio = ordem[i];
    if (distancia(inicio, embarque) > PARADA_RAIO_EMBARQUE) continue;
    let j = i;
    while (j + 1 < ordem.length && distancia(ordem[j + 1], inicio) <= PARADA_DESLOCAMENTO) j++;
    if (new Date(ordem[j].fixTime) - new Date(inicio.fixTime) >= PARADA_MIN_MS) return { chegouEm: inicio.fixTime, ponto: { lat: inicio.lat, lon: inicio.lon }, fimIndice: j };
  }
  return null;
}

/** `pontos`: [{ lat, lon, fixTime }] em qualquer ordem. Devolve só os marcos encontrados. */
export function marcosDoTrajeto(pontos, embarque, destinoFinal) {
  const marcos = {};
  if (!embarque || !Array.isArray(pontos) || pontos.length === 0) return marcos;
  const ordem = [...pontos].filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.fixTime)
    .sort((a, b) => new Date(a.fixTime) - new Date(b.fixTime));
  let desde = 0;
  // 1) Passagem pelo ponto/área do embarque.
  const dentro = ordem.findIndex((p) => chegouAoLocal(p, embarque));
  if (dentro >= 0) {
    marcos.chegouEmbarqueEm = ordem[dentro].fixTime;
    const fora = ordem.findIndex((p, i) => i > dentro && saiuDoLocal(p, embarque));
    if (fora >= 0) { marcos.saiuEmbarqueEm = ordem[fora].fixTime; desde = fora; } else desde = ordem.length;
  } else {
    // 2) Sem passar pelo ponto exato: parada de alguns minutos perto dele.
    const parada = paradaPertoDoEmbarque(ordem, embarque);
    if (!parada) return marcos;
    marcos.chegouEmbarqueEm = parada.chegouEm;
    marcos.embarqueAproximado = true;
    const fora = ordem.findIndex((p, i) => i > parada.fimIndice && distancia(p, parada.ponto) > RAIO_SAIDA);
    if (fora >= 0) { marcos.saiuEmbarqueEm = ordem[fora].fixTime; desde = fora; } else desde = ordem.length;
  }
  // 3) Depois de sair: chegada ao destino final.
  if (marcos.saiuEmbarqueEm && destinoFinal) {
    const fim = ordem.findIndex((p, i) => i > desde && chegouAoLocal(p, destinoFinal));
    if (fim >= 0) marcos.concluidoEm = ordem[fim].fixTime;
  }
  return marcos;
}
