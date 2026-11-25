// Etapas do serviço (saída → paradas → destino) avançadas pelo GPS. Regra fixa, sem IA.
import { chegouAoLocal, dentroDaArea, saiuDoLocal } from "./local.mjs";
import { distanciaMetros } from "./infleet.mjs";

export const PERMANENCIA_MS = 60000;

const atualDe = (etapas) => {
  const i = etapas.findIndex((e, k) => (k === etapas.length - 1 ? !e.chegouEm : !e.saiuEm));
  return i === -1 ? null : i;
};

export function avancarEtapas(etapas, pos, quando) {
  if (!pos) return false;
  const i = atualDe(etapas);
  if (i === null) return false;
  // Carro dentro do local de uma etapa posterior: as anteriores não visitadas foram puladas
  // (ex.: link criado com o carro já na parada ou chegando direto ao destino). Só vale se o carro
  // não está na etapa atual e ela ainda não começou; a primeira etapa posterior que bate ganha.
  const atual = etapas[i];
  const k = chegouAoLocal(pos, atual) || atual.dentroDesde || atual.chegouEm
    ? -1
    : etapas.findIndex((x, j) => j > i && chegouAoLocal(pos, x));
  if (k > i) {
    for (let j = i; j < k; j++) {
      const p = etapas[j];
      delete p.dentroDesde;
      p.chegouEm ??= quando;
      p.saiuEm ??= quando;
      p.pulada = true;
    }
    etapas[k].dentroDesde = quando;
    return true;
  }
  const e = etapas[i];
  if (!e.chegouEm) {
    if (!chegouAoLocal(pos, e)) { if (!e.dentroDesde) return false; delete e.dentroDesde; return true; }
    if (!e.dentroDesde) { e.dentroDesde = quando; return true; }
    if (Date.parse(quando) - Date.parse(e.dentroDesde) < PERMANENCIA_MS) return false;
    e.chegouEm = e.dentroDesde; delete e.dentroDesde; return true;
  }
  if (i < etapas.length - 1 && saiuDoLocal(pos, e)) { e.saiuEm = quando; return true; }
  return false;
}

export const REFORCO_DIST_M = 50;
export const REFORCO_INTERVALO_MS = 2 * 60000;

/**
 * Reforço (opcional) da chegada com posições esparsas: duas posições seguidas (fixTime diferentes, >= 2 min),
 * a até 50 m uma da outra e ambas dentro do raio/área da etapa atual → chegou, sem exigir os 60 s contínuos.
 * Velocidade nunca entra. `ultima` = {lat, lon, fixTime}; `pos` = {lat, lon}. Devolve true se marcou a chegada.
 */
export function reforcarChegada(etapas, ultima, pos, quando) {
  if (!ultima || !pos || !Array.isArray(etapas)) return false;
  const i = atualDe(etapas);
  if (i === null || etapas[i].chegouEm) return false;
  const dt = Date.parse(quando) - Date.parse(ultima.fixTime);
  if (!(dt >= REFORCO_INTERVALO_MS)) return false;
  if (distanciaMetros(ultima.lat, ultima.lon, pos.lat, pos.lon) > REFORCO_DIST_M) return false;
  if (!chegouAoLocal(ultima, etapas[i]) || !chegouAoLocal(pos, etapas[i])) return false;
  etapas[i].chegouEm = ultima.fixTime; delete etapas[i].dentroDesde;
  return true;
}

export function faseDasEtapas(etapas, concluidoDataverse) {
  if (concluidoDataverse) return { fase: "concluido", atual: null };
  if (!Array.isArray(etapas) || etapas.length === 0) return { fase: "a_caminho", atual: null };
  const i = atualDe(etapas);
  if (i === null) return { fase: "concluido", atual: null };
  if (etapas[i].chegouEm) return { fase: "no_local", atual: i };
  if (i === 0) return { fase: "a_caminho", atual: 0 };
  return { fase: "em_viagem", atual: i };
}

export const POSICAO_MAX_MS = 3 * 60000;

const POSICAO_CONFIAVEL_MS = 90000;

/**
 * ETA público: só a caminho/em viagem, com rota e posição com menos de 3 min.
 * Com trânsito (TomTom) e posição recente → minutos exatos. Sem trânsito (OSRM) ou posição com mais
 * de 90 s → confiança baixa: `faixa` [min, max] e a página avisa. Devolve null quando não há ETA.
 */
export function etaPublico({ fase, rota, posFixTime, agora = new Date() }) {
  if (!["a_caminho", "em_viagem"].includes(fase)) return null;
  if (!rota || !Number.isFinite(rota.minutos)) return null;
  const idade = agora - new Date(posFixTime ?? NaN);
  if (!(idade <= POSICAO_MAX_MS)) return null;
  const minutos = Math.max(1, rota.minutos);
  const transito = rota.fonte === "tomtom";
  const baixa = !transito || idade > POSICAO_CONFIAVEL_MS;
  return { minutos, faixa: baixa ? [minutos, Math.max(minutos + 2, Math.round(minutos * 1.35))] : null, transito, km: Number.isFinite(rota.km) ? rota.km : null };
}

// "Chegando" por geofence com histerese: entra a até 1 km (ou dentro da área do lugar com 1 km de folga)
// ou a 5 min; só sai a mais de 2 km e, havendo ETA, acima de 10 min. Assim a posição oscilando na borda
// não liga e desliga o aviso. `alvo.chegandoEm` guarda o estado entre leituras (vai para o KV).
export const RAIO_CHEGANDO_M = 1000;
const MIN_CHEGANDO = 5;
export const RAIO_SAIR_CHEGANDO_M = 2000;
const MIN_SAIR_CHEGANDO = 10;

/** Atualiza `alvo.chegandoEm` e devolve true se o carro está chegando ao alvo. */
export function atualizarChegando(alvo, { pos, rota, quando }) {
  if (!alvo) return false;
  if (!pos) return Boolean(alvo.chegandoEm);
  const d = distanciaMetros(pos.lat, pos.lon, alvo.lat, alvo.lon);
  const min = Number.isFinite(rota?.minutos) ? rota.minutos : null;
  if (alvo.chegandoEm) {
    if (d > RAIO_SAIR_CHEGANDO_M && (min === null || min > MIN_SAIR_CHEGANDO)) { delete alvo.chegandoEm; return false; }
    return true;
  }
  if (d <= RAIO_CHEGANDO_M || (min !== null && min <= MIN_CHEGANDO) || dentroDaArea(pos, alvo.area, RAIO_CHEGANDO_M)) { alvo.chegandoEm = quando; return true; }
  return false;
}

// Etapas para a página: sem horários (a UI não os mostra). `pulada` só aparece quando verdadeira.
export function etapasVisiveis(etapas, atual) {
  return etapas.map((e, i) => ({
    tipo: e.tipo, rotulo: e.rotulo, lat: e.lat, lon: e.lon,
    visitada: Boolean(e.pulada || e.chegouEm),
    atual: i === atual,
    ...(e.pulada ? { pulada: true } : {}),
  }));
}

const maisAntigo = (a, b) => (!a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b);

// Mescla monotônica de duas leituras das etapas (duas abas): por etapa, mantém o marco mais antigo já gravado,
// inclusive `chegandoEm` (histerese do "chegando"), para a marca de um isolate não sumir na gravação de outro.
export function mesclarEtapas(gravadas, minhas) {
  if (!Array.isArray(gravadas) || gravadas.length !== minhas.length) return minhas;
  return minhas.map((m, i) => {
    const g = gravadas[i], r = { ...m };
    for (const k of ["chegouEm", "saiuEm", "chegandoEm"]) { const v = maisAntigo(g[k], m[k]); if (v) r[k] = v; }
    if (g.pulada || m.pulada) r.pulada = true;
    if (r.chegouEm) delete r.dentroDesde;
    else if (!r.dentroDesde && g.dentroDesde) r.dentroDesde = g.dentroDesde;
    return r;
  });
}

// ---- Serviço já em curso quando o link nasce: a saída nunca é vista pelo GPS ao vivo ----

const depoisDoHorario = (horarioAgendado, agora) => {
  const h = Date.parse(horarioAgendado ?? "");
  return !Number.isNaN(h) && agora.getTime() >= h;
};
const saidaPendente = (etapas) => Array.isArray(etapas) && etapas.length > 1 && !etapas[0].chegouEm && !etapas[0].dentroDesde;

export const RETENTATIVA_TRAJETO_MS = 5 * 60000;
export const MAX_TENTATIVAS_TRAJETO = 3;

/** Ler o histórico da Infleet uma vez (saída pendente, depois do horário); após falha, de novo a cada 5 min, até 3 vezes. */
export function precisaLerTrajeto(t, agora) {
  if (t.trajetoLidoEm || !saidaPendente(t.etapas) || !depoisDoHorario(t.horarioAgendado, agora)) return false;
  if ((t.trajetoTentativas ?? 0) >= MAX_TENTATIVAS_TRAJETO) return false;
  return !t.trajetoTentadoEm || agora.getTime() - Date.parse(t.trajetoTentadoEm) >= RETENTATIVA_TRAJETO_MS;
}

const LONGE_DA_SAIDA_M = 2000;

/** Evidência de que o carro passou pela saída: primeiro ponto do histórico a até 2 km dela (ou na área). */
export function saidaVistaNoTrajeto(etapas, pontos) {
  const s = etapas?.[0];
  if (!s) return null;
  const perto = (pontos ?? []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)
    && (distanciaMetros(p.lat, p.lon, s.lat, s.lon) <= LONGE_DA_SAIDA_M || dentroDaArea(p, s.area)));
  perto.sort((a, b) => Date.parse(a.fixTime) - Date.parse(b.fixTime));
  return perto[0]?.fixTime ?? null;
}

/** Repassa o histórico (qualquer ordem) pelas mesmas regras do GPS ao vivo. Devolve true se mudou algo. */
export function reconstruirEtapas(etapas, pontos) {
  const antes = JSON.stringify(etapas);
  const ordem = (pontos ?? []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.fixTime)
    .sort((a, b) => Date.parse(a.fixTime) - Date.parse(b.fixTime));
  for (const p of ordem) avancarEtapas(etapas, { lat: p.lat, lon: p.lon }, p.fixTime);
  return JSON.stringify(etapas) !== antes;
}

const VELOCIDADE_VIAGEM_KMH = 30;

/**
 * Sem marca da saída mesmo depois do histórico, mas com o histórico mostrando o carro perto dela
 * (`saidaVistaEm`; sem isso o motorista pode estar atrasado indo buscar): depois do horário, longe da saída e
 * mais perto do próximo ponto do que a saída está dele (ou rápido se afastando) → saída feita.
 * Marca `inferido` sem horário público. Antes do horário nunca infere.
 */
export function inferirSaidaFeita(etapas, { pos, velocidadeKmh, agora, horarioAgendado, quando, anterior = null, saidaVistaEm = null }) {
  if (!saidaVistaEm || !pos || !saidaPendente(etapas) || !depoisDoHorario(horarioAgendado, agora)) return false;
  const [s, prox] = etapas;
  const d = (a, b) => distanciaMetros(a.lat, a.lon, b.lat, b.lon);
  const dSaida = d(pos, s);
  if (dSaida <= LONGE_DA_SAIDA_M) return false;
  const adiantado = d(pos, prox) < d(s, prox);
  const afastando = Number(velocidadeKmh) > VELOCIDADE_VIAGEM_KMH && anterior && dSaida > d(anterior, s);
  if (!adiantado && !afastando) return false;
  s.chegouEm = quando; s.saiuEm = quando; s.inferido = true;
  return true;
}
