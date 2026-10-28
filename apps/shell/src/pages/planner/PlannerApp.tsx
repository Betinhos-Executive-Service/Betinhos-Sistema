// Porte de Tela Planner/src/App.jsx: a casca do Planner; estado e ações vêm de usePlanner.
import { AttachmentSection, TaskReturnsSection } from './components/Attachments'
import { QuoteCompletionDialog, UnassignedTaskDialog } from './components/Dialogs'
import { FilterBar } from './components/FilterBar'
import LoadingFallback from './components/LoadingFallback'
import { NewTaskDrawer } from './components/NewTaskDrawer'
import { AppShell } from './components/PlannerAppShell'
import { TaskDrawer } from './components/TaskDrawer'
import { DataLoadingView } from './components/TaskSelectors'
import { WaitingReturnModal } from './components/WaitingReturnModal'
import { WaitingStatusModal } from './components/WaitingStatusModal'
import { QUOTE_HYBRID_V3_ENABLED, QUOTE_WORKSPACE_V2_ENABLED } from './constants'
import { taskStats } from './domain/domain'
import { canViewManagement } from './domain/management'
import { isQuoteTask } from './domain/quoteTaskFlow'
import { readQuoteViewPreference } from './domain/quoteViewPreference'
import { filterWorkItems, isAssignedToEmployee, workItemStats } from './domain/workItems'
import { createDefaultFilters } from './pageHelpers'
import { BoardView } from './views/BoardView'
import { CalendarView } from './views/CalendarView'
import CentralView from './views/CentralView'
import ContactsView from './views/ContactsView'
import IdeasView from './views/IdeasView'
import { ListView } from './views/ListView'
import ManagementView from './views/ManagementView'
import { MoreView } from './views/MoreView'
import { QualityView } from './views/QualityView'
import QuotesView from './views/QuotesView'
import { SettingsView } from './views/SettingsView'
import { CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { usePlanner } from './usePlanner'
import { useQuoteAttachments } from './components/quotes/useQuoteAttachments'



// Lazy-loaded wrappers for non-critical views (Quality & Settings)
// These are code-split to reduce the critical bundle size
export const LazyQualityView = lazy(() => Promise.resolve({ default: QualityView }));
export const LazySettingsView = lazy(() => Promise.resolve({ default: SettingsView }));

export function PlannerApp() {
  const {
    active,
    readyView,
    store,
    state,
    setState,
    currentEmployee,
    showManagement,
    quoteToOpenId,
    quoteActionRequest,
    selectQuote,
    consumeQuoteAction,
    openQuoteView,
    selectedContactId,
    setWaitingTaskId,
    setWaitingReturnTaskId,
    creating,
    setCreating,
    creatingStatus,
    creatingInput,
    filters,
    setFilters,
    taskScope,
    checklistVisibility,
    notice,
    noticeAction,
    error,
    setError,
    pendingUnassignedCreate,
    setPendingUnassignedCreate,
    quoteCompletionRequest,
    refreshing,
    dismissNotice,
    refreshInBackground,
    ensureTaskDetails,
    selected,
    openTask,
    openContact,
    closeTask,
    closeContact,
    openCreate,
    setChecklistVisibilityForTask,
    moveTask,
    createPersonalTag,
    updatePersonalTag,
    archivePersonalTag,
    reorderPersonalTags,
    saveTask,
    waitingTask,
    saveWaitingStatus,
    waitingReturnTask,
    openWaitingReturn,
    registerWaitingReturn,
    completeTask,
    collectTask,
    deleteTask,
    saveContact,
    createQuote,
    updateQuote,
    markQuoteSent,
    setQuoteOutcome,
    deleteQuote,
    archiveContact,
    addContactNote,
    addContactAttachment,
    removeContactAttachment,
    taskFromContact,
    setTaskFromContact,
    createTaskFromContact,
    saveTeam,
    deleteTeam,
    importPlannerTasks,
    createNewTask,
    createSubtask,
    createQualityTask,
    reloadData,
    adminCleanup,
    sendNotificationTest,
    addComment,
    addAttachment,
    removeAttachment,
    workItems,
    markNotificationRead,
    markAllNotificationsRead,
    openNotification,
    onTaskScopeChange,
    onCentralModeChange,
    navigate,
    visibleTasks,
    visibleNotifications,
  } = usePlanner()
  const quoteAttachments = useQuoteAttachments(store)

  if (error)
    return (
      <div className="app-error">
        <strong>Não foi possível carregar o Planner.</strong>
        <span>{error}</span>
        <button
          className="button button-secondary"
          onClick={() => {
            setError("");
            store
              .load()
              .then(setState)
              .catch((failure: any) => setError(failure.message));
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  if (state.loading?.core)
    return (
      <AppShell
        active={active}
        onNavigate={navigate}
        onCreate={openCreate}
        tasks={state.tasks}
        live={store.live}
        currentEmployee={null}
        personalStats={taskStats([])}
        openTaskCount={0}
        onRefresh={refreshInBackground}
        refreshing={refreshing}
        canViewManagement={false}
      >
        <DataLoadingView
          loading={state.loading}
          error={state.loadErrors?.core}
          view={active}
        />
      </AppShell>
    );
  const viewState = {
    ...state,
    tasks: visibleTasks.map((task: any) => {
      const quote = task.quoteId ? state.quotes.find((item: any) => item.id === task.quoteId) : null;
      return isQuoteTask(task) && !task.parentTaskId && quote
        ? { ...task, quoteStatus: quote.status }
        : task;
    }),
    workItems,
  };
  const personalItems = currentEmployee
    ? workItems.filter((item) => isAssignedToEmployee(item, currentEmployee))
    : [];
  const personalStats = workItemStats(filterWorkItems(personalItems));
  const openTaskCount = visibleTasks.filter(
    (task: any) =>
      !task.parentTaskId && !["done", "cancelled"].includes(task.status),
  ).length;
  const renderPage = () => {
    if (active === "dashboard" || active === "team")
      return (
        <CentralView
          state={viewState}
          mode={active === "dashboard" ? "mine" : "team"}
          currentEmployee={currentEmployee}
          filters={filters}
          filterBar={
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              onCreate={openCreate}
              employees={state.employees}
              teams={state.teams}
              personalTags={state.personalTags}
              onCreatePersonalTag={createPersonalTag}
              onUpdatePersonalTag={updatePersonalTag}
              onArchivePersonalTag={archivePersonalTag}
              onReorderPersonalTags={reorderPersonalTags}
            />
          }
          onClearFilters={() => setFilters(createDefaultFilters())}
          onChangeMode={onCentralModeChange}
          onOpenTask={openTask}
          onOpenSource={(item: any) => store.openSource?.(item)}
          onCompleteTask={completeTask}
        />
      );
    if (active === "management")
      return <ManagementView state={viewState} currentEmployee={currentEmployee} onOpenTask={openTask} onCollect={collectTask} onRegisterWaitingReturn={openWaitingReturn} />;
    if (active === "ideas") return <IdeasView store={store} />;
    if (active === "contacts")
      return (
        <ContactsView
          contacts={state.contacts}
          employees={state.employees}
          teams={state.teams}
          quotes={state.quotes}
          tasks={visibleTasks}
          currentEmployee={currentEmployee}
          selectedContactId={selectedContactId}
          contactLoading={state.contactLoading}
          contactLoadError={state.contactLoadError}
          onSelect={(id: any) => id ? openContact(id) : closeContact()}
          onSave={saveContact}
          onArchive={archiveContact}
          onAddNote={addContactNote}
          onAttachment={addContactAttachment}
          onDeleteAttachment={removeContactAttachment}
          loadAttachmentContent={store.loadAttachmentContent}
          onCreateTask={createTaskFromContact}
          AttachmentSectionComponent={AttachmentSection}
        />
      );
    if (active === "quotes")
      return state.loading?.quotes ? <LoadingFallback label="Carregando cotações" view="quotes" quoteView={readQuoteViewPreference()} /> : <QuotesView state={viewState} currentEmployee={currentEmployee} ReturnsSectionComponent={TaskReturnsSection} onOpenTask={openTask} onCreateQuote={createQuote} onUpdateQuote={updateQuote} onDeleteQuote={deleteQuote} quoteAttachments={quoteAttachments} onRegisterWaitingReturn={openWaitingReturn} onMarkQuoteSent={markQuoteSent} onSetQuoteOutcome={setQuoteOutcome} onEnsureTaskDetails={ensureTaskDetails} onAttachment={addAttachment} onDeleteAttachment={removeAttachment} loadAttachmentContent={store.loadAttachmentContent} AttachmentSectionComponent={AttachmentSection} selectedQuoteId={quoteToOpenId} onSelectQuote={selectQuote} requestedQuoteAction={quoteActionRequest} onQuoteActionConsumed={consumeQuoteAction} workspaceEnabled={QUOTE_WORKSPACE_V2_ENABLED} hybridEnabled={QUOTE_HYBRID_V3_ENABLED} />;
    if (active === "board")
      return (
        <BoardView
          state={viewState}
          currentEmployee={currentEmployee}
          checklistVisibility={checklistVisibility}
          onOpen={openTask}
          onToggleSubtask={saveTask}
          onMove={moveTask}
          onComplete={completeTask}
          onRegisterWaitingReturn={openWaitingReturn}
          onCreate={openCreate}
          filters={filters}
          setFilters={setFilters}
          onNavigate={navigate}
          taskScope={taskScope}
          onScopeChange={onTaskScopeChange}
          personalTags={state.personalTags}
          tasks={visibleTasks}
          onCreatePersonalTag={createPersonalTag}
          onUpdatePersonalTag={updatePersonalTag}
          onArchivePersonalTag={archivePersonalTag}
          onReorderPersonalTags={reorderPersonalTags}
        />
      );
    if (active === "list")
      return (
        <ListView
          state={viewState}
          currentEmployee={currentEmployee}
          onOpen={openTask}
          onCreate={openCreate}
          filters={filters}
          setFilters={setFilters}
          onNavigate={navigate}
          taskScope={taskScope}
          onScopeChange={onTaskScopeChange}
          personalTags={state.personalTags}
          tasks={visibleTasks}
          onCreatePersonalTag={createPersonalTag}
          onUpdatePersonalTag={updatePersonalTag}
          onArchivePersonalTag={archivePersonalTag}
          onReorderPersonalTags={reorderPersonalTags}
        />
      );
    if (active === "calendar")
      return (
        <CalendarView
          state={viewState}
          currentEmployee={currentEmployee}
          onOpen={openTask}
          onCreate={openCreate}
          filters={filters}
          setFilters={setFilters}
          onNavigate={navigate}
          taskScope={taskScope}
          onScopeChange={onTaskScopeChange}
          personalTags={state.personalTags}
          onCreatePersonalTag={createPersonalTag}
          onUpdatePersonalTag={updatePersonalTag}
          onArchivePersonalTag={archivePersonalTag}
          onReorderPersonalTags={reorderPersonalTags}
        />
      );
    if (active === "more") return <MoreView onNavigate={navigate} canViewManagement={showManagement} />;
    if (active === "quality")
      return state.loading?.quality ? (
        <LoadingFallback view="quality" />
      ) : (
        <Suspense fallback={<LoadingFallback view="quality" />}>
          <LazyQualityView
            state={viewState}
            currentEmployee={currentEmployee}
            onCreate={createQualityTask}
            onCreateTask={openCreate}
            filters={filters}
            setFilters={setFilters}
          />
        </Suspense>
      );
    return (
      <Suspense fallback={<LoadingFallback view="settings" />}>
          <LazySettingsView onReset={reloadData} onAdminCleanup={adminCleanup} onSendNotificationTest={sendNotificationTest} live={store.live} teams={state.teams} tasks={state.tasks} contacts={state.contacts} notifications={state.notifications} employees={state.employees} personalTags={state.personalTags} onCreatePersonalTag={createPersonalTag} onUpdatePersonalTag={updatePersonalTag} onArchivePersonalTag={archivePersonalTag} onReorderPersonalTags={reorderPersonalTags} onSaveTeam={saveTeam} onDeleteTeam={deleteTeam} onImportPlannerTasks={importPlannerTasks} />
      </Suspense>
    );
  };
  return (
    <AppShell
      active={active}
      onNavigate={navigate}
      onCreate={openCreate}
      tasks={state.tasks}
      contacts={state.contacts}
      live={store.live}
      currentEmployee={currentEmployee}
      teams={state.teams}
      personalStats={personalStats}
      openTaskCount={openTaskCount}
      notifications={visibleNotifications}
      notificationError={state.loadErrors?.notifications || ""}
      onOpenNotification={openNotification}
      onOpenContact={openNotification}
      onMarkNotificationRead={markNotificationRead}
      onMarkAllNotificationsRead={markAllNotificationsRead}
      onRefresh={refreshInBackground}
      refreshing={refreshing}
      canViewManagement={showManagement}
    >
      {readyView === active ? renderPage() : <LoadingFallback view={active} quoteView={readQuoteViewPreference()} />}
      {(state.loading?.quotes || state.loading?.quality) && (
        <div className="data-sync-chip" role="status" aria-live="polite">
          Preparando dados complementares…
        </div>
      )}
      {notice && (
        <div
          className={`toast ${notice.startsWith("Falha") || notice.startsWith("Não foi") ? "toast-error" : ""} ${refreshing ? "toast-refreshing" : ""}`}
          role="status"
          aria-live="polite"
        >
          {refreshing ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}
          <span>{notice}</span>
          {noticeAction && (
            <button
              className="toast-action"
              type="button"
              onClick={() => {
                const action = noticeAction;
                dismissNotice();
                action.onClick();
              }}
            >
              {noticeAction.label}
            </button>
          )}
          <button
            className="toast-close"
            type="button"
            onClick={dismissNotice}
            aria-label="Fechar notificação"
            title="Fechar notificação"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {pendingUnassignedCreate && (
        <UnassignedTaskDialog
          isCreation
          missingResponsible={pendingUnassignedCreate.missingResponsible}
          missingDueDate={pendingUnassignedCreate.missingDueDate}
          onCancel={() => setPendingUnassignedCreate(null)}
          onConfirm={() => {
            const pending = pendingUnassignedCreate;
            setPendingUnassignedCreate(null);
            if (pending.kind === "quality")
              createQualityTask(pending.item, true);
            else createSubtask(pending.parentId, pending.title, true);
          }}
        />
      )}
      {quoteCompletionRequest && (
        <QuoteCompletionDialog
          quote={quoteCompletionRequest.quote}
          onCancel={quoteCompletionRequest.onCancel}
          onConfirm={quoteCompletionRequest.onConfirm}
        />
      )}
      {waitingTask && (
        <WaitingStatusModal
          task={waitingTask}
          employees={state.employees}
          teams={state.teams}
          onClose={() => setWaitingTaskId("")}
          onSave={saveWaitingStatus}
        />
      )}
      {waitingReturnTask && (
        <WaitingReturnModal
          task={waitingReturnTask}
          onClose={() => setWaitingReturnTaskId("")}
          onSave={registerWaitingReturn}
        />
      )}
      {selected && (
        <TaskDrawer
          task={selected}
          state={state}
          teams={state.teams}
          personalTags={state.personalTags}
          onCreatePersonalTag={createPersonalTag}
          currentEmployee={currentEmployee}
          showChecklistOnCard={Boolean(checklistVisibility[selected.id])}
          onToggleChecklistOnCard={(visible: any) =>
            setChecklistVisibilityForTask(selected.id, visible)
          }
          onClose={closeTask}
          onRegisterWaitingReturn={openWaitingReturn}
          onSave={saveTask}
          onDelete={deleteTask}
          onComment={addComment}
          onAttachment={addAttachment}
          onDeleteAttachment={removeAttachment}
          onOpenQuote={(id: any, action = "") => { openQuoteView(id, action); closeTask(); }}
          onAddSubtask={createSubtask}
        />
      )}
      {taskFromContact && (
        <NewTaskDrawer
          employees={state.employees}
          teams={state.teams}
          personalTags={state.personalTags}
          onCreatePersonalTag={createPersonalTag}
          initialInput={taskFromContact}
          onClose={() => setTaskFromContact(null)}
          onSave={createNewTask}
        />
      )}
      {creating && (
        <NewTaskDrawer
          employees={state.employees}
          teams={state.teams}
          personalTags={state.personalTags}
          onCreatePersonalTag={createPersonalTag}
          initialStatus={creatingStatus}
          initialInput={creatingInput}
          onClose={() => setCreating(false)}
          onSave={createNewTask}
        />
      )}
    </AppShell>
  );
}
