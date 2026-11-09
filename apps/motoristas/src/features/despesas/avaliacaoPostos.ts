import { executeCustomApi } from "../../data/dataverse/customApi.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";

export const MAX_COMENTARIO = 280;

export const MOTIVOS = {
  recomenda: [
    { id: "combustivel_bom", rotulo: "Combustível bom" },
    { id: "bom_atendimento", rotulo: "Bom atendimento" },
    { id: "sem_fila", rotulo: "Sem fila" },
    { id: "banheiro_limpo", rotulo: "Banheiro limpo" },
    { id: "local_seguro", rotulo: "Local seguro" }
  ],
  naoRecomenda: [
    { id: "combustivel_ruim", rotulo: "Combustível ruim" },
    { id: "mau_atendimento", rotulo: "Mau atendimento" },
    { id: "fila_grande", rotulo: "Fila grande" },
    { id: "banheiro_ruim", rotulo: "Banheiro ruim" },
    { id: "local_inseguro", rotulo: "Local inseguro" }
  ]
};

export type MinhaAvaliacao = { recomenda: boolean; motivos: string[]; comentario: string };
type Comentario = { autor: string; data: string; recomenda: boolean; texto: string };
export type ResumoAvaliacoes = { total: number; recomendam: number; motivos: string[]; contagemMotivos: Record<string, number>; comentarios: Comentario[]; minha: MinhaAvaliacao | null };

export const SEM_AVALIACOES: ResumoAvaliacoes = { total: 0, recomendam: 0, motivos: [], contagemMotivos: {}, comentarios: [], minha: null };

export const motivoPositivo = (id: string) => MOTIVOS.recomenda.some((motivo) => motivo.id === id);
export const rotuloMotivo = (id: string) => [...MOTIVOS.recomenda, ...MOTIVOS.naoRecomenda].find((motivo) => motivo.id === id)?.rotulo ?? "";

export function rotuloRecomendacoes({ total, recomendam }: Pick<ResumoAvaliacoes, "total" | "recomendam">) {
  if (total === 0) return "";
  return total === 1 ? `${recomendam} de 1 recomenda` : `${recomendam} de ${total} recomendam`;
}

export const percentualRecomenda = ({ total, recomendam }: Pick<ResumoAvaliacoes, "total" | "recomendam">) => (total ? Math.round((recomendam / total) * 100) : 0);

// Nome completo não cabe na linha do comentário: primeiro e último bastam entre colegas.
export function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 2 ? `${partes[0]} ${partes[partes.length - 1]}` : partes.join(" ");
}

// Só para o mock: no real quem recalcula é o plugin.
export function aplicarMinhaAvaliacao(resumo: ResumoAvaliacoes, minha: MinhaAvaliacao, autor: string, data: string): ResumoAvaliacoes {
  const anterior = resumo.minha;
  const total = resumo.total + (anterior ? 0 : 1);
  const recomendam = resumo.recomendam - (anterior?.recomenda ? 1 : 0) + (minha.recomenda ? 1 : 0);
  const contagemMotivos = { ...resumo.contagemMotivos };
  anterior?.motivos.forEach((id) => { contagemMotivos[id] = (contagemMotivos[id] ?? 1) - 1; });
  minha.motivos.forEach((id) => { contagemMotivos[id] = (contagemMotivos[id] ?? 0) + 1; });
  const motivos = Object.keys(contagemMotivos).filter((id) => contagemMotivos[id] > 0).sort((a, b) => contagemMotivos[b] - contagemMotivos[a]).slice(0, 3);
  const outros = resumo.comentarios.filter((comentario) => comentario.autor !== autor);
  const comentarios = minha.comentario ? [{ autor, data, recomenda: minha.recomenda, texto: minha.comentario }, ...outros] : outros;
  return { total, recomendam, motivos, contagemMotivos, comentarios, minha };
}

const MOCK_AUTOR = "Você";

export async function enviarAvaliacao(postoId: string, resumo: ResumoAvaliacoes, minha: MinhaAvaliacao): Promise<ResumoAvaliacoes> {
  if (isMockGastosCartao()) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (new URLSearchParams(window.location.search).get("mockRankingPostos") === "falhaavaliar") throw new Error("Falha simulada ao enviar a avaliação.");
    return aplicarMinhaAvaliacao(resumo, minha, MOCK_AUTOR, new Date().toISOString().slice(0, 10));
  }
  const resposta = await executeCustomApi("new_AvaliarPosto", { new_AvaliacaoJson: JSON.stringify({ postoId, ...minha }) });
  const corpo = JSON.parse(String(resposta.new_ResultadoJson ?? "{}")) as { ok?: boolean; avaliacoes?: ResumoAvaliacoes };
  if (corpo.ok !== true || !corpo.avaliacoes) throw new Error("Não foi possível enviar a avaliação.");
  return { ...SEM_AVALIACOES, ...corpo.avaliacoes };
}
