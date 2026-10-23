import { executeCustomApi } from "./customApi.ts";
import { cleanGuid, validateSignature, type SignatureStrokes } from "./comunicados.ts";
import { DATAVERSE, retrieveMultiple, retrieveOne } from "./dataverse.ts";

export const TERMO_STATUS = { pendente: 100000000, assinado: 100000001, contestado: 100000002 } as const;
export const FORMA_PAGAMENTO = { guia: 100000000, folha: 100000001 } as const;
// Texto exato do plugin TermoMultaCommandPlugin (SemAditivo): leva para a tela "procure o escritório".
export const SEM_ADITIVO_MENSAGEM = "O motorista ainda não tem o aditivo de assinatura eletrônica registrado.";
// O servidor pode embrulhar o texto (prefixo/sufixo); basta o trecho característico.
export const isSemAditivo = (message: string) => message.includes("aditivo de assinatura eletrônica");
// Recusas do plugin que não mudam tentando de novo: levam a uma tela final, sem "Tentar de novo".
export const isErroDefinitivo = (message: string) => /não é seu|não está mais pendente/.test(message);
export const PRAZO_ASSINATURA_DIAS = 7;
export const GPS_PRECISAO_AVISO_M = 200;
export const SELFIE_MAX_LADO = 1280;
export const SELFIE_JPEG_QUALIDADE = 0.8;
// O plugin recusa base64 acima de 2.000.000 caracteres e JPEG acima de 1,5 MB; o cliente fica abaixo com folga.
export const SELFIE_MAX_BASE64 = 1_900_000;

export type TermoMulta = {
  id: string;
  nome: string;
  status: number;
  texto: string;
  versaoTexto: string;
  evidenciasJson: string;
  formaPagamento: number;
  parcelas: number;
  valorTotal: number;
  valorParcela: number;
  primeiraCompetencia: string;
  enviadoEm: string;
  assinadoEm: string | null;
  hashPdf: string;
  motivoContestacao: string;
};

export type Gps = { latitude: number; longitude: number; precisao: number };

const TERMO_SELECT = "$select=new_termomultaid,new_name,new_status,new_textotermo,new_versaotexto,new_evidenciasjson,new_formapagamento,new_parcelas,new_valortotal,new_valorparcela,new_primeiracompetencia,new_enviadoem,new_assinadoem,new_hashpdf,new_motivocontestacao";

export function mapTermo(row: Record<string, unknown>): TermoMulta {
  return {
    id: String(row.new_termomultaid ?? ""),
    nome: String(row.new_name ?? ""),
    status: Number(row.new_status ?? TERMO_STATUS.pendente),
    texto: String(row.new_textotermo ?? ""),
    versaoTexto: String(row.new_versaotexto ?? ""),
    evidenciasJson: String(row.new_evidenciasjson ?? ""),
    formaPagamento: Number(row.new_formapagamento ?? FORMA_PAGAMENTO.guia),
    parcelas: Number(row.new_parcelas ?? 0),
    valorTotal: Number(row.new_valortotal ?? 0),
    valorParcela: Number(row.new_valorparcela ?? 0),
    primeiraCompetencia: String(row.new_primeiracompetencia ?? ""),
    enviadoEm: String(row.new_enviadoem ?? ""),
    assinadoEm: row.new_assinadoem ? String(row.new_assinadoem) : null,
    hashPdf: String(row.new_hashpdf ?? ""),
    motivoContestacao: String(row.new_motivocontestacao ?? "")
  };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export const formatBrl = (value: number) => BRL.format(value).replace(/ /g, " ");

export function formatDataHora(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATA_HORA.format(date).replace(",", "");
}

const DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** Prazo para assinar (envio + 7 dias), em dd/mm de São Paulo; o plugin expira depois disso. */
export function prazoAssinatura(enviadoEm: string) {
  const date = new Date(enviadoEm);
  if (!enviadoEm || Number.isNaN(date.getTime())) return "";
  return DIA_MES.format(new Date(date.getTime() + PRAZO_ASSINATURA_DIAS * 86_400_000));
}

/** Pendentes primeiro; Concluídos são os assinados e contestados (cancelados e expirados não aparecem ao motorista). */
export function separarTermos(items: TermoMulta[]) {
  return {
    pendentes: items.filter((t) => t.status === TERMO_STATUS.pendente),
    concluidos: items.filter((t) => t.status === TERMO_STATUS.assinado || t.status === TERMO_STATUS.contestado)
  };
}

/** Texto do banner da Home, com o prazo mais próximo; null sem pendências. */
export function resumoPendentes(items: TermoMulta[]) {
  const pendentes = separarTermos(items).pendentes.filter((t) => prazoAssinatura(t.enviadoEm));
  if (!pendentes.length) return null;
  const primeiro = pendentes.reduce((a, b) => (new Date(b.enviadoEm) < new Date(a.enviadoEm) ? b : a));
  const n = pendentes.length;
  return `Você tem ${n} multa${n === 1 ? "" : "s"} para assinar · prazo até ${prazoAssinatura(primeiro.enviadoEm)}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function descreverAcordo(termo: Pick<TermoMulta, "formaPagamento" | "parcelas" | "valorParcela" | "primeiraCompetencia">) {
  if (termo.formaPagamento !== FORMA_PAGAMENTO.folha) return "Você paga a guia";
  const [ano, mes] = termo.primeiraCompetencia.split("-").map(Number);
  const competencias = Number.isFinite(ano) && Number.isFinite(mes)
    ? Array.from({ length: termo.parcelas }, (_, i) => {
      const indice = mes - 1 + i;
      return `${MESES[indice % 12]}/${String((ano + Math.floor(indice / 12)) % 100).padStart(2, "0")}`;
    }).join(", ")
    : "";
  return `Desconto em folha em ${termo.parcelas}x de ${formatBrl(termo.valorParcela)}${competencias ? ` — ${competencias}` : ""}`;
}

export type Evidencias = {
  placa: string;
  dataHora: string;
  local: string;
  infracao: string;
  valor: number | null;
  infleetIndisponivel: boolean;
  viagens: { inicio: string; fim: string }[];
};

// Formato gravado pelo plugin em new_evidenciasjson: { multa, infracao, infleet: {erro} | {viagens[]} }.
type EvidenciasJson = {
  multa?: { placa?: unknown; dataHora?: unknown; local?: unknown; valorGuia?: unknown };
  infracao?: { codigo?: string; descricao?: string; valor?: unknown };
  infleet?: { erro?: unknown; viagens?: { inicio?: unknown; fim?: unknown }[] };
};

export function parseEvidencias(json: string): Evidencias {
  let data: EvidenciasJson = {};
  try { data = JSON.parse(json || "{}") ?? {}; } catch { data = {}; }
  const multa = data.multa ?? {};
  const infracao = data.infracao;
  const infleet = data.infleet ?? {};
  const valor = infracao?.valor ?? multa.valorGuia;
  return {
    placa: String(multa.placa ?? ""),
    dataHora: String(multa.dataHora ?? ""),
    local: String(multa.local ?? ""),
    infracao: infracao ? [infracao.codigo, infracao.descricao].filter(Boolean).join(" - ") : "",
    valor: valor == null || !Number.isFinite(Number(valor)) ? null : Number(valor),
    infleetIndisponivel: Boolean(infleet.erro) || !Array.isArray(infleet.viagens),
    viagens: Array.isArray(infleet.viagens) ? infleet.viagens.map((v) => ({ inicio: String(v.inicio ?? ""), fim: String(v.fim ?? "") })) : []
  };
}

export function validarMotivo(motivo: string) {
  const texto = motivo.trim();
  if (texto.length < 10) return "Descreva o motivo com pelo menos 10 caracteres.";
  if (texto.length > 2000) return "O motivo deve ter até 2.000 caracteres.";
  return "";
}

export function descreverGpsErro(error: { code?: number } | null | undefined) {
  if (error?.code === 1) return "A localização está bloqueada. Toque em Permitir quando o celular perguntar ou libere em Ajustes › Apps › (Power Apps ou o navegador) › Permissões › Localização e toque em Tentar de novo.";
  if (error?.code === 3) return "A localização demorou para responder. Vá para um lugar aberto e toque em Tentar de novo.";
  return "Não foi possível obter sua localização. Ligue o GPS do celular e toque em Tentar de novo.";
}

// ---------------- Selfie ----------------

export function selfieDimensions(width: number, height: number, maxLado = SELFIE_MAX_LADO) {
  const scale = Math.min(1, maxLado / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

type CanvasLike = {
  width: number;
  height: number;
  getContext: (kind: "2d") => { drawImage: (...args: unknown[]) => void } | null;
  toBlob: (cb: (blob: Blob | null) => void, type: string, quality: number) => void;
};

const defaultCanvas = () => document.createElement("canvas") as unknown as CanvasLike;

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Quadro atual do vídeo em JPEG base64 (sem "data:"), no máximo 1280 px. Se o base64 passar de 1.900.000 caracteres,
 * baixa a qualidade (0,8 → 0,6) e depois a dimensão, até caber no limite do plugin.
 */
export async function capturarSelfieJpeg(video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">, createCanvas: () => CanvasLike = defaultCanvas) {
  if (!video.videoWidth || !video.videoHeight) throw new Error("A câmera ainda não está pronta. Tente de novo.");
  const canvas = createCanvas();
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível gerar a foto.");
  for (const maxLado of [SELFIE_MAX_LADO, 1024, 800, 640]) {
    const { width, height } = selfieDimensions(video.videoWidth, video.videoHeight, maxLado);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    for (const quality of maxLado === SELFIE_MAX_LADO ? [SELFIE_JPEG_QUALIDADE, 0.6] : [0.6]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("Não foi possível gerar a foto.");
      if (Math.ceil(blob.size / 3) * 4 > SELFIE_MAX_BASE64) continue;
      return blobToBase64(blob);
    }
  }
  throw new Error("A selfie ficou grande demais. Tire de novo.");
}

// ---------------- Fluxo da tela ----------------

export type TermoStep = "detalhe" | "selfie" | "local" | "assinatura" | "sucesso" | "semAditivo" | "encerrado" | "contestar" | "contestado";

export type TermoFlow = {
  step: TermoStep;
  selfie: string;
  gps: Gps | null;
  gpsErro: string;
  strokes: SignatureStrokes;
  motivo: string;
  enviando: boolean;
  erro: string;
  assinadoEm: string | null;
};

export const initialTermoFlow = (): TermoFlow => ({ step: "detalhe", selfie: "", gps: null, gpsErro: "", strokes: [], motivo: "", enviando: false, erro: "", assinadoEm: null });

export type TermoFlowAction =
  | { type: "go"; step: TermoStep }
  | { type: "selfie"; value: string }
  | { type: "gps"; value: Gps }
  | { type: "gpsErro"; message: string }
  | { type: "strokes"; value: SignatureStrokes }
  | { type: "motivo"; value: string }
  | { type: "submit" }
  | { type: "error"; message: string }
  | { type: "signed"; assinadoEm: string | null }
  | { type: "contested" }
  | { type: "reset" };

export function termoFlowReducer(state: TermoFlow, action: TermoFlowAction): TermoFlow {
  switch (action.type) {
    case "go": return { ...state, step: action.step, erro: "" };
    case "selfie": return { ...state, selfie: action.value, erro: "" };
    case "gps": return { ...state, gps: action.value, gpsErro: "" };
    case "gpsErro": return { ...state, gps: null, gpsErro: action.message };
    case "strokes": return { ...state, strokes: action.value };
    case "motivo": return { ...state, motivo: action.value };
    case "submit": return { ...state, enviando: true, erro: "" };
    // Mantém selfie, GPS e assinatura: o motorista corrige e reenvia sem refazer os passos.
    case "error": return { ...state, enviando: false, erro: action.message, step: isSemAditivo(action.message) ? "semAditivo" : isErroDefinitivo(action.message) ? "encerrado" : state.step };
    case "signed": return { ...state, enviando: false, step: "sucesso", assinadoEm: action.assinadoEm };
    case "contested": return { ...state, enviando: false, step: "contestado" };
    case "reset": return initialTermoFlow();
  }
}

export function canAdvance(state: TermoFlow) {
  if (state.step === "selfie") return Boolean(state.selfie);
  if (state.step === "local") return Boolean(state.gps);
  if (state.step === "assinatura") return Boolean(state.selfie && state.gps) && validateSignature(state.strokes);
  if (state.step === "contestar") return !validarMotivo(state.motivo);
  return true;
}

/** Enquanto a chamada está em andamento, novas chamadas recebem a mesma promessa (sem duplo envio). */
export function createSingleFlight<T>(fn: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= fn().finally(() => { pending = null; });
    return pending;
  };
}

// ---------------- Dados ----------------

export const isMockTermos = () => ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mockParam = (name: string) => new URLSearchParams(window.location.search).get(name);

let mockTermos: Record<string, unknown>[] | null = null;
function getMockTermos() {
  mockTermos ??= [
    {
      new_termomultaid: "55555555-5555-4555-8555-555555555555", new_name: "TM-RTB4F21-20261022", new_status: TERMO_STATUS.pendente,
      new_formapagamento: FORMA_PAGAMENTO.folha, new_parcelas: 3, new_valortotal: 195.23, new_valorparcela: 65.08, new_primeiracompetencia: "2026-11-01",
      new_versaotexto: "v1", new_enviadoem: "2026-10-22T12:00:00Z",
      new_textotermo: "[Mock] Eu, Renan, reconheço que conduzia o veículo de placa RTB4F21 no momento da infração 745-5 - Velocidade até 20% acima da máxima, no valor de R$ 195,23, e concordo com o desconto em folha em 3 parcelas.\n\nDeclaro que li este termo e que a assinatura eletrônica tem a mesma validade da assinatura em papel, conforme o aditivo ao meu contrato.",
      new_evidenciasjson: JSON.stringify({ multa: { placa: "RTB4F21", dataHora: "2026-10-01T13:42:00Z", local: "Av. Paulista, 1000 - São Paulo/SP", valorGuia: 195.23 }, infracao: { codigo: "745-5", descricao: "Velocidade até 20% acima da máxima", valor: 195.23 }, infleet: { viagens: [{ inicio: "2026-10-01T13:20:00Z", fim: "2026-10-01T14:05:00Z" }] } })
    },
    {
      new_termomultaid: "66666666-6666-4666-8666-666666666666", new_name: "TM-QPA2B11-20261022", new_status: TERMO_STATUS.pendente,
      new_formapagamento: FORMA_PAGAMENTO.guia, new_parcelas: 1, new_valortotal: 130.16, new_valorparcela: 130.16, new_primeiracompetencia: "2026-11-01",
      new_versaotexto: "v1", new_enviadoem: "2026-10-22T12:05:00Z",
      new_textotermo: "[Mock] Eu, Renan, reconheço que conduzia o veículo de placa QPA2B11 e que pagarei a guia da multa.",
      new_evidenciasjson: JSON.stringify({ multa: { placa: "QPA2B11", dataHora: "2026-09-18T20:10:00Z", local: "Rod. Ayrton Senna, km 22", valorGuia: 130.16 }, infracao: { codigo: "518-5", descricao: "Estacionar em local proibido", valor: 130.16 }, infleet: { erro: "Veículo QPA2B11 não encontrado no InFleet." } })
    },
    {
      new_termomultaid: "77777777-7777-4777-8777-777777777777", new_name: "TM-FHK7C30-20260915", new_status: TERMO_STATUS.contestado,
      new_formapagamento: FORMA_PAGAMENTO.folha, new_parcelas: 2, new_valortotal: 88.38, new_valorparcela: 44.19, new_primeiracompetencia: "2026-10-01",
      new_versaotexto: "v1", new_enviadoem: "2026-09-15T12:00:00Z", new_assinadoem: "2026-09-16T10:20:00Z",
      new_motivocontestacao: "Eu estava de folga nesse dia; o carro ficou na garagem.",
      new_textotermo: "[Mock] Termo contestado.",
      new_evidenciasjson: JSON.stringify({ multa: { placa: "FHK7C30", dataHora: "2026-09-10T08:00:00Z", local: "Av. Brasil, 500", valorGuia: 88.38 }, infracao: { codigo: "554-1", descricao: "Estacionar na faixa", valor: 88.38 }, infleet: { viagens: [] } })
    }
  ];
  return mockTermos;
}

const mockDelay = () => new Promise((resolve) => setTimeout(resolve, 600));

/** Termos do motorista que ele ainda vê: pendentes, assinados e contestados. */
export async function listarTermosMotorista(motoristaId: string): Promise<TermoMulta[]> {
  if (isMockTermos()) {
    if (mockParam("mockTermos") === "vazio") return [];
    return getMockTermos().map(mapTermo).filter((t) => t.status <= TERMO_STATUS.contestado);
  }
  const id = cleanGuid(motoristaId);
  if (!GUID_PATTERN.test(id)) throw new Error("Motorista não identificado para carregar termos de multa.");
  // Filtra pelo motorista logado: quem tem leitura ampla (admin) veria os termos de todos.
  const result = await retrieveMultiple(DATAVERSE.termosMulta, `${TERMO_SELECT}&$filter=new_status le ${TERMO_STATUS.contestado} and _new_motorista_value eq ${id}&$orderby=new_enviadoem desc`);
  return result.entities.map((row) => mapTermo(row as Record<string, unknown>));
}

export async function obterTermo(id: string): Promise<TermoMulta | null> {
  const cleanId = cleanGuid(id);
  if (isMockTermos()) {
    const row = getMockTermos().find((item) => item.new_termomultaid === cleanId);
    return row ? mapTermo(row) : null;
  }
  const row = await retrieveOne(DATAVERSE.termosMulta, cleanId, TERMO_SELECT);
  return row ? mapTermo(row as Record<string, unknown>) : null;
}

export type AssinaturaDados = { selfieJpegBase64: string; strokes: SignatureStrokes; gps: Gps | null; dispositivo: string };

// A data/hora da assinatura nunca vai no payload: o plugin usa o relógio do servidor.
export function buildAssinarParams(id: string, dados: AssinaturaDados) {
  const params: Record<string, string | number> = {
    new_TermoId: cleanGuid(id),
    new_SelfieBase64: dados.selfieJpegBase64,
    new_AssinaturaJson: JSON.stringify(dados.strokes)
  };
  if (dados.gps) {
    params.new_Latitude = Number(dados.gps.latitude.toFixed(6));
    params.new_Longitude = Number(dados.gps.longitude.toFixed(6));
    params.new_PrecisaoGps = Math.round(dados.gps.precisao * 100) / 100;
  }
  if (dados.dispositivo) params.new_Dispositivo = dados.dispositivo.slice(0, 500);
  return params;
}

/** Assina e devolve a data/hora relida do servidor (gravada pelo plugin). */
export async function assinarTermo(id: string, dados: AssinaturaDados): Promise<{ hashPdf: string; assinadoEm: string | null }> {
  if (!validateSignature(dados.strokes)) throw new Error("Desenhe sua assinatura antes de confirmar.");
  if (!dados.selfieJpegBase64) throw new Error("Tire a selfie antes de assinar.");
  const params = buildAssinarParams(id, dados);
  if (isMockTermos()) {
    await mockDelay();
    if (mockParam("mockTermoErro") === "aditivo") throw new Error(SEM_ADITIVO_MENSAGEM);
    if (mockParam("mockTermoErro") === "dono") throw new Error("Este termo não é seu.");
    const row = getMockTermos().find((item) => item.new_termomultaid === params.new_TermoId);
    if (!row) throw new Error("Este termo não é seu.");
    if (row.new_status !== TERMO_STATUS.pendente) throw new Error("Este termo não está mais pendente.");
    Object.assign(row, { new_status: TERMO_STATUS.assinado, new_assinadoem: new Date().toISOString(), new_hashpdf: "mock" });
    return { hashPdf: "mock", assinadoEm: String(row.new_assinadoem) };
  }
  const result = await executeCustomApi("new_AssinarTermoMulta", params);
  const termo = await obterTermo(id).catch(() => null);
  return { hashPdf: String(result.new_HashPdf ?? termo?.hashPdf ?? ""), assinadoEm: termo?.assinadoEm ?? null };
}

export async function contestarTermo(id: string, motivo: string) {
  const erro = validarMotivo(motivo);
  if (erro) throw new Error(erro);
  if (isMockTermos()) {
    await mockDelay();
    const row = getMockTermos().find((item) => item.new_termomultaid === cleanGuid(id));
    if (!row) throw new Error("Este termo não é seu.");
    row.new_status = TERMO_STATUS.contestado;
    return;
  }
  await executeCustomApi("new_ContestarTermoMulta", { new_TermoId: cleanGuid(id), new_Motivo: motivo.trim() });
}

export type PdfTermo = { base64: string; nome: string };

/** O PDF tem segurança de campo: o motorista recebe o arquivo pela Custom API, que confere o dono. */
export async function baixarPdf(id: string): Promise<PdfTermo> {
  if (isMockTermos()) {
    await mockDelay();
    if (mockParam("mockTermoErro") === "pdf") throw new Error("Este termo não é seu.");
    const row = getMockTermos().find((item) => item.new_termomultaid === cleanGuid(id));
    return { base64: btoa("%PDF-1.4\n% termo de multa (mock)\n"), nome: `${String(row?.new_name ?? "termo-multa")}.pdf` };
  }
  const result = await executeCustomApi("new_BaixarPdfTermoMulta", { new_TermoId: cleanGuid(id) });
  const base64 = String(result.new_PdfBase64 ?? "");
  if (!base64) throw new Error("O PDF do termo veio vazio.");
  return { base64, nome: String(result.new_NomeArquivo || "termo-multa.pdf") };
}

/** Confere o aditivo antes da selfie. O motorista não lê o próprio cadastro: a API devolve só um booleano. */
export async function consultarAditivo(): Promise<boolean> {
  if (isMockTermos()) {
    await mockDelay();
    return mockParam("mockTermoErro") !== "aditivo";
  }
  const result = await executeCustomApi("new_ConsultarAditivoMotorista", {});
  return result.new_TemAditivo === true || result.new_TemAditivo === "true";
}

type XrmOpenFile = (file: { fileContent: string; fileName: string; fileSize: number; mimeType: string }, options?: { openMode: number }) => Promise<unknown> | unknown;
export type AbrirPdfEnv = {
  xrmOpenFile?: XrmOpenFile;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
  canShare?: (data: { files: File[] }) => boolean;
  download?: (blob: Blob, nome: string) => void;
  onFalha?: (metodo: "xrm" | "share" | "download", error: unknown) => void;
};

function pdfBlob(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

/**
 * Abre o PDF no WebView do Power Apps, que ignora <a download> com blob: em silêncio.
 * Ordem: visualizador nativo (Xrm.Navigation.openFile) → compartilhar → download. Se nada funcionar, lança erro.
 */
export async function abrirPdf(pdf: PdfTermo, env: AbrirPdfEnv = navegadorPdfEnv()): Promise<"xrm" | "share" | "download"> {
  const blob = pdfBlob(pdf.base64);
  if (env.xrmOpenFile) {
    try {
      await env.xrmOpenFile({ fileContent: pdf.base64, fileName: pdf.nome, fileSize: blob.size, mimeType: "application/pdf" }, { openMode: 2 });
      return "xrm";
    } catch (error) { env.onFalha?.("xrm", error); }
  }
  if (env.share && typeof File === "function") {
    const file = new File([blob], pdf.nome, { type: "application/pdf" });
    if (!env.canShare || env.canShare({ files: [file] })) {
      try {
        await env.share({ files: [file], title: pdf.nome });
        return "share";
      } catch (error) {
        // Cancelar a folha de compartilhar é escolha do motorista, não falha.
        if ((error as { name?: string })?.name === "AbortError") return "share";
        env.onFalha?.("share", error);
      }
    }
  }
  if (env.download) {
    try {
      env.download(blob, pdf.nome);
      return "download";
    } catch (error) { env.onFalha?.("download", error); }
  }
  throw new Error("Não foi possível abrir o PDF neste aparelho. Peça a cópia ao gestor de frota.");
}

/** Ambiente real: Xrm do Power Apps (pai ou próprio), Web Share e link de download como último recurso. */
export function navegadorPdfEnv(onFalha?: AbrirPdfEnv["onFalha"]): AbrirPdfEnv {
  type XrmNav = { Navigation?: { openFile?: XrmOpenFile } };
  let xrm: XrmNav | undefined;
  try { xrm = (window.parent as Window & { Xrm?: XrmNav }).Xrm; } catch { /* Parent pode ser de outra origem. */ }
  xrm ??= (window as Window & { Xrm?: XrmNav }).Xrm;
  const navigation = xrm?.Navigation;
  const nav = navigator as Navigator & { share?: AbrirPdfEnv["share"]; canShare?: AbrirPdfEnv["canShare"] };
  return {
    xrmOpenFile: navigation?.openFile ? (file, options) => navigation.openFile!(file, options) : undefined,
    share: typeof nav.share === "function" ? nav.share.bind(nav) : undefined,
    canShare: typeof nav.canShare === "function" ? nav.canShare.bind(nav) : undefined,
    download: (blob, nome) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
    onFalha
  };
}
