// O servidor recusa a gravação de um módulo desligado na configuração do App com
// "<Módulo> não está(ão) disponível(is) no seu App no momento. Procure o escritório."
// A frase já é para o motorista: as telas a mostram em vez do texto genérico, e a fila não oferece reenvio (só reabre quando o escritório religar).
const RECUSA_DA_CONFIGURACAO = /n(?:ã|a)o est(?:á|a|ão|ao) dispon(?:í|i)ve(?:l|is) no seu App no momento/i;

export const ehRecusaDaConfiguracao = (mensagem?: string | null): boolean => Boolean(mensagem) && RECUSA_DA_CONFIGURACAO.test(mensagem as string);

/** Mensagem da recusa quando o erro é uma; senão o texto de reserva. */
export function mensagemDaRecusa(erro: unknown, reserva: string): string {
  const texto = typeof erro === "string" ? erro : String((erro as { message?: unknown } | null | undefined)?.message ?? "");
  return ehRecusaDaConfiguracao(texto) ? texto : reserva;
}
