import { executeCustomApi } from "./customApi.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";

type PostoRanking = { nome: string; precoLitro: number; abastecimentos: number; ultimoAbastecimento: string };
export type CidadeRanking = { cidade: string; postos: PostoRanking[] };
export type RankingPostos = { dias: number; cidades: CidadeRanking[] };

export function parseRankingPostos(json: string): RankingPostos {
  const body = JSON.parse(json || "{}") as Partial<RankingPostos> & { ok?: boolean };
  if (body.ok !== true || typeof body.dias !== "number" || !Array.isArray(body.cidades)) throw new Error("Ranking de postos indisponível.");
  return { dias: body.dias, cidades: body.cidades };
}

// Os postos chegam ordenados por preço. Só marca quando há com quem comparar; empate marca os dois.
export function ehMenorPreco(cidade: CidadeRanking, posto: PostoRanking) {
  return cidade.postos.length >= 2 && posto.precoLitro === cidade.postos[0].precoLitro;
}

export function rotuloAbastecimentos(quantidade: number) {
  return quantidade === 1 ? "Baseado em 1 abastecimento" : `${quantidade} abastecimentos`;
}

const MOCK: RankingPostos = {
  dias: 30,
  cidades: [
    { cidade: "Pindamonhangaba - SP", postos: [
      { nome: "Posto Exemplo Dutra", precoLitro: 6.09, abastecimentos: 5, ultimoAbastecimento: "2026-11-03" },
      { nome: "Auto Posto Exemplo Centro", precoLitro: 6.83, abastecimentos: 1, ultimoAbastecimento: "2026-10-28" }
    ] },
    { cidade: "Taubaté - SP", postos: [
      { nome: "Posto Exemplo Taubaté", precoLitro: 6.19, abastecimentos: 2, ultimoAbastecimento: "2026-11-01" }
    ] }
  ]
};

export async function carregarRankingPostos(): Promise<RankingPostos> {
  if (isMockGastosCartao()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const modo = new URLSearchParams(window.location.search).get("mockRankingPostos");
    if (modo === "erro") throw new Error("Falha simulada ao carregar o ranking de postos.");
    return modo === "vazio" ? { ...MOCK, cidades: [] } : MOCK;
  }
  const resposta = await executeCustomApi("new_ObterRankingPostos", {});
  return parseRankingPostos(String(resposta.new_RankingJson ?? ""));
}
