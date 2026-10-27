// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { waitingContextSummary } from '../domain/domain'
import { AttachmentSection } from './Attachments'
import { createDraftAttachment, filesFromClipboard, releaseDraftAttachment, toAttachmentFiles, useDocumentPaste } from './attachmentFiles'
import { Check, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'


export function WaitingReturnModal({ task, onClose, onSave }: any) {
  const [text, setText] = useState<any>("");
  const [draftAttachments, setDraftAttachments] = useState<any>([]);
  const [validationError, setValidationError] = useState<any>("");
  const [saveState, setSaveState] = useState<any>("idle");
  const closeButtonRef = useRef<any>(null);
  const draftAttachmentsRef = useRef<any>([]);
  const textRef = useRef<any>(null);
  const titleId = useId();
  draftAttachmentsRef.current = draftAttachments;

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: any) => {
      if (event.key === "Escape" && saveState === "idle") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saveState]);

  useEffect(
    () => () => draftAttachmentsRef.current.forEach(releaseDraftAttachment),
    [],
  );
  const documentPasteRef = useRef<any>(null);
  useDocumentPaste((event: any) => documentPasteRef.current?.(event));
  documentPasteRef.current = null;

  if (!task) return null;

  const handleDraftAttachment = (id: any, filesOrFile: any) =>
    setDraftAttachments((current: any) => [
      ...current,
      ...toAttachmentFiles(filesOrFile).map((file) =>
        createDraftAttachment(file, "waiting-return"),
      ),
    ]);

  const handleDraftAttachmentDelete = (id: any, attachment: any) => {
    releaseDraftAttachment(attachment);
    setDraftAttachments((current: any) =>
      current.filter((item: any) => item.id !== attachment.id),
    );
  };

  const handlePaste = (event: any) => {
    const files = filesFromClipboard(event);
    if (!files.length) return;
    event.preventDefault();
    handleDraftAttachment("paste", files);
  };
  documentPasteRef.current = handlePaste;

  const handleSave = () => {
    if (saveState !== "idle") return;
    const returnText = text.trim();
    if (!returnText) {
      setValidationError("Informe o retorno recebido.");
      textRef.current?.focus();
      return;
    }
    setValidationError("");
    setSaveState("saving");
    Promise.resolve(
      onSave(task.id, {
        text: returnText,
        files: draftAttachments.map((attachment: any) => attachment.file).filter(Boolean),
      }),
    )
      .then((success) => {
        if (success) {
          onClose();
          return;
        }
        setSaveState("idle");
        setValidationError("Não foi possível registrar o retorno. Tente novamente.");
      })
      .catch((failure) => {
        setSaveState("idle");
        setValidationError(failure.message || "Não foi possível registrar o retorno. Tente novamente.");
      });
  };

  return (
    <div
      className="waiting-status-modal-layer waiting-return-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && saveState === "idle") onClose();
      }}
    >
      <section
        className="waiting-status-modal waiting-return-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onPaste={handlePaste}
      >
        <header className="waiting-status-modal-header">
          <div className="waiting-status-modal-heading">
            <span className="waiting-status-modal-icon waiting-return-modal-icon" aria-hidden="true">
              <CheckCircle2 size={19} />
            </span>
            <div>
              <span className="eyebrow">Atualizar andamento</span>
              <h2 id={titleId}>Registrar retorno</h2>
              <p>{task.title}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Fechar registro de retorno"
            disabled={saveState !== "idle"}
          >
            <X size={18} />
          </button>
        </header>
        <div className="waiting-status-modal-body waiting-return-modal-body">
          <div className="waiting-return-context">
            <span>Contexto de Aguardando</span>
            <strong>{waitingContextSummary(task.waitingContext) || "Nenhum contexto detalhado foi informado."}</strong>
          </div>
          <label className="waiting-return-field">
            <span>O que foi retornado?</span>
            <textarea
              ref={textRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Descreva o retorno recebido e o que muda na tarefa."
              maxLength={1000}
              rows={5}
              aria-invalid={Boolean(validationError)}
            />
          </label>
          {validationError && <div className="field-error" role="alert">{validationError}</div>}
          <AttachmentSection
            taskId="waiting-return"
            attachments={draftAttachments}
            onAttachment={handleDraftAttachment}
            onDeleteAttachment={handleDraftAttachmentDelete}
            helperText="Anexe um comprovante ou outra evidência, se necessário."
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
            {saveState === "saving" ? <><LoaderCircle size={16} className="spin" /> Salvando…</> : <><Check size={16} /> Registrar retorno</>}
          </button>
        </footer>
      </section>
    </div>
  );
}
