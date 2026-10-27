// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { plannerPortalRoot } from './portalRoot'
import { CalendarDays, UserRound } from 'lucide-react'
import { createPortal } from 'react-dom'


// A tarefa de cotação não conclui pelo board: conclui quando a decisão do
// cliente (aceite, recusa ou cancelamento) é registrada na cotação.
export function QuoteCompletionDialog({ quote, onCancel, onConfirm }: any) {
  return createPortal(<div className="drawer-confirm-layer"><div className="drawer-confirm" role="dialog" aria-modal="true" aria-labelledby="quote-completion-title">
    <h2 id="quote-completion-title">Concluir pela cotação</h2>
    <p>Esta tarefa acompanha a cotação {quote?.code || "vinculada"} e conclui sozinha quando a decisão do cliente é registrada lá: aceite, recusa ou cancelamento.</p>
    <div className="drawer-confirm-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Voltar</button><button className="button button-primary" type="button" onClick={onConfirm}>Abrir cotação</button></div>
  </div></div>, plannerPortalRoot());
}

export function UnsavedChangesDialog({ onContinue, onDiscard }: any) {
  return (
    <div
      className="drawer-confirm-layer"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="drawer-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-confirm-title"
      >
        <h2 id="drawer-confirm-title">Alterações não salvas</h2>
        <p>Você tem alterações que ainda não foram salvas. Deseja descartar?</p>
        <div className="drawer-confirm-actions">
          <button
            className="button button-quiet"
            type="button"
            onClick={onContinue}
          >
            Continuar editando
          </button>
          <button
            className="button button-danger"
            type="button"
            onClick={onDiscard}
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteTaskDialog({
  taskTitle,
  onCancel,
  onConfirm,
  subject = "tarefa",
}: any) {
  return (
    <div
      className="drawer-confirm-layer"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="drawer-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-task-title"
      >
        <h2>Excluir {subject}?</h2>
        <p>
          “{taskTitle}” será removida do Planner. Esta ação não pode ser
          desfeita.
        </p>
        <div className="drawer-confirm-actions">
          <button
            className="button button-quiet"
            type="button"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="button button-danger"
            type="button"
            onClick={onConfirm}
          >
            Excluir {subject}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnassignedTaskDialog({
  taskTitle = "",
  isCreation = false,
  missingResponsible = true,
  missingDueDate = false,
  onCancel,
  onConfirm,
}: any) {
  const missingFields = [
    missingResponsible ? "responsável" : "",
    missingDueDate ? "prazo" : "",
  ].filter(Boolean);
  const missingLabel = missingFields.length === 2
    ? "responsável e prazo"
    : missingFields[0] || "campos obrigatórios";
  return (
    <div
      className="drawer-confirm-layer"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="drawer-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unassigned-task-title"
      >
        <h2 id="unassigned-task-title">Faltam dados para salvar</h2>
        <p>
          {isCreation
            ? "Preencha os campos abaixo ou confirme para criar assim mesmo."
            : `“${taskTitle}” pode ser salva sem os campos abaixo.`}
        </p>
        <ul className="drawer-confirm-missing" aria-label={`Campos pendentes: ${missingLabel}`}>
          {missingResponsible && (
            <li>
              <UserRound size={16} aria-hidden="true" />
              <span><strong>Responsável</strong><small>Escolha uma pessoa ou equipe</small></span>
            </li>
          )}
          {missingDueDate && (
            <li>
              <CalendarDays size={16} aria-hidden="true" />
              <span><strong>Prazo</strong><small>Defina uma data de entrega</small></span>
            </li>
          )}
        </ul>
        <div className="drawer-confirm-actions">
          <button className="button button-primary" type="button" onClick={onCancel}>
            {isCreation ? "Voltar e preencher" : "Preencher agora"}
          </button>
          <button className="button button-quiet" type="button" onClick={onConfirm}>
            {isCreation ? "Criar mesmo assim" : "Salvar mesmo assim"}
          </button>
        </div>
      </div>
    </div>
  );
}
