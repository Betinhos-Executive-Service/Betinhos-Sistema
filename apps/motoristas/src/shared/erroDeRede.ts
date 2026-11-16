// Detecção única de "erro de rede": sem conexão (navigator.onLine false) ou falha de transporte na cadeia de causas
// (TypeError "Failed to fetch", timeout, ERR_INTERNET_DISCONNECTED). Erro de negócio ou HTTP 4xx/5xx com rede não entra.
import { classifyErrorCause, isNetworkCause } from "./errorLogGrouping.ts";

/** Aviso curto para quando a causa é falta de rede (no lugar do texto técnico ou do "feche e reabra"). */
export const SEM_CONEXAO_MESSAGE = "Sem conexão. O que já está guardado no aparelho continua disponível.";

export function estaOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function ehErroDeRede(error: unknown, online: boolean = estaOnline()): boolean {
  if (!online) return true;
  return isNetworkCause(classifyErrorCause(error));
}
