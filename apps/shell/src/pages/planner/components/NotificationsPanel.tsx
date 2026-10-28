// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { isTaskVisibleToEmployee, statusById, waitingContextSummary } from '../domain/domain'
import { unreadCount } from '../domain/notifications'
import { BellRing, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardList, Eye, FileText, ListChecks, MessageCircle, ShieldAlert, Users, X } from 'lucide-react'
import { useState } from 'react'


export const ACTIONABLE_NOTIFICATION_TYPES = new Set([
  "quote_urgent",
  "quote_ready",
  "quote_follow_up",
  "quote_waiting_return",
  "assignment",
  "deadline",
  "due_today",
  "mention",
  "overdue",
  "waiting",
  "contact_assignment",
  "contact_transfer",
]);

export function formatNotificationTime(value: any) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Agora";
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (elapsedMinutes < 1) return "agora";
  if (elapsedMinutes < 60) return `há ${elapsedMinutes} min`;
  if (elapsedMinutes < 1440) return `há ${Math.round(elapsedMinutes / 60)} h`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function notificationPresentation(item: any, task: any, contact: any) {
  const taskTitle = task?.title || item.message || "Atualização da tarefa";
  const contactTitle = contact?.subject || item.message || "Atualização do caso";
  const context = task ? task.teamName || "Sem equipe" : contact ? `${contactChannelLabelForNotification(contact.channel)} • ${contact.ownerName || "Sem responsável"}` : "Central de avisos";
  const type = item.type || "update";
  const distinctMessage = item.message && String(item.message).trim() !== String(taskTitle).trim() ? item.message : "";

  // Cotações V2: avisos ligados à cotação (sem tarefa).
  if (item.quoteId) {
    const quoteLabels: Record<string, [string, string]> = { quote_urgent: ["Cotação para hoje", "danger"], quote_ready: ["Preço pronto", "success"], quote_follow_up: ["Cobrar decisão do cliente", "warning"], quote_waiting_return: ["Retorno de informação", "warning"] };
    const [label, tone] = quoteLabels[type] || ["Cotação", "info"];
    return { context: "Cotações", icon: type === "quote_urgent" ? ShieldAlert : FileText, label, message: item.message || "", title: item.title || label, tone };
  }

  if (item.contactId) {
    return {
      context,
      icon: Users,
      label: "Novo caso para você",
      message: item.message || "Um caso de atendimento foi atribuído a você.",
      title: item.title || contactTitle,
      tone: "success",
    };
  }

  if (["deadline", "due_today", "overdue"].includes(type)) {
    return {
      context,
      icon: type === "overdue" ? ShieldAlert : CalendarDays,
      label: type === "overdue" ? "Prazo da tarefa atrasado" : "Prazo da tarefa",
      message: distinctMessage || (type === "overdue" ? "O prazo desta tarefa está atrasado." : "O prazo desta tarefa vence hoje."),
      title: taskTitle,
      tone: type === "overdue" ? "danger" : "warning",
    };
  }

  if (type === "assignment") {
    return {
      context,
      icon: ClipboardList,
      label: "Nova tarefa para você",
      message: distinctMessage || "Você recebeu uma nova tarefa para acompanhar.",
      title: taskTitle,
      tone: "success",
    };
  }

  if (type === "mention") {
    return {
      context,
      icon: MessageCircle,
      label: "Você foi mencionado",
      message: distinctMessage || "Há uma mensagem aguardando sua resposta.",
      title: taskTitle,
      tone: "info",
    };
  }

  if (type === "waiting" || (type === "status" && task?.status === "waiting")) {
    return {
      context,
      icon: BellRing,
      label: "Aguardando seu retorno",
      message: distinctMessage || waitingContextSummary(task?.waitingContext) || "Esta tarefa aguarda um retorno para avançar.",
      title: taskTitle,
      tone: "warning",
    };
  }

  if (type === "status") {
    const statusLabel = task ? statusById(task.status)?.label : "";
    return {
      context,
      icon: CheckCircle2,
      label: "Tarefa atualizada",
      message: distinctMessage || (statusLabel ? `Agora: ${statusLabel}` : "O andamento desta tarefa foi alterado."),
      title: taskTitle,
      tone: "info",
    };
  }

  if (type === "assignees") {
    return {
      context,
      icon: Users,
      label: "Responsáveis atualizados",
      message: distinctMessage || "A equipe responsável foi atualizada.",
      title: taskTitle,
      tone: "info",
    };
  }

  if (type === "overdue_manual") {
    return {
      context,
      icon: ShieldAlert,
      label: "Cobrança de tarefa",
      message: distinctMessage || "O responsável recebeu uma cobrança.",
      title: taskTitle,
      tone: "warning",
    };
  }

  return {
    context,
    icon: BellRing,
    label: "Nova atualização",
    message: distinctMessage || "Há uma nova atualização no Planner.",
    title: item.title || taskTitle,
    tone: "neutral",
  };
}

export function contactChannelLabelForNotification(channel: any) {
  return channel === "email" ? "E-mail" : channel === "phone" ? "Telefone" : "WhatsApp";
}

export function isActionableNotification(item: any, tasks: any) {
  if (ACTIONABLE_NOTIFICATION_TYPES.has(item.type)) return true;
  return item.type === "status" && tasks.some((task: any) => task.id === item.taskId && task.status === "waiting");
}

export function notificationsVisibleToEmployee(notifications: any = [], tasks: any = [], employee: any, teams: any = []) {
  const taskById = new Map(tasks.map((task: any) => [task.id, task]));
  return notifications.filter((item: any) => {
    if (!item.taskId) return true;
    const task = taskById.get(item.taskId);
    return !task || isTaskVisibleToEmployee(task, employee, teams);
  });
}

export function NotificationsPanel({
  notifications,
  tasks,
  contacts = [],
  currentEmployee,
  teams = [],
  error = "",
  onClose,
  onOpenTask,
  onOpenContact,
  onMarkRead,
  onMarkAllRead,
}: any) {
  const [notificationFilter, setNotificationFilter] = useState<any>("all");
  const scopedNotifications = notificationsVisibleToEmployee(notifications, tasks, currentEmployee, teams);
  const unread = unreadCount(scopedNotifications);
  const actionableNotifications = scopedNotifications.filter((item: any) => isActionableNotification(item, tasks));
  const informationalNotifications = scopedNotifications.filter((item: any) => !isActionableNotification(item, tasks));
  const filterOptions = [
    { id: "all", label: "Todas", icon: BellRing, items: scopedNotifications },
    { id: "actionable", label: "Pendentes", icon: ListChecks, items: actionableNotifications },
    { id: "informational", label: "Informativas", icon: FileText, items: informationalNotifications },
  ];
  const visibleNotifications = [...(notificationFilter === "actionable" ? actionableNotifications : notificationFilter === "informational" ? informationalNotifications : scopedNotifications)].sort((left, right) => {
    return new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime();
  });

  return (
    <div
      className="notification-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="notification-panel" aria-label="Caixa de entrada de notificações">
        <header>
          <div className="notification-panel-heading">
            <span className="notification-panel-heading-icon" aria-hidden="true">
              <BellRing size={21} strokeWidth={2.1} />
            </span>
            <div>
              <h2>Caixa de entrada</h2>
              <p>{unread ? "Atualizações recentes" : "Tudo em dia"}</p>
            </div>
          </div>
          <button
            className="icon-button notification-close"
            type="button"
            onClick={onClose}
            aria-label="Fechar notificações"
          >
            <X size={18} />
          </button>
        </header>
        {unread > 0 && (
          <div className="notification-panel-actions">
            <span className="notification-action-summary" aria-live="polite" aria-atomic="true">
              {`${unread} não lida${unread === 1 ? "" : "s"}`}
            </span>
            <button
              className="notification-mark-all"
              type="button"
              onClick={onMarkAllRead}
              aria-label="Marcar todas como lidas"
            >
              <Check size={14} strokeWidth={2.2} aria-hidden="true" />
              <span>Marcar todas</span>
            </button>
          </div>
        )}
        <div className="notification-filters" role="tablist" aria-label="Filtrar notificações">
          {filterOptions.map((filter) => {
            const Icon = filter.icon;
            const isActive = notificationFilter === filter.id;
            return (
              <button
                aria-selected={isActive}
                className={`notification-filter ${isActive ? "is-active" : ""}`}
                key={filter.id}
                onClick={() => setNotificationFilter(filter.id)}
                role="tab"
                type="button"
              >
                <Icon aria-hidden="true" size={20} strokeWidth={2} />
                <span>{filter.label}</span>
                <b>{filter.items.length}</b>
              </button>
            );
          })}
        </div>
        {error && <div className="notification-degraded" role="alert"><strong>Notificações indisponíveis</strong><span>{error}</span></div>}
        <div className="notification-list">
          {visibleNotifications.length ? (
            visibleNotifications.map((item) => {
              const task = tasks.find((entry: any) => entry.id === item.taskId);
              const contact = contacts.find((entry: any) => entry.id === item.contactId);
              const presentation = notificationPresentation(item, task, contact);
              const Icon = presentation.icon;
              return (
                <article
                  className={`notification-item is-${presentation.tone} ${item.readAt ? "is-read" : "is-unread"}`}
                  key={item.id}
                >
                  <span className="notification-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2.1} />
                  </span>
                  <div className="notification-item-content">
                    <button className="notification-item-main" type="button" onClick={() => item.contactId || item.quoteId ? onOpenContact?.(item) : onOpenTask(item)}>
                      <span className="notification-kicker">{presentation.label}</span>
                      <strong>{presentation.title}</strong>
                      {presentation.message && <span className="notification-message">{presentation.message}</span>}
                      <span className="notification-meta">
                        <span>{presentation.context}</span>
                        <time dateTime={item.occurredAt || undefined}>{formatNotificationTime(item.occurredAt)}</time>
                      </span>
                      <ChevronRight className="notification-item-chevron" aria-hidden="true" size={18} strokeWidth={2.1} />
                    </button>
                    {!item.readAt && (
                      <button
                        className="notification-view"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMarkRead?.(item.id);
                        }}
                        aria-label={`Marcar como lida sem abrir: ${presentation.title}`}
                        title="Marcar como lida sem abrir"
                      >
                        <Eye aria-hidden="true" size={17} strokeWidth={2.1} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="notification-empty" role="status">
              <CheckCircle2 size={28} strokeWidth={1.8} />
              <strong>{notificationFilter === "all" ? "Nenhuma notificação" : "Nada por aqui"}</strong>
              <span>
                {notificationFilter === "actionable" ? "Você não tem pendências que exigem ação." : notificationFilter === "informational" ? "Novas atualizações informativas aparecerão aqui." : "Novas atribuições, menções e prazos aparecerão aqui."}
              </span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
