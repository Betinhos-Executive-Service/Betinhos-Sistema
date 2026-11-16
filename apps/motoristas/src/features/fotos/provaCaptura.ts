import { dataUrlToBase64 } from "../../data/dataverse/arquivos.ts";
import { reportAppError } from "../../shared/appErrorLogger.ts";
import { PDFDocument } from "pdf-lib";
import { loadMediaDraft, saveMediaDraft } from "./mediaDraftStore.ts";
import {
  BYTES_EXIF,
  DHASH_ALTURA,
  DHASH_LARGURA,
  SEM_METADADOS,
  dhashDaAmostra,
  leitorDeArquivo,
  lerExifJpeg,
  lerMvhd,
  referenciaIso,
  seloDaJanela
} from "./metadadosArquivo.ts";
import {
  conferirProvaMidiaRemote,
  emitirProvaMidiaRemote,
  registrarProvaMidiaRemote,
  type ComandoRegistroProva,
  type LocalizacaoProva,
  type OrigemProva,
  type PortaProva,
  type TelaProva
} from "./provaRemota.ts";

// Prova de captura (fase 1): código do servidor ao abrir a câmera, carimbo e redução na foto, SHA-256 dos bytes
// enviados, localização só registrada e fila no aparelho. Nada aqui bloqueia o anexo: sem rede vira "sem rede",
// e falha ao registrar deixa a prova pendente para reenviar.
// Fase 2: arquivo da galeria (foto, vídeo ou PDF) por tela, data gravada no arquivo (selo, nunca bloqueia), dHash e
// conferência de repetida antes do envio (a repetida bloqueia; sem rede segue e o servidor reconfere ao registrar).

export type { OrigemProva, TelaProva } from "./provaRemota.ts";

export const FOTO_MAX_LADO = 2048;
export const FOTO_QUALIDADE = 0.85;
export const VIDEO_MAX_SEGUNDOS = 120;
export const VIDEO_MAX_BYTES = 70 * 1024 * 1024;
export const VIDEO_BITRATE = 4_000_000;
export const CODIGO_ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_MAX_PAGINAS = 20;
const PENDENTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const EMITIR_TIMEOUT_MS = 4000;
const FILA_CHAVE = "prova-captura";

export type OrigemCaptura = ComandoRegistroProva["origemCaptura"];

export type SessaoProva = OrigemProva & {
  codigo: string;
  emitidoEm: string | null;
  assinatura: string | null;
  semRede: boolean;
  /** Atualizada quando o celular responde; a captura usa o que houver no momento, sem esperar. */
  localizacao: LocalizacaoProva;
};

export type DadosProva = Pick<ComandoRegistroProva, "tipoMidia" | "tamanhoBytes" | "duracaoSegundos" | "sha256" | "origemCaptura" | "capturadoEm" | "localizacao">
  & Pick<ComandoRegistroProva, "sha256Original" | "dhashes" | "paginas" | "metadados" | "dataReferencia">;
export type ContextoCarimbo = { placa?: string; registro?: string };
export type EntradaProva = { sessao: SessaoProva; dados: DadosProva; link?: string; criadoEm: number };
export type FilaProvas = { carregar: () => Promise<EntradaProva[]>; gravar: (lista: EntradaProva[]) => Promise<void> };

type Contexto2D = Pick<CanvasRenderingContext2D, "drawImage" | "fillRect" | "fillText" | "measureText"> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textBaseline: CanvasTextBaseline;
};
export type Desenho = {
  carregar: (dataUrl: string) => Promise<{ largura: number; altura: number; imagem: CanvasImageSource }>;
  criarTela: (largura: number, altura: number) => { contexto: Contexto2D; imagem: CanvasImageSource; exportarJpeg: (qualidade: number) => string };
  /** Pixels RGBA da imagem reduzida a largura x altura (para o dHash). */
  amostrar: (imagem: CanvasImageSource, largura: number, altura: number) => ArrayLike<number>;
};

export type DependenciasProva = {
  porta: PortaProva;
  fila: FilaProvas;
  desenho: Desenho;
  agora?: () => Date;
  localizar?: () => Promise<LocalizacaoProva>;
  aoFalhar?: (erro: unknown, acao: string) => void;
  /** Duração do vídeo escolhido na galeria (no navegador, pelo elemento <video>). */
  duracaoVideo?: (video: Blob) => Promise<number | null>;
};

/** O que cada tela aceita da galeria: documento (imagem ou PDF) e foto ou vídeo do momento. */
export type AceiteGaleria = { documento: boolean; momento: boolean };
export const GALERIA_POR_TELA: Record<TelaProva, AceiteGaleria> = {
  despesa: { documento: true, momento: false },
  devolucao: { documento: true, momento: false },
  manutencao: { documento: true, momento: true },
  finalizar: { documento: true, momento: true },
  colisao: { documento: true, momento: true },
  recebimento: { documento: false, momento: true },
  checklist: { documento: false, momento: false }
};

export function aceitaGaleria(tela: TelaProva) {
  const aceite = GALERIA_POR_TELA[tela];
  return aceite.documento || aceite.momento;
}

/** Valor do accept do seletor: imagem sempre; PDF só com documento; vídeo só com momento e numa tela que aceita vídeo. */
export function acceptDaGaleria(tela: TelaProva) {
  const aceite = GALERIA_POR_TELA[tela];
  return ["image/*", aceite.documento ? "application/pdf" : "", aceite.momento && permiteVideo(tela) ? "video/*" : ""].filter(Boolean).join(",");
}

export type ArquivoDaGaleria =
  | { ok: false; erro: string }
  | { ok: true; tipo: "foto" | "pdf"; dataUrl: string; dados: DadosProva; selo: string | null; parecida: boolean }
  | { ok: true; tipo: "video"; video: Blob; dados: DadosProva; selo: string | null; parecida: boolean };

const formatoDia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** Recusa da repetida: só a data do uso anterior, sem motorista, tela nem link. */
export function mensagemRepetida(tipo: "foto" | "video" | "pdf", usadaEm: string | null) {
  const quando = usadaEm && !Number.isNaN(Date.parse(usadaEm)) ? ` em ${formatoDia.format(new Date(usadaEm))}` : "";
  if (tipo === "foto") return `Esta foto já foi usada em outro registro${quando}. Tire uma foto nova.`;
  return `${tipo === "video" ? "Este vídeo" : "Este PDF"} já foi usado em outro registro${quando}. Escolha outro arquivo.`;
}

function tipoDoArquivo(arquivo: File) {
  if (arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name)) return "pdf";
  if (arquivo.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(arquivo.name)) return "video";
  if (arquivo.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(arquivo.name)) return "foto";
  return null;
}

const SEM_LOCALIZACAO: LocalizacaoProva = { estado: "indisponivel", latitude: null, longitude: null, precisaoMetros: null };
const TELAS_SEM_VIDEO: ReadonlySet<TelaProva> = new Set(["despesa", "devolucao"]);

/** Despesa (e a devolução dela) só aceita foto: a análise de IA da despesa recusa vídeo. */
export function permiteVideo(tela: TelaProva) {
  return !TELAS_SEM_VIDEO.has(tela);
}

/** Motivo da recusa de um PDF (até 10 MB e 20 páginas), ou "". */
export function validarPdf(pdf: { tamanhoBytes: number; paginas: number | null }) {
  if (pdf.tamanhoBytes > PDF_MAX_BYTES) return `PDF muito grande (${formatarMb(pdf.tamanhoBytes)}). O limite é ${formatarMb(PDF_MAX_BYTES)}.`;
  if (pdf.paginas === null) return "Não foi possível abrir este PDF. Escolha outro arquivo.";
  if (pdf.paginas > PDF_MAX_PAGINAS) return `PDF com ${pdf.paginas} páginas. O limite é ${PDF_MAX_PAGINAS} páginas.`;
  return "";
}

/** Páginas do PDF pelo pdf-lib (já dependência do app); arquivo que não abre devolve null. */
export async function contarPaginasPdf(bytes: Uint8Array) {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    return null;
  }
}

const MB = 1024 * 1024;

/** "85 MB", arredondado para cima: 70,2 MB não pode aparecer como "70 MB" na recusa. */
function formatarMb(bytes: number) {
  return `${Math.ceil(bytes / MB)} MB`;
}

/** "2 min 40 s", "2 minutos" (sem segundos sobrando) ou "45 s". */
export function formatarDuracao(segundos: number) {
  const total = Math.ceil(segundos);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  if (!min) return `${seg} s`;
  if (!seg) return min === 1 ? "1 minuto" : `${min} minutos`;
  return `${min} min ${seg} s`;
}

/** Motivo da recusa de um vídeo (câmera ou galeria), com o número real, ou "" quando cabe nos limites. */
export function validarVideo(video: { duracaoSegundos: number | null; tamanhoBytes: number }) {
  if (video.tamanhoBytes > VIDEO_MAX_BYTES) {
    return `Vídeo muito grande (${formatarMb(video.tamanhoBytes)}). O limite é ${formatarMb(VIDEO_MAX_BYTES)}: grave um vídeo mais curto.`;
  }
  const duracao = video.duracaoSegundos ?? 0;
  if (duracao > VIDEO_MAX_SEGUNDOS) return `Vídeo muito longo (${formatarDuracao(duracao)}). O limite é ${formatarDuracao(VIDEO_MAX_SEGUNDOS)}.`;
  return "";
}

const PLACA = /\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/i;

/** Placa (Mercosul ou antiga) achada num rótulo de veículo, ou "". */
export function placaDoTexto(texto?: string | null) {
  return PLACA.exec(texto ?? "")?.[0].toUpperCase().replace("-", "") ?? "";
}

export function placaDosVeiculos(veiculos: Array<{ id: string; label: string }>, atualId: string) {
  return placaDoTexto(veiculos.find((veiculo) => veiculo.id === atualId)?.label);
}

/** Placa do serviço ou da manutenção, pelo campo de veículo do detalhe. */
export function placaDoDetalhe(detalhe: { fields: Array<{ label: string; value: string }> } | null | undefined) {
  return placaDoTexto(detalhe?.fields.find((campo) => /ve[ií]culo|placa/i.test(campo.label))?.value);
}

/**
 * Dimensões da imagem reduzida (maior lado até 2048 px) e a faixa do carimbo, acrescentada abaixo dela: o canvas
 * fica com altura + faixa e nenhum pixel da foto é coberto (o total do cupom costuma estar no rodapé).
 */
export function planejarFoto(largura: number, altura: number, maxLado = FOTO_MAX_LADO) {
  const escala = Math.min(1, maxLado / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));
  // A faixa acompanha a largura, que é onde o texto precisa caber.
  const faixa = Math.max(40, Math.round(w * 0.08));
  return { largura: w, altura: h, faixa, alturaTotal: h + faixa };
}

const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
});

export function textoDoCarimbo(sessao: Pick<SessaoProva, "semRede" | "codigo">, contexto: ContextoCarimbo, capturadoEm: Date) {
  const linha1 = [formatoHora.format(capturadoEm).replace(",", ""), contexto.placa, contexto.registro].filter(Boolean).join(" · ");
  return [linha1, sessao.semRede ? "SEM REDE" : `Código ${sessao.codigo}`];
}

/** Faixa opaca de `topo` até `topo + faixa`, abaixo da foto. */
function desenharCarimbo(ctx: Contexto2D, largura: number, topo: number, faixa: number, linhas: string[]) {
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, topo, largura, faixa);
  const margem = Math.round(faixa * 0.25);
  let fonte = Math.max(8, Math.floor(faixa * 0.36));
  const caber = () => linhas.every((linha) => ctx.measureText(linha).width <= largura - margem * 2);
  ctx.font = `600 ${fonte}px sans-serif`;
  while (fonte > 8 && !caber()) {
    fonte -= 1;
    ctx.font = `600 ${fonte}px sans-serif`;
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  linhas.forEach((linha, indice) => ctx.fillText(linha, margem, topo + (faixa * (indice + 0.5)) / linhas.length));
}

function base64DeBytes(bytes: Uint8Array) {
  // Em blocos: String.fromCharCode com o arquivo inteiro estoura a pilha.
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

function bytesDoDataUrl(dataUrl: string) {
  // Laço simples: Uint8Array.from com callback por byte trava o celular num vídeo de 70 MB.
  const binario = atob(dataUrlToBase64(dataUrl));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Tamanho dos bytes de um data URL sem decodificar (para não decodificar 70 MB de vídeo à toa). */
function tamanhoDoDataUrl(dataUrl: string) {
  const base64 = dataUrlToBase64(dataUrl);
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

function dhashDe(desenho: Desenho, imagem: CanvasImageSource) {
  return dhashDaAmostra(desenho.amostrar(imagem, DHASH_LARGURA, DHASH_ALTURA));
}

async function sha256Hex(bytes: BufferSource) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function codigoLocal() {
  const valores = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(valores, (valor) => CODIGO_ALFABETO[valor % CODIGO_ALFABETO.length]).join("");
}

function comTempoLimite<T>(promessa: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tempo esgotado.")), ms);
    promessa.then((valor) => { clearTimeout(timer); resolve(valor); }, (erro) => { clearTimeout(timer); reject(erro); });
  });
}

export function criarProvaCaptura(deps: DependenciasProva) {
  const agora = deps.agora ?? (() => new Date());
  const aoFalhar = deps.aoFalhar ?? (() => undefined);
  // Leitura e gravação da fila em série: envios em paralelo (finalizar com 4 fotos) não se sobrescrevem.
  let filaEmSerie: Promise<unknown> = Promise.resolve();
  const naFila = <T>(operacao: (lista: EntradaProva[]) => Promise<{ lista?: EntradaProva[]; valor: T }>) => {
    const resultado = filaEmSerie.then(async () => {
      const lista = await deps.fila.carregar().catch(() => []);
      const { lista: nova, valor } = await operacao(lista);
      if (nova) await deps.fila.gravar(nova).catch((erro) => aoFalhar(erro, "gravar-fila"));
      return valor;
    });
    filaEmSerie = resultado.catch(() => undefined);
    return resultado;
  };
  const guardar = (entrada: EntradaProva) =>
    naFila(async (lista) => ({ lista: [...lista.filter((item) => item.dados.sha256 !== entrada.dados.sha256), entrada], valor: undefined }));
  const retirar = (sha256: string) => naFila(async (lista) => ({ lista: lista.filter((item) => item.dados.sha256 !== sha256), valor: undefined }));

  async function iniciar(origem: OrigemProva): Promise<SessaoProva> {
    const sessao: SessaoProva = { ...origem, codigo: "", emitidoEm: null, assinatura: null, semRede: true, localizacao: SEM_LOCALIZACAO };
    if (deps.localizar) {
      void deps.localizar().then((local) => { sessao.localizacao = local; }, () => undefined);
    }
    try {
      const emissao = await comTempoLimite(deps.porta.emitirProvaMidia(origem), EMITIR_TIMEOUT_MS);
      Object.assign(sessao, { codigo: emissao.codigo, emitidoEm: emissao.emitidoEm, assinatura: emissao.assinatura, semRede: false });
    } catch (erro) {
      aoFalhar(erro, "emitir");
      sessao.codigo = codigoLocal();
    }
    return sessao;
  }

  async function aplicarNaFoto(sessao: SessaoProva, fotoDataUrl: string, contexto: ContextoCarimbo, origemCaptura: OrigemCaptura, opcoes: { maxLado?: number; qualidade?: number } = {}) {
    const capturadoEm = agora();
    const original = await deps.desenho.carregar(fotoDataUrl);
    const plano = planejarFoto(original.largura, original.altura, opcoes.maxLado);
    const tela = deps.desenho.criarTela(plano.largura, plano.alturaTotal);
    tela.contexto.drawImage(original.imagem, 0, 0, plano.largura, plano.altura);
    desenharCarimbo(tela.contexto, plano.largura, plano.altura, plano.faixa, textoDoCarimbo(sessao, contexto, capturadoEm));
    const dataUrl = tela.exportarJpeg(opcoes.qualidade ?? FOTO_QUALIDADE);
    const bytes = bytesDoDataUrl(dataUrl);
    // Dois dHash: o da cena (antes do carimbo) e o da foto final, para pegar quem salva a foto carimbada e reenvia da galeria.
    const dados: DadosProva = {
      tipoMidia: "foto", tamanhoBytes: bytes.length, duracaoSegundos: null, sha256: await sha256Hex(bytes),
      origemCaptura, capturadoEm: capturadoEm.toISOString(), localizacao: sessao.localizacao,
      dhashes: [dhashDe(deps.desenho, original.imagem), dhashDe(deps.desenho, tela.imagem)]
    };
    await guardar({ sessao, dados, criadoEm: capturadoEm.getTime() });
    return { dataUrl, dados };
  }

  async function dadosDoVideo(sessao: SessaoProva, video: Blob, origemCaptura: OrigemCaptura, duracaoSegundos: number | null) {
    const capturadoEm = agora();
    const dados: DadosProva = {
      tipoMidia: "video", tamanhoBytes: video.size, duracaoSegundos: duracaoSegundos === null ? null : Math.round(duracaoSegundos * 10) / 10, sha256: await sha256Hex(await video.arrayBuffer()),
      origemCaptura, capturadoEm: capturadoEm.toISOString(), localizacao: sessao.localizacao
    };
    await guardar({ sessao, dados, criadoEm: capturadoEm.getTime() });
    return dados;
  }

  /** Conferência antes do envio: só "repetida" recusa. Sem resposta (rede, servidor), segue: o registrar reconfere. */
  async function conferir(sessao: SessaoProva, sha256: string, dhashes: string[]) {
    try {
      return await deps.porta.conferirProvaMidia({ tela: sessao.tela, tabela: sessao.tabela, registroId: sessao.registroId, sha256, dhashes });
    } catch (erro) {
      aoFalhar(erro, "conferir");
      return null;
    }
  }

  /**
   * Arquivo escolhido na galeria: lê a data gravada, calcula SHA-256 e dHash do original, confere a repetida e só
   * então reduz a foto (2048 px, JPEG 0,85, sem carimbo: não foi capturada pelo app). PDF e vídeo sobem como vieram.
   */
  async function prepararDaGaleria(sessao: SessaoProva, arquivo: File, opcoes: { referencia?: string | null } = {}): Promise<ArquivoDaGaleria> {
    const tipo = tipoDoArquivo(arquivo);
    const aceite = GALERIA_POR_TELA[sessao.tela];
    const aceito = tipo === "pdf" ? aceite.documento : tipo === "video" ? aceite.momento && permiteVideo(sessao.tela) : tipo === "foto" && (aceite.documento || aceite.momento);
    if (!tipo || !aceito) return { ok: false, erro: "Este tipo de arquivo não é aceito nesta tela." };
    const agoraCaptura = agora();
    const referencia = referenciaIso(opcoes.referencia);
    const base = { origemCaptura: "galeria" as const, capturadoEm: agoraCaptura.toISOString(), localizacao: sessao.localizacao, dataReferencia: referencia };

    if (tipo === "pdf") {
      if (arquivo.size > PDF_MAX_BYTES) return { ok: false, erro: validarPdf({ tamanhoBytes: arquivo.size, paginas: 0 }) };
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const paginas = await contarPaginasPdf(bytes);
      const recusa = validarPdf({ tamanhoBytes: arquivo.size, paginas });
      if (recusa) return { ok: false, erro: recusa };
      const sha256 = await sha256Hex(bytes);
      const conferencia = await conferir(sessao, sha256, []);
      if (conferencia?.resultado === "repetida") return { ok: false, erro: mensagemRepetida("pdf", conferencia.usadaEm) };
      const dados: DadosProva = { ...base, tipoMidia: "pdf", tamanhoBytes: bytes.length, duracaoSegundos: null, sha256, paginas, metadados: null };
      await guardar({ sessao, dados, criadoEm: agoraCaptura.getTime() });
      return { ok: true, tipo: "pdf", dataUrl: `data:application/pdf;base64,${base64DeBytes(bytes)}`, dados, selo: null, parecida: false };
    }

    if (tipo === "video") {
      const duracao = deps.duracaoVideo ? await deps.duracaoVideo(arquivo).catch(() => null) : null;
      const recusa = validarVideo({ duracaoSegundos: duracao, tamanhoBytes: arquivo.size });
      if (recusa) return { ok: false, erro: recusa };
      const metadados = await lerMvhd(leitorDeArquivo(arquivo), arquivo.size, agoraCaptura);
      const sha256 = await sha256Hex(await arquivo.arrayBuffer());
      const conferencia = await conferir(sessao, sha256, []);
      if (conferencia?.resultado === "repetida") return { ok: false, erro: mensagemRepetida("video", conferencia.usadaEm) };
      const dados: DadosProva = {
        ...base, tipoMidia: "video", tamanhoBytes: arquivo.size, duracaoSegundos: duracao === null ? null : Math.round(duracao * 10) / 10, sha256, metadados
      };
      await guardar({ sessao, dados, criadoEm: agoraCaptura.getTime() });
      return { ok: true, tipo: "video", video: arquivo, dados, selo: seloDaJanela(metadados.dataGravada, referencia, agoraCaptura), parecida: conferencia?.resultado === "parecida-em-observacao" };
    }

    // Foto: metadados antes de qualquer redução (o canvas apaga o EXIF).
    const inicio = await leitorDeArquivo(arquivo)(0, BYTES_EXIF);
    const metadados = inicio[0] === 0xff && inicio[1] === 0xd8 ? lerExifJpeg(inicio) : SEM_METADADOS;
    const originais = new Uint8Array(await arquivo.arrayBuffer());
    const sha256Original = await sha256Hex(originais);
    let original: Awaited<ReturnType<Desenho["carregar"]>>;
    try {
      original = await deps.desenho.carregar(`data:${arquivo.type || "image/jpeg"};base64,${base64DeBytes(originais)}`);
    } catch {
      return { ok: false, erro: "Não foi possível abrir esta imagem. Escolha outra ou tire uma foto." };
    }
    const dhash = dhashDe(deps.desenho, original.imagem);
    const conferencia = await conferir(sessao, sha256Original, [dhash]);
    if (conferencia?.resultado === "repetida") return { ok: false, erro: mensagemRepetida("foto", conferencia.usadaEm) };
    const plano = planejarFoto(original.largura, original.altura);
    const tela = deps.desenho.criarTela(plano.largura, plano.altura);
    tela.contexto.drawImage(original.imagem, 0, 0, plano.largura, plano.altura);
    const dataUrl = tela.exportarJpeg(FOTO_QUALIDADE);
    const bytes = bytesDoDataUrl(dataUrl);
    const dados: DadosProva = {
      ...base, tipoMidia: "foto", tamanhoBytes: bytes.length, duracaoSegundos: null, sha256: await sha256Hex(bytes), sha256Original, dhashes: [dhash], metadados
    };
    await guardar({ sessao, dados, criadoEm: agoraCaptura.getTime() });
    return { ok: true, tipo: "foto", dataUrl, dados, selo: seloDaJanela(metadados.dataGravada, referencia, agoraCaptura), parecida: conferencia?.resultado === "parecida-em-observacao" };
  }

  /** Registra a prova depois que o flow devolveu o link. Nunca lança: falha deixa a prova pendente. */
  async function registrar(sessao: SessaoProva, link: string, dados: DadosProva, criadoEm = agora().getTime()): Promise<"registrada" | "pendente" | "recusada"> {
    const comando: ComandoRegistroProva = {
      tela: sessao.tela, tabela: sessao.tabela, registroId: sessao.registroId, codigo: sessao.codigo,
      emitidoEm: sessao.emitidoEm, assinatura: sessao.assinatura, semRede: sessao.semRede, ...dados, link
    };
    try {
      const resultado = await deps.porta.registrarProvaMidia(comando);
      await retirar(dados.sha256);
      if (!resultado.ok) aoFalhar(new Error(resultado.erro), "registrar-recusada");
      return resultado.ok ? "registrada" : "recusada";
    } catch (erro) {
      aoFalhar(erro, "registrar");
      // Mantém a data da captura: senão a prova que sempre falha nunca chega aos 7 dias e é reenviada para sempre.
      await guardar({ sessao, dados, link, criadoEm });
      return "pendente";
    }
  }

  /** Acha a prova pelo SHA-256 dos bytes enviados (o mesmo arquivo que saiu da câmera) e registra. */
  async function registrarArquivo(dataUrl: string, link: string) {
    try {
      const tamanho = tamanhoDoDataUrl(dataUrl);
      const candidatas = await naFila(async (lista) => ({ valor: lista.filter((item) => item.dados.tamanhoBytes === tamanho) }));
      if (!candidatas.length) return "sem-prova";
      const sha256 = await sha256Hex(bytesDoDataUrl(dataUrl));
      const entrada = candidatas.find((item) => item.dados.sha256 === sha256);
      return entrada ? registrar(entrada.sessao, link, entrada.dados, entrada.criadoEm) : "sem-prova";
    } catch (erro) {
      aoFalhar(erro, "registrar-arquivo");
      return "pendente";
    }
  }

  /** Reenvia as provas que já têm link e descarta as de mais de 7 dias (enviadas ou não). */
  // Uma rodada por vez: abrir o app e o evento "online" juntos não registram a mesma prova duas vezes.
  let reenvioEmCurso: Promise<number> | null = null;
  function reenviarPendentes() {
    reenvioEmCurso ??= reenviarAgora().finally(() => { reenvioEmCurso = null; });
    return reenvioEmCurso;
  }

  async function reenviarAgora() {
    const limite = agora().getTime() - PENDENTE_MAX_MS;
    const prontas = await naFila(async (lista) => {
      const vigentes = lista.filter((item) => item.criadoEm >= limite);
      return { lista: vigentes.length === lista.length ? undefined : vigentes, valor: vigentes.filter((item) => item.link) };
    });
    let registradas = 0;
    for (const item of prontas) {
      if (await registrar(item.sessao, item.link ?? "", item.dados, item.criadoEm) !== "pendente") registradas += 1;
    }
    return registradas;
  }

  return { iniciar, aplicarNaFoto, dadosDoVideo, prepararDaGaleria, registrar, registrarArquivo, reenviarPendentes, pendentes: () => naFila(async (lista) => ({ valor: lista })) };
}

export type ProvaCaptura = ReturnType<typeof criarProvaCaptura>;

// ---------- implementação do navegador ----------

const AVISO_LOCALIZACAO_CHAVE = "betinhos.prova.aviso-localizacao";
let liberarLocalizacao: (() => void) | null = null;
let avisoLocalizacaoVisto = (() => {
  try {
    return globalThis.localStorage?.getItem(AVISO_LOCALIZACAO_CHAVE) === "1";
  } catch {
    return false;
  }
})();
// A localização só é pedida ao navegador depois que o motorista leu a explicação (uma vez por aparelho).
const explicacaoLida = avisoLocalizacaoVisto ? Promise.resolve() : new Promise<void>((resolve) => { liberarLocalizacao = resolve; });

/** true enquanto a explicação da localização ainda não foi mostrada neste aparelho. */
export function precisaAvisoLocalizacao() {
  return !avisoLocalizacaoVisto && Boolean(globalThis.navigator?.geolocation);
}

/** O motorista leu a explicação: grava (sem travar se o armazenamento falhar) e libera o pedido de localização. */
export function confirmarAvisoLocalizacao() {
  avisoLocalizacaoVisto = true;
  try {
    globalThis.localStorage?.setItem(AVISO_LOCALIZACAO_CHAVE, "1");
  } catch {
    // Sem armazenamento a explicação volta na próxima abertura do app; a câmera segue normal.
  }
  liberarLocalizacao?.();
}

export function localizarNavegador(timeoutMs = 5000): Promise<LocalizacaoProva> {
  const geolocation = globalThis.navigator?.geolocation;
  if (!geolocation) return Promise.resolve(SEM_LOCALIZACAO);
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (posicao) => resolve({
        estado: "registrada",
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
        precisaoMetros: Number.isFinite(posicao.coords.accuracy) ? Math.round(posicao.coords.accuracy * 10) / 10 : null
      }),
      (erro) => resolve(erro.code === 1 ? { estado: "negada", latitude: null, longitude: null, precisaoMetros: null } : SEM_LOCALIZACAO),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs }
    );
  });
}

const desenhoNavegador: Desenho = {
  carregar: (dataUrl) => new Promise((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => resolve({ largura: imagem.naturalWidth, altura: imagem.naturalHeight, imagem });
    imagem.onerror = () => reject(new Error("Não foi possível abrir a foto."));
    imagem.src = dataUrl;
  }),
  criarTela: (largura, altura) => {
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("Não foi possível preparar a foto.");
    return { contexto, imagem: canvas, exportarJpeg: (qualidade) => canvas.toDataURL("image/jpeg", qualidade) };
  },
  amostrar: (imagem, largura, altura) => {
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d", { willReadFrequently: true });
    if (!contexto) throw new Error("Não foi possível preparar a foto.");
    contexto.drawImage(imagem, 0, 0, largura, altura);
    return contexto.getImageData(0, 0, largura, altura).data;
  }
};

function duracaoVideoNavegador(video: Blob) {
  const url = URL.createObjectURL(video);
  return new Promise<number | null>((resolve) => {
    const elemento = document.createElement("video");
    const fim = (valor: number | null) => { URL.revokeObjectURL(url); resolve(valor); };
    elemento.preload = "metadata";
    elemento.onloadedmetadata = () => fim(Number.isFinite(elemento.duration) ? elemento.duration : null);
    elemento.onerror = () => fim(null);
    elemento.src = url;
  });
}

const filaNavegador: FilaProvas = {
  carregar: async () => (await loadMediaDraft<EntradaProva[]>(FILA_CHAVE)) ?? [],
  gravar: (lista) => saveMediaDraft(lista, FILA_CHAVE)
};

let instancia: ProvaCaptura | null = null;

/** Instância do app (Dataverse, ou o mock de código e hora fixos em localhost). */
export function provaCaptura() {
  instancia ??= criarProvaCaptura({
    porta: { emitirProvaMidia: emitirProvaMidiaRemote, registrarProvaMidia: registrarProvaMidiaRemote, conferirProvaMidia: conferirProvaMidiaRemote },
    duracaoVideo: duracaoVideoNavegador,
    fila: filaNavegador,
    desenho: desenhoNavegador,
    localizar: () => explicacaoLida.then(() => localizarNavegador()),
    // A prova nunca derruba o envio: falha vira aviso no log, sem toast para o motorista.
    aoFalhar: (erro, acao) => reportAppError(erro, { severity: "warning", source: "prova-captura", action: acao, component: "provaCaptura", notifyUser: false })
  });
  return instancia;
}
