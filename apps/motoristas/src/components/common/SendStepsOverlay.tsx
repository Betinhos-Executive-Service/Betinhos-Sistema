import { useEffect, useRef } from "react";
import { SystemIcon } from "../icons/SystemIcon";

export type SendStepStatus = "pending" | "active" | "done";
export type SendStep = { label: string; status: SendStepStatus };
export type SendOverlayAction = { label: string; onClick: () => void; variant?: "primary" | "secondary" };

type Props = {
  status: "busy" | "done" | "error";
  /** Modificador de classe do cartão; o gasto mantém as fases dele (saving, uploading...). */
  phaseClass?: string;
  titleId: string;
  title: string;
  description: string;
  progress: number;
  steps: SendStep[];
  actions: SendOverlayAction[];
  /** Etapa atual para leitor de tela (ex.: "Enviando foto 2 de 5"); a descrição visível é fixa. */
  liveText?: string;
};

function StepRow({ label, status }: SendStep) {
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

// Carregamento bloqueante de envio em etapas (gasto, checklist): cobre o formulário,
// mostra cada etapa real, a barra de progresso, o sucesso e o erro com as saídas possíveis.
export function SendStepsOverlay({ status, phaseClass = status, titleId, title, description, progress, steps, actions, liveText }: Props) {
  const firstActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (status === "error") firstActionRef.current?.focus();
  }, [status]);

  return (
    <div className="expense-send-overlay">
      <div className={`expense-send-card is-${phaseClass}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={status === "busy"}>
        <div className="expense-send-hero" aria-hidden="true">
          {status === "done" ? <SystemIcon name="check" /> : status === "error" ? <SystemIcon name="warning" /> : <span className="expense-send-spinner is-large" />}
        </div>
        <h2 id={titleId}>{title}</h2>
        <p role="status" aria-live="polite">{description}</p>
        {liveText !== undefined ? <span className="expense-send-sr" aria-live="polite">{liveText}</span> : null}
        {status !== "error" ? (
          <>
            <div className="expense-send-bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
            <ul className="expense-send-steps">
              {steps.map((step, index) => <StepRow key={index} {...step} />)}
            </ul>
          </>
        ) : (
          actions.map((action, index) => (
            <button
              key={action.label}
              ref={index === 0 ? firstActionRef : undefined}
              type="button"
              className={`expense-send-close${action.variant === "secondary" ? " is-secondary" : ""}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
