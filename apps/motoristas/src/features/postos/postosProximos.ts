// Postos próximos: regras puras (consulta por área, distância, ordenação). Sem React nem Dataverse, para testar direto.
import { distanciaKm, enderecoLegivel, nomePosto, type Posicao } from "../despesas/rankingPostos.ts";
import { mapsSearchUrl, wazeNavigateUrl } from "../detalhe/mapLinks.ts";

export type Area = { sul: number; norte: number; oeste: number; leste: number };
export type Posto = { id: string; nome: string; endereco: string; lat: number; lon: number };

/** São José dos Campos: centro do mapa quando a localização do motorista não está disponível. */
export const CENTRO_PADRAO: Posicao = { lat: -23.1896, lon: -45.8841 };
export const ZOOM_INICIAL = 13;
/** Tocar em um posto centraliza sem aproximar além disto. */
export const ZOOM_MAXIMO_FOCO = 15;
/** Abaixo disto a área visível passa de ~30 km: pedimos para aproximar em vez de buscar tudo. */
export const ZOOM_MINIMO_BUSCA = 11;
export const LIMITE_POSTOS = 200;
export const TAMANHO_LISTA = 10;
export const ESPERA_BUSCA_MS = 400;
export const RAIOS_LISTA_KM = [3, 10, 30];
const KM_POR_GRAU = 111.32;

// Nomes lógicos de new_postocombustivel (confirmados em carregar-postos-ctf.ps1 e FuelSchema.cs).
export const STATUS_GEO_PENDENTE = 100000000;
const COLUNAS = ["new_postocombustivelid", "new_name", "new_logradouro", "new_numero", "new_bairro", "new_municipio", "new_uf", "new_latitude", "new_longitude"] as const;

const coordenada = (valor: number) => valor.toFixed(6);

/** Consulta OData: só postos da rede CTF com coordenada, dentro da área visível do mapa. */
export function consultaPostosNaArea({ sul, norte, oeste, leste }: Area, limite = LIMITE_POSTOS) {
  const filtro = [
    "new_aceitactf eq true",
    `(new_statusgeo eq null or new_statusgeo ne ${STATUS_GEO_PENDENTE})`,
    `new_latitude ge ${coordenada(sul)}`,
    `new_latitude le ${coordenada(norte)}`,
    `new_longitude ge ${coordenada(oeste)}`,
    `new_longitude le ${coordenada(leste)}`
  ].join(" and ");
  return `$select=${COLUNAS.join(",")}&$filter=${filtro}&$top=${limite}`;
}

export const areaAfastadaDemais = (zoom: number) => zoom < ZOOM_MINIMO_BUSCA;

/** De onde as distâncias são medidas: o GPS do motorista ou, sem ele, o centro padrão. Nunca o posto tocado nem o centro do mapa arrastado. */
export type Origem = { ponto: Posicao; doMotorista: boolean };

export const origemDasDistancias = (posicao: Posicao | null): Origem => (posicao ? { ponto: posicao, doMotorista: true } : { ponto: CENTRO_PADRAO, doMotorista: false });
export const tituloLista = (origem: Origem) => (origem.doMotorista ? "Mais próximos de você" : "Mais próximos do centro de São José dos Campos");
export const rotuloOrigem = (origem: Origem) => (origem.doMotorista ? "de você" : "do centro de São José dos Campos");

/** Caixa de meia-largura `raioKm` em volta do ponto. Tudo a até `raioKm` do ponto cabe nela. */
export function areaEmVolta({ lat, lon }: Posicao, raioKm: number): Area {
  const dLat = raioKm / KM_POR_GRAU;
  const dLon = raioKm / (KM_POR_GRAU * Math.cos((lat * Math.PI) / 180));
  return { sul: lat - dLat, norte: lat + dLat, oeste: lon - dLon, leste: lon + dLon };
}

/**
 * Raios (km) tentados na busca da lista, do menor ao maior. Depois de buscar na caixa de `raioAtual`, devolve o próximo raio ou null se já basta:
 * a lista só é confiável se tem `TAMANHO_LISTA` postos e o último está dentro do raio (nada mais perto ficou fora da caixa).
 * Se a busca bateu o limite, ampliar só piora o recorte arbitrário; sem raio maior, não há o que tentar.
 */
export function proximoRaio(postos: Posto[], origem: Posicao, raioAtual: number, limite = LIMITE_POSTOS) {
  const lista = maisProximos(postos, origem);
  const completa = lista.length >= TAMANHO_LISTA && lista[lista.length - 1].distanciaKm <= raioAtual;
  if (completa || postos.length >= limite) return null;
  return RAIOS_LISTA_KM.find((raio) => raio > raioAtual) ?? null;
}

/** A nova área já foi carregada (inteira dentro da anterior) e a anterior não bateu o limite: não há nada novo a buscar. */
export function areaJaCarregada(nova: Area, { area, cheia }: { area: Area; cheia: boolean }) {
  return !cheia && nova.sul >= area.sul && nova.norte <= area.norte && nova.oeste >= area.oeste && nova.leste <= area.leste;
}

/** Zoom ao centralizar um posto: mantém o atual, limitado a ZOOM_MAXIMO_FOCO. */
export const zoomDoFoco = (zoomAtual: number) => Math.min(zoomAtual, ZOOM_MAXIMO_FOCO);

/** Os mais próximos de `origem`, do menor para o maior; empate pelo nome para a lista não pular. */
export function maisProximos<T extends Posto>(postos: T[], origem: Posicao, quantidade = TAMANHO_LISTA) {
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
