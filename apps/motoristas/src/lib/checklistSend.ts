import type { SendStep } from "../components/common/SendStepsOverlay";

// Estado do envio do checklist mostrado no carregamento em etapas (mesmo padrão do gasto).
export type ChecklistSendState =
  | { phase: "uploading"; current: number; total: number }
  | { phase: "registering"; total: number }
  | { phase: "done"; total: number }
  | { phase: "error"; total: number; message: string };

export const CHECKLIST_SEND_ERROR_FALLBACK = "Não foi possível enviar o checklist agora.";
const KEPT_PROGRESS = "Seu progresso e as fotos já enviadas continuam salvos neste aparelho.";

export function describeChecklistSend(state: ChecklistSendState) {
  const { total } = state;
  // Cada foto e o registro contam uma fatia; a primeira fatia já anda quando o motorista toca em Enviar.
  const sent = state.phase === "uploading" ? Math.max(0, state.current - 1) : total;
  const progress = state.phase === "done" ? 1 : state.phase === "error" ? 0 : (1 + sent) / (total + 2);

  const steps: SendStep[] = [];
  if (total) {
    steps.push({
      label: state.phase === "uploading"
        ? `Enviando foto ${Math.min(Math.max(state.current, 1), total)} de ${total}`
        : total === 1 ? "Foto enviada" : `${total} fotos enviadas`,
      status: state.phase === "uploading" ? "active" : "done"
    });
  }
  steps.push({
    label: state.phase === "done" ? "Checklist registrado" : state.phase === "registering" ? "Registrando checklist" : "Registrar checklist",
    status: state.phase === "done" ? "done" : state.phase === "registering" ? "active" : "pending"
  });

  const title = state.phase === "done" ? "Checklist enviado" : state.phase === "error" ? "Checklist não enviado" : "Enviando checklist";
  const description = state.phase === "done"
    ? "Obrigado pela vistoria."
    : state.phase === "error"
      ? `${state.message.trim() || CHECKLIST_SEND_ERROR_FALLBACK} ${KEPT_PROGRESS}`
      : "Leva poucos segundos. Não feche o app.";
  // Texto curto para leitores de tela acompanharem a etapa atual.
  const statusText = state.phase === "error" ? title : steps.find((step) => step.status === "active")?.label ?? title;

  return {
    status: state.phase === "done" ? "done" as const : state.phase === "error" ? "error" as const : "busy" as const,
    title,
    description,
    progress,
    steps,
    statusText
  };
}
