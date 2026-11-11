// Postos próximos no Dataverse (new_postocombustivel) e o conjunto fictício do modo local.
import { hasDataverseRuntime, retrieveMultiple } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { SEM_AVALIACOES, type ResumoAvaliacoes } from "../despesas/avaliacaoPostos.ts";
import { carregarRankingPostos, obterPosicao, type ConviteAvaliacao, type Posicao, type RankingPostos } from "../despesas/rankingPostos.ts";
import { todayInSaoPaulo } from "../despesas/receiptQuickRead.ts";
import { guardar, lerGuardado } from "./guardados.ts";
import { indexarRanking, type DadosPorId, type DadosPosto } from "./postosDados.ts";
import { areaEmVolta, consultaPostosNaArea, mapearPosto, maisProximos, proximoRaio, RAIOS_LISTA_KM, type Area, type Posto } from "./postosProximos.ts";

const POSTO = (n: number, nome: string, endereco: string, lat: number, lon: number): Posto => ({ id: `mock-posto-${n}`, nome, endereco, lat, lon });

// Nomes genéricos, coordenadas na região de São José dos Campos.
export const POSTOS_MOCK: Posto[] = [
  POSTO(1, "Posto Exemplo Centro", "Avenida Exemplo, 100 - Centro - São José dos Campos/SP", -23.1921, -45.8869),
  POSTO(2, "Posto Exemplo Jardim Satélite", "Rua Exemplo, 250 - Jardim Satélite - São José dos Campos/SP", -23.2287, -45.8933),
  POSTO(3, "Auto Posto Exemplo Dutra", "Rodovia Presidente Dutra, km 150 - São José dos Campos/SP", -23.2075, -45.8412),
  POSTO(4, "Posto Exemplo Aquarius", "Avenida Exemplo, 800 - Jardim Aquarius - São José dos Campos/SP", -23.2174, -45.9068),
  POSTO(5, "Posto Exemplo Vila Industrial", "Rua Exemplo, 45 - Vila Industrial - São José dos Campos/SP", -23.1768, -45.8702),
  POSTO(6, "Auto Posto Exemplo Colinas", "Avenida Exemplo, 1200 - Colinas - São José dos Campos/SP", -23.1649, -45.9015),
  POSTO(7, "Posto Exemplo Eugênio de Melo", "Estrada Exemplo, 30 - Eugênio de Melo - São José dos Campos/SP", -23.1581, -45.7867),
  POSTO(8, "Posto Exemplo Urbanova", "Avenida Exemplo, 560 - Urbanova - São José dos Campos/SP", -23.1523, -45.9264),
  POSTO(9, "Auto Posto Exemplo Santana", "Rua Exemplo, 90 - Santana - São José dos Campos/SP", -23.1712, -45.8855),
  POSTO(10, "Posto Exemplo Jacareí", "Avenida Exemplo, 700 - Centro - Jacareí/SP", -23.3053, -45.9658),
  POSTO(11, "Posto Exemplo Jardim das Indústrias", "Avenida Exemplo, 2100 - Jardim das Indústrias - São José dos Campos/SP", -23.2392, -45.9211),
  POSTO(12, "Auto Posto Exemplo Putim", "Estrada Exemplo, 10 - Putim - São José dos Campos/SP", -23.2006, -45.8225)
];

const dentro = (posto: Posto, { sul, norte, oeste, leste }: Area) => posto.lat >= sul && posto.lat <= norte && posto.lon >= oeste && posto.lon <= leste;

// No modo local, ficar sem rede faz a leitura falhar como falharia a do Dataverse (testa o aviso "Sem conexão").
const semRede = () => typeof navigator !== "undefined" && navigator.onLine === false;

async function carregarPostosNaArea(area: Area): Promise<Posto[]> {
  if (!hasDataverseRuntime()) {
    if (semRede()) throw new Error("Sem conexão.");
    await new Promise((resolve) => setTimeout(resolve, 150));
    return POSTOS_MOCK.filter((posto) => dentro(posto, area));
  }
  const { entities } = await retrieveMultiple(DATAVERSE.postosCombustivel, consultaPostosNaArea(area));
  return entities.map((linha) => mapearPosto(linha as Record<string, unknown>)).filter((posto): posto is Posto => posto !== null);
}

/** Dados de uma leitura e, se vieram do aparelho por falha da rede, quando foram guardados (`desde`, ms). */
export type Resultado<T> = { dados: T; desde: number | null };

/** Falha de conexão (aparelho sem rede, fetch que não chegou ou tempo esgotado); 401/403/5xx não entram. Xrm.WebApi rejeita com `{ message }`, não com Error. */
export const ehFalhaDeRede = (erro: unknown) => semRede() || erro instanceof TypeError || /failed to fetch|network ?error|network request failed|load failed|err_internet|timed? ?out/i.test(String((erro as { message?: unknown } | null)?.message ?? erro));

/** Lê e guarda; se a leitura falha por falta de rede e há cópia válida do motorista (7 dias), devolve a cópia. Sem cópia, ou em qualquer outro erro, o erro segue. */
export async function comGuardado<T, G = T>(motoristaId: string, chave: string, carregar: () => Promise<T>, paraGuardar: (dados: T) => G, restaurar: (guardado: G) => T, valido?: (dados: unknown) => boolean): Promise<Resultado<T>> {
  try {
    const dados = await carregar();
    guardar(motoristaId, chave, paraGuardar(dados));
    return { dados, desde: null };
  } catch (erro) {
    const guardado = ehFalhaDeRede(erro) ? lerGuardado<G>(motoristaId, chave, valido) : null;
    if (!guardado) throw erro;
    return { dados: restaurar(guardado.dados), desde: guardado.salvoEm };
  }
}

export const carregarPostosDaArea = (motoristaId: string, area: Area) => comGuardado(motoristaId, "area", () => carregarPostosNaArea(area), (postos) => postos, (postos) => postos);

/** Os 10 mais próximos de `origem`: busca em caixas cada vez maiores (ver `proximoRaio`), porque o limite da consulta não é ordenado por distância. */
async function buscarMaisProximos(origem: Posicao): Promise<Posto[]> {
  let raio: number | null = RAIOS_LISTA_KM[0];
  let postos: Posto[] = [];
  while (raio !== null) {
    postos = await carregarPostosNaArea(areaEmVolta(origem, raio));
    raio = proximoRaio(postos, origem, raio);
  }
  return maisProximos(postos, origem);
}

// Do aparelho, a lista é reordenada a partir da origem de agora (o GPS pode ter mudado desde que foi guardada).
export const carregarMaisProximos = (motoristaId: string, origem: Posicao) => comGuardado(motoristaId, "lista", () => buscarMaisProximos(origem), (postos) => postos, (postos) => maisProximos(postos, origem));

// Posição do motorista no modo local: perto dos postos fictícios (não do ponto padrão do centro, para a distância não dar 0 m).
const POSICAO_MOCK: Posicao = { lat: -23.1905, lon: -45.882 };
export const lerPosicaoDoMotorista = () => obterPosicao({ precisa: true, mock: POSICAO_MOCK });

// Preço e recomendação fictícios, com os mesmos ids de POSTOS_MOCK: barato e bem recomendado (9), verde (1, 12), amarelo (2, 3, 6), caro (5, 4), maioria não recomenda (3) e sem dados (os demais).
const aval = (total: number, recomendam: number, contagemMotivos: Record<string, number> = {}): ResumoAvaliacoes => ({ ...SEM_AVALIACOES, total, recomendam, contagemMotivos, motivos: Object.keys(contagemMotivos) });
const RANKING_MOCK = (() => {
  const base = { aproximada: false, endereco: "", historico: [] };
  const item = (postoId: string, precoLitro: number, abastecimentos: number, ultimoAbastecimento: string, avaliacoes: ResumoAvaliacoes) => ({ ...base, postoId, nome: postoId, precoLitro, abastecimentos, ultimoAbastecimento, lat: 0, lon: 0, avaliacoes });
  return {
    dias: 30,
    convite: null,
    postos: [
      item("mock-posto-9", 5.99, 8, "2026-11-08", aval(12, 11, { combustivel_bom: 8, sem_fila: 5, bom_atendimento: 2 })),
      item("mock-posto-1", 6.09, 5, "2026-11-03", aval(8, 6, { sem_fila: 4, combustivel_bom: 3, banheiro_ruim: 1 })),
      item("mock-posto-6", 6.14, 3, "2026-11-05", aval(4, 4, { bom_atendimento: 3, banheiro_limpo: 1 })),
      item("mock-posto-12", 6.05, 2, "2026-11-06", SEM_AVALIACOES),
      item("mock-posto-2", 6.15, 3, "2026-11-04", aval(1, 1, { local_seguro: 1 })),
      item("mock-posto-3", 6.19, 4, "2026-11-01", aval(7, 2, { fila_grande: 4, mau_atendimento: 3, combustivel_ruim: 1 })),
      item("mock-posto-4", 6.52, 1, "2026-10-29", aval(3, 3, { bom_atendimento: 2 })),
      item("mock-posto-5", 6.89, 2, "2026-11-02", aval(4, 3, { banheiro_limpo: 2, local_seguro: 2 }))
    ]
  } satisfies RankingPostos;
})();

// O ranking não muda de minuto em minuto: uma leitura serve a várias aberturas da tela. Falha não fica guardada.
const VALIDADE_CACHE_MS = 10 * 60 * 1000;
export type RankingTela = { dados: DadosPorId; convite: ConviteAvaliacao | null };
let cache: { motoristaId: string; carregadoEm: number; dados: Promise<Resultado<RankingTela>> } | null = null;

/** Depois de avaliar: a próxima leitura traz a nota nova e o convite sem este posto. */
export const invalidarRanking = () => { cache = null; };

function rankingMock(): RankingPostos {
  // O convite aponta o posto mais perto do motorista (id 1), abastecido há 2 dias.
  const abasteceu = todayInSaoPaulo(new Date(Date.now() - 2 * 86_400_000));
  return { ...RANKING_MOCK, convite: { postoId: "mock-posto-1", nome: "Posto Exemplo Centro", data: abasteceu } };
}

async function lerRanking(): Promise<RankingPostos> {
  if (hasDataverseRuntime()) return carregarRankingPostos();
  if (semRede()) throw new Error("Sem conexão.");
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (new URLSearchParams(window.location.search).get("mockRankingPostos") === "erro") throw new Error("Falha simulada ao carregar os postos.");
  return rankingMock();
}

type RankingGuardado = { dados: [string, DadosPosto][]; convite: ConviteAvaliacao | null };
const rankingGuardadoValido = (valor: unknown) => Array.isArray((valor as RankingGuardado | null)?.dados);

const carregarRankingTela = (motoristaId: string) => comGuardado<RankingTela, RankingGuardado>(motoristaId, "ranking",
  async () => { const ranking = await lerRanking(); return { dados: indexarRanking(ranking), convite: ranking.convite }; },
  ({ dados, convite }) => ({ dados: [...dados], convite }),
  ({ dados, convite }) => ({ dados: new Map(dados), convite }),
  rankingGuardadoValido);

export function carregarDadosPostos(motoristaId: string): Promise<Resultado<RankingTela>> {
  if (cache?.motoristaId === motoristaId && Date.now() - cache.carregadoEm < VALIDADE_CACHE_MS) return cache.dados;
  const atual: NonNullable<typeof cache> = { motoristaId, carregadoEm: Date.now(), dados: carregarRankingTela(motoristaId).then((resultado) => { if (resultado.desde !== null && cache === atual) cache = null; return resultado; }) };
  cache = atual;
  atual.dados.catch(() => { if (cache === atual) cache = null; });
  return atual.dados;
}
