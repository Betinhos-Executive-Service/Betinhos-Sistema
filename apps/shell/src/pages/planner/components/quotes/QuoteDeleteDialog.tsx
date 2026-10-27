// Porte de Tela Planner/src/quotes/QuoteDeleteDialog.jsx (sem mudança de comportamento).
import React, { useState } from "react";

export default function QuoteDeleteDialog({ quote, onCancel, onDelete }: any) {
  const [deleting, setDeleting] = useState<any>(false);
  const [error, setError] = useState<any>("");
  const confirm = async () => {
    setDeleting(true);
    setError("");
    try {
      const success = await onDelete?.(quote.id);
      if (success === false) setError("Não foi possível excluir a cotação. Tente novamente.");
      else onCancel?.();
    } catch (failure: any) {
      setError(failure.message || "Não foi possível excluir a cotação.");
    } finally {
      setDeleting(false);
    }
  };
  return <div className="quote-v3-confirm-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onCancel?.(); }}>
    <div className="quote-v3-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-delete-title" aria-describedby="quote-delete-description">
      <h3 id="quote-delete-title">Excluir cotação?</h3>
      <p id="quote-delete-description">A cotação {quote.code || quote.title} e as tarefas vinculadas, incluindo subtarefas, serão excluídas. Esta ação não pode ser desfeita.</p>
      {error && <p role="alert">{error}</p>}
      <div><button className="button button-secondary" type="button" disabled={deleting} onClick={onCancel}>Cancelar</button><button className="button button-danger" type="button" disabled={deleting} onClick={confirm}>{deleting ? "Excluindo…" : "Excluir cotação"}</button></div>
    </div>
  </div>;
}
