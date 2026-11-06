import { executeCustomApi } from "./customApi.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";
import { mapsSearchUrl } from "./mapLinks.ts";
import { METAS_GASTOS, semaforo, type Semaforo } from "./gastosRelatorio.ts";

export const RAIO_KM = 10;

type AbastecimentoPosto = { data: string; precoLitro: number };
type PostoRanking = { nome: string; precoLitro: number; abastecimentos: number; ultimoAbastecimento: string; lat: number; lon: number; aproximada: boolean; endereco: string; historico: AbastecimentoPosto[] };
export type RankingPostos = { dias: number; postos: PostoRanking[] };
export type Posicao = { lat: number; lon: number };
export type PostoProximo = PostoRanking & { distanciaKm: number; cor: Semaforo };

export function parseRankingPostos(json: string): RankingPostos {
  const body = JSON.parse(json || "{}") as Partial<RankingPostos> & { ok?: boolean };
  if (body.ok !== true || typeof body.dias !== "number" || !Array.isArray(body.postos)) throw new Error("Postos indisponíveis.");
  // Plugin e web resource publicam em momentos diferentes: o plugin anterior não manda endereço nem histórico.
  return comNomesLimpos({ dias: body.dias, postos: body.postos.map((posto) => ({ ...posto, endereco: posto.endereco ?? "", historico: posto.historico ?? [] })) });
}

function distanciaKm(a: Posicao, b: Posicao) {
  const rad = (grau: number) => (grau * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function postosProximos(postos: PostoRanking[], origem: Posicao): PostoProximo[] {
  return postos
    .map((posto) => ({ ...posto, distanciaKm: distanciaKm(origem, posto), cor: semaforo(posto.precoLitro, METAS_GASTOS.litro) }))
    .filter((posto) => posto.distanciaKm <= RAIO_KM)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

export const RECOMENDACAO: Record<Semaforo, { rotulo: string; tom: string }> = {
  verde: { rotulo: "Recomendado", tom: "sucesso" },
  amarelo: { rotulo: "Atenção", tom: "atencao" },
  vermelho: { rotulo: "Evitar", tom: "erro" }
};

// O destaque é o menor preço do raio; no empate, o mais perto, que já vem primeiro.
export function separarMelhor(proximos: PostoProximo[]) {
  const melhor = proximos.reduce((atual, posto) => (posto.precoLitro < atual.precoLitro ? posto : atual));
  return { melhor, outros: proximos.filter((posto) => posto !== melhor) };
}

export const rotuloMelhor = (cor: Semaforo) => (cor === "verde" ? "Melhor opção perto de você" : "Menor preço perto de você");

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
const SUFIXO_SOCIAL = /(?:[\s.,-]+(?:LTDA\.?|EIRELI|S\.?\/?A\.?|ME|EPP))+[\s.,-]*$/i;
const SIGLA = /^[b-df-hj-np-tv-z]{2,}(?:-\d+)?$/;

function capitalizar(palavra: string, indice: number) {
  if (indice > 0 && MINUSCULAS.has(palavra)) return palavra;
  return SIGLA.test(palavra) ? palavra.toUpperCase() : palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

// O nome vem do cupom, muitas vezes em caixa alta e com a razão social inteira.
export function nomePosto(nome: string) {
  const limpo = nome.replace(SUFIXO_SOCIAL, "").trim();
  if (limpo !== limpo.toUpperCase()) return limpo;
  return limpo.toLowerCase().split(/\s+/).map(capitalizar).join(" ");
}

const comNomesLimpos = (ranking: RankingPostos): RankingPostos => ({ ...ranking, postos: ranking.postos.map((posto) => ({ ...posto, nome: nomePosto(posto.nome) })) });

// Sem endereço, só o nome levaria a outro posto da mesma rede: vale a coordenada.
export const urlMaps = ({ nome, endereco, lat, lon }: Pick<PostoRanking, "nome" | "endereco" | "lat" | "lon">) => mapsSearchUrl(endereco ? `${nome} ${endereco}` : `${lat},${lon}`);

export function rotuloDistancia({ distanciaKm: km, aproximada }: Pick<PostoProximo, "distanciaKm" | "aproximada">) {
  const metros = Math.round(km * 1000);
  const texto = metros < 1000 ? `${metros} m` : `${km.toFixed(1).replace(".", ",")} km`;
  return aproximada ? `cerca de ${texto}` : texto;
}

export function rotuloAbastecimentos(quantidade: number) {
  return quantidade === 1 ? "Baseado em 1 abastecimento" : `${quantidade} abastecimentos`;
}

const MOCK_POSICAO: Posicao = { lat: -22.9246, lon: -45.4613 };
const historicoMock = (...itens: [string, number][]) => itens.map(([data, precoLitro]) => ({ data, precoLitro }));
const MOCK: RankingPostos = {
  dias: 30,
  postos: [
    { nome: "Posto Exemplo Dutra", precoLitro: 6.09, abastecimentos: 5, ultimoAbastecimento: "2026-11-03", lat: -22.9301, lon: -45.4502, aproximada: false, endereco: "RODOVIA PRESIDENTE DUTRA, 100 - PINDAMONHANGABA/SP", historico: historicoMock(["2026-11-03", 6.09], ["2026-11-01", 6.09], ["2026-10-30", 6.05], ["2026-10-27", 6.12], ["2026-10-24", 6.09]) },
    { nome: "POSTO EXEMPLO RODOVIA LTDA", precoLitro: 6.19, abastecimentos: 2, ultimoAbastecimento: "2026-11-01", lat: -22.9105, lon: -45.4801, aproximada: true, endereco: "AVENIDA EXEMPLO, 500 - PINDAMONHANGABA/SP", historico: historicoMock(["2026-11-01", 6.19], ["2026-10-22", 6.19]) },
    { nome: "Auto Posto Exemplo Centro", precoLitro: 6.83, abastecimentos: 1, ultimoAbastecimento: "2026-10-28", lat: -22.9252, lon: -45.4625, aproximada: false, endereco: "RUA EXEMPLO, 33 - PINDAMONHANGABA/SP", historico: historicoMock(["2026-10-28", 6.83]) },
    { nome: "Posto Exemplo Distante", precoLitro: 5.99, abastecimentos: 3, ultimoAbastecimento: "2026-11-02", lat: -23.03, lon: -45.56, aproximada: false, endereco: "ESTRADA EXEMPLO - TAUBATE/SP", historico: historicoMock(["2026-11-02", 5.99]) }
  ]
};

const mockModo = () => new URLSearchParams(window.location.search).get("mockRankingPostos");

export async function carregarRankingPostos(): Promise<RankingPostos> {
  if (isMockGastosCartao()) {
    const modo = mockModo();
    await new Promise((resolve) => setTimeout(resolve, modo === "lento" ? 4000 : 300));
    if (modo === "erro") throw new Error("Falha simulada ao carregar os postos.");
    return modo === "vazio" ? { ...MOCK, postos: [] } : comNomesLimpos(MOCK);
  }
  const resposta = await executeCustomApi("new_ObterRankingPostos", {});
  return parseRankingPostos(String(resposta.new_RankingJson ?? ""));
}

export function obterPosicao(): Promise<Posicao> {
  if (isMockGastosCartao()) {
    if (mockModo() === "semgps") return Promise.reject({ code: 1 });
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_POSICAO), mockModo() === "lento" ? 1500 : 0));
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(null); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  });
}
