import { executeCustomApi } from "../../data/dataverse/customApi.ts";
import { isLocalhostRuntime } from "../../data/dataverse/cliente.ts";

// Custom API new_ProvaMidia (unbound): new_Command (JSON com "acao") -> new_Result (JSON com "ok").
// Contrato fechado com o ProvaMidiaHandler do plugin Betinhos.DriverRecordSharing.

export type TelaProva = "despesa" | "recebimento" | "manutencao" | "finalizar" | "colisao" | "checklist";
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
  tipoMidia: "foto" | "video";
  tamanhoBytes: number;
  duracaoSegundos: number | null;
  sha256: string;
  origemCaptura: "camera-ao-vivo" | "camera-nativa";
  capturadoEm: string;
  localizacao: LocalizacaoProva;
};

export type ResultadoRegistroProva = { ok: true; provaId: string; selos: string[] } | { ok: false; erro: string };

export type PortaProva = {
  emitirProvaMidia: (origem: OrigemProva) => Promise<EmissaoProva>;
  registrarProvaMidia: (comando: ComandoRegistroProva) => Promise<ResultadoRegistroProva>;
};

// Mock de localhost: código e hora fixos, para a prévia e os testes ficarem estáveis.
export const PROVA_MOCK_CODIGO = "K7M2QX";
export const PROVA_MOCK_EMITIDO_EM = "2026-11-16T12:00:00.000Z";
export const portaProvaMock: PortaProva = {
  emitirProvaMidia: async () => ({ ok: true, codigo: PROVA_MOCK_CODIGO, emitidoEm: PROVA_MOCK_EMITIDO_EM, assinatura: "mock", assinada: true }),
  registrarProvaMidia: async (comando) => ({ ok: true, provaId: "00000000-0000-4000-8000-000000000001", selos: comando.semRede ? ["capturada-sem-rede"] : [] })
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
