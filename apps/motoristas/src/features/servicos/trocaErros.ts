import { APP_OPERATION_ERROR_MESSAGE } from "../../shared/appErrorLogger";

// Mensagens para o motorista a partir dos códigos de erro do plugin de trocas de carro.
const EXCHANGE_ERROR_MESSAGES: Record<string, string> = {
  EXCHANGE_CONCURRENCY_CONFLICT: "A troca foi alterada por outra pessoa. Atualize a agenda e tente novamente.",
  EXCHANGE_VERSION_REQUIRED: "Atualize a agenda antes de executar esta ação.",
  EXCHANGE_INVALID_WINDOW: "O fim da troca deve ser posterior ao início.",
  EXCHANGE_OVERLAP: "Existe outra troca para este motorista ou veículo no período.",
  POSSESSION_CHAIN_GAP: "O histórico de posse precisa ser reconciliado pela operação antes desta troca.",
  POSSESSION_OVERLAP: "Existe sobreposição no histórico de posse. Contate a operação.",
  POSSESSION_NOT_OPEN: "A posse esperada do veículo não está aberta. Contate a operação.",
  IDENTITY_NOT_MAPPED: "Seu usuário não está vinculado a um funcionário ativo. Contate a operação.",
  FORBIDDEN_LIFECYCLE: "Você não tem permissão ou esta troca não aceita essa ação.",
  EXCHANGE_OUT_OF_WINDOW_REASON_REQUIRED: "A troca está fora do combinado. Conte o motivo antes de confirmar."
};

export function exchangeUserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? "");
  const code = Object.keys(EXCHANGE_ERROR_MESSAGES).find((candidate) => message.includes(candidate));
  return code ? EXCHANGE_ERROR_MESSAGES[code] : APP_OPERATION_ERROR_MESSAGE;
}
