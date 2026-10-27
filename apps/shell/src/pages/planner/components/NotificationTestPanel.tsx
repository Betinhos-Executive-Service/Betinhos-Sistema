// Porte de Tela Planner/src/NotificationTestPanel.jsx (sem mudança de comportamento).
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock3, LoaderCircle, Smartphone, Send } from "lucide-react";
import SearchableSelect from './SearchableSelect';

const DEFAULT_MESSAGE = "Teste de notificação do Planner.";

function firstTestableTask(tasks: any) {
  return tasks.find((task: any) => !["done", "cancelled"].includes(task.status)) || tasks[0];
}

export default function NotificationTestPanel({ live, tasks = [], onSend }: any) {
  const [taskId, setTaskId] = useState<any>("");
  const [message, setMessage] = useState<any>(DEFAULT_MESSAGE);
  const [sending, setSending] = useState<any>(false);
  const [feedback, setFeedback] = useState<any>(null);
  const availableTasks = useMemo(() => tasks.filter((task: any) => task?.id), [tasks]);

  useEffect(() => {
    if (!availableTasks.some((task: any) => task.id === taskId)) setTaskId(firstTestableTask(availableTasks)?.id || "");
  }, [availableTasks, taskId]);

  const submit = async () => {
    if (!live || !taskId || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const result = await onSend({ taskId, message });
      setFeedback(result?.text
        ? { type: result.type || "pending", text: result.text }
        : { type: "pending", text: "Evento criado, mas o Planner ainda não confirmou o disparo." });
    } catch (error: any) {
      setFeedback({ type: "error", text: error?.message || "Não foi possível enviar o teste." });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel notification-test-panel" aria-labelledby="notification-test-title">
      <div className="notification-test-heading">
        <div className="notification-test-heading-icon" aria-hidden="true"><BellRing size={18} /></div>
        <div>
          <span className="eyebrow">Operação controlada</span>
          <h2 id="notification-test-title">Módulo de teste de notificações mobile</h2>
          <p>Dispare um evento real para validar o push do Power Apps Mobile usando o usuário Microsoft conectado.</p>
        </div>
        <span className="notification-test-target"><Smartphone size={14} /> Power Apps Mobile</span>
      </div>
      <div className="notification-test-body">
        {!live && <div className="notification-test-local-note"><AlertTriangle size={15} /> Conecte o Planner ao Dataverse para habilitar o envio real.</div>}
        <div className="notification-test-fields">
          <label className="notification-test-field">
            <span>Tarefa de referência</span>
            <SearchableSelect value={taskId} onChange={setTaskId} disabled={!live || sending || !availableTasks.length} options={availableTasks.map((task: any) => ({ value: task.id, label: task.title || "Tarefa sem título" }))} placeholder={availableTasks.length ? "Selecione uma tarefa" : "Nenhuma tarefa disponível"} clearable={false} aria-label="Tarefa de referência" />
          </label>
          <label className="notification-test-field">
            <span>Mensagem do teste</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={500} disabled={!live || sending} />
          </label>
        </div>
        <div className="notification-test-footer">
          {feedback && <div className={`notification-test-feedback is-${feedback.type}`} role={feedback.type === "error" || feedback.type === "warning" ? "alert" : "status"}>
            {feedback.type === "success" ? <CheckCircle2 size={15} /> : feedback.type === "pending" ? <Clock3 size={15} /> : <AlertTriangle size={15} />}
            {feedback.text}
          </div>}
          <button className="button button-primary" type="button" onClick={submit} disabled={!live || !taskId || sending || !message.trim()}>
            {sending ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
            {sending ? "Enviando…" : "Enviar push de teste"}
          </button>
        </div>
      </div>
    </section>
  );
}
