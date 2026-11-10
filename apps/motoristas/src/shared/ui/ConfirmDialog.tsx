import { useEffect, useId, useRef } from "react";
import { SystemIcon } from "./icons/SystemIcon";
import { ActionButton } from "./ActionButton";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  // Padrão destrutivo (lixeira, botão vermelho); "confirm" serve para perguntas sem exclusão.
  tone?: "danger" | "confirm";
};

// Diálogo destrutivo padrão: fecha com Cancelar, Esc ou toque fora; foco inicial em Cancelar.
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Cancelar", onCancel, onConfirm, tone = "danger" }: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div className="maintenance-delete-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onCancel}>
      <div className="maintenance-delete-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="maintenance-delete-icon" aria-hidden="true">
          <SystemIcon name={tone === "danger" ? "trash" : "warning"} />
        </div>
        <div id={titleId} className="maintenance-delete-title">{title}</div>
        <p>{message}</p>
        <div className="maintenance-delete-actions">
          <ActionButton buttonRef={cancelRef} className="maintenance-delete-cancel" label={cancelLabel} onClick={onCancel} />
          {tone === "danger" ? (
            <ActionButton className="maintenance-delete-confirm" variant="danger" label={confirmLabel} icon={<SystemIcon name="trash" />} onClick={onConfirm} />
          ) : (
            <ActionButton className="maintenance-delete-confirm" variant="primary" label={confirmLabel} onClick={onConfirm} />
          )}
        </div>
      </div>
    </div>
  );
}
