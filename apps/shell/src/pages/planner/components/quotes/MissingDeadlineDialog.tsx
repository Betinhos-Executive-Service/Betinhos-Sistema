// Porte de Tela Planner/src/quotes/MissingDeadlineDialog.jsx (sem mudança de comportamento).
import React from "react";

export default function MissingDeadlineDialog({ onCancel, onConfirm }: any) {
  return <div className="quote-v3-confirm-layer"><div className="quote-v3-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-missing-deadline-title" aria-describedby="quote-missing-deadline-description"><h3 id="quote-missing-deadline-title">Salvar sem prazo para responder?</h3><p id="quote-missing-deadline-description">A cotação ficará sem data de resposta. Você pode definir o prazo depois.</p><div><button className="button button-secondary" type="button" autoFocus onClick={onCancel}>Definir prazo</button><button className="button button-primary" type="button" onClick={onConfirm}>Salvar sem prazo</button></div></div></div>;
}
