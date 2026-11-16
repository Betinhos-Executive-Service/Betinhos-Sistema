// Texto e situação do indicador fixo de envios. Puro (sem React) para testar em Node.
import type { FilaItem } from "./fila";
import { MENSAGEM_SESSAO } from "./processador.ts";
import { avisoAgendaOffline } from "../servicos/agendaOffline.ts";

export type SituacaoIndicador = "carro" | "sessao" | "falhou" | "enviando" | "sem-conexao" | "pendente" | "agenda";

const rotuloPendentes = (total: number) => `${total} ${total === 1 ? "envio pendente" : "envios pendentes"}`;

type Entrada = { itens: FilaItem[]; online: boolean; total: number; agendaOfflineEm: string | null };

export function descreverIndicador({ itens, online, total, agendaOfflineEm }: Entrada): { texto: string; situacao: SituacaoIndicador; comAcao?: FilaItem } {
  const comAcao = itens.find((item) => item.estado === "precisa-acao" || item.estado === "falhou");
  // Com falha ou ação pendente e sem rede, o "Sem conexão" continua na frente do texto.
  const prefixo = online ? "" : "Sem conexão · ";
  if (comAcao?.estado === "precisa-acao" && comAcao.motivo === "carro") return { texto: `${prefixo}${comAcao.titulo}: escolha o carro para enviar`, situacao: "carro", comAcao };
  if (comAcao?.estado === "precisa-acao") return { texto: `${prefixo}${comAcao.ultimoErro || MENSAGEM_SESSAO}`, situacao: "sessao", comAcao };
  if (comAcao) return { texto: `${prefixo}${comAcao.titulo} não foi enviado`, situacao: "falhou", comAcao };
  if (itens.some((item) => item.estado === "enviando")) return { texto: "Enviando…", situacao: "enviando" };
  if (!online) return { texto: total ? `Sem conexão · ${rotuloPendentes(total)}` : agendaOfflineEm ? avisoAgendaOffline(agendaOfflineEm) : "Sem conexão", situacao: "sem-conexao" };
  if (total) return { texto: rotuloPendentes(total), situacao: "pendente" };
  return { texto: avisoAgendaOffline(agendaOfflineEm ?? ""), situacao: "agenda" };
}
