import { idadeTexto } from "../../src/movimento.mjs";
import { POSICAO_VELHA_MIN, SEM_CONEXAO_MS } from "./bt";
import type { Traduz } from "./i18n";
import type { Dados } from "./tipos";
import { nomesCarro } from "./util";

// Regras de status, como funções puras de (dados, relógio do servidor): o selo, o aviso de chegada e o "ao vivo".
export type TipoSelo = "load" | "info" | "ok" | "warn";
export interface Selo { tipo: TipoSelo; texto: string }

export const agoraServidor = (desvio: number, agora: number) => agora + desvio;
export function idadePosicao(d: Dados | null, desvio: number, agora: number) {
  return d && d.posicao && d.posicao.atualizadoEm ? agoraServidor(desvio, agora) - new Date(d.posicao.atualizadoEm).getTime() : NaN;
}

export function seloStatus(d: Dados, t: Traduz, idade: number): Selo {
  const velha = typeof d.sinalAtrasadoMin === "number" || !d.comSinal || idade > POSICAO_VELHA_MIN * 60000;
  if (!d.posicao) return { tipo: "warn", texto: t("status.aguardando") };
  if (d.fase === "no_local") return { tipo: "ok", texto: t("status.noLocal") };
  if (velha) return { tipo: "warn", texto: t("status.desatualizada") };
  if (d.fase === "em_viagem") return { tipo: "info", texto: t(d.chegando ? "status.chegandoDestino" : "passo.em_viagem") };
  return { tipo: "info", texto: t(d.chegando ? "passo.chegando" : "passo.a_caminho") };
}

export function textoAvisoCarro(d: Dados, t: Traduz, cor: (c?: string) => string) {
  const v = d.veiculo || {};
  const carro = [nomesCarro(v).completo, cor(v.cor)].filter(Boolean).join(" ");
  return (carro ? t("aviso.procure", { carro }) : t("aviso.procureCarro")) + (v.placa ? t("aviso.placa", { placa: v.placa }) : "") + ".";
}
export function esperaMin(d: Dados, desvio: number, agora: number) {
  const desde = d.marcos && d.marcos.chegouEmbarqueEm ? new Date(d.marcos.chegouEmbarqueEm).getTime() : NaN;
  return Math.floor((agoraServidor(desvio, agora) - desde) / 60000);
}

export interface Vivo { texto: string; conexao: "" | "off" | "reconectando" | "rastreador"; velha: boolean; oculto: boolean }
export function estadoVivo(d: Dados | null, t: Traduz, idade: number, falhandoDesde: number, agora: number): Vivo {
  if (!d) return { texto: "", conexao: "", velha: true, oculto: true };
  let texto = "";
  if (d.posicao && !isNaN(idade)) {
    texto = idade < 30000 ? t("vivo.agora") : t("vivo.ha", { t: idadeTexto(idade) });
    if ((d.posicao.velocidadeKmh ?? 99) <= 3 && d.fase !== "no_local" && idade < 5 * 60000) texto += t("vivo.parado");
  }
  const sem = falhandoDesde ? agora - falhandoDesde : 0;
  const conexao = sem > SEM_CONEXAO_MS ? "off" : sem || d.fonteIndisponivel ? (d.fonteIndisponivel ? "rastreador" : "reconectando") : "";
  return { texto, conexao, velha: conexao !== "" || !(idade < 120000), oculto: !texto && conexao === "" };
}
