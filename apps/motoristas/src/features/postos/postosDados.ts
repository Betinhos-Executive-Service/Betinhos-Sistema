// Preço e recomendação dos postos da tela Postos próximos: junção por id com o ranking e formatação. Sem React nem Dataverse.
import { maioriaNaoRecomenda, motivoPositivo, percentualRecomenda, rotuloMotivo, type ResumoAvaliacoes } from "../despesas/avaliacaoPostos.ts";
import { METAS_GASTOS, semaforo, type Semaforo } from "../despesas/gastosRelatorio.ts";
import type { RankingPostos } from "../despesas/rankingPostos.ts";
import type { Posto } from "./postosProximos.ts";

/**
 * O ranking (Custom API new_ObterRankingPostos) devolve, por posto, a média ponderada do R$/litro (soma dos valores ÷ soma dos litros)
 * dos abastecimentos de TODA a frota nos últimos `dias` (30). `postoId` é o new_postocombustivelid: a mesma chave desta tela.
 */
export type DadosPosto = { precoLitro: number; cor: Semaforo; abastecimentos: number; ultimoAbastecimento: string; dias: number; avaliacoes: ResumoAvaliacoes };
export type PostoExibido = Posto & { dados: DadosPosto | null };
export type DadosPorId = ReadonlyMap<string, DadosPosto>;

/** Ranking nulo (falha ao carregar) ou sem `postoId` (plugin antigo) vira mapa vazio: a tela segue sem preço nem nota. */
export function indexarRanking(ranking: RankingPostos | null): Map<string, DadosPosto> {
  const mapa = new Map<string, DadosPosto>();
  const dias = ranking?.dias ?? 0;
  for (const posto of ranking?.postos ?? []) {
    if (!posto.postoId || mapa.has(posto.postoId) || !Number.isFinite(posto.precoLitro) || posto.precoLitro <= 0) continue;
    mapa.set(posto.postoId, { precoLitro: posto.precoLitro, cor: semaforo(posto.precoLitro, METAS_GASTOS.litro), abastecimentos: posto.abastecimentos, ultimoAbastecimento: posto.ultimoAbastecimento, dias, avaliacoes: posto.avaliacoes });
  }
  return mapa;
}

export const juntarPosto = (posto: Posto, dados: DadosPorId | null): PostoExibido => ({ ...posto, dados: dados?.get(posto.id) ?? null });
export const juntarDados = (postos: Posto[], dados: DadosPorId | null): PostoExibido[] => postos.map((posto) => juntarPosto(posto, dados));

const virgula = (valor: number) => valor.toFixed(2).replace(".", ",");
export const rotuloPrecoLitro = (valor: number) => `R$ ${virgula(valor)}/L`;
/** Com "R$" e sem "/L": cabe na etiqueta do pino. */
export const rotuloPrecoMapa = (valor: number) => `R$ ${virgula(valor)}`;

/** "2026-11-03" vira "03/11"; sem data válida, vazio. Lê as partes da string para o fuso não mudar o dia. */
export function rotuloDia(iso: string) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return partes ? `${partes[3]}/${partes[2]}` : "";
}

export function rotuloBaseDoPreco({ abastecimentos, dias, ultimoAbastecimento }: Pick<DadosPosto, "abastecimentos" | "dias" | "ultimoAbastecimento">) {
  const base = abastecimentos === 1 ? "1 abastecimento" : `Média de ${abastecimentos} abastecimentos`;
  const periodo = dias > 0 ? ` em ${dias} dias` : "";
  const dia = rotuloDia(ultimoAbastecimento);
  return `${base}${periodo}${dia ? ` · último em ${dia}` : ""}`;
}

export type Nota = { texto: string; total: number; alerta: boolean };

/** Recomendação para a lista: "92%" e a contagem. Sem avaliações, nada. */
export function notaDoPosto(avaliacoes: ResumoAvaliacoes): Nota | null {
  if (avaliacoes.total <= 0) return null;
  return { texto: `${percentualRecomenda(avaliacoes)}%`, total: avaliacoes.total, alerta: maioriaNaoRecomenda(avaliacoes) };
}

/** Indicador do mapa: só destaca o que muda a decisão (alerta, ou aprovação clara de 2 ou mais motoristas). */
export function indicadorNoMapa(avaliacoes: ResumoAvaliacoes): "bom" | "alerta" | null {
  if (maioriaNaoRecomenda(avaliacoes)) return "alerta";
  return avaliacoes.total >= 2 && percentualRecomenda(avaliacoes) >= 70 ? "bom" : null;
}

/** Os motivos mais citados (até `quantidade`), pelo contador; sem contador, a lista que o plugin já ordenou. */
export function motivosPrincipais({ contagemMotivos, motivos }: Pick<ResumoAvaliacoes, "contagemMotivos" | "motivos">, quantidade = 2) {
  const porContagem = Object.keys(contagemMotivos).filter((id) => contagemMotivos[id] > 0).sort((a, b) => contagemMotivos[b] - contagemMotivos[a] || a.localeCompare(b));
  return (porContagem.length ? porContagem : motivos).filter((id) => rotuloMotivo(id)).slice(0, quantidade).map((id) => ({ id, rotulo: rotuloMotivo(id), positivo: motivoPositivo(id) }));
}

/** Id do posto mais barato entre os que têm preço. Só destaca com 2 ou mais preços diferentes; no empate fica o primeiro (a lista já vem do mais perto). */
export function idMenorPreco(postos: Pick<PostoExibido, "id" | "dados">[]) {
  const precos = postos.flatMap(({ id, dados }) => (dados ? [{ id, preco: dados.precoLitro }] : []));
  const menor = precos.reduce<(typeof precos)[number] | null>((atual, item) => (!atual || item.preco < atual.preco ? item : atual), null);
  return menor && precos.some(({ preco }) => preco > menor.preco) ? menor.id : "";
}
