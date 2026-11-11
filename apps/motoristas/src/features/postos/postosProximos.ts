// Postos próximos: regras puras (consulta por área, distância, ordenação). Sem React nem Dataverse, para testar direto.
import { enderecoLegivel, nomePosto } from "../despesas/rankingPostos.ts";
import { mapsSearchUrl, wazeNavigateUrl } from "../detalhe/mapLinks.ts";

export type Posicao = { lat: number; lon: number };
export type Area = { sul: number; norte: number; oeste: number; leste: number };
export type Posto = { id: string; nome: string; endereco: string; lat: number; lon: number };
export type PostoComDistancia = Posto & { distanciaKm: number };

/** São José dos Campos: centro do mapa quando a localização do motorista não está disponível. */
export const CENTRO_PADRAO: Posicao = { lat: -23.1896, lon: -45.8841 };
export const ZOOM_INICIAL = 13;
/** Abaixo disto a área visível passa de ~30 km: pedimos para aproximar em vez de buscar tudo. */
export const ZOOM_MINIMO_BUSCA = 11;
export const LIMITE_POSTOS = 200;
export const TAMANHO_LISTA = 10;
export const ESPERA_BUSCA_MS = 400;

// Nomes lógicos de new_postocombustivel (confirmados em carregar-postos-ctf.ps1 e FuelSchema.cs).
export const STATUS_GEO_PENDENTE = 100000000;
const COLUNAS = ["new_postocombustivelid", "new_name", "new_logradouro", "new_numero", "new_bairro", "new_municipio", "new_uf", "new_latitude", "new_longitude"] as const;

const coordenada = (valor: number) => valor.toFixed(6);

/** Consulta OData: só postos da rede CTF com coordenada, dentro da área visível do mapa. */
export function consultaPostosNaArea({ sul, norte, oeste, leste }: Area, limite = LIMITE_POSTOS) {
  const filtro = [
    "new_aceitactf eq true",
    `new_statusgeo ne ${STATUS_GEO_PENDENTE}`,
    `new_latitude ge ${coordenada(sul)}`,
    `new_latitude le ${coordenada(norte)}`,
    `new_longitude ge ${coordenada(oeste)}`,
    `new_longitude le ${coordenada(leste)}`
  ].join(" and ");
  return `$select=${COLUNAS.join(",")}&$filter=${filtro}&$top=${limite}`;
}

export const areaAfastadaDemais = (zoom: number) => zoom < ZOOM_MINIMO_BUSCA;

export function distanciaKm(a: Posicao, b: Posicao) {
  const rad = (grau: number) => (grau * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Os mais próximos de `origem`, do menor para o maior; empate pelo nome para a lista não pular. */
export function maisProximos(postos: Posto[], origem: Posicao, quantidade = TAMANHO_LISTA): PostoComDistancia[] {
  return postos
    .map((posto) => ({ ...posto, distanciaKm: distanciaKm(origem, posto) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, quantidade);
}

const texto = (valor: unknown) => String(valor ?? "").trim();

function montarEndereco(row: Record<string, unknown>) {
  const rua = [texto(row.new_logradouro), texto(row.new_numero)].filter(Boolean).join(", ");
  const cidade = [texto(row.new_municipio), texto(row.new_uf)].filter(Boolean).join("/");
  return enderecoLegivel([rua, texto(row.new_bairro), cidade].filter(Boolean).join(" - "));
}

/** Linha do Dataverse para posto; sem coordenada válida não vira pino. */
export function mapearPosto(row: Record<string, unknown>): Posto | null {
  const lat = Number(row.new_latitude);
  const lon = Number(row.new_longitude);
  if (row.new_latitude == null || row.new_longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const id = texto(row.new_postocombustivelid);
  if (!id) return null;
  return { id, nome: nomePosto(texto(row.new_name)) || "Posto", endereco: montarEndereco(row), lat, lon };
}

export function rotuloKm(km: number) {
  const metros = Math.round(km * 1000);
  return metros < 1000 ? `${metros} m` : `${km.toFixed(1).replace(".", ",")} km`;
}

export const urlGoogleMaps = ({ lat, lon }: Posicao) => mapsSearchUrl(`${lat},${lon}`);
export const urlWaze = ({ lat, lon }: Posicao) => wazeNavigateUrl(lat, lon);
