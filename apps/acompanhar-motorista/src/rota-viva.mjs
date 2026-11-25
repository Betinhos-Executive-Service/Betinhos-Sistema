// Rota "viva" do link: trilha de leituras confiáveis, rumo do carro, corte da rota pela posição,
// teste de bom senso e a decisão de manter, recalcular ou esperar confirmação. Funções puras (testadas em Node);
// o estado fica no worker, em Map por isolate.
import { metrosEntre, rumo as rumoEntre, giro, projetarNaLinha } from "./movimento.mjs";

const SALTO_MIN_M = 300;          // abaixo disso nunca é salto
const VELOCIDADE_MAX_KMH = 200;   // acima disso entre duas leituras é GPS ruim
const FUTURO_MAX_MS = 120000;
const TRILHA_MAX = 8;
const RUMO_JANELA_MS = 3 * 60000;
const RUMO_MIN_M = 40;
const VEL_MIN_RUMO_KMH = 10;

const valida = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(Math.abs(p.lat) < 0.01 && Math.abs(p.lon) < 0.01);

/** Leitura nova é aceitável depois de `anterior` (null = primeira). */
export function leituraConfiavel(anterior, atual, agoraMs) {
  if (!valida(atual)) return false;
  const fix = Date.parse(atual.fixTime);
  if (Number.isFinite(fix) && fix > agoraMs + FUTURO_MAX_MS) return false;
  if (!anterior) return true;
  const fixAnt = Date.parse(anterior.fixTime);
  if (Number.isFinite(fix) && Number.isFinite(fixAnt) && fix < fixAnt) return false;
  const m = metrosEntre(anterior, atual);
  if (m <= SALTO_MIN_M) return true;
  const h = (fix - fixAnt) / 3600e3;
  return h > 0 && m / 1000 / h <= VELOCIDADE_MAX_KMH;
}

/** Acrescenta a leitura à trilha se confiável. Duas rejeitadas coerentes entre si recomeçam a trilha. */
export function registrarNaTrilha(trilha, leitura, agoraMs) {
  const pontos = trilha?.pontos ?? [];
  const ultima = pontos.at(-1) ?? null;
  if (ultima && leitura && leitura.fixTime === ultima.fixTime) return trilha;
  if (leituraConfiavel(ultima, leitura, agoraMs)) return { pontos: [...pontos, leitura].slice(-TRILHA_MAX), rejeitada: null };
  const r = trilha?.rejeitada;
  if (r && leitura && r.fixTime !== leitura.fixTime && leituraConfiavel(r, leitura, agoraMs)) return { pontos: [r, leitura], rejeitada: null };
  return { pontos, rejeitada: valida(leitura) ? leitura : null };
}

/** Rumo e velocidade pelas últimas leituras (≥ 40 m, até 3 min); null parado (< 10 km/h) ou sem dados. */
export function rumoDaTrilha(pontos) {
  if (!pontos || pontos.length < 2) return null;
  const fim = pontos.at(-1), tFim = Date.parse(fim.fixTime);
  for (let i = pontos.length - 2; i >= 0; i--) {
    const p = pontos[i], ms = tFim - Date.parse(p.fixTime);
    if (!(ms > 0) || ms > RUMO_JANELA_MS) return null;
    const m = metrosEntre(p, fim);
    if (m >= RUMO_MIN_M) {
      const v = m / 1000 / (ms / 3600e3);
      return v >= VEL_MIN_RUMO_KMH ? { rumo: rumoEntre(p, fim), velocidadeKmh: Math.round(v) } : null;
    }
  }
  return null;
}

const LIMITE_NA_ROTA_M = 80;
const LEITURAS_FORA = 2;
const IDADE_PERTO_MS = 120000;
const IDADE_LONGE_MS = 240000;
const ANTERIOR_SERVE_M = 150;
const CONTRAMAO_GRAUS = 120;
const VOLTA_JANELA_M = 5000, VOLTA_AFASTA_M = 500, VOLTA_RETORNA_M = 200;
const DESVIO_FATOR = 2.5, DESVIO_RETA_MIN_M = 2000;

/** Rota a partir da projeção do carro; km e minutos na proporção do que falta. null se o carro está fora dela. */
export function cortarRota(base, pos, limite = LIMITE_NA_ROTA_M) {
  const p = base?.coords && pos ? projetarNaLinha(pos, base.coords) : null;
  if (!p || p.distancia > limite || !(p.total > 0)) return null;
  const frac = Math.max(0, (p.total - p.metrosAntes) / p.total);
  return {
    ...base,
    coords: [[p.lon, p.lat], ...base.coords.slice(p.indice + 1)],
    km: Number.isFinite(base.km) ? Math.round(base.km * frac * 10) / 10 : base.km,
    minutos: Number.isFinite(base.minutos) ? Math.max(1, Math.round(base.minutos * frac)) : base.minutos,
  };
}

/** Motivos para desconfiar da rota: começa contra o rumo, faz retorno no começo, ou é longa demais. */
export function avaliarRota(rota, { pos, alvo, rumo }) {
  const motivos = [];
  const pts = (rota?.coords ?? []).map(([lon, lat]) => ({ lat, lon }));
  if (pts.length < 2 || !pos) return motivos;
  if (rumo != null) {
    const inicio = pts.find((q) => metrosEntre(pts[0], q) >= 50);
    if (inicio && Math.abs(giro(rumo, rumoEntre(pts[0], inicio))) > CONTRAMAO_GRAUS) motivos.push("contramao");
  }
  let andado = 0, afastou = false;
  for (let i = 1; i < pts.length && andado <= VOLTA_JANELA_M; i++) {
    andado += metrosEntre(pts[i - 1], pts[i]);
    const d = metrosEntre(pts[0], pts[i]);
    if (d >= VOLTA_AFASTA_M) afastou = true;
    else if (afastou && d <= VOLTA_RETORNA_M) { motivos.push("volta"); break; }
  }
  const reta = alvo ? metrosEntre(pos, alvo) : 0;
  if (reta >= DESVIO_RETA_MIN_M && Number.isFinite(rota.km) && rota.km * 1000 > DESVIO_FATOR * reta) motivos.push("desvio");
  return motivos;
}

const mesmoAlvo = (estado, alvo, alvoChave) => estado && estado.alvoChave === alvoChave && metrosEntre(estado.alvo, alvo) < 50;

/**
 * Decide a rota desta leitura. Segue a rota guardada (cortada) enquanto o carro está nela e ela não envelheceu;
 * fora dela, só recalcula na segunda leitura (fixTime diferente). Rota nova suspeita, com a anterior ainda servindo,
 * espera a próxima leitura confirmar. `calcular()` devolve a rota do roteador ou null.
 */
export async function decidirRota(estado, { pos, fixTime, alvo, alvoChave, agoraMs, perto, rumo }, calcular) {
  let est = mesmoAlvo(estado, alvo, alvoChave) ? estado : null;
  if (est) {
    const corte = cortarRota(est.base, pos);
    const fresca = agoraMs - est.em < (perto ? IDADE_PERTO_MS : IDADE_LONGE_MS);
    if (corte) {
      est = { ...est, fora: 0, exibida: corte, ultimoFix: fixTime };
      if (fresca) return { rota: corte, estado: est, decisao: "seguindo", motivos: [] };
    } else {
      const fora = fixTime !== est.ultimoFix ? est.fora + 1 : est.fora;
      est = { ...est, fora, ultimoFix: fixTime };
      if (fora < LEITURAS_FORA) return { rota: est.exibida, estado: est, decisao: "fora_aguardando", motivos: [] };
    }
    if (est.pendente && est.pendente.fix === fixTime) return { rota: est.exibida, estado: est, decisao: "suspeita_aguardando", motivos: est.pendente.motivos };
  }
  const nova = await calcular();
  if (!nova) return { rota: est?.exibida ?? null, estado: est, decisao: "sem_rota", motivos: [] };
  const motivos = avaliarRota(nova, { pos, alvo, rumo });
  const anterior = est ? projetarNaLinha(pos, est.base.coords) : null;
  if (motivos.length && anterior && anterior.distancia <= ANTERIOR_SERVE_M && !est.pendente) {
    return { rota: est.exibida, estado: { ...est, pendente: { fix: fixTime, motivos } }, decisao: "suspeita_aguardando", motivos };
  }
  const novoEstado = { base: nova, exibida: nova, em: agoraMs, alvo: { lat: alvo.lat, lon: alvo.lon }, alvoChave, fora: 0, ultimoFix: fixTime, pendente: null };
  return { rota: nova, estado: novoEstado, decisao: motivos.length ? "suspeita_aceita" : est ? "recalculada" : "nova", motivos };
}
