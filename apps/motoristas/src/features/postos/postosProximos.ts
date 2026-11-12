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
export const LIMITE_POSTOS = 200;
export const TAMANHO_LISTA = 10;
export const ESPERA_BUSCA_MS = 400;
/** Raio dos candidatos da lista (km): 10, ampliado para 30 se não houver `TAMANHO_LISTA` postos CTF dentro. */
export const RAIOS_LISTA_KM = [10, 30];
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

/** De onde as distâncias são medidas: o GPS do motorista ou, sem ele, o centro padrão. Nunca o posto tocado nem o centro do mapa arrastado. */
export type Origem = { ponto: Posicao; doMotorista: boolean };

export const origemDasDistancias = (posicao: Posicao | null): Origem => (posicao ? { ponto: posicao, doMotorista: true } : { ponto: CENTRO_PADRAO, doMotorista: false });
/** "Recomendados" quando a ordem usou preço e recomendação; sem o ranking a lista cai na distância e o título diz isso. */
export const tituloLista = (origem: Origem, recomendados = false) => `${recomendados ? "Recomendados perto" : "Mais próximos"} ${origem.doMotorista ? "de você" : "do centro de SJC"}`;
export const rotuloOrigem = (origem: Origem) => (origem.doMotorista ? "de você" : "do centro de São José dos Campos");

/** Caixa de meia-largura `raioKm` em volta do ponto. Tudo a até `raioKm` do ponto cabe nela. */
export function areaEmVolta({ lat, lon }: Posicao, raioKm: number): Area {
  const dLat = raioKm / KM_POR_GRAU;
  const dLon = raioKm / (KM_POR_GRAU * Math.cos((lat * Math.PI) / 180));
  return { sul: lat - dLat, norte: lat + dLat, oeste: lon - dLon, leste: lon + dLon };
}

/** Postos a até `raioKm` de `origem`, do mais perto ao mais longe. */
const dentroDe = <T extends Posto>(postos: T[], origem: Posicao, raioKm: number) => maisProximos(postos, origem, Infinity).filter((posto) => posto.distanciaKm <= raioKm);

/**
 * Depois de buscar na caixa de `raioAtual`, devolve o próximo raio ou null se já basta: basta com `TAMANHO_LISTA` postos dentro do raio.
 * Se a busca bateu o limite, ampliar só piora o recorte arbitrário; sem raio maior, não há o que tentar.
 */
export function proximoRaio(postos: Posto[], origem: Posicao, raioAtual: number, limite = LIMITE_POSTOS) {
  if (dentroDe(postos, origem, raioAtual).length >= TAMANHO_LISTA || postos.length >= limite) return null;
  return RAIOS_LISTA_KM.find((raio) => raio > raioAtual) ?? null;
}

/** Candidatos da lista: os postos no menor raio de RAIOS_LISTA_KM com `TAMANHO_LISTA` postos (ou no maior), do mais perto ao mais longe. */
export function candidatosDaLista<T extends Posto>(postos: T[], origem: Posicao) {
  const raio = RAIOS_LISTA_KM.find((km) => dentroDe(postos, origem, km).length >= TAMANHO_LISTA) ?? RAIOS_LISTA_KM[RAIOS_LISTA_KM.length - 1];
  return dentroDe(postos, origem, raio);
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

// Gaveta com a lista: três posições (recolhida, meio, aberta), medidas em deslocamento vertical (translateY) a partir da posição aberta.
export type PosicaoGaveta = "recolhida" | "meio" | "aberta";
export type Gaveta = { total: number; visivel: Record<PosicaoGaveta, number>; deslocamento: Record<PosicaoGaveta, number> };
/** Acima desta velocidade (px/ms) o arrasto vira "flick": vai para a próxima posição na direção do gesto, mesmo sem passar do meio do caminho. */
export const VELOCIDADE_FLICK = 0.11;
/** Altura da gaveta recolhida (puxador, título e contagem). */
export const ALTURA_RECOLHIDA = 76;
/** Faixa do topo que a gaveta aberta deixa livre: `--pp-topo` do postos.css (70: cabeçalho de 62 + folga) + botões de zoom e "minha posição" (10 + 80 + 8 + 40 + 10). */
const FAIXA_CONTROLES = 218;
const FRICCAO = 0.25;

/** Alturas visíveis e deslocamentos da gaveta para um palco de `altura` px. Aberta nunca cobre o cabeçalho nem os botões do mapa, inclusive em tela baixa; meio mostra uns 34%. */
export function medidasGaveta(altura: number): Gaveta {
  const total = Math.max(Math.round(altura - FAIXA_CONTROLES), ALTURA_RECOLHIDA);
  const meio = Math.min(total, Math.max(Math.round(altura * 0.34), 200));
  const visivel = { recolhida: ALTURA_RECOLHIDA, meio, aberta: total };
  return { total, visivel, deslocamento: { recolhida: total - visivel.recolhida, meio: total - visivel.meio, aberta: 0 } };
}

/** Fricção nas bordas: além do limite o deslocamento acompanha o dedo com 25% da distância. */
export function comFriccao(deslocamento: number, minimo: number, maximo: number) {
  if (deslocamento < minimo) return minimo + (deslocamento - minimo) * FRICCAO;
  if (deslocamento > maximo) return maximo + (deslocamento - maximo) * FRICCAO;
  return deslocamento;
}

/** Onde a gaveta assenta ao soltar. `velocidade` em px/ms, positiva descendo. Flick vai à próxima posição na direção do gesto; senão, a mais próxima. */
export function posicaoAposArrasto(deslocamento: number, velocidade: number, gaveta: Gaveta): PosicaoGaveta {
  const posicoes = (Object.keys(gaveta.deslocamento) as PosicaoGaveta[]).sort((a, b) => gaveta.deslocamento[a] - gaveta.deslocamento[b]);
  if (Math.abs(velocidade) > VELOCIDADE_FLICK) {
    const sentido = Math.sign(velocidade);
    const adiante = posicoes.filter((posicao) => (gaveta.deslocamento[posicao] - deslocamento) * sentido > 1);
    if (adiante.length) return sentido > 0 ? adiante[0] : adiante[adiante.length - 1];
    return sentido > 0 ? posicoes[posicoes.length - 1] : posicoes[0];
  }
  return posicoes.reduce((melhor, posicao) => (Math.abs(gaveta.deslocamento[posicao] - deslocamento) < Math.abs(gaveta.deslocamento[melhor] - deslocamento) ? posicao : melhor));
}

/** Toque no puxador: recolhida abre no meio, meio abre de vez, aberta volta ao meio. */
export const posicaoAposToque = (posicao: PosicaoGaveta): PosicaoGaveta => (posicao === "meio" ? "aberta" : "meio");

// Sem sinal: os últimos dados carregados ficam no aparelho por 7 dias.
export const VALIDADE_GUARDADO_MS = 7 * 24 * 60 * 60 * 1000;
export const guardadoValido = (salvoEm: number, agora: number) => Number.isFinite(salvoEm) && salvoEm <= agora && agora - salvoEm <= VALIDADE_GUARDADO_MS;

const FUSO = "America/Sao_Paulo";
/** "Sem conexão · dados de 10/11 14:32", no fuso de São Paulo. */
export function rotuloSemConexao(salvoEm: number) {
  const partes = new Map(new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(salvoEm)).map(({ type, value }) => [type, value]));
  return `Sem conexão · dados de ${partes.get("day")}/${partes.get("month")} ${partes.get("hour")}:${partes.get("minute")}`;
}
