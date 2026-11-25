import { diaMes, hora } from "./formato";
import type { IdiomaId, Traduz } from "./i18n";
import type { EtaMostrado } from "./hooks/useEta";
import { textoAvisoCarro } from "./status";
import type { Dados } from "./tipos";
import { enderecoLimpo } from "./util";

// Regras do portal como funções puras de (dados, relógio): a fase que vale, a faixa do topo e a linha do tempo.
export type Estado = "definicao" | "agendado" | "a_caminho" | "no_local" | "em_viagem" | "concluido";

// Embarque em aeroporto: o motorista espera no desembarque (não prometemos placa com nome).
const AEROPORTO = /aeroporto|\b(GRU|CGH|VCP|SDU|GIG)\b|guarulhos|congonhas|viracopos|terminal/i;
export const ehAeroporto = (texto?: string | null) => !!texto && AEROPORTO.test(texto);

export const rotuloEmbarque = (d: Dados) => d.etapas?.[0]?.rotulo || d.embarque?.label || "";
export const rotuloDestino = (d: Dados) => [...(d.etapas ?? [])].reverse().find((e) => e.tipo === "destino")?.rotulo || "";
export const aeroportoNoEmbarque = (d: Dados) => ehAeroporto(rotuloEmbarque(d));
const primeiroNome = (d: Dados) => (d.motorista?.nome || "").trim().split(/\s+/)[0];
// Endereço curto para a frase ("Av. Paulista, 1000"), sem bairro.
const localCurto = (d: Dados) => enderecoLimpo(rotuloEmbarque(d)).split(/\s+-\s+/)[0];

export function estadoViagem(d: Dados): Estado {
  if (d.fase === "concluido") return "concluido";
  if (d.emDefinicao) return "definicao";
  if (d.rastreio === false || d.modo === "simples" || d.fase === "agendado") return "agendado";
  return d.fase as Estado;
}
export const semRastreio = (d: Dados) => d.rastreio === false || d.modo === "simples";

// Barra de 5 segmentos: Confirmada, Motorista definido, A caminho, No local, Em viagem. Concluído acende todos.
export const SEGMENTOS = ["seg.confirmada", "seg.definido", "passo.a_caminho", "passo.no_local", "passo.em_viagem"] as const;
export function segmentosAcesos(d: Dados) {
  return { definicao: 1, agendado: 2, a_caminho: 3, no_local: 4, em_viagem: 5, concluido: 5 }[estadoViagem(d)];
}

export function tituloFase(d: Dados, t: Traduz) {
  const e = estadoViagem(d);
  if (e === "definicao") return t("h.confirmada");
  if (e === "agendado") return t("h.definido");
  if (e === "a_caminho") return t(d.chegando ? "h.chegando" : "h.a_caminho");
  if (e === "no_local") return aeroportoNoEmbarque(d) && primeiroNome(d) ? t("h.desembarque", { nome: primeiroNome(d) }) : t("h.no_local");
  if (e === "em_viagem") return t(d.chegando ? "status.chegandoDestino" : "h.em_viagem");
  return t("concluido.titulo");
}

interface CtxFrase { t: Traduz; id: IdiomaId; cor: (c?: string) => string; eta: EtaMostrado; espera: number }
export function fraseFase(d: Dados, c: CtxFrase) {
  const { t, id, eta } = c;
  const e = estadoViagem(d);
  const agendado = Date.parse(d.horarioAgendado ?? "");
  if (e === "definicao") return t("f.definicao");
  if (e === "agendado") {
    if (isNaN(agendado) || !semRastreio(d)) return t("f.aguarda");
    return t("agendado.texto", { dia: diaMes(id, agendado), h: hora(id, agendado) });
  }
  if (e === "a_caminho") {
    if (!eta.eta || !eta.chegada) return t("f.semPrevisao");
    const v = { local: localCurto(d), h: hora(id, eta.chegada) };
    if (isNaN(agendado)) return t("f.chegaSo", v);
    const diff = Math.round((agendado - eta.chegada) / 60000);
    return diff >= 1 ? t("f.chega", { ...v, n: diff }) : diff <= -1 ? t("f.chegaTarde", { ...v, n: -diff }) : t("f.chegaHora", v);
  }
  if (e === "no_local") {
    if (aeroportoNoEmbarque(d)) return t("f.desembarque");
    return c.espera >= 1 ? t("f.espera", { n: c.espera }) : textoAvisoCarro(d, t, c.cor);
  }
  if (e === "em_viagem") return eta.eta && eta.chegada ? t("f.emViagem", { h: hora(id, eta.chegada) }) : t("f.boaViagem");
  const fim = d.marcos?.concluidoEm;
  return fim ? t("concluido.chegada", { h: hora(id, fim) }) : t("concluido.obrigado");
}

// ---- Linha do tempo ----
export type ChavePasso = "confirmada" | "definicao" | "definido" | "aguardando" | "embarque" | "a_caminho" | "no_local" | "em_viagem" | "parada" | "chegada";
export interface Passo { chave: ChavePasso; estado: "feita" | "atual" | "futura"; endereco?: string; hora?: number | null; n?: number; sino?: boolean }

const ms = (x?: string) => { const v = Date.parse(x ?? ""); return isNaN(v) ? null : v; };
// O sino (aviso "quando estiver chegando") só faz sentido antes de o motorista chegar ao embarque.
export const sinoNoPasso = (p: Pick<Passo, "chave" | "estado">) => p.estado === "atual" && (p.chave === "aguardando" || p.chave === "a_caminho");

export function linhaDoTempo(d: Dados, chegada: number | null): Passo[] {
  const e = estadoViagem(d);
  const fim = e === "concluido";
  const emb = enderecoLimpo(rotuloEmbarque(d)), dest = enderecoLimpo(rotuloDestino(d));
  const ag = ms(d.horarioAgendado), m = d.marcos ?? {};
  const lista: Passo[] = [{ chave: "confirmada", estado: "feita" }];
  const marca = (p: Passo) => { lista.push({ ...p, sino: sinoNoPasso(p) }); };
  // Etapa i da lista de fases: feita antes da atual, atual na atual, futura depois.
  const fases: Estado[] = ["definicao", "agendado", "a_caminho", "no_local", "em_viagem"];
  const i = fases.indexOf(e);
  const st = (n: number): Passo["estado"] => (fim || n < i ? "feita" : n === i ? "atual" : "futura");

  if (e === "definicao") marca({ chave: "definicao", estado: "atual" });
  else marca({ chave: "definido", estado: "feita" });

  if (semRastreio(d)) {
    marca({ chave: "embarque", estado: fim ? "feita" : e === "agendado" ? "atual" : "futura", endereco: emb, hora: ag });
    marca({ chave: "chegada", estado: fim ? "feita" : "futura", endereco: dest, hora: fim ? ms(m.concluidoEm) : null });
    return lista;
  }
  if (e === "definicao" || e === "agendado") marca({ chave: "aguardando", estado: e === "agendado" ? "atual" : "futura", endereco: emb, hora: ag });
  marca({ chave: "a_caminho", estado: st(2), hora: e === "a_caminho" ? chegada : null });
  marca({ chave: "no_local", estado: st(3), endereco: emb, hora: fim || e === "em_viagem" || e === "no_local" ? ms(m.chegouEmbarqueEm) : ag });
  const paradas = (d.etapas ?? []).filter((x) => x.tipo === "parada");
  const naParada = e === "em_viagem" && paradas.some((x) => x.atual);
  marca({ chave: "em_viagem", estado: naParada ? "feita" : st(4), hora: fim || e === "em_viagem" ? ms(m.saiuEmbarqueEm) : null });
  paradas.forEach((x, n) => marca({ chave: "parada", n: n + 1, estado: fim || x.visitada ? "feita" : x.atual ? "atual" : "futura", endereco: enderecoLimpo(x.rotulo) || x.rotulo }));
  marca({ chave: "chegada", estado: fim ? "feita" : "futura", endereco: dest, hora: fim ? ms(m.concluidoEm) : e === "em_viagem" ? chegada : null });
  return lista;
}
