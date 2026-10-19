import { useEffect, useRef } from "react";
import { SystemIcon } from "../icons/SystemIcon";

export type ExpenseSendState = {
  phase: "saving" | "uploading" | "done" | "error";
  current: number;
  total: number;
};

type StepStatus = "pending" | "active" | "done";

function StepRow({ label, status }: { label: string; status: StepStatus }) {
  return (
    <li className={`expense-send-step is-${status}`}>
      <span className="expense-send-step-mark" aria-hidden="true">
        {status === "done" ? <SystemIcon name="check" /> : status === "active" ? <span className="expense-send-spinner" /> : null}
      </span>
      <span>{label}</span>
      <span className="expense-send-sr">{status === "done" ? "concluído" : status === "active" ? "em andamento" : "aguardando"}</span>
    </li>
  );
}

export function ExpenseSendOverlay({ state, onClose }: { state: ExpenseSendState; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const busy = state.phase === "saving" || state.phase === "uploading";
  const sent = state.phase === "done" ? state.total : state.phase === "uploading" ? Math.max(0, state.current - 1) : 0;
  // Saving counts as one slice so the bar moves as soon as the driver taps.
  const progress = state.phase === "done" ? 1 : (1 + sent) / (state.total + 2);
  const photoLabel = state.total > 1
    ? `Enviando foto ${Math.min(Math.max(state.current, 1), state.total)} de ${state.total}`
    : "Enviando foto do comprovante";

  useEffect(() => {
    if (state.phase === "error") closeRef.current?.focus();
  }, [state.phase]);

  const title = state.phase === "done" ? "Gasto enviado" : state.phase === "error" ? "Sem conexão agora" : "Enviando gasto";
  const description = state.phase === "done"
    ? "Tudo certo. Pode seguir com o app."
    : state.phase === "error"
      ? "O gasto ficou salvo no celular e será enviado sozinho quando a conexão voltar."
      : "Leva poucos segundos. Não feche o app.";

  return (
    <div className="expense-send-overlay">
      <div className={`expense-send-card is-${state.phase}`} role="dialog" aria-modal="true" aria-labelledby="expense-send-title" aria-busy={busy}>
        <div className="expense-send-hero" aria-hidden="true">
          {state.phase === "done" ? <SystemIcon name="check" /> : state.phase === "error" ? <SystemIcon name="warning" /> : <span className="expense-send-spinner is-large" />}
        </div>
        <h2 id="expense-send-title">{title}</h2>
        <p role="status" aria-live="polite">{description}</p>
        {state.phase !== "error" ? (
          <>
            <div className="expense-send-bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
            <ul className="expense-send-steps">
              <StepRow label={state.phase === "saving" ? "Salvando dados do gasto" : "Dados do gasto salvos"} status={state.phase === "saving" ? "active" : "done"} />
              {state.total ? (
                <StepRow
                  label={state.phase === "done"
                    ? (state.total > 1 ? `${state.total} fotos enviadas` : "Foto enviada")
                    : state.phase === "uploading" ? photoLabel : (state.total > 1 ? `Enviar ${state.total} fotos do comprovante` : "Enviar foto do comprovante")}
                  status={state.phase === "done" ? "done" : state.phase === "uploading" ? "active" : "pending"}
                />
              ) : null}
            </ul>
          </>
        ) : (
          <button ref={closeRef} type="button" className="expense-send-close" onClick={onClose}>Entendi</button>
        )}
      </div>
    </div>
  );
}
