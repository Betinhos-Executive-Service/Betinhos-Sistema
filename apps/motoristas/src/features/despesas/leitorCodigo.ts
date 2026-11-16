// Leitura do QR (NFC-e, SAT) e do Code 128 (DANFE). Usa o BarcodeDetector do navegador quando ele lê os dois formatos;
// senão (Safari no iPhone), o @zxing/library, só com os leitores de QR e de Code 128 (import direto: ~107 KB minificados,
// empacotados no build single-file, sem CDN, carregados só quando faltam; ver zxingLeitores.ts).
export type FormatoCodigo = "qr" | "codigo-barras";
export type CodigoLido = { texto: string; formato: FormatoCodigo };

type DetectorNativo = { detect: (fonte: CanvasImageSource) => Promise<Array<{ rawValue: string; format: string }>> };
type ConstrutorDetector = { new (opcoes: { formats: string[] }): DetectorNativo; getSupportedFormats?: () => Promise<string[]> };

let detectorNativo: Promise<DetectorNativo | null> | null = null;

/** BarcodeDetector só quando suporta qr_code e code_128; qualquer erro cai no leitor JavaScript. */
export function obterDetectorNativo(global: { BarcodeDetector?: ConstrutorDetector } = globalThis as never): Promise<DetectorNativo | null> {
  detectorNativo ??= (async () => {
    const Construtor = global.BarcodeDetector;
    if (!Construtor) return null;
    try {
      const formatos = (await Construtor.getSupportedFormats?.()) ?? [];
      if (!formatos.includes("qr_code") || !formatos.includes("code_128")) return null;
      return new Construtor({ formats: ["qr_code", "code_128"] });
    } catch {
      return null;
    }
  })();
  return detectorNativo;
}

/** Só para testes. */
export function esquecerDetectorNativo() {
  detectorNativo = null;
}

/** Classes do zxing usadas aqui (o app passa as do ESM; os testes, as do build CJS). */
export type LeitoresZxing = {
  BinaryBitmap: new (binarizador: never) => unknown;
  HybridBinarizer: new (fonte: never) => unknown;
  RGBLuminanceSource: new (luminancia: Uint8ClampedArray, largura: number, altura: number) => unknown;
  QRCodeReader: new () => { decode: (bitmap: never, dicas: Map<never, unknown>) => { getText: () => string } };
  Code128Reader: new () => { decode: (bitmap: never, dicas: Map<never, unknown>) => { getText: () => string } };
  DecodeHintType: { TRY_HARDER: unknown };
};

/** Decodifica uma imagem em tons de cinza (1 byte por pixel). Tenta o QR e depois o Code 128. */
export function decodificarLuminancia(z: LeitoresZxing, luminancia: Uint8ClampedArray, largura: number, altura: number): CodigoLido | null {
  const dicas = new Map([[z.DecodeHintType.TRY_HARDER, true]]) as Map<never, unknown>;
  const bitmap = () => new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(luminancia, largura, altura) as never) as never) as never;
  try {
    return { texto: new z.QRCodeReader().decode(bitmap(), dicas).getText(), formato: "qr" };
  } catch {
    // segue para o código de barras
  }
  try {
    return { texto: new z.Code128Reader().decode(bitmap(), dicas).getText(), formato: "codigo-barras" };
  } catch {
    return null;
  }
}

let leitores: Promise<LeitoresZxing> | null = null;
const carregarLeitores = () => (leitores ??= import("./zxingLeitores.ts").then((m) => m.LEITORES_ZXING as unknown as LeitoresZxing));

/** RGBA (ImageData) → luminância, com os pesos de sempre (0,299 R + 0,587 G + 0,114 B). */
export function luminanciaDoRgba(rgba: Uint8ClampedArray, largura: number, altura: number) {
  const saida = new Uint8ClampedArray(largura * altura);
  for (let i = 0, p = 0; i < saida.length; i++, p += 4) saida[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  return saida;
}

const LADO_MAXIMO = 1280;

/** Lê um quadro do vídeo ou uma imagem. null = nada lido (o chamador tenta de novo no próximo quadro). */
export async function lerCodigo(fonte: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<CodigoLido | null> {
  const largura = fonte instanceof HTMLVideoElement ? fonte.videoWidth : fonte instanceof HTMLImageElement ? fonte.naturalWidth : fonte.width;
  const altura = fonte instanceof HTMLVideoElement ? fonte.videoHeight : fonte instanceof HTMLImageElement ? fonte.naturalHeight : fonte.height;
  if (!largura || !altura) return null;
  const nativo = await obterDetectorNativo();
  if (nativo) {
    try {
      const [achado] = await nativo.detect(fonte);
      return achado ? { texto: achado.rawValue, formato: achado.format === "qr_code" ? "qr" : "codigo-barras" } : null;
    } catch {
      // cai no leitor JavaScript
    }
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  const contexto = canvas.getContext("2d", { willReadFrequently: true });
  if (!contexto) return null;
  contexto.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  const { data } = contexto.getImageData(0, 0, canvas.width, canvas.height);
  return decodificarLuminancia(await carregarLeitores(), luminanciaDoRgba(data, canvas.width, canvas.height), canvas.width, canvas.height);
}

/** Foto (data URL) → código. Usado quando a câmera é a nativa (iPhone) ou no "tirar foto do código". */
export async function lerCodigoDaFoto(dataUrl: string): Promise<CodigoLido | null> {
  const imagem = new Image();
  imagem.src = dataUrl;
  await imagem.decode();
  return lerCodigo(imagem);
}
