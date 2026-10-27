// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { normalizeWaitingContext, validateWaitingContext } from '../domain/domain'
import { WaitingContextFields } from './WaitingContextFields'
import { Clock3, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'


export function WaitingStatusModal({ task, employees = [], teams = [], onClose, onSave }: any) {
  const [waitingContext, setWaitingContext] = useState<any>(() =>
    normalizeWaitingContext(task?.waitingContext),
  );
  const [validationError, setValidationError] = useState<any>("");
  const [saveState, setSaveState] = useState<any>("idle");
  const closeButtonRef = useRef<any>(null);
  const titleId = useId();

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: any) => {
      if (event.key === "Escape" && saveState === "idle") {
        event.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saveState]);

  if (!task) return null;

  const handleSave = () => {
    if (saveState !== "idle") return;
    const waitingValidation = validateWaitingContext("waiting", waitingContext);
    if (!waitingValidation.allowed) {
      setValidationError(waitingValidation.error);
      return;
    }
    setValidationError("");
    setSaveState("saving");
    Promise.resolve(onSave(task.id, waitingContext))
      .then((success) => {
        if (success) {
          onClose();
          return;
        }
        setSaveState("idle");
        setValidationError("Não foi possível salvar a tarefa. Tente novamente.");
      })
      .catch(() => {
        setSaveState("idle");
        setValidationError("Não foi possível salvar a tarefa. Tente novamente.");
      });
  };

  return (
    <div
      className="waiting-status-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && saveState === "idle") onClose();
      }}
    >
      <section
        className="waiting-status-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="waiting-status-modal-header">
          <div className="waiting-status-modal-heading">
            <span className="waiting-status-modal-icon" aria-hidden="true">
              <Clock3 size={19} />
            </span>
            <div>
              <span className="eyebrow">Alterar status</span>
              <h2 id={titleId}>Mover para Aguardando</h2>
              <p>{task.title}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Fechar alteração de status"
            disabled={saveState !== "idle"}
          >
            <X size={18} />
          </button>
        </header>
        <div className="waiting-status-modal-body">
          <p className="waiting-status-modal-intro">
            Preencha o contexto para deixar claro de quem depende o próximo passo.
          </p>
          <WaitingContextFields
            value={waitingContext}
            onChange={setWaitingContext}
            employees={employees}
            teams={teams}
            error={validationError}
          />
        </div>
        <footer className="waiting-status-modal-footer">
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
            disabled={saveState !== "idle"}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={handleSave}
            disabled={saveState !== "idle"}
          >
            {saveState === "saving" ? "Salvando…" : "Salvar e mover"}
          </button>
        </footer>
      </section>
    </div>
  );
}
