import { executeCustomApi } from "./customApi.ts";
import { isMockGastosCartao } from "./gastosCartao.ts";
import { METAS_GASTOS, semaforo, type Semaforo } from "./gastosRelatorio.ts";

export const RAIO_KM = 10;

type PostoRanking = { nome: string; precoLitro: number; abastecimentos: number; ultimoAbastecimento: string; lat: number; lon: number; aproximada: boolean };
export type RankingPostos = { dias: number; postos: PostoRanking[] };
export type Posicao = { lat: number; lon: number };
export type PostoProximo = PostoRanking & { distanciaKm: number; cor: Semaforo };

export function parseRankingPostos(json: string): RankingPostos {
  const body = JSON.parse(json || "{}") as Partial<RankingPostos> & { ok?: boolean };
  if (body.ok !== true || typeof body.dias !== "number" || !Array.isArray(body.postos)) throw new Error("Postos indisponíveis.");
  return { dias: body.dias, postos: body.postos };
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

export function rotuloDistancia({ distanciaKm: km, aproximada }: Pick<PostoProximo, "distanciaKm" | "aproximada">) {
  const metros = Math.round(km * 1000);
  const texto = metros < 1000 ? `${metros} m` : `${km.toFixed(1).replace(".", ",")} km`;
  return aproximada ? `cerca de ${texto}` : texto;
}

export function rotuloAbastecimentos(quantidade: number) {
  return quantidade === 1 ? "Baseado em 1 abastecimento" : `${quantidade} abastecimentos`;
}

const MOCK_POSICAO: Posicao = { lat: -22.9246, lon: -45.4613 };
const MOCK: RankingPostos = {
  dias: 30,
  postos: [
    { nome: "Posto Exemplo Dutra", precoLitro: 6.09, abastecimentos: 5, ultimoAbastecimento: "2026-11-03", lat: -22.9301, lon: -45.4502, aproximada: false },
    { nome: "Posto Exemplo Rodovia", precoLitro: 6.19, abastecimentos: 2, ultimoAbastecimento: "2026-11-01", lat: -22.9105, lon: -45.4801, aproximada: true },
    { nome: "Auto Posto Exemplo Centro", precoLitro: 6.83, abastecimentos: 1, ultimoAbastecimento: "2026-10-28", lat: -22.9252, lon: -45.4625, aproximada: false },
    { nome: "Posto Exemplo Distante", precoLitro: 5.99, abastecimentos: 3, ultimoAbastecimento: "2026-11-02", lat: -23.03, lon: -45.56, aproximada: false }
  ]
};

const mockModo = () => new URLSearchParams(window.location.search).get("mockRankingPostos");

export async function carregarRankingPostos(): Promise<RankingPostos> {
  if (isMockGastosCartao()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const modo = mockModo();
    if (modo === "erro") throw new Error("Falha simulada ao carregar os postos.");
    return modo === "vazio" ? { ...MOCK, postos: [] } : MOCK;
  }
  const resposta = await executeCustomApi("new_ObterRankingPostos", {});
  return parseRankingPostos(String(resposta.new_RankingJson ?? ""));
}

export function obterPosicao(): Promise<Posicao> {
  if (isMockGastosCartao()) {
    return mockModo() === "semgps" ? Promise.reject({ code: 1 }) : Promise.resolve(MOCK_POSICAO);
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
