// Porte de Tela Planner/src/TaskHistorySection.jsx (sem mudança de comportamento).
import React, { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { taskHistoryDetails, visibleTaskHistory } from '../domain/taskHistory';

export default function TaskHistorySection({ history: rawHistory, employees = [], loading = false, error = "", onRetry }: any) {
  const [showHistory, setShowHistory] = useState<any>(false);
  const [showAllHistory, setShowAllHistory] = useState<any>(false);
  const history = visibleTaskHistory(rawHistory);
  const visibleHistory = showAllHistory ? history : history.slice(0, 5);

  return <section className="drawer-section history-section">
    <div className="drawer-section-heading">
      <button className="history-toggle" type="button" onClick={() => setShowHistory((current: any) => !current)} aria-expanded={showHistory}>
        <span className="history-heading"><strong>Histórico da tarefa</strong><small>Alterações registradas nesta tarefa</small></span>
        <span className="section-count">{history.length}</span>
        {showHistory ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
    </div>
    {showHistory && (
      loading ? <p>Carregando histórico…</p> : error ? <div className="quote-v3-inline-warning"><strong>Histórico indisponível</strong><span>{error}</span>{onRetry && <button className="button button-secondary" type="button" onClick={onRetry}>Tentar novamente</button>}</div> : (
        history.length ? <div className="task-history-list">
          {visibleHistory.map((item, index) => {
            const details = taskHistoryDetails(item, employees);
            const date = new Date((item.createdAt as any));
            const day = Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
            const previous = visibleHistory[index - 1];
            const previousDate = previous && new Date((previous.createdAt as any));
            const previousDay = previousDate && !Number.isNaN(previousDate.getTime()) ? previousDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Data não informada";
            return <React.Fragment key={item.id || `${item.createdAt}-${index}`}>
              {day !== previousDay && <div className="task-history-day">{day}</div>}
              <div className="task-history-event">
                <span className="task-history-marker" aria-hidden="true" />
                <div className="task-history-content">
                  <p>{details.title}</p>
                  {details.before !== undefined && <div className="task-history-change"><span>{details.before}</span><ChevronRight size={13} aria-hidden="true" /><strong>{details.after}</strong></div>}
                  {details.detail && <div className="task-history-detail">{details.detail}</div>}
                  <div className="task-history-meta"><span>{(item as any).author || "Sistema"}</span><time dateTime={item.createdAt || undefined}>{Number.isNaN(date.getTime()) ? "Horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></div>
                </div>
              </div>
            </React.Fragment>;
          })}
          {history.length > 5 && <button className="task-history-more" type="button" onClick={() => setShowAllHistory((current: any) => !current)}>{showAllHistory ? "Mostrar menos" : `Mostrar mais ${history.length - 5} alterações`}</button>}
        </div> : <div className="task-history-empty">Nenhuma alteração registrada nesta tarefa.</div>
      )
    )}
  </section>;
}
