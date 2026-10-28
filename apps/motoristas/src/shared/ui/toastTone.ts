import type { ToastTone } from "../../components/common/LocalToast";

// Tom do aviso deduzido do texto, para chamadas que só passam a mensagem.
export function inferToastTone(message: string): ToastTone {
  const normalized = message.trim().toLowerCase();

  if (
    normalized.includes("falha") ||
    normalized.includes("erro") ||
    normalized.includes("não foi") ||
    normalized.includes("nao foi") ||
    normalized.includes("não encontrado") ||
    normalized.includes("nao encontrado")
  ) {
    return "error";
  }

  if (
    normalized.includes("atenção") ||
    normalized.includes("atencao") ||
    normalized.includes("aviso") ||
    normalized.includes("conclua") ||
    normalized.includes("ainda nao") ||
    normalized.includes("ainda não")
  ) {
    return "warning";
  }

  if (
    normalized.includes("salva") ||
    normalized.includes("salvo") ||
    normalized.includes("enviado") ||
    normalized.includes("registrado") ||
    normalized.includes("atualizado") ||
    normalized.includes("copiadas") ||
    normalized.includes("copiado") ||
    normalized.includes("reiniciados") ||
    normalized.includes("apagada") ||
    normalized.includes("apagado")
  ) {
    return "success";
  }

  return "info";
}
