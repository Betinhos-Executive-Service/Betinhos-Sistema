import { dataUrlToBase64 } from "../../data/dataverse/arquivos.ts";
import { reportAppError } from "../../shared/appErrorLogger.ts";
import { loadMediaDraft, saveMediaDraft } from "./mediaDraftStore.ts";
import {
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

export type { OrigemProva, TelaProva } from "./provaRemota.ts";

export const FOTO_MAX_LADO = 2048;
export const FOTO_QUALIDADE = 0.85;
export const VIDEO_MAX_SEGUNDOS = 120;
export const VIDEO_MAX_BYTES = 70 * 1024 * 1024;
export const VIDEO_BITRATE = 4_000_000;
export const CODIGO_ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
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

export type DadosProva = Pick<ComandoRegistroProva, "tipoMidia" | "tamanhoBytes" | "duracaoSegundos" | "sha256" | "origemCaptura" | "capturadoEm" | "localizacao">;
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
  criarTela: (largura: number, altura: number) => { contexto: Contexto2D; exportarJpeg: (qualidade: number) => string };
};

export type DependenciasProva = {
  porta: PortaProva;
  fila: FilaProvas;
  desenho: Desenho;
  agora?: () => Date;
  localizar?: () => Promise<LocalizacaoProva>;
  aoFalhar?: (erro: unknown, acao: string) => void;
};

const SEM_LOCALIZACAO: LocalizacaoProva = { estado: "indisponivel", latitude: null, longitude: null, precisaoMetros: null };
const TELAS_SEM_VIDEO: ReadonlySet<TelaProva> = new Set(["despesa"]);

/** Despesa só aceita foto: a análise de IA da despesa recusa vídeo. */
export function permiteVideo(tela: TelaProva) {
  return !TELAS_SEM_VIDEO.has(tela);
}

/** Motivo da recusa de um vídeo da câmera nativa, ou "" quando cabe nos limites. */
export function validarVideo(video: { duracaoSegundos: number | null; tamanhoBytes: number }) {
  if (video.tamanhoBytes > VIDEO_MAX_BYTES) return "Vídeo muito grande. Grave até 1 minuto e meio.";
  if ((video.duracaoSegundos ?? 0) > VIDEO_MAX_SEGUNDOS) return "Vídeo muito longo. Grave até 2 minutos.";
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

/** Dimensões finais (maior lado até 2048 px) e a faixa do carimbo (no máximo 10% da altura). */
export function planejarFoto(largura: number, altura: number, maxLado = FOTO_MAX_LADO) {
  const escala = Math.min(1, maxLado / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));
  const faixa = Math.min(Math.floor(h * 0.1), Math.max(24, Math.round(h * 0.075)));
  return { largura: w, altura: h, faixa };
}

const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
});

export function textoDoCarimbo(sessao: Pick<SessaoProva, "semRede" | "codigo">, contexto: ContextoCarimbo, capturadoEm: Date) {
  const linha1 = [formatoHora.format(capturadoEm).replace(",", ""), contexto.placa, contexto.registro].filter(Boolean).join(" · ");
  return [linha1, sessao.semRede ? "SEM REDE" : `Código ${sessao.codigo}`];
}

function desenharCarimbo(ctx: Contexto2D, largura: number, altura: number, faixa: number, linhas: string[]) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect(0, altura - faixa, largura, faixa);
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
  linhas.forEach((linha, indice) => ctx.fillText(linha, margem, altura - faixa + (faixa * (indice + 0.5)) / linhas.length));
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
    const tela = deps.desenho.criarTela(plano.largura, plano.altura);
    tela.contexto.drawImage(original.imagem, 0, 0, plano.largura, plano.altura);
    desenharCarimbo(tela.contexto, plano.largura, plano.altura, plano.faixa, textoDoCarimbo(sessao, contexto, capturadoEm));
    const dataUrl = tela.exportarJpeg(opcoes.qualidade ?? FOTO_QUALIDADE);
    const bytes = bytesDoDataUrl(dataUrl);
    const dados: DadosProva = {
      tipoMidia: "foto", tamanhoBytes: bytes.length, duracaoSegundos: null, sha256: await sha256Hex(bytes),
      origemCaptura, capturadoEm: capturadoEm.toISOString(), localizacao: sessao.localizacao
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

  return { iniciar, aplicarNaFoto, dadosDoVideo, registrar, registrarArquivo, reenviarPendentes, pendentes: () => naFila(async (lista) => ({ valor: lista })) };
}

export type ProvaCaptura = ReturnType<typeof criarProvaCaptura>;

// ---------- implementação do navegador ----------

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
    return { contexto, exportarJpeg: (qualidade) => canvas.toDataURL("image/jpeg", qualidade) };
  }
};

const filaNavegador: FilaProvas = {
  carregar: async () => (await loadMediaDraft<EntradaProva[]>(FILA_CHAVE)) ?? [],
  gravar: (lista) => saveMediaDraft(lista, FILA_CHAVE)
};

let instancia: ProvaCaptura | null = null;

/** Instância do app (Dataverse, ou o mock de código e hora fixos em localhost). */
export function provaCaptura() {
  instancia ??= criarProvaCaptura({
    porta: { emitirProvaMidia: emitirProvaMidiaRemote, registrarProvaMidia: registrarProvaMidiaRemote },
    fila: filaNavegador,
    desenho: desenhoNavegador,
    localizar: () => localizarNavegador(),
    // A prova nunca derruba o envio: falha vira aviso no log, sem toast para o motorista.
    aoFalhar: (erro, acao) => reportAppError(erro, { severity: "warning", source: "prova-captura", action: acao, component: "provaCaptura", notifyUser: false })
  });
  return instancia;
}
