// Leitura de um link: Infleet → regras (etapas, geofence, rota viva, percorrido, ETA) → contrato de /dados.
// Não guarda nada sozinho: o estado da rota vem em `est` ({ trilha, estadoRota, percorrido, rotaEm }) e as
// gravações saem por `opcoes.gravar`. O Worker monta esse estado com Map por isolate (caminho sem Durable Object)
// e o Durable Object `Viagem` com o próprio storage; as regras são as mesmas nos dois.
import { gqlInfleet, rotaAte, distanciaMetros, encaixarNasRuas, encaixarPosicao } from "./infleet.mjs";
import { registrarNaTrilha, rumoDaTrilha, decidirRota } from "./rota-viva.mjs";
import { pontoDeChegada } from "./chegada.mjs";
import { linhaPercorrida } from "./percorrido.mjs";
import { geocodeNominatim, geocodeTolerante } from "./api-links.mjs";
import { avancarEtapas, reforcarChegada, POSICAO_MAX_MS, inferirSaidaFeita, precisaLerTrajeto, reconstruirEtapas, saidaVistaNoTrajeto, faseDasEtapas, etaPublico, etapasVisiveis, mesclarEtapas, atualizarChegando } from "./etapas.mjs";
import { lugarConhecido, rotuloSeguro } from "./geocodificar.mjs";
import { chegouAoLocal, inferirEmViagem, marcosDoTrajeto, saiuDoLocal } from "./local.mjs";

// Rota "viva" (src/rota-viva.mjs): segue a rota calculada e só pede outra ao sair dela, ao envelhecer
// (trânsito) ou com rota suspeita confirmada. Perto do alvo a idade máxima é menor.
const ROTA_PERTO_METROS = 5000;
// Modo economia (alarm do Viagem sem ninguém olhando): rota só perto do alvo e no máximo a cada 5 min.
const ECONOMIA_ROTA_METROS = 15000;
const ECONOMIA_ROTA_MS = 5 * 60000;

// O texto bruto da reserva (nome de passageiro, apto, observação) nunca sai daqui: links antigos guardaram
// esse texto como `label`/`rotulo`, então o rótulo é limpo de novo na saída e só os campos do mapa passam.
export function pontoPublico(p, padrao) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  return { lat: p.lat, lon: p.lon, ...(p.area ? { area: p.area } : {}), label: p.rotuloLimpo ? p.label : rotuloSeguro(p.label, padrao) };
}
function etapasPublicas(etapas) {
  let parada = 0;
  return etapas.map((e) => ({ ...e, rotulo: e.rotuloLimpo ? e.rotulo : rotuloSeguro(e.rotulo, e.tipo === "saida" ? "Saída" : e.tipo === "destino" ? "Destino" : `Parada ${++parada}`) }));
}

const SEMEAR_A_CADA_MS = 120000;
const SEMEAR_JANELA_MS = 5 * 60000;

// Primeira leitura do link (neste isolate ou neste Viagem): as últimas leituras da Infleet dão o rumo sem esperar o carro andar.
async function semearTrilha(t, env, agoraMs, est) {
  const atual = est.trilha;
  if ((atual?.pontos.length ?? 0) >= 3 || (atual?.semeadaEm && agoraMs - atual.semeadaEm < SEMEAR_A_CADA_MS) || !t.vehicleId) return;
  let trilha = { pontos: [], rejeitada: null };
  try {
    const d = await gqlInfleet(env.INFLEET_TOKEN,
      "query Recentes($f: ListVehiclePositionsFilterInput!){ listVehiclePositions(filter:$f){ latitude longitude fixTime } }",
      { f: { vehicleId: t.vehicleId, fixTime: { startAt: new Date(agoraMs - SEMEAR_JANELA_MS).toISOString(), endAt: new Date(agoraMs).toISOString() } } }, env.INFLEET_URL);
    const pontos = (d.listVehiclePositions ?? []).map((p) => ({ lat: p.latitude, lon: p.longitude, fixTime: p.fixTime }))
      .sort((a, b) => Date.parse(a.fixTime) - Date.parse(b.fixTime));
    for (const p of pontos) trilha = registrarNaTrilha(trilha, p, agoraMs);
  } catch (e) { console.warn(`Trilha recente indisponível: ${e.message}`); }
  for (const p of atual?.pontos ?? []) trilha = registrarNaTrilha(trilha, p, agoraMs);
  est.trilha = { ...trilha, semeadaEm: agoraMs };
}

// Rota da leitura atual: trilha confiável → rumo → (se precisar recalcular) encaixe e roteador com o rumo.
async function rotaViva(id, t, env, leitura, alvo, alvoChave, est, economia) {
  const agoraMs = Date.now();
  await semearTrilha(t, env, agoraMs, est);
  const trilha = registrarNaTrilha(est.trilha, leitura, agoraMs);
  est.trilha = { ...trilha, semeadaEm: est.trilha?.semeadaEm };
  const pos = trilha.pontos.at(-1) ?? leitura;
  const destino = pontoDeChegada(alvo);
  const distancia = distanciaMetros(pos.lat, pos.lon, destino.lat, destino.lon);
  if (economia && distancia >= ECONOMIA_ROTA_METROS) return null;
  const movimento = rumoDaTrilha(trilha.pontos);
  const diag = { rumo: movimento?.rumo ?? null, velocidadeKmh: movimento?.velocidadeKmh ?? null, origem: null, encaixada: null, trilha: trilha.pontos.map((p) => [p.lon, p.lat]) };
  const calcular = async () => {
    if (economia && est.rotaEm && agoraMs - est.rotaEm < ECONOMIA_ROTA_MS) return null;
    const enc = movimento ? await encaixarPosicao(trilha.pontos, env.OSRM_URL) : null;
    const rumoCarro = movimento ? (enc?.rumo ?? movimento.rumo) : null;
    diag.origem = { lat: pos.lat, lon: pos.lon };
    diag.encaixada = enc ? { lat: enc.lat, lon: enc.lon } : null;
    diag.rumo = rumoCarro;
    est.rotaEm = agoraMs;
    return rotaAte(enc ?? pos, destino, env.TOMTOM_KEY, { tomtom: env.TOMTOM_URL, osrm: env.OSRM_URL }, { rumo: rumoCarro });
  };
  const perto = distancia < ROTA_PERTO_METROS;
  const r = await decidirRota(est.estadoRota ?? null, { pos, fixTime: pos.fixTime, alvo: destino, alvoChave, agoraMs, perto, rumo: diag.rumo }, calcular);
  est.estadoRota = r.estado ?? null;
  // Sem coordenadas no log: só o suficiente para medir quantas rotas foram seguradas ou aceitas.
  if (r.motivos.length) console.log(JSON.stringify({ evento: "rota_suspeita", link: id.slice(0, 6), decisao: r.decisao, motivos: r.motivos, km: r.rota?.km ?? null, fonte: r.rota?.fonte ?? null }));
  return { rota: r.rota, diagnostico: { decisao: r.decisao, motivos: r.motivos, ...diag } };
}

// Destino sem a chave `area` é de um link antigo: geocodifica de novo pelo rótulo. Falha vira `null`, para não repetir.
async function completarArea(destino) {
  if (!destino || "area" in destino) return destino;
  let area = null;
  try { area = destino.label ? (await geocodeNominatim(destino.label)).area : null; } catch { /* sem área */ }
  return { ...destino, area };
}

// Embarque que não geocodificou na criação (Nominatim fora ou texto abreviado): tenta de novo uma única vez
// pelo texto guardado; sem o texto (links antigos) não há o que fazer além de gerar outro link.
async function completarDestino(t) {
  if (t.destino || !t.embarque || t.destinoTentadoEm) return false;
  t.destino = await geocodeTolerante(t.embarque, geocodeNominatim);
  t.destinoTentadoEm = new Date().toISOString();
  return true;
}

// Saída que é lugar com ponto fixo (ex.: Kenvue): corrige o ponto de links já gravados com o geocode errado.
// Links antigos não guardam o texto do embarque; o título ("Embarque X → Y") traz o nome da saída.
export function corrigirSaidaFixa(t) {
  const texto = t.embarque ?? String(t.titulo ?? "").split("→")[0].replace(/^\s*embarque\b/i, "");
  const c = lugarConhecido(texto)?.coord;
  if (!c || (t.destino && distanciaMetros(t.destino.lat, t.destino.lon, c.lat, c.lon) < 300)) return false;
  t.destino = { lat: c.lat, lon: c.lon, label: lugarConhecido(texto).rotulo, area: null };
  return true;
}

const TRAJETO_ANTES_MS = 90 * 60000; // olha o trajeto desde 1h30 antes do horário agendado

// Histórico de posições da Infleet desde 1h30 antes do horário agendado até agora.
async function lerTrajeto(t, env, agora, nome = "Trajeto") {
  if (!t.vehicleId) return [];
  const inicio = new Date(t.horarioAgendado).getTime();
  const d = await gqlInfleet(env.INFLEET_TOKEN,
    `query ${nome}($f: ListVehiclePositionsFilterInput!){ listVehiclePositions(filter:$f){ latitude longitude fixTime } }`,
    { f: { vehicleId: t.vehicleId, fixTime: { startAt: new Date(inicio - TRAJETO_ANTES_MS).toISOString(), endAt: agora.toISOString() } } }, env.INFLEET_URL);
  return (d.listVehiclePositions ?? []).map((p) => ({ lat: p.latitude, lon: p.longitude, fixTime: p.fixTime }));
}

// Linha do caminho já feito: histórico da Infleet relido no máximo a cada minuto por link (`est.percorrido`).
// Sem horário agendado ou com a Infleet fora, a página só não mostra a linha. Ao vivo, só depois que o carro saiu do endereço de saída.
const PERCORRIDO_IDADE_MS = 60000;
// `fim` ({ lat, lon, quando }): serviço concluído; a linha termina no destino, na hora da chegada, e não depende de posição ao vivo.
async function percorridoComCache(t, env, pos, saida, fim, est) {
  if ((!pos && !fim) || !t.horarioAgendado || Number.isNaN(Date.parse(t.horarioAgendado))) return null;
  const ate = fim && Number.isFinite(Date.parse(fim.quando)) ? Date.parse(fim.quando) : null;
  const opcoes = { saida, ate };
  let c = est.percorrido;
  if (!c || Date.now() - c.em > PERCORRIDO_IDADE_MS || (c.ate ?? null) !== ate) {
    let pontos = c?.pontos ?? [];
    try { pontos = await lerTrajeto(t, env, new Date(ate ?? Date.now()), "Percorrido"); } catch (e) { console.warn(`Percorrido indisponível: ${e.message}`); }
    // Só o trajeto passado vai ao OSRM (a posição atual entra depois, localmente).
    const crua = linhaPercorrida(pontos, null, opcoes);
    const casado = crua ? await encaixarNasRuas(crua, env.OSRM_URL) : null;
    c = { em: Date.now(), pontos, casado, ate };
    est.percorrido = c;
  }
  const ponto = fim ? { lat: fim.lat, lon: fim.lon, fixTime: fim.quando } : pos;
  const linha = linhaPercorrida(c.pontos, ponto, opcoes);
  return linha && c.casado ? [...c.casado, linha.at(-1)] : linha;
}

// Trajeto do serviço concluído: da saída ao destino, até a hora da chegada (sem a volta do carro).
function percorridoFinal(t, env, quando, est) {
  const saida = t.destino ?? t.etapas?.[0], fim = t.destinoFinal ?? t.etapas?.at(-1);
  if (!saida || !fim) return Promise.resolve(null);
  return percorridoComCache(t, env, null, saida, { lat: fim.lat, lon: fim.lon, quando: quando ?? new Date().toISOString() }, est);
}

// Horários do resumo: links com etapas guardam saída e chegada nas próprias etapas.
const marcosDasEtapas = (t) => t.etapas?.length ? Object.fromEntries(Object.entries({ saiuEmbarqueEm: t.etapas[0].saiuEm, concluidoEm: t.etapas.at(-1).chegouEm }).filter(([, v]) => v)) : {};

// Link aberto com o serviço já em curso: lê o histórico de posições da Infleet desde antes do horário
// agendado e reconstrói os marcos na ordem real (chegou, saiu, concluiu). Uma vez por link
// (`trajetoLidoEm`); falha da Infleet não impede a página e tenta de novo na próxima abertura.
async function reconstruirPeloTrajeto(t, estado, env, agora) {
  if (estado.chegouEmbarqueEm || estado.trajetoLidoEm || !t.destino || !t.horarioAgendado) return false;
  const inicio = new Date(t.horarioAgendado).getTime();
  if (Number.isNaN(inicio) || agora.getTime() < inicio) return false;
  try {
    const pontos = await lerTrajeto(t, env, agora);
    const marcos = marcosDoTrajeto(pontos, t.destino, t.destinoFinal);
    Object.assign(estado, marcos, { trajetoLidoEm: agora.toISOString() });
    if (marcos.chegouEmbarqueEm) estado.inferido = "trajeto";
    return true;
  } catch { return false; }
}

// Cartão "quem é seu motorista": foto enviada na criação (servida por /r/<id>/foto/<qual>) ou, na falta, a da
// Infleet; sem nenhuma, a página mostra a inicial. Concluído nunca expõe o telefone.
function cartoes(id, t, v, fim = false) {
  const m = t.motorista;
  return {
    motorista: {
      nome: m?.nome ?? v?.driver?.name?.split(" ")[0] ?? null,
      telefone: fim ? null : m?.telefone ?? null,
      foto: m?.temFoto ? `/r/${id}/foto/motorista` : v?.driver?.profilePictures?.[0]?.url ?? null,
    },
    veiculo: {
      placa: t.placa ?? v?.plate ?? null,
      modelo: t.modeloVeiculo || [v?.brand, v?.model].filter(Boolean).join(" ") || null,
      // Marca do Dataverse (nome de exibição); a da Infleet vem abreviada ("chev") e só serve de reserva.
      marca: t.marcaVeiculo || (t.modeloVeiculo ? null : v?.brand) || null,
      cor: t.corVeiculo ?? null,
      foto: t.veiculoTemFoto ? `/r/${id}/foto/veiculo` : null,
    },
  };
}

// Um só contrato de /dados para todos os links (com etapas, antigos e modo simples): a página tem um render só.
function resposta(id, t, v, { fase, chegando = false, etapas = null, eta = null, rota = null, percorrido = null, sinalAtrasadoMin = null, marcos = {}, diagnostico = null }) {
  const fim = fase === "concluido", simples = t.modo === "simples", l = v?.location;
  return {
    titulo: t.titulo ?? null, modo: simples ? "simples" : "completo",
    // Sem veículo da Infleet a página não monta mapa; sem motorista também, mostra "Motorista em definição".
    rastreio: Boolean(t.vehicleId), emDefinicao: !t.motorista && !t.vehicleId,
    ...cartoes(id, t, v, fim), comSinal: v ? Boolean(v.hasSignal) : true,
    posicao: !fim && l ? { lat: l.latitude, lon: l.longitude, endereco: l.address ?? null, velocidadeKmh: Math.round(l.speed ?? 0), atualizadoEm: l.fixTime ?? null } : null,
    sinalAtrasadoMin,
    embarque: pontoPublico(t.destino, "Saída"), destinoFinal: pontoPublico(t.destinoFinal, "Destino"), horarioAgendado: t.horarioAgendado ?? null,
    fase: simples && !fim && fase !== "agendado" ? null : fase, chegando, eta,
    ...(etapas ? { etapas } : {}),
    marcos, rota: fim ? null : rota, percorrido, diagnostico, expiraEm: t.expiraEm,
  };
}

// Link antigo (sem `etapas`): saída e destino viram duas etapas para a página, com os marcos de `estado`.
function etapasLegado(t, e, fase) {
  const saida = pontoPublico(t.destino, "Saída"), fim = pontoPublico(t.destinoFinal, "Destino");
  return [
    saida && { tipo: "saida", rotulo: saida.label, lat: saida.lat, lon: saida.lon, visitada: Boolean(e.chegouEmbarqueEm), atual: fase === "a_caminho" || fase === "no_local" },
    fim && { tipo: "destino", rotulo: fim.label, lat: fim.lat, lon: fim.lon, visitada: Boolean(e.concluidoEm), atual: fase === "em_viagem" },
  ].filter(Boolean);
}

const comEtapas = (t) => t.modo === "completo" && t.etapas?.length > 0;

export function gravarLink(env, id, t) {
  const ttl = Math.max(60, Math.round((new Date(t.expiraEm) - Date.now()) / 1000));
  return env.TRACK_KV.put(`track:${id}`, JSON.stringify(t), { expirationTtl: ttl });
}

// Gravação do link no KV. `mesclar`: outra aba (ou o /concluir) pode ter gravado desde a leitura; relê e mescla
// as etapas (em `t`, que segue sendo usado) e preserva a conclusão vinda do Dataverse.
// Sem a chave (revogado ou expirado desde a leitura), não grava e devolve `false`: o link não volta a existir.
export async function gravarNoKv(env, id, t, { mesclar = false } = {}) {
  if (!mesclar) return gravarLink(env, id, t);
  let raw;
  try { raw = await env.TRACK_KV.get(`track:${id}`); } catch { /* KV fora: grava o que temos */ }
  if (raw === null) return false;
  let gravado = null;
  try { gravado = JSON.parse(raw); } catch { /* grava o que temos */ }
  if (gravado && t.etapas) t.etapas = mesclarEtapas(gravado.etapas, t.etapas);
  return gravarLink(env, id, gravado?.concluidoPor ? { ...t, concluidoEm: gravado.concluidoEm, concluidoPor: gravado.concluidoPor } : t);
}

// O que precisa estar no KV (para o conector, o Dataverse e o caminho sem DO): tudo menos a última posição,
// que muda a cada leitura e só o Viagem precisa.
export function marcosChave(t) {
  return JSON.stringify({ ...t, ultimaPos: undefined });
}

// Contrato público de /dados (e das mensagens do WebSocket): diagnóstico só com ?debug=1.
export function publicarDados(dados, { debug = false, avaliado = false, versao, agora = new Date() } = {}) {
  const { diagnostico, ...publico } = dados;
  return { ...publico, ...(debug && diagnostico ? { diagnostico } : {}), avaliado, versao, servidorEm: agora.toISOString() };
}

const ANTECEDENCIA_MS = 2 * 3600000;
function agendadoAinda(t, agora = Date.now()) {
  const h = Date.parse(t.horarioAgendado ?? "");
  return Number.isFinite(h) && agora < h - ANTECEDENCIA_MS;
}

/**
 * Leitura de um link. `t` (JSON do link já lido) é a cópia de trabalho e é alterado; `est` guarda trilha, rota e
 * percorrido entre leituras. Opções: `concluido` (chave `concluido:<id>` existe), `economia` (alarm sem ninguém
 * olhando: rota só perto e a cada 5 min) e `gravar(t, { mesclar })`, chamada quando o link precisa ser gravado.
 */
export async function calcularDados(id, t, env, est, { concluido = false, economia = false, gravar }) {
  // Dataverse manda: serviço concluído lá encerra o link sem consultar a Infleet.
  if (t.concluidoPor === "dataverse" || concluido) {
    const marcos = { ...marcosDasEtapas(t), ...(t.estado ?? {}), ...(t.concluidoEm ? { concluidoEm: t.concluidoEm } : {}) };
    const percorrido = await percorridoFinal(t, env, marcos.concluidoEm, est);
    return resposta(id, t, null, { fase: "concluido", etapas: comEtapas(t) ? etapasVisiveis(etapasPublicas(t.etapas), null) : null, percorrido, marcos });
  }
  // Antes de 2 h do horário agendado, ou sem veículo da Infleet (sem rastreio), não consulta a Infleet: só a tela "viagem agendada".
  if (agendadoAinda(t) || !t.vehicleId) return resposta(id, t, null, { fase: "agendado", etapas: comEtapas(t) ? etapasVisiveis(etapasPublicas(t.etapas), null) : null });
  const d = await gqlInfleet(env.INFLEET_TOKEN,
    `query($id: ID!){ getVehicle(id:$id){ plate brand model hasSignal
      driver { name profilePictures { url } }
      location { latitude longitude address speed fixTime } } }`,
    { id: t.vehicleId }, env.INFLEET_URL);
  const v = d.getVehicle, l = v.location;
  const pos = l && { lat: l.latitude, lon: l.longitude };
  const quando = l?.fixTime ?? new Date().toISOString();

  if (comEtapas(t)) return dadosPorEtapas(id, t, v, pos, quando, env, est, economia, gravar);

  // Links criados antes da área do lugar: completa uma vez (área ou null) e grava junto com os marcos.
  let destinoMudou = corrigirSaidaFixa(t) || await completarDestino(t);
  const comArea = await completarArea(t.destino);
  if (comArea !== t.destino) { t.destino = comArea; destinoMudou = true; }

  // Marcos do serviço
  const e = { ...(t.estado ?? {}) };
  await reconstruirPeloTrajeto(t, e, env, new Date());
  const dEmb = pos && t.destino ? distanciaMetros(pos.lat, pos.lon, t.destino.lat, t.destino.lon) : null;
  if (!e.chegouEmbarqueEm && chegouAoLocal(pos, t.destino)) e.chegouEmbarqueEm = quando;
  // Serviço já em andamento quando o link nasceu: infere embarque feito pela tendência do carro.
  const dFim = pos && t.destinoFinal ? distanciaMetros(pos.lat, pos.lon, t.destinoFinal.lat, t.destinoFinal.lon) : null;
  const inferido = inferirEmViagem({ estado: e, agora: new Date(), horarioAgendado: t.horarioAgendado, dEmb, dFim, quando });
  if (inferido) Object.assign(e, inferido, { observado: inferido.observado });
  if (e.observado === undefined) delete e.observado;
  if (e.chegouEmbarqueEm && !e.saiuEmbarqueEm && saiuDoLocal(pos, t.destino)) e.saiuEmbarqueEm = quando;
  if (e.saiuEmbarqueEm && !e.concluidoEm && chegouAoLocal(pos, t.destinoFinal)) e.concluidoEm = quando;
  // Uma gravação só por leitura, depois do "chegando" (que também mexe em `e`).
  const gravarSeMudou = async () => {
    if (!destinoMudou && JSON.stringify(e) === JSON.stringify(t.estado ?? {})) return;
    t.estado = e;
    await gravar(t, { mesclar: false });
  };

  let fase = "a_caminho", alvo = null, alvoChave = null;
  if (e.concluidoEm) fase = "concluido";
  else if (e.saiuEmbarqueEm) { fase = "em_viagem"; alvo = t.destinoFinal; alvoChave = "fim"; }
  else if (e.chegouEmbarqueEm) fase = "no_local";
  else if (t.destino) { alvo = t.destino; alvoChave = "embarque"; }

  const simples = t.modo === "simples";
  if (simples) { await gravarSeMudou(); return resposta(id, t, v, { fase, marcos: e }); }
  const viva = pos && alvo ? await rotaViva(id, t, env, { lat: pos.lat, lon: pos.lon, fixTime: quando }, alvo, alvoChave, est, economia) : null;
  const rota = viva?.rota ?? null;
  // "Chegando" só a caminho do embarque (links antigos não guardam o alvo); o estado fica em `estado.chegandoEm`.
  let chegando = false;
  if (fase === "a_caminho" && alvo) {
    const marca = { ...alvo, chegandoEm: e.chegandoEm };
    chegando = atualizarChegando(marca, { pos, rota, quando });
    if (marca.chegandoEm) e.chegandoEm = marca.chegandoEm; else delete e.chegandoEm;
  }
  await gravarSeMudou();
  const eta = etaPublico({ fase, rota, posFixTime: l?.fixTime });
  const percorrido = fase === "concluido" ? await percorridoFinal(t, env, e.concluidoEm, est) : e.saiuEmbarqueEm ? await percorridoComCache(t, env, pos, t.destino, null, est) : null;
  return resposta(id, t, v, { fase, chegando, etapas: etapasLegado(t, e, fase), eta, rota, percorrido, marcos: e, diagnostico: viva?.diagnostico ?? null });
}

// Link com etapas: o GPS avança as etapas, a fase vem delas e o ETA só aparece quando confiável.
async function dadosPorEtapas(id, t, v, pos, quando, env, est, economia, gravar) {
  const marcaTrajeto = () => JSON.stringify([t.etapas, t.trajetoLidoEm, t.trajetoTentadoEm]);
  const antes = marcaTrajeto();
  const agora = new Date();
  // Link criado com o serviço já em curso: a saída ficou para trás antes do primeiro GPS ao vivo.
  let ultimoDoTrajeto = null;
  if (precisaLerTrajeto(t, agora)) {
    try {
      const pontos = await lerTrajeto(t, env, agora);
      reconstruirEtapas(t.etapas, pontos);
      // Evidência guardada: a inferência só vale se o histórico mostrou o carro perto da saída.
      t.saidaVistaEm = saidaVistaNoTrajeto(t.etapas, pontos);
      t.trajetoLidoEm = agora.toISOString();
      est.percorrido = { em: Date.now(), pontos }; // a linha percorrida aproveita a mesma leitura
      ultimoDoTrajeto = pontos.reduce((a, p) => (!a || Date.parse(p.fixTime) > Date.parse(a.fixTime) ? p : a), null);
    } catch (e) {
      console.warn(`Trajeto da Infleet indisponível: ${e.message}`);
      t.trajetoTentadoEm = agora.toISOString();
      t.trajetoTentativas = (t.trajetoTentativas ?? 0) + 1;
    }
  }
  const fixMs = Date.parse(quando);
  const atrasoMs = Number.isFinite(fixMs) && v.location?.fixTime ? agora.getTime() - fixMs : 0;
  const sinalAtrasadoMin = atrasoMs > POSICAO_MAX_MS ? Math.round(atrasoMs / 60000) : null;
  const antesUltima = JSON.stringify(t.ultimaPos ?? null);
  // Posição com fixTime novo é processada uma vez (mesmo velha: carros que reportam a cada 10-40 min); repetida não.
  // O atraso só afeta a exibição e a inferência da saída, que exige posição recente.
  const fixNovo = !t.ultimaPos || !v.location?.fixTime || fixMs > Date.parse(t.ultimaPos.fixTime);
  if (pos && fixNovo) {
    avancarEtapas(t.etapas, pos, quando);
    reforcarChegada(t.etapas, t.ultimaPos, pos, quando);
    if (sinalAtrasadoMin === null) inferirSaidaFeita(t.etapas, { pos, velocidadeKmh: v.location?.speed, agora, horarioAgendado: t.horarioAgendado, quando, anterior: ultimoDoTrajeto, saidaVistaEm: t.saidaVistaEm });
    t.ultimaPos = { lat: pos.lat, lon: pos.lon, fixTime: quando };
  }
  if (marcaTrajeto() !== antes || JSON.stringify(t.ultimaPos ?? null) !== antesUltima) await gravar(t, { mesclar: true });
  const { fase, atual } = faseDasEtapas(t.etapas, false);
  const alvo = atual !== null && fase !== "no_local" ? t.etapas[atual] : null;
  const viva = pos && alvo ? await rotaViva(id, t, env, { lat: pos.lat, lon: pos.lon, fixTime: quando }, alvo, `etapa${atual}`, est, economia) : null;
  const rota = viva?.rota ?? null;
  // Geofence "chegando" na etapa alvo, com histerese; a transição (rara) é gravada para não oscilar entre isolates.
  const chegandoAntes = alvo?.chegandoEm ?? null;
  const chegando = alvo ? atualizarChegando(alvo, { pos, rota, quando }) : false;
  if (alvo && (alvo.chegandoEm ?? null) !== chegandoAntes) await gravar(t, { mesclar: false });
  const marcos = { ...marcosDasEtapas(t), ...(t.estado ?? {}) };
  // Sem saída registrada (a caminho ou esperando no embarque) não há linha: o histórico é o deslocamento até o embarque.
  const saidaFeita = t.etapas.find((x) => x.tipo === "saida" && x.saiuEm);
  const percorrido = fase === "concluido" ? await percorridoFinal(t, env, marcos.concluidoEm, est) : saidaFeita ? await percorridoComCache(t, env, pos, saidaFeita, null, est) : null;
  return resposta(id, t, v, {
    fase, chegando, sinalAtrasadoMin, rota, percorrido,
    eta: etaPublico({ fase, rota, posFixTime: v.location?.fixTime }),
    etapas: etapasVisiveis(etapasPublicas(t.etapas), atual), marcos, diagnostico: viva?.diagnostico ?? null,
  });
}
