// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { CENTRAL_NAV_ITEMS, MOBILE_NAV_ITEMS, SIDEBAR_EXPANDED_KEY, TODAY_LABEL_FORMATTER } from '../constants'
import { APP_VERSION } from '../data/version'
import { isTaskVisibleToEmployee, taskStats } from '../domain/domain'
import { canViewManagement } from '../domain/management'
import { unreadCount } from '../domain/notifications'
import { Avatar } from './Badges'
import { useMentionController } from './MentionableField'
import { NotificationsPanel, notificationsVisibleToEmployee } from './NotificationsPanel'
import { BellRing, ClipboardList, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'


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
  const [expanded, setExpanded] = useState<any>(() => {
    try {
      return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(expanded));
    } catch {
      // O estado da navegação continua utilizável quando o navegador bloqueia o storage.
    }
  }, [expanded]);
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
  const userName = currentEmployee?.name || "Usuário não vinculado";
  const desktopNavActive =
    active === "team"
      ? "dashboard"
      : ["board", "list", "calendar"].includes(active)
        ? "board"
        : active;
  const mobileNavActive = ["ideas", "quality", "settings"].includes(active)
    ? "more"
    : desktopNavActive;
  const activeLabel: any =
    MOBILE_NAV_ITEMS.find(([id]: any) => id === mobileNavActive)?.[1] || (active === "contacts" ? "Contatos" : "Central");
  const canCreateTask = ["dashboard", "team", "board", "list", "calendar"].includes(active);
  return (
    <div className={`app-shell ${expanded ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setExpanded((value: any) => !value)}
          aria-label={expanded ? "Recolher navegação" : "Expandir navegação"}
          title={expanded ? "Recolher navegação" : "Expandir navegação"}
        >
          {expanded ? (
            <PanelLeftClose size={18} />
          ) : (
            <PanelLeftOpen size={18} />
          )}
        </button>
        <div className="brand-block">
          <div className="brand-mark">
            <ClipboardList size={20} />
          </div>
          <div className="brand-copy">
            <strong>Central de Trabalho</strong>
            <span>Operação Betinhos</span>
          </div>
        </div>
        <div
          className="sidebar-day-card"
          aria-label={`Hoje, ${stats.open} pendências e ${stats.overdue} atrasados`}
        >
          <div className="sidebar-day-title">
            <span>Hoje</span>
            <strong>{todayLabel}</strong>
          </div>
          <div className="sidebar-day-stats">
            <span className="sidebar-day-stat">
              <strong>{stats.open}</strong>
              <small>Pendências</small>
            </span>
            <span className="sidebar-day-stat sidebar-day-stat-overdue">
              <strong>{stats.overdue}</strong>
              <small>Atrasados</small>
            </span>
          </div>
        </div>
        <nav className="main-nav">
          {CENTRAL_NAV_ITEMS.filter(([id]: any) => id !== "management" || canViewManagement).map(([id, label, Icon]: any) => (
            <button
              key={id}
              className={
                desktopNavActive === id ? "nav-item active" : "nav-item"
              }
              onClick={() => onNavigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "board" && (
                <span className="nav-count">{openTaskCount}</span>
              )}
              {id === "dashboard" && personalStats?.alertCount > 0 && (
                <span className="nav-count nav-count-alert">
                  {personalStats.alertCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mock-label">
            <span className="pulse-dot" />
            {live ? "Dataverse conectado" : "Modo local · mock"}
          </div>
          <div
            className="sidebar-version"
            aria-label={`Versão do aplicativo ${APP_VERSION}`}
          >
            Versão {APP_VERSION}
          </div>
          <div className="user-card">
            <Avatar name={userName} />
            <div className="user-copy">
              <strong>{userName}</strong>
              <span>
                {currentEmployee ? "Administrativo" : "Sem vínculo Dataverse"}
              </span>
            </div>
            <button
              className="user-settings-button"
              type="button"
              onClick={() => onNavigate("settings")}
              aria-label="Abrir configurações"
              title="Configurações"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <div className="app-topbar" aria-label="Ações do aplicativo">
          <button
            className="notification-trigger"
            type="button"
            onClick={() => setNotificationsOpen(true)}
            aria-label={`Abrir notificações${unreadCount(notifications) ? `, ${unreadCount(notifications)} não lidas` : ""}`}
            title="Notificações"
          >
            <BellRing size={17} />
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
            <RotateCcw size={16} />
          </button>
        </div>
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
