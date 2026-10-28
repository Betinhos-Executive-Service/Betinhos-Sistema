import { SendStepsOverlay, type SendStep } from "../../components/common/SendStepsOverlay";

export type ExpenseSendState = {
  phase: "saving" | "uploading" | "done" | "error";
  current: number;
  total: number;
};

export function ExpenseSendOverlay({ state, onClose }: { state: ExpenseSendState; onClose: () => void }) {
  const sent = state.phase === "done" ? state.total : state.phase === "uploading" ? Math.max(0, state.current - 1) : 0;
  // Saving counts as one slice so the bar moves as soon as the driver taps.
  const progress = state.phase === "done" ? 1 : (1 + sent) / (state.total + 2);
  const photoLabel = state.total > 1
    ? `Enviando foto ${Math.min(Math.max(state.current, 1), state.total)} de ${state.total}`
    : "Enviando foto do comprovante";

  const title = state.phase === "done" ? "Gasto enviado" : state.phase === "error" ? "Sem conexão agora" : "Enviando gasto";
  const description = state.phase === "done"
    ? "Tudo certo. Pode seguir com o app."
    : state.phase === "error"
      ? "O gasto ficou salvo no celular e será enviado sozinho quando a conexão voltar."
      : "Leva poucos segundos. Não feche o app.";

  const steps: SendStep[] = [
    { label: state.phase === "saving" ? "Salvando dados do gasto" : "Dados do gasto salvos", status: state.phase === "saving" ? "active" : "done" }
  ];
  if (state.total) {
    steps.push({
      label: state.phase === "done"
        ? (state.total > 1 ? `${state.total} fotos enviadas` : "Foto enviada")
        : state.phase === "uploading" ? photoLabel : (state.total > 1 ? `Enviar ${state.total} fotos do comprovante` : "Enviar foto do comprovante"),
      status: state.phase === "done" ? "done" : state.phase === "uploading" ? "active" : "pending"
    });
  }

  return (
    <SendStepsOverlay
      status={state.phase === "done" ? "done" : state.phase === "error" ? "error" : "busy"}
      phaseClass={state.phase}
      titleId="expense-send-title"
      title={title}
      description={description}
      progress={progress}
      steps={steps}
      actions={[{ label: "Entendi", onClick: onClose }]}
    />
  );
}
