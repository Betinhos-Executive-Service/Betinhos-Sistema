// Leitura de metadados e impressão visual dos arquivos da galeria (fase 2 da prova de captura), sem dependência nova.
// Lê só os bytes iniciais: o EXIF fica no começo do JPEG e a caixa mvhd é achada pulando os cabeçalhos das caixas do MP4.

export type MetadadosArquivo = {
  /** ISO com fuso. Sem OffsetTimeOriginal, o horário do EXIF vale como horário de Brasília (-03:00). */
  dataGravada: string | null;
  offset: string | null;
  marca: string | null;
  modelo: string | null;
  software: string | null;
};

export const SEM_METADADOS: MetadadosArquivo = { dataGravada: null, offset: null, marca: null, modelo: null, software: null };
export const BYTES_EXIF = 128 * 1024;
const FUSO_PADRAO = "-03:00";

/** Lê uma faixa [inicio, fim) do arquivo; no navegador é `file.slice(...).arrayBuffer()`. */
export type LeitorBytes = (inicio: number, fim: number) => Promise<Uint8Array>;

export function leitorDeArquivo(arquivo: Blob): LeitorBytes {
  return async (inicio, fim) => new Uint8Array(await arquivo.slice(inicio, Math.min(fim, arquivo.size)).arrayBuffer());
}

// ---------- EXIF do JPEG ----------

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_SOFTWARE = 0x0131;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATA_ORIGINAL = 0x9003;
const TAG_OFFSET_ORIGINAL = 0x9011;

/** EXIF do JPEG (DateTimeOriginal, OffsetTimeOriginal, Make, Model, Software). Sem EXIF ou corrompido: tudo nulo. */
export function lerExifJpeg(bytes: Uint8Array): MetadadosArquivo {
  try {
    const tiff = acharTiff(bytes);
    if (!tiff) return SEM_METADADOS;
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const le = view.getUint16(0) === 0x4949;
    if (!le && view.getUint16(0) !== 0x4d4d) return SEM_METADADOS;
    const ifd0 = lerIfd(view, view.getUint32(4, le), le);
    const exifOffset = ifd0.get(TAG_EXIF_IFD);
    const exif = typeof exifOffset === "number" ? lerIfd(view, exifOffset, le) : new Map<number, string | number>();
    const texto = (valor: string | number | undefined) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);
    const offset = normalizarOffset(texto(exif.get(TAG_OFFSET_ORIGINAL)));
    return {
      dataGravada: dataDoExif(texto(exif.get(TAG_DATA_ORIGINAL)), offset),
      offset,
      marca: texto(ifd0.get(TAG_MAKE)),
      modelo: texto(ifd0.get(TAG_MODEL)),
      software: texto(ifd0.get(TAG_SOFTWARE))
    };
  } catch {
    return SEM_METADADOS;
  }
}

function acharTiff(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marcador = bytes[i + 1];
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marcador === 0xda || marcador === 0xd9) return null;
    // APP1 com "Exif\0\0".
    if (marcador === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) {
      return bytes.subarray(i + 10, Math.min(bytes.length, i + 2 + tamanho));
    }
    i += 2 + tamanho;
  }
  return null;
}

function lerIfd(view: DataView, inicio: number, le: boolean) {
  const tags = new Map<number, string | number>();
  if (inicio + 2 > view.byteLength) return tags;
  const total = view.getUint16(inicio, le);
  for (let n = 0; n < total; n += 1) {
    const entrada = inicio + 2 + n * 12;
    if (entrada + 12 > view.byteLength) break;
    const tag = view.getUint16(entrada, le);
    const tipo = view.getUint16(entrada + 2, le);
    const quantidade = view.getUint32(entrada + 4, le);
    if (tipo === 2) {
      const origem = quantidade <= 4 ? entrada + 8 : view.getUint32(entrada + 8, le);
      if (origem + quantidade > view.byteLength) continue;
      let texto = "";
      for (let k = 0; k < quantidade; k += 1) {
        const c = view.getUint8(origem + k);
        if (c === 0) break;
        texto += String.fromCharCode(c);
      }
      tags.set(tag, texto);
    } else if (tipo === 4 && quantidade === 1) {
      tags.set(tag, view.getUint32(entrada + 8, le));
    }
  }
  return tags;
}

function normalizarOffset(texto: string | null) {
  return texto && /^[+-]\d{2}:\d{2}$/.test(texto) ? texto : null;
}

/** "2026:11:15 14:30:00" + "-03:00" -> "2026-11-15T14:30:00-03:00". Data zerada ou inválida: null. */
function dataDoExif(texto: string | null, offset: string | null) {
  const partes = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(texto ?? "");
  if (!partes || partes[1] === "0000") return null;
  const iso = `${partes[1]}-${partes[2]}-${partes[3]}T${partes[4]}:${partes[5]}:${partes[6]}${offset ?? FUSO_PADRAO}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// ---------- mvhd do MP4/MOV ----------

const SEGUNDOS_1904_A_1970 = 2_082_844_800;
const ANO_MINIMO = 2000;
const MAX_MOOV = 1024 * 1024;

/**
 * creation_time da caixa mvhd (segundos desde 1904). Data fora de 2000 até agora mais um ano (época errada, zero)
 * vale como sem data.
 */
export async function lerMvhd(ler: LeitorBytes, tamanho: number, agora = new Date()): Promise<MetadadosArquivo> {
  try {
    let inicio = 0;
    // Caixas de topo: só os 16 bytes do cabeçalho de cada uma, até achar a moov (que pode ficar no fim do arquivo).
    for (let caixas = 0; inicio + 8 <= tamanho && caixas < 64; caixas += 1) {
      const cabecalho = await ler(inicio, inicio + 16);
      const view = new DataView(cabecalho.buffer, cabecalho.byteOffset, cabecalho.byteLength);
      let tamanhoCaixa = view.getUint32(0);
      const tipo = String.fromCharCode(...cabecalho.subarray(4, 8));
      let cabecalhoTamanho = 8;
      if (tamanhoCaixa === 1) {
        tamanhoCaixa = Number(view.getBigUint64(8));
        cabecalhoTamanho = 16;
      } else if (tamanhoCaixa === 0) {
        tamanhoCaixa = tamanho - inicio;
      }
      if (tamanhoCaixa < cabecalhoTamanho) break;
      if (tipo === "moov") {
        const moov = await ler(inicio + cabecalhoTamanho, inicio + Math.min(tamanhoCaixa, MAX_MOOV));
        return { ...SEM_METADADOS, dataGravada: dataDoMvhd(moov, agora) };
      }
      inicio += tamanhoCaixa;
    }
  } catch {
    // Arquivo truncado ou fora do padrão: segue sem data.
  }
  return SEM_METADADOS;
}

function dataDoMvhd(moov: Uint8Array, agora: Date) {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  for (let i = 0; i + 8 <= moov.length; ) {
    const tamanho = view.getUint32(i);
    const tipo = String.fromCharCode(...moov.subarray(i + 4, i + 8));
    if (tipo === "mvhd") {
      const versao = moov[i + 8];
      const segundos = versao === 1 ? Number(view.getBigUint64(i + 12)) : view.getUint32(i + 12);
      const data = new Date((segundos - SEGUNDOS_1904_A_1970) * 1000);
      const limite = agora.getTime() + 365 * 24 * 60 * 60 * 1000;
      if (!segundos || data.getUTCFullYear() < ANO_MINIMO || data.getTime() > limite) return null;
      return data.toISOString();
    }
    if (tamanho < 8) break;
    i += tamanho;
  }
  return null;
}

// ---------- dHash ----------

export const DHASH_LARGURA = 9;
export const DHASH_ALTURA = 8;

/** dHash de 64 bits (hex) de uma amostra RGBA 9x8: bit 1 quando o pixel é mais claro que o vizinho da direita. */
export function dhashDaAmostra(rgba: ArrayLike<number>) {
  const cinza = (x: number, y: number) => {
    const p = (y * DHASH_LARGURA + x) * 4;
    return rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114;
  };
  let hex = "";
  for (let y = 0; y < DHASH_ALTURA; y += 1) {
    let byte = 0;
    for (let x = 0; x < 8; x += 1) byte = (byte << 1) | (cinza(x, y) > cinza(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

// ---------- janela do evento ----------

export const ANTES_DA_REFERENCIA_MS = 24 * 60 * 60 * 1000;
export const TOLERANCIA_RELOGIO_MS = 10 * 60 * 1000;

/** "2026-11-15" (data) ou "2026-11-15T14:30" (datetime-local) viram horário de Brasília; ISO com fuso fica como está. */
export function referenciaIso(texto: string | null | undefined) {
  const valor = (texto ?? "").trim();
  if (!valor) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T00:00:00${FUSO_PADRAO}`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(valor) ? `${valor.length === 16 ? `${valor}:00` : valor}${FUSO_PADRAO}`
      : valor;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Selo da data gravada: "sem-data", "fora-da-janela" ou nenhum. Nunca bloqueia; o servidor recalcula. */
export function seloDaJanela(dataGravada: string | null, referencia: string | null, agora: Date) {
  if (!dataGravada) return "sem-data";
  const gravada = Date.parse(dataGravada);
  const inicio = referencia ? Date.parse(referencia) - ANTES_DA_REFERENCIA_MS : Number.NEGATIVE_INFINITY;
  return gravada < inicio || gravada > agora.getTime() + TOLERANCIA_RELOGIO_MS ? "fora-da-janela" : null;
}
