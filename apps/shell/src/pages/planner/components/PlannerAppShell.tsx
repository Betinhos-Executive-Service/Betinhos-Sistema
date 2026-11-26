// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { CENTRAL_NAV_ITEMS, MOBILE_NAV_ITEMS, TODAY_LABEL_FORMATTER } from '../constants'
import { isTaskVisibleToEmployee, taskStats } from '../domain/domain'
import { canViewManagement } from '../domain/management'
import { unreadCount } from '../domain/notifications'
import { useMentionController } from './MentionableField'
import { NotificationsPanel, notificationsVisibleToEmployee } from './NotificationsPanel'
import { BellRing, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'


export function AppShell({
  active,
  onNavigate,
  children,
  onCreate,
  tasks,
  contacts = [],
  live,
  currentEmployee,
  teams = [],
  personalStats,
  openTaskCount,
  mentionEmployees = [],
  notifications = [],
  notificationError = "",
  onOpenNotification,
  onOpenContact,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onRefresh,
  refreshing = false,
  canViewManagement = false,
}: any) {
  const [notificationsOpen, setNotificationsOpen] = useState<any>(false);
  useMentionController(
    mentionEmployees.length
      ? mentionEmployees
      : (globalThis as any).__plannerEmployees || [],
  );
  const visibleTasks = tasks.filter((task: any) => isTaskVisibleToEmployee(task, currentEmployee, teams));
  const stats = personalStats || taskStats(visibleTasks);
  const visibleNotifications = notificationsVisibleToEmployee(notifications, tasks, currentEmployee, teams);
  const todayLabel = TODAY_LABEL_FORMATTER.format(new Date()).replace(".", "");
  const desktopNavActive =
    active === "team"
      ? "dashboard"
      : ["board", "list", "calendar"].includes(active)
        ? "board"
        : active;
  const mobileNavActive = ["ideas", "quality", "settings", "projects"].includes(active)
    ? "more"
    : desktopNavActive;
  const activeLabel: any =
    MOBILE_NAV_ITEMS.find(([id]: any) => id === mobileNavActive)?.[1] || (active === "contacts" ? "Contatos" : "Central");
  const canCreateTask = ["dashboard", "team", "board", "list", "calendar"].includes(active);
  return (
    <div className="app-shell">
      <main className="main-area">
        <header className="planner-header">
          <nav className="planner-tabs" aria-label="Seções da Central de Trabalho">
            {CENTRAL_NAV_ITEMS.filter(([id]: any) => id !== "management" || canViewManagement)
              .sort(([a]: any, [b]: any) => Number(a === "settings") - Number(b === "settings"))
              .map(([id, label, Icon]: any) => (
              <button
                key={id}
                type="button"
                className={`planner-tab${desktopNavActive === id ? " active" : ""}`}
                aria-current={desktopNavActive === id ? "page" : undefined}
                onClick={() => onNavigate(id)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
                {id === "board" && <span className="planner-tab-count">{openTaskCount}</span>}
                {id === "dashboard" && personalStats?.alertCount > 0 && (
                  <span className="planner-tab-count planner-tab-count-alert">{personalStats.alertCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="planner-header-actions" aria-label="Ações do aplicativo">
            <span
              className="planner-day-chip"
              title={`Hoje, ${todayLabel}: ${stats.open} pendências`}
              aria-label={`Hoje, ${stats.open} pendências e ${stats.overdue} atrasados`}
            >
              <b>{stats.open}</b> hoje
            </span>
            {stats.overdue > 0 && (
              <span className="planner-day-chip planner-day-chip-overdue">
                <b>{stats.overdue}</b> {stats.overdue === 1 ? "atrasada" : "atrasadas"}
              </span>
            )}
            {!currentEmployee && <span className="planner-day-chip">Sem vínculo</span>}
            <button
              className="notification-trigger"
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label={`Abrir notificações${unreadCount(notifications) ? `, ${unreadCount(notifications)} não lidas` : ""}`}
              title="Notificações"
            >
              <BellRing size={16} />
              {unreadCount(notifications) > 0 && <b>{unreadCount(notifications)}</b>}
            </button>
            <button
              className={`refresh-trigger${refreshing ? " is-refreshing" : ""}`}
              type="button"
              onClick={() => onRefresh?.({ silent: false })}
              disabled={refreshing}
              aria-label={refreshing ? "Atualizando dados" : "Atualizar dados"}
              title={refreshing ? "Atualizando dados" : "Atualizar dados"}
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </header>
        <header className="mobile-header">
          <div className="mobile-header-copy">
            <strong>{activeLabel}</strong>
            <span>Central de Trabalho</span>
          </div>
          <button
            className="notification-trigger mobile-notification-trigger"
            type="button"
            onClick={() => setNotificationsOpen(true)}
            aria-label={`Abrir notificações${unreadCount(notifications) ? `, ${unreadCount(notifications)} não lidas` : ""}`}
          >
            <BellRing size={18} />
            {unreadCount(notifications) > 0 && (
              <b>{unreadCount(notifications)}</b>
            )}
          </button>
          <button
            className={`refresh-trigger mobile-refresh-trigger${refreshing ? " is-refreshing" : ""}`}
            type="button"
            onClick={() => onRefresh?.({ silent: false })}
            disabled={refreshing}
            aria-label={refreshing ? "Atualizando dados" : "Atualizar dados"}
            title={refreshing ? "Atualizando dados" : "Atualizar dados"}
          >
            <RotateCcw size={16} />
          </button>
        </header>
        {children}
      </main>
      <nav className="mobile-bottom-nav" aria-label="Navegação principal">
        {MOBILE_NAV_ITEMS.map(([id, label, Icon]: any) => (
          <button
            key={id}
            className={
              mobileNavActive === id
                ? "mobile-nav-item active"
                : "mobile-nav-item"
            }
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={mobileNavActive === id ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={mobileNavActive === id ? 2.4 : 2} />
            <span>{label}</span>
            {id === "board" && openTaskCount > 0 && <b>{openTaskCount}</b>}
            {id === "dashboard" && personalStats?.alertCount > 0 && (
              <b>{personalStats.alertCount}</b>
            )}
          </button>
        ))}
      </nav>
      {canCreateTask && (
        <button
          className="mobile-fab"
          type="button"
          onClick={onCreate}
          aria-label="Criar nova tarefa"
          title="Nova tarefa"
        >
          <Plus size={22} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
      {notificationsOpen && (
        <NotificationsPanel
          notifications={visibleNotifications}
          tasks={visibleTasks}
          contacts={contacts}
          currentEmployee={currentEmployee}
          teams={teams}
          error={notificationError}
          onClose={() => setNotificationsOpen(false)}
          onOpenTask={(item: any) => {
            onOpenNotification?.(item);
            setNotificationsOpen(false);
          }}
          onOpenContact={(item: any) => {
            onOpenContact?.(item);
            setNotificationsOpen(false);
          }}
          onMarkRead={onMarkNotificationRead}
          onMarkAllRead={onMarkAllNotificationsRead}
        />
      )}
    </div>
  );
}
