import { executeCustomApi } from "../../data/dataverse/customApi.ts";
import { isLocalhostRuntime } from "../../data/dataverse/cliente.ts";
import type { MetadadosArquivo } from "./metadadosArquivo.ts";

// Custom API new_ProvaMidia (unbound): new_Command (JSON com "acao": emitir | conferir | registrar) -> new_Result (JSON com "ok").
// Contrato fechado com o ProvaMidiaHandler do plugin Betinhos.DriverRecordSharing.

export type TelaProva = "despesa" | "recebimento" | "manutencao" | "finalizar" | "colisao" | "checklist" | "devolucao";
export type OrigemProva = { tela: TelaProva; tabela: string; registroId: string };

export type EmissaoProva = { ok: true; codigo: string; emitidoEm: string; assinatura: string | null; assinada: boolean };

export type LocalizacaoProva =
  | { estado: "registrada"; latitude: number; longitude: number; precisaoMetros: number | null }
  | { estado: "negada" | "indisponivel"; latitude: null; longitude: null; precisaoMetros: null };

export type ComandoRegistroProva = OrigemProva & {
  codigo: string;
  emitidoEm: string | null;
  assinatura: string | null;
  semRede: boolean;
  link: string;
  tipoMidia: "foto" | "video" | "pdf";
  tamanhoBytes: number;
  duracaoSegundos: number | null;
  sha256: string;
  origemCaptura: "camera-ao-vivo" | "camera-nativa" | "galeria";
  capturadoEm: string;
  localizacao: LocalizacaoProva;
  /** Fase 2. Foto da galeria: SHA-256 do arquivo escolhido, antes da redução. */
  sha256Original?: string | null;
  /** Fase 2. [0] dHash da imagem original; [1] da foto final com carimbo (câmera do app). */
  dhashes?: string[];
  paginas?: number | null;
  metadados?: MetadadosArquivo | null;
  /** Fase 2. Data de referência do evento declarada pelo app; o servidor prefere a do registro quando o id é real. */
  dataReferencia?: string | null;
};

export type ComandoConferencia = OrigemProva & { sha256: string; dhashes: string[] };
export type ResultadoConferencia = { resultado: "livre" | "repetida" | "parecida-em-observacao"; usadaEm: string | null };

export type ResultadoRegistroProva = { ok: true; provaId: string; selos: string[] } | { ok: false; erro: string };

export type PortaProva = {
  emitirProvaMidia: (origem: OrigemProva) => Promise<EmissaoProva>;
  registrarProvaMidia: (comando: ComandoRegistroProva) => Promise<ResultadoRegistroProva>;
  conferirProvaMidia: (comando: ComandoConferencia) => Promise<ResultadoConferencia>;
};

// Mock de localhost: código e hora fixos, para a prévia e os testes ficarem estáveis.
export const PROVA_MOCK_CODIGO = "K7M2QX";
export const PROVA_MOCK_EMITIDO_EM = "2026-11-16T12:00:00.000Z";
// O mock lembra o que foi conferido nesta aba: o mesmo arquivo em outro registro volta "repetida" (prévia da recusa).
const conferidasNoMock = new Map<string, OrigemProva>();
export const portaProvaMock: PortaProva = {
  emitirProvaMidia: async () => ({ ok: true, codigo: PROVA_MOCK_CODIGO, emitidoEm: PROVA_MOCK_EMITIDO_EM, assinatura: "mock", assinada: true }),
  registrarProvaMidia: async (comando) => ({ ok: true, provaId: "00000000-0000-4000-8000-000000000001", selos: comando.semRede ? ["capturada-sem-rede"] : [] }),
  conferirProvaMidia: async (comando) => {
    const anterior = conferidasNoMock.get(comando.sha256);
    if (anterior && (anterior.tabela !== comando.tabela || anterior.registroId !== comando.registroId)) return { resultado: "repetida", usadaEm: PROVA_MOCK_EMITIDO_EM };
    conferidasNoMock.set(comando.sha256, { tela: comando.tela, tabela: comando.tabela, registroId: comando.registroId });
    return { resultado: "livre", usadaEm: null };
  }
};

async function runProvaCommand(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await executeCustomApi("new_ProvaMidia", { new_Command: JSON.stringify(command) });
  return JSON.parse(String(response.new_Result ?? "{}")) as Record<string, unknown>;
}

export async function emitirProvaMidiaRemote(origem: OrigemProva): Promise<EmissaoProva> {
  if (isLocalhostRuntime()) return portaProvaMock.emitirProvaMidia(origem);
  const result = await runProvaCommand({ acao: "emitir", ...origem });
  if (result.ok !== true || typeof result.codigo !== "string" || typeof result.emitidoEm !== "string") {
    throw new Error(String(result.erro || "A prova de captura não foi emitida."));
  }
  return result as EmissaoProva;
}

export async function registrarProvaMidiaRemote(comando: ComandoRegistroProva): Promise<ResultadoRegistroProva> {
  if (isLocalhostRuntime()) return portaProvaMock.registrarProvaMidia(comando);
  const result = await runProvaCommand({ acao: "registrar", ...comando });
  if (result.ok === true) return { ok: true, provaId: String(result.provaId ?? ""), selos: Array.isArray(result.selos) ? result.selos.map(String) : [] };
  return { ok: false, erro: String(result.erro || "Prova recusada.") };
}

export async function conferirProvaMidiaRemote(comando: ComandoConferencia): Promise<ResultadoConferencia> {
  if (isLocalhostRuntime()) return portaProvaMock.conferirProvaMidia(comando);
  const result = await runProvaCommand({ acao: "conferir", ...comando });
  const resultado = result.resultado;
  if (result.ok !== true || (resultado !== "livre" && resultado !== "repetida" && resultado !== "parecida-em-observacao")) {
    throw new Error(String(result.erro || "A conferência da foto não respondeu."));
  }
  return { resultado, usadaEm: typeof result.usadaEm === "string" ? result.usadaEm : null };
}
