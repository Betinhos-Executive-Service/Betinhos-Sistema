// Preço e recomendação dos postos da tela Postos próximos: junção por id com o ranking e formatação. Sem React nem Dataverse.
import { maioriaNaoRecomenda, percentualRecomenda, SEM_AVALIACOES, type ResumoAvaliacoes } from "../despesas/avaliacaoPostos.ts";
import { METAS_GASTOS, semaforo, type Semaforo } from "../despesas/gastosRelatorio.ts";
import { todayInSaoPaulo } from "../despesas/receiptQuickRead.ts";
import type { ConviteAvaliacao, PostoProximo, RankingPostos } from "../despesas/rankingPostos.ts";
import { RAIOS_LISTA_KM, TAMANHO_LISTA, type Posto } from "./postosProximos.ts";

/**
 * O ranking (Custom API new_ObterRankingPostos) devolve, por posto, a média ponderada do R$/litro (soma dos valores ÷ soma dos litros)
 * dos abastecimentos de TODA a frota nos últimos `dias` (30). `postoId` é o new_postocombustivelid: a mesma chave desta tela.
 */
export type DadosPosto = { precoLitro: number; cor: Semaforo; abastecimentos: number; ultimoAbastecimento: string; dias: number; historico: PostoProximo["historico"]; avaliacoes: ResumoAvaliacoes };
export type PostoExibido = Posto & { dados: DadosPosto | null };
export type DadosPorId = ReadonlyMap<string, DadosPosto>;

/** Ranking nulo (falha ao carregar) ou sem `postoId` (plugin antigo) vira mapa vazio: a tela segue sem preço nem nota. */
export function indexarRanking(ranking: RankingPostos | null): Map<string, DadosPosto> {
  const mapa = new Map<string, DadosPosto>();
  const dias = ranking?.dias ?? 0;
  for (const posto of ranking?.postos ?? []) {
    if (!posto.postoId || mapa.has(posto.postoId) || !Number.isFinite(posto.precoLitro) || posto.precoLitro <= 0) continue;
    mapa.set(posto.postoId, { precoLitro: posto.precoLitro, cor: semaforo(posto.precoLitro, METAS_GASTOS.litro), abastecimentos: posto.abastecimentos, ultimoAbastecimento: posto.ultimoAbastecimento, dias, historico: posto.historico, avaliacoes: posto.avaliacoes });
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

/** Recomendação para a lista: "92%" e a contagem. Sem avaliações, nada. Alerta (polegar para baixo) sempre que menos da metade recomenda, mesmo com uma opinião só: um "0%" com polegar positivo engana. */
export function notaDoPosto(avaliacoes: ResumoAvaliacoes): Nota | null {
  if (avaliacoes.total <= 0) return null;
  return { texto: `${percentualRecomenda(avaliacoes)}%`, total: avaliacoes.total, alerta: avaliacoes.recomendam * 2 < avaliacoes.total };
}

/** Indicador do mapa: só destaca o que muda a decisão (alerta, ou aprovação clara de 2 ou mais motoristas). */
export function indicadorNoMapa(avaliacoes: ResumoAvaliacoes): "bom" | "alerta" | null {
  if (maioriaNaoRecomenda(avaliacoes)) return "alerta";
  return avaliacoes.total >= 2 && percentualRecomenda(avaliacoes) >= 70 ? "bom" : null;
}


/** Id do posto mais barato entre os que têm preço. Só destaca com 2 ou mais preços diferentes; no empate fica o primeiro (a lista já vem do mais perto). */
export function idMenorPreco(postos: Pick<PostoExibido, "id" | "dados">[]) {
  const precos = postos.flatMap(({ id, dados }) => (dados ? [{ id, preco: dados.precoLitro }] : []));
  const menor = precos.reduce<(typeof precos)[number] | null>((atual, item) => (!atual || item.preco < atual.preco ? item : atual), null);
  return menor && precos.some(({ preco }) => preco > menor.preco) ? menor.id : "";
}

/** Pesos da nota da lista (0 a 100): preço, recomendação dos motoristas e distância. Aceitar CTF já é filtro da consulta. */
export const PESOS_NOTA = { preco: 0.4, recomendacao: 0.35, distancia: 0.25 } as const;

export type Recomendado<T> = T & { pontos: number | null; motivo: string };

/** Recomendação suavizada: sem avaliações vale 0,5; 1 de 1 não vale o mesmo que 20 de 20. */
const fatorRecomendacao = ({ recomendam, total }: ResumoAvaliacoes) => (recomendam + 1.5) / (total + 3);

/**
 * Os `TAMANHO_LISTA` melhores candidatos pela nota: preço entre os candidatos (o mais barato vale 1, o mais caro 0), recomendação suavizada
 * e distância (0 km vale 1, o raio vale 0). Sem preço recente não há nota: vão para o fim, do mais perto ao mais longe.
 * Motivo = o critério que mais pesou na nota; o mais barato da lista leva "Menor preço" (com 2 ou mais preços diferentes).
 */
export function recomendados<T extends PostoExibido & { distanciaKm: number }>(candidatos: T[], quantidade = TAMANHO_LISTA): Recomendado<T>[] {
  const raio = Math.max(RAIOS_LISTA_KM[0], ...candidatos.map((posto) => posto.distanciaKm));
  const precos = candidatos.flatMap((posto) => (posto.dados ? [posto.dados.precoLitro] : []));
  const [barato, caro] = [Math.min(...precos), Math.max(...precos)];
  const menor = idMenorPreco(candidatos);
  const pontuados = candidatos.map((posto): Recomendado<T> => {
    if (!posto.dados) return { ...posto, pontos: null, motivo: "Sem preço recente" };
    const avaliado = posto.dados.avaliacoes.total > 0;
    const partes = [
      { motivo: posto.id === menor ? "Menor preço" : "Bom preço", valor: PESOS_NOTA.preco * (caro > barato ? (caro - posto.dados.precoLitro) / (caro - barato) : 1) },
      { motivo: avaliado ? "Bem avaliado" : "", valor: PESOS_NOTA.recomendacao * fatorRecomendacao(posto.dados.avaliacoes) },
      { motivo: "Mais perto", valor: PESOS_NOTA.distancia * Math.min(1, Math.max(0, 1 - posto.distanciaKm / raio)) }
    ];
    const total = partes.reduce((soma, parte) => soma + parte.valor, 0);
    // Sem avaliações a recomendação é neutra: entra na nota, mas não é motivo.
    const principal = posto.id === menor ? partes[0] : partes.filter((parte) => parte.motivo).reduce((maior, parte) => (parte.valor > maior.valor ? parte : maior));
    return { ...posto, pontos: Math.round(total * 100), motivo: principal.motivo };
  });
  return pontuados
    .sort((a, b) => (b.pontos ?? -1) - (a.pontos ?? -1) || a.distanciaKm - b.distanciaKm || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, quantidade);
}

/** Janela em que o motorista ainda pode avaliar o posto onde abasteceu (a mesma do plugin FuelRanking, `DiasConvite`). */
export const DIAS_PARA_AVALIAR = 7;

/**
 * O motorista abasteceu neste posto nos últimos 7 dias e ainda não o avaliou? Vale o `convite` do ranking (plugin FuelRanking): o último
 * abastecimento do PRÓPRIO motorista, por CNPJ, em posto que ele ainda não avaliou. O ranking da frota não diz quem abasteceu onde.
 */
export function podeAvaliar(convite: Pick<ConviteAvaliacao, "postoId" | "data"> | null, postoId: string, agora: Date) {
  if (!convite || convite.postoId !== postoId) return false;
  const dias = (Date.parse(`${todayInSaoPaulo(agora)}T00:00:00Z`) - Date.parse(`${convite.data}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(dias) && dias >= 0 && dias <= DIAS_PARA_AVALIAR;
}

/** Ficha do posto (PostoDetalheDialog): o posto do mapa com o que o ranking sabe dele. Sem ranking, preço 0 (a ficha esconde "Quanto custa") e sem avaliações. */
export function paraFicha({ id, nome, endereco, lat, lon, dados }: PostoExibido, distanciaKm: number, avaliacoes?: ResumoAvaliacoes): PostoProximo {
  return {
    postoId: id, nome, endereco, lat, lon, aproximada: false, distanciaKm,
    precoLitro: dados?.precoLitro ?? 0, cor: dados?.cor ?? "amarelo", abastecimentos: dados?.abastecimentos ?? 0, ultimoAbastecimento: dados?.ultimoAbastecimento ?? "",
    historico: dados?.historico ?? [], avaliacoes: avaliacoes ?? dados?.avaliacoes ?? SEM_AVALIACOES
  };
}
