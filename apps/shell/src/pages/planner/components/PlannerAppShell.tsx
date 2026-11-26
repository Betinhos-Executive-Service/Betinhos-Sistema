// Porte de Tela Planner/src/App.jsx; navegação pelo ModuleNav do DS (faixa no desktop, barra flutuante no celular).
import { CENTRAL_NAV_ITEMS, TODAY_LABEL_FORMATTER } from '../constants'
import { isTaskVisibleToEmployee, taskStats } from '../domain/domain'
import { canViewManagement } from '../domain/management'
import { unreadCount } from '../domain/notifications'
import { useMentionController } from './MentionableField'
import { NotificationsPanel, notificationsVisibleToEmployee } from './NotificationsPanel'
import { BellRing, Plus, RotateCcw } from 'lucide-react'
import { Button, ModuleNav, useShellHeader } from '@betinhos/ui'
import { useMemo, useState } from 'react'

/** Rótulos da barra do celular para nomes que não cabem (~10 caracteres). */
const SHORT_LABELS: Record<string, string> = { ideas: "Ideias", settings: "Ajustes" };
/** Título do cabeçalho do celular nas telas que não têm aba própria. */
const VIEW_TITLES: Record<string, string> = { contacts: "Contatos", quality: "Qualidade" };


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
  const unread = unreadCount(notifications);
  const navActive =
    active === "team"
      ? "dashboard"
      : ["board", "list", "calendar"].includes(active)
        ? "board"
        : active;
  const navItems = useMemo(
    () =>
      CENTRAL_NAV_ITEMS.filter(([id]: any) => id !== "management" || canViewManagement)
        .sort(([a]: any, [b]: any) => Number(a === "settings") - Number(b === "settings"))
        .map(([id, label, Icon]: any) => ({
          value: id,
          label,
          shortLabel: SHORT_LABELS[id],
          icon: <Icon size={16} />,
          count: id === "board" ? openTaskCount : undefined,
        })),
    [canViewManagement, openTaskCount],
  );
  const canCreateTask = ["dashboard", "team", "board", "list", "calendar"].includes(active);
  const openNotifications = () => setNotificationsOpen(true);
  const refresh = () => onRefresh?.({ silent: false });
  const notificationLabel = `Abrir notificações${unread ? `, ${unread} não lidas` : ""}`;
  const refreshLabel = refreshing ? "Atualizando dados" : "Atualizar dados";
  // No celular as ações sobem para o cabeçalho do AppShell (fora de .planner-page): botões do DS.
  // Memo porque useShellHeader registra de novo a cada referência nova.
  const mobileActions = useMemo(
    () => (
      <>
        <Button variant="secondary" icon={<BellRing size={18} />} aria-label={notificationLabel} title="Notificações" onClick={openNotifications}>
          {unread > 0 ? (unread > 99 ? "99+" : unread) : null}
        </Button>
        <Button variant="secondary" icon={<RotateCcw size={18} />} aria-label={refreshLabel} title={refreshLabel} loading={refreshing} onClick={refresh} />
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unread, refreshing, onRefresh],
  );
  // O cabeçalho do celular é registrado aqui (shellHeader={false}) para ter título também em Contatos e Qualidade.
  const mobileTitle = navItems.find((item: any) => item.value === navActive)?.label ?? VIEW_TITLES[active];
  useShellHeader({ title: mobileTitle, actions: mobileActions });
  return (
    <div className="app-shell">
      <main className="main-area">
        <ModuleNav
          aria-label="Seções da Central de Trabalho"
          items={navItems}
          value={navActive}
          onNavigate={onNavigate}
          shellHeader={false}
          actions={
            <>
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
              <button className="notification-trigger" type="button" onClick={openNotifications} aria-label={notificationLabel} title="Notificações">
                <BellRing size={16} />
                {unread > 0 && <b>{unread}</b>}
              </button>
              <button
                className={`refresh-trigger${refreshing ? " is-refreshing" : ""}`}
                type="button"
                onClick={refresh}
                disabled={refreshing}
                aria-label={refreshLabel}
                title={refreshLabel}
              >
                <RotateCcw size={15} />
              </button>
            </>
          }
        />
        {children}
      </main>
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
