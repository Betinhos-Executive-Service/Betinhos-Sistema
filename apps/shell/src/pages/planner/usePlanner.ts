// Estado e ações do Planner (antes no corpo do App.jsx do Tela Planner), sem mudança de comportamento.
import { shellPlannerWindow } from './shellNavigation'
import { notificationsVisibleToEmployee } from './components/NotificationsPanel'
import { fileToDataUrl, mergeAttachmentDetailsIntoState, toAttachmentFiles } from './components/attachmentFiles'
import { CHECKLIST_VISIBILITY_STORAGE_KEY, plannerQuoteSearchRef } from './constants'
import { createDataStore } from './data/dataverse'
import { setErrorLogContext } from './data/errorLogger'
import { playCompletionSound, prepareCompletionSound } from './domain/completionSound'
import { buildLinkedTaskInput, createContactEvent, createContactPayload, normalizeContact } from './domain/contactDomain'
import { DEFAULT_PERSONAL_TAG_COLOR, STATUSES, addOptimisticAttachment, addOptimisticComment, addOptimisticReturn, applyOptimisticTaskPatch, buildOptimisticTask, buildTaskCreationInput, canRegisterWaitingReturn, findCreatedMainTask, hasTaskResponsible, isTaskVisibleToEmployee, mentionedEmployees, normalizeText, normalizeWaitingContext, resolveTaskAssignment, validateWaitingContext } from './domain/domain'
import { canViewManagement, localDateKey } from './domain/management'
import { plannerNavigationWindow, plannerUrlForState, readPlannerUrlState } from './domain/plannerUrl'
import { resolveQuoteAcceptance } from './domain/quoteScenarios'
import { isQuoteTask, taskStatusForQuoteStatus } from './domain/quoteTaskFlow'
import { buildBackgroundRefreshPatch } from './domain/refreshState'
import { installPlannerBridge } from './domain/whatsappBridge'
import { normalizeWorkItems } from './domain/workItems'
import { createDefaultFilters, launchQuoteId, readChecklistVisibility, resolveCurrentEmployee } from './pageHelpers'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export function usePlanner() {
  const navigationWindowRef = useRef<any>(shellPlannerWindow());
  const initialUrlStateRef = useRef<any>(readPlannerUrlState(navigationWindowRef.current.location.search));
  const [active, setActive] = useState<any>(initialUrlStateRef.current.view);
  const [readyView, setReadyView] = useState<any>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setReadyView(active), 180);
    return () => window.clearTimeout(timer);
  }, [active]);
  const [store] = useState<any>(() => createDataStore());
  const [state, setState] = useState<any>(() => ({
    tasks: [],
    contacts: [],
    contactLoading: true,
    contactLoadError: "",
    quotes: [],
    employees: [],
    teams: [],
    currentUserEmail: "",
    currentUserId: "",
    personalTags: [],
    quality: [],
    notifications: [],
    collectionEvents: [],
    live: store.live,
    loading: { core: true, quotes: true, quality: true, photos: true },
    loadErrors: {},
  }));
  const currentEmployee = resolveCurrentEmployee(
    state.employees,
    store.live,
    state.currentUserEmail,
  );
  const showManagement = canViewManagement(state.currentUserEmail);
  useEffect(() => { setErrorLogContext({ screen: active || "", userEmail: state.currentUserEmail || "" }); }, [active, state.currentUserEmail]);
  const [selectedId, setSelectedId] = useState<any>(initialUrlStateRef.current.taskId);
  const [quoteToOpenId, setQuoteToOpenId] = useState<any>(initialUrlStateRef.current.quoteId);
  // Ação a executar ao abrir a cotação (ex.: "outcome" vindo do board de tarefas).
  const [quoteActionRequest, setQuoteActionRequest] = useState<any>("");
  // Abre a aba Cotações numa cotação, opcionalmente já numa ação (ex.: "outcome").
  const selectQuote = useCallback((id: any, action = "") => { setQuoteToOpenId(id); setQuoteActionRequest(action); }, []);
  const consumeQuoteAction = useCallback(() => setQuoteActionRequest(""), []);
  const openQuoteView = useCallback((id: any, action = "") => { selectQuote(id, action); setActive("quotes"); setSelectedId(""); }, [selectQuote]);
  const [selectedContactId, setSelectedContactId] = useState<any>(initialUrlStateRef.current.contactId);
  const [waitingTaskId, setWaitingTaskId] = useState<any>("");
  const [waitingQuoteId, setWaitingQuoteId] = useState<any>("");
  const [waitingReturnTaskId, setWaitingReturnTaskId] = useState<any>("");
  const [creating, setCreating] = useState<any>(false);
  const [creatingStatus, setCreatingStatus] = useState<any>("todo");
  const [creatingInput, setCreatingInput] = useState<any>({});
  const [filters, setFilters] = useState<any>(createDefaultFilters);
  const [taskScope, setTaskScope] = useState<any>("mine");
  const [checklistVisibility, setChecklistVisibility] = useState<any>(
    readChecklistVisibility,
  );
  const [notice, setNotice] = useState<any>("");
  const [noticeAction, setNoticeAction] = useState<any>(null);
  const [error, setError] = useState<any>("");
  const [failedTaskDraft, setFailedTaskDraft] = useState<any>(null);
  const [pendingTaskDraft, setPendingTaskDraft] = useState<any>(null);
  const [pendingUnassignedCreate, setPendingUnassignedCreate] = useState<any>(null);
  const [quoteCompletionRequest, setQuoteCompletionRequest] = useState<any>(null);
  const [refreshing, setRefreshing] = useState<any>(false);
  const confirmedStateRef = useRef<any>(null);
  const pendingMutationsRef = useRef<any>(new Map());
  const refreshInFlightRef = useRef<any>(false);
  const noticeTimerRef = useRef<any>(null);
  const launchHandledRef = useRef<any>(false);
  const urlStateRef = useRef<any>(initialUrlStateRef.current);
  const handlingHistoryRef = useRef<any>(false);
  const failedTaskReopenTimerRef = useRef<any>(null);
  useEffect(() => {
    const navigationWindow = navigationWindowRef.current;
    const handlePopState = () => {
      const next = readPlannerUrlState(navigationWindow.location.search);
      handlingHistoryRef.current = true;
      urlStateRef.current = next;
      setActive(next.view);
      setSelectedId(next.taskId);
      setSelectedContactId(next.contactId);
      setQuoteToOpenId(next.quoteId);
    };
    navigationWindow.addEventListener("popstate", handlePopState);
    return () => navigationWindow.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    const next = { view: active, taskId: selectedId, contactId: selectedContactId, quoteId: quoteToOpenId };
    if (
      next.view === urlStateRef.current.view &&
      next.taskId === urlStateRef.current.taskId &&
      next.contactId === urlStateRef.current.contactId &&
      next.quoteId === urlStateRef.current.quoteId
    ) {
      handlingHistoryRef.current = false;
      return;
    }
    urlStateRef.current = next;
    if (handlingHistoryRef.current) {
      handlingHistoryRef.current = false;
      return;
    }
    const navigationWindow = navigationWindowRef.current;
    navigationWindow.history.pushState(navigationWindow.history.state, "", plannerUrlForState(navigationWindow.location, next));
  }, [active, selectedId, selectedContactId, quoteToOpenId]);
  const dismissNotice = useCallback(() => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice("");
    setNoticeAction(null);
  }, []);
  const showNotice = useCallback((message: any, duration = 2600, action: any = null) => {
    setNotice(message);
    setNoticeAction(action);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice("");
      setNoticeAction(null);
    }, duration);
  }, []);
  (globalThis as any).__plannerEmployees = state.employees;
  const defaultEmployee = resolveCurrentEmployee(
    state.employees,
    store.live,
    state.currentUserEmail,
  );
  useEffect(() => {
    if (taskScope !== "mine" || !defaultEmployee?.name) return;
    setFilters((current: any) =>
      current.assignee?.length
        ? current
        : { ...current, assignee: [defaultEmployee.name] },
    );
  }, [taskScope, defaultEmployee?.name]);
  useEffect(() => {
    if (!defaultEmployee?.name) return;
    const isMine =
      filters.assignee?.length === 1 &&
      filters.assignee[0] === defaultEmployee.name;
    setTaskScope((current: any) =>
      current === (isMine ? "mine" : "all") ? current : isMine ? "mine" : "all",
    );
  }, [filters.assignee, defaultEmployee?.name]);
  useEffect(
    () => () => {
      if (failedTaskReopenTimerRef.current)
        window.clearTimeout(failedTaskReopenTimerRef.current);
    },
    [],
  );
  const applyPendingMutations = useCallback(
    (confirmed: any) =>
      [...pendingMutationsRef.current.values()].reduce(
        (current, mutation) => mutation.update(current),
        confirmed,
      ),
    [],
  );
  const mergeConfirmed = useCallback(
    (patch: any) => {
      const current = confirmedStateRef.current || {};
      const next = {
        ...current,
        ...patch,
        loading: { ...(current.loading || {}), ...(patch.loading || {}) },
      };
      confirmedStateRef.current = next;
      setState(applyPendingMutations(next));
    },
    [applyPendingMutations],
  );
  const refreshInBackground = useCallback(async ({ silent = true }: any = {}) => {
    if (refreshInFlightRef.current || state.loading?.core) return;
    refreshInFlightRef.current = true;
    setRefreshing(true);
    if (!silent) showNotice("Atualizando dados…", 5200);
    try {
      const core = await store.loadCore();
      const [supplemental, photos, contacts] = await Promise.allSettled([
        store.loadSupplemental(core),
        store.loadPhotos(core),
        store.loadContacts ? store.loadContacts(core) : Promise.resolve(core.contacts || []),
      ]);
      const current = confirmedStateRef.current || {};
      const patch = buildBackgroundRefreshPatch(
        current,
        core,
        { supplemental, photos, contacts },
      );
      patch.loadErrors = {
        ...(current.loadErrors || {}),
        ...(supplemental.status === "rejected"
          ? { supplemental: supplemental.reason?.message || "Dados complementares indisponíveis." }
          : { supplemental: undefined }),
        ...(photos.status === "rejected"
          ? { photos: photos.reason?.message || "Fotos indisponíveis." }
          : { photos: undefined }),
        ...(contacts.status === "rejected"
          ? { contactLoadError: contacts.reason?.message || "Contatos indisponíveis." }
          : { contactLoadError: undefined }),
      };
      mergeConfirmed(patch);
      if (!silent) showNotice("Dados atualizados agora.", 2200);
    } catch {
      if (!silent) showNotice("Não foi possível atualizar. Dados atuais mantidos.", 4200);
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }, [mergeConfirmed, showNotice, state.loading?.core, store]);

  useEffect(() => {
    if (state.loading?.core) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") refreshInBackground({ silent: true });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refreshInBackground, state.loading?.core]);
  const searchQuotes = useCallback(
    (query: any) =>
      store.searchQuotes
        ? store
            .searchQuotes(query)
            .then((found: any) =>
              setState((current: any) => ({
                ...current,
                quotes: [
                  ...new Map(
                    [...current.quotes, ...found].map((quote) => [
                      quote.id,
                      quote,
                    ]),
                  ).values(),
                ],
              })),
            )
            .catch(() => undefined)
        : Promise.resolve([]),
    [store],
  );
  plannerQuoteSearchRef.current = searchQuotes;
  useEffect(() => {
    let activeRequest = true;
    store
      .loadCore()
      .then((core: any) => {
        if (!activeRequest) return;
        mergeConfirmed(core);
        store
          .loadSupplemental(core)
          .then((supplemental: any) => {
            if (activeRequest) mergeConfirmed(supplemental);
          })
          .catch((failure: any) => {
            if (activeRequest)
              setState((current: any) => ({
                ...current,
                loadErrors: {
                  ...current.loadErrors,
                  supplemental:
                    failure.message || "Dados complementares indisponíveis.",
                },
                loading: { ...current.loading, quotes: false, quality: false },
              }));
          });
        store
          .loadPhotos(core)
          .then((photos: any) => {
            if (activeRequest) mergeConfirmed(photos);
          })
          .catch((failure: any) => {
            if (activeRequest)
              setState((current: any) => ({
                ...current,
                loadErrors: {
                  ...current.loadErrors,
                  photos: failure.message || "Fotos indisponíveis.",
                },
                loading: { ...current.loading, photos: false },
              }));
          });
        (store.loadContacts ? store.loadContacts(core) : Promise.resolve(core.contacts || []))
          .then((contacts: any) => { if (activeRequest) mergeConfirmed({ contacts, contactLoading: false, contactLoadError: "" }); })
          .catch((failure: any) => {
            if (activeRequest) mergeConfirmed({ contactLoading: false, contactLoadError: failure.message || "Contatos indisponíveis." });
          });
      })
      .catch((failure: any) => {
        if (activeRequest)
          setError(failure.message || "Não foi possível carregar as tarefas.");
      });
    return () => {
      activeRequest = false;
    };
  }, [store, mergeConfirmed]);
  const ensureTaskDetails = useCallback((taskId: any) => {
    const task = state.tasks.find((item: any) => item.id === taskId);
    if (!taskId || !task || !isTaskVisibleToEmployee(task, currentEmployee, state.teams) || task.detailsLoaded || task.detailsLoading || !store.loadTaskDetails) return Promise.resolve(false);
    setState((current: any) => ({
      ...current,
      tasks: current.tasks.map((item: any) => item.id === taskId ? { ...item, detailsLoading: true, detailsError: "" } : item),
    }));
    return store.loadTaskDetails(taskId)
      .then((details: any) => setState((current: any) => ({
        ...current,
        tasks: current.tasks.map((item: any) => item.id === taskId ? { ...item, ...details, detailsLoaded: true, detailsLoading: false, detailsError: "" } : item),
      })))
      .catch((failure: any) => setState((current: any) => ({
        ...current,
        tasks: current.tasks.map((item: any) => item.id === taskId ? { ...item, detailsLoading: false, detailsError: failure.message || "Não foi possível carregar o histórico." } : item),
      })));
  }, [currentEmployee, state.tasks, state.teams, store]);
  useEffect(() => {
    const task = state.tasks.find((item: any) => item.id === selectedId);
    if (!selectedId || !task || !isTaskVisibleToEmployee(task, currentEmployee, state.teams) || task.detailsLoaded || task.detailsLoading || !store.loadTaskDetails) return;
    setState((current: any) => ({
      ...current,
      tasks: current.tasks.map((item: any) => item.id === selectedId ? { ...item, detailsLoading: true } : item),
    }));
    store.loadTaskDetails(selectedId)
      .then((details: any) => setState((current: any) => ({
        ...current,
        tasks: current.tasks.map((item: any) => item.id === selectedId ? { ...item, ...details, detailsLoaded: true, detailsLoading: false } : item),
      })))
      .catch((failure: any) => setState((current: any) => ({
        ...current,
        tasks: current.tasks.map((item: any) => item.id === selectedId ? { ...item, detailsLoading: false, detailsError: failure.message || "Não foi possível carregar o histórico." } : item),
      })));
  }, [currentEmployee, selectedId, state.tasks, state.teams, store]);
  const runMutation = useCallback(
    (operation: any, message: any) =>
      operation
        .then((next: any) => {
          confirmedStateRef.current = next;
          setState(applyPendingMutations(next));
          showNotice(message);
        })
        .catch((failure: any) =>
          showNotice(
            failure.message || "Não foi possível concluir a operação.",
            5200,
          ),
        ),
    [applyPendingMutations, showNotice],
  );
  useEffect(() => {
    if (!state || launchHandledRef.current) return;
    launchHandledRef.current = true;
    const search = navigationWindowRef.current.location.search;
    const { taskId } = readPlannerUrlState(search);
    const params = new URLSearchParams(search);
    const data = new URLSearchParams((params.get("data") || "").replace(/^\?/, ""));
    const mode = params.get("mode") || data.get("mode") || "";
    const quoteSourceId = launchQuoteId(search);
    if (taskId) setSelectedId(taskId);
    if (quoteSourceId) {
      const openExistingOrCreate = (quote: any) =>
        Promise.resolve(store.ensureQuoteTask(state, quote))
          .then((next) => {
            confirmedStateRef.current = next;
            setState(applyPendingMutations(next));
            const task = next.tasks.find(
              (item: any) => item.quoteId === quote.id && !item.parentTaskId,
            );
            if (task) setSelectedId(task.id);
          })
          .catch((failure) =>
            showNotice(
              failure.message ||
                "Não foi possível abrir o acompanhamento da cotação.",
              5200,
            ),
          );
      const knownQuote = state.quotes.find((item: any) => item.id === quoteSourceId);
      if (knownQuote) {
        openExistingOrCreate(knownQuote);
      } else if (store.searchQuotes) {
        store
          .searchQuotes(quoteSourceId)
          .then((found: any) => {
            const quote = found.find((item: any) => item.id === quoteSourceId) || found[0];
            if (quote) return openExistingOrCreate(quote);
            showNotice("Cotação de origem não encontrada.", 5200);
          })
          .catch(() => showNotice("Cotação de origem não encontrada.", 5200));
      } else {
        showNotice("Cotação de origem não encontrada.", 5200);
      }
    } else if (mode === "create") {
      setCreating(true);
    }
  }, [state]);
  const runOptimisticMutation = useCallback(
    (update: any, operation: any, pendingMessage: any, successMessage: any) => {
      const mutationId =
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      pendingMutationsRef.current.set(mutationId, { update });
      setState((current: any) => update(current));
      if (pendingMessage) showNotice(pendingMessage);
      return Promise.resolve()
        .then(operation)
        .then((next) => {
          confirmedStateRef.current = next;
          pendingMutationsRef.current.delete(mutationId);
          setState(applyPendingMutations(next));
          if (successMessage) showNotice(successMessage);
          return true;
        })
        .catch((failure) => {
          pendingMutationsRef.current.delete(mutationId);
          if (confirmedStateRef.current)
            setState(applyPendingMutations(confirmedStateRef.current));
          showNotice(
            `Falha ao sincronizar: ${failure.message || "operação não concluída."}`,
            5200,
          );
          return false;
        });
    },
    [applyPendingMutations, showNotice],
  );
  const runOptimisticCreate = useCallback(
    (input: any, operation: any, message: any, parentTaskId: any = null) => {
      const optimisticTask = buildOptimisticTask(input, parentTaskId);
      return runOptimisticMutation(
        (current: any) => ({
          ...current,
          tasks: [optimisticTask, ...current.tasks],
        }),
        operation,
        store.live
          ? "Tarefa adicionada. Enviando ao Dataverse..."
          : "Tarefa adicionada no mock local.",
        message,
      );
    },
    [runOptimisticMutation, store],
  );
  const selected = useMemo(() => {
    const taskItem = state?.tasks.find((item: any) => item.id === selectedId);
    if (!taskItem || !isTaskVisibleToEmployee(taskItem, currentEmployee, state?.teams)) return undefined;
    const failedPatch = failedTaskDraft?.id === taskItem.id ? failedTaskDraft.patch : null;
    const pendingPatch = pendingTaskDraft?.id === taskItem.id ? pendingTaskDraft.patch : null;
    return failedPatch || pendingPatch
      ? { ...taskItem, ...pendingPatch, ...failedPatch, syncStatus: undefined }
      : taskItem;
  }, [currentEmployee, state, selectedId, failedTaskDraft, pendingTaskDraft]);
  const markTaskNotificationsRead = useCallback((taskId: any) => {
    if (!taskId || !store.markNotificationRead) return;
    const unread = (state.notifications || []).filter((item: any) => item.taskId === taskId && !item.readAt);
    if (!unread.length) return;
    const optimisticReadAt = new Date().toISOString();
    const unreadIds = new Set(unread.map((item: any) => item.id));
    setState((current: any) => ({
      ...current,
      notifications: (current.notifications || []).map((item: any) => unreadIds.has(item.id) ? { ...item, readAt: item.readAt || optimisticReadAt } : item),
    }));
    Promise.all(unread.map((item: any) => store.markNotificationRead(state, item.id)))
      .then(() => undefined)
      .catch((failure) => {
        setState((current: any) => ({
          ...current,
          notifications: (current.notifications || []).map((item: any) => unreadIds.has(item.id) && item.readAt === optimisticReadAt ? { ...item, readAt: "" } : item),
        }));
        showNotice(`Falha ao atualizar notificações: ${failure.message}`);
      });
  }, [state, store, showNotice]);
  const openTask = useCallback((id: any) => {
    const task = state.tasks.find((item: any) => item.id === id);
    if (task && !isTaskVisibleToEmployee(task, currentEmployee, state.teams)) {
      showNotice("Esta tarefa não está disponível para este usuário.", 3600);
      return;
    }
    markTaskNotificationsRead(id);
    setSelectedContactId("");
    setQuoteToOpenId("");
    setSelectedId(id);
  }, [currentEmployee, markTaskNotificationsRead, showNotice, state.tasks, state.teams]);
  const openContact = useCallback((id: any) => {
    setSelectedId("");
    setQuoteToOpenId("");
    setActive("contacts");
    setSelectedContactId(id);
  }, []);
  const closeTask = useCallback(() => {
    setSelectedId("");
    setPendingTaskDraft(null);
  }, []);
  const requestQuoteCompletion = useCallback((task: any) => new Promise((resolve) => {
    const quote = (state.quotes || []).find((item: any) => item.id === task.quoteId);
    if (!quote) { showNotice("Cotação vinculada não encontrada."); resolve(false); return; }
    setQuoteCompletionRequest({
      quote,
      onConfirm: () => { openQuoteView(quote.id, "outcome"); setQuoteCompletionRequest(null); resolve(false); },
      onCancel: () => { setQuoteCompletionRequest(null); resolve(false); },
    });
  }), [state.quotes, showNotice, openQuoteView]);
  const closeContact = useCallback(() => setSelectedContactId(""), []);
  const openCreate = useCallback((status = "todo", initialInput: any = {}) => {
    const nextStatus = STATUSES.some((item) => item.id === status)
      ? status
      : "todo";
    setCreatingStatus(nextStatus);
    setCreatingInput(initialInput);
    setCreating(true);
  }, []);
  const setChecklistVisibilityForTask = useCallback((id: any, visible: any) => {
    setChecklistVisibility((current: any) => {
      const next = { ...current, [id]: visible };
      try {
        localStorage.setItem(
          CHECKLIST_VISIBILITY_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        /* preferência visual permanece nesta sessão */
      }
      return next;
    });
  }, []);
  const moveTask = useCallback(
    (id: any, value: any, groupBy = "status") => {
      const task = state.tasks.find((item: any) => item.id === id);
      if (!task) return Promise.resolve(false);
      let patch: any = { status: value };
      let successMessage = "Status atualizado.";
      if (groupBy === "team") {
        const team = (state.teams || []).find((item: any) => normalizeText(item.name) === normalizeText(value));
        if (!team) return Promise.resolve(false);
        patch = resolveTaskAssignment({ assignmentMode: "team", teamIds: [team.id] }, state.teams || [], state.employees || []);
        successMessage = "Equipe atualizada.";
      } else if (groupBy === "assignee") {
        const employee = (state.employees || []).find((item: any) => normalizeText(item.name) === normalizeText(value));
        patch = resolveTaskAssignment({ assignmentMode: "people", assigneeIds: employee ? [employee.id] : [] }, state.teams || [], state.employees || []);
        successMessage = "Responsável atualizado.";
      } else if (groupBy === "priority") {
        patch = ({ priority: value } as any);
        successMessage = "Prioridade atualizada.";
      } else if (groupBy === "personalTag") {
        patch = ({ personalTagIds: value === "__none__" ? [] : [value] } as any);
        successMessage = "Tag atualizada.";
      }
      const persist = async () => {
        const { personalTagIds, ...taskPatch } = patch;
        const nextState = Object.keys(taskPatch).length
          ? await store.updateTask(confirmedStateRef.current || state, id, taskPatch)
          : confirmedStateRef.current || state;
        return personalTagIds !== undefined && store.replaceTaskPersonalTags
          ? store.replaceTaskPersonalTags(nextState, id, personalTagIds, state.currentUserId || currentEmployee?.userId || "")
          : nextState;
      };
      const isCompleting = groupBy === "status" && value === "done" && task.status !== "done";
      if (groupBy === "status" && value === "waiting" && task.status !== "waiting") {
        const waitingValidation = validateWaitingContext("waiting", task.waitingContext);
        if (!waitingValidation.allowed) {
          setWaitingTaskId(id);
          return Promise.resolve(false);
        }
      }
      const quoteCompletion = isCompleting && isQuoteTask(task) && !task.parentTaskId;
      const complete = (completion: any) => {
        if (completion) patch = { ...patch, ...completion };
        if (isCompleting) prepareCompletionSound();
        return runOptimisticMutation(
          (current: any) => quoteCompletion ? current : applyOptimisticTaskPatch(current, id, patch),
          persist,
          store.live
            ? `${successMessage} Sincronizando...`
            : `${successMessage} No mock local.`,
          store.live ? `${successMessage} Sincronizada.` : successMessage,
        ).then((success) => {
          if (success && isCompleting) playCompletionSound();
          return success;
        });
      };
      return quoteCompletion ? (requestQuoteCompletion as any)(task, complete) : (complete as any)();
    },
    [currentEmployee?.userId, state, store, runOptimisticMutation, showNotice, requestQuoteCompletion],
  );
  const createPersonalTag = useCallback(
    (input: any = {}) => {
      if (!store.createPersonalTag) return Promise.resolve(false);
      const ownerUserId = state.currentUserId || currentEmployee?.userId || "";
      const optimisticId = `optimistic-personal-tag-${Date.now()}`;
      const optimisticTag = { id: optimisticId, name: String(input.name || "").trim().slice(0, 32), color: input.color || DEFAULT_PERSONAL_TAG_COLOR, sortOrder: (state.personalTags || []).length, archived: false, ownerUserId };
      return runOptimisticMutation(
        (current: any) => ({ ...current, personalTags: [...(current.personalTags || []), optimisticTag] }),
        () => store.createPersonalTag(state, { ...input, ownerUserId }),
        store.live ? "Tag criada. Sincronizando..." : "Tag criada no mock local.",
        store.live ? "Tag sincronizada." : "Tag criada.",
      );
    },
    [currentEmployee?.userId, runOptimisticMutation, state, store],
  );
  const updatePersonalTag = useCallback(
    (id: any, patch: any) => {
      if (!store.updatePersonalTag) return Promise.resolve(false);
      return runOptimisticMutation(
        (current: any) => ({ ...current, personalTags: (current.personalTags || []).map((tag: any) => tag.id === id ? { ...tag, ...patch } : tag) }),
        () => store.updatePersonalTag(state, id, patch),
        "Atualizando tag...",
        "Tag atualizada.",
      );
    },
    [runOptimisticMutation, state, store],
  );
  const archivePersonalTag = useCallback(
    (id: any) => {
      if (!store.archivePersonalTag) return Promise.resolve(false);
      return runOptimisticMutation(
        (current: any) => ({ ...current, personalTags: (current.personalTags || []).map((tag: any) => tag.id === id ? { ...tag, archived: true } : tag) }),
        () => store.archivePersonalTag(state, id),
        "Arquivando tag...",
        "Tag arquivada.",
      );
    },
    [runOptimisticMutation, state, store],
  );
  const reorderPersonalTags = useCallback(
    (orderedIds: any) => {
      if (!store.reorderPersonalTags) return Promise.resolve(false);
      const order = new Map(orderedIds.map((id: any, index: any) => [id, index]));
      return runOptimisticMutation(
        (current: any) => ({ ...current, personalTags: (current.personalTags || []).map((tag: any) => order.has(tag.id) ? { ...tag, sortOrder: order.get(tag.id) } : tag) }),
        () => store.reorderPersonalTags(state, orderedIds),
        "Reordenando tags...",
        "Ordem das tags salva.",
      );
    },
    [runOptimisticMutation, state, store],
  );
  const saveTask = useCallback(
    (id: any, patch: any) => {
      const existingTask = state.tasks.find((taskItem: any) => taskItem.id === id);
      if (existingTask && isQuoteTask(existingTask) && !existingTask.parentTaskId && existingTask.status !== "done" && patch.status === "done" && patch.responseSent === undefined) {
        return (requestQuoteCompletion as any)(existingTask, (completion: any) => saveTask(id, { ...patch, ...completion }));
      }
      const mentionText = [
        patch.title !== existingTask?.title ? patch.title : "",
        patch.description !== existingTask?.description ? patch.description : "",
      ].filter((value) => typeof value === "string").join(" ");
      const nextPatch = {
        ...patch,
        ...(patch.assignmentMode !== undefined || patch.teamIds !== undefined || patch.teamId !== undefined || patch.assigneeIds !== undefined || patch.assigneeNames !== undefined || patch.primaryAssigneeId !== undefined || patch.consultantIds !== undefined
          ? (() => {
              const assignment = resolveTaskAssignment(patch, state.teams || [], state.employees || []);
              return { ...assignment, assigneeName: assignment.assigneeNames.join(", ") };
            })()
          : {}),
        actorEmployeeId: currentEmployee?.id || "",
        actorUserId: currentEmployee?.userId || "",
        actorName: currentEmployee?.name || "Executor não identificado",
        mentionedEmployeeIds: mentionText ? mentionedEmployees(mentionText, state.employees).map((employee) => employee.id) : [],
      };
      const visibilityChanged = Boolean(existingTask)
        && patch.restrictedVisibility !== undefined
        && Boolean(patch.restrictedVisibility) !== Boolean(existingTask.restrictedVisibility);
      const previousVisibility = Boolean(existingTask?.restrictedVisibility);
      const isCompleting = existingTask?.status !== "done" && nextPatch.status === "done";
      if (isCompleting) prepareCompletionSound();
      const shouldReopen = id === selectedId;
      return runOptimisticMutation(
        (current: any) => isCompleting && isQuoteTask(existingTask) ? current : applyOptimisticTaskPatch(current, id, nextPatch),
        async () => {
      const { personalTagIds: _personalTagIds, ...taskPatch } = nextPatch;
      const nextState = await store.updateTask(confirmedStateRef.current || state, id, taskPatch);
          return nextPatch.personalTagIds !== undefined && store.replaceTaskPersonalTags
            ? store.replaceTaskPersonalTags(nextState, id, nextPatch.personalTagIds, state.currentUserId || currentEmployee?.userId || "")
            : nextState;
        },
        "",
        "",
      ).then((success) => {
        if (success) {
          if (isCompleting) playCompletionSound();
          setPendingTaskDraft((current: any) => current?.id === id ? null : current);
          if (shouldReopen)
            setFailedTaskDraft((current: any) =>
              current?.id === id ? null : current,
            );
          if (visibilityChanged) {
            showNotice(
              nextPatch.restrictedVisibility ? "Tarefa ocultada." : "Tarefa visível para todos.",
              5600,
              {
                label: "Desfazer",
                onClick: () => runOptimisticMutation(
                  (current: any) => applyOptimisticTaskPatch(current, id, { restrictedVisibility: previousVisibility }),
                  () => store.updateTask(state, id, { restrictedVisibility: previousVisibility }),
                  "",
                  "",
                ),
              },
            );
          }
          return true;
        }
        if (!shouldReopen) return false;
        setFailedTaskDraft({ id, patch: nextPatch });
        if (failedTaskReopenTimerRef.current)
          window.clearTimeout(failedTaskReopenTimerRef.current);
        setSelectedId("");
        failedTaskReopenTimerRef.current = window.setTimeout(() => {
          failedTaskReopenTimerRef.current = null;
          setSelectedId(id);
        }, 120);
        return false;
      });
    },
    [currentEmployee, state, store, runOptimisticMutation, selectedId, showNotice, requestQuoteCompletion],
  );
  const waitingTask = useMemo(
    () => state.tasks.find((item: any) => item.id === waitingTaskId),
    [state.tasks, waitingTaskId],
  );
  const saveWaitingStatus = useCallback(
    (id: any, waitingContext: any) =>
      saveTask(id, { status: "waiting", waitingContext }),
    [saveTask],
  );
  const waitingReturnTask = useMemo(
    () => state.tasks.find((item: any) => item.id === waitingReturnTaskId),
    [state.tasks, waitingReturnTaskId],
  );
  const openWaitingReturn = useCallback(
    (id: any) => {
      const task = state.tasks.find((item: any) => item.id === id);
      // Proposta enviada: o retorno aguardado é a decisão do cliente, registrada na cotação.
      const quote = task?.quoteId ? state.quotes.find((item: any) => item.id === task.quoteId) : null;
      if (quote?.status === "Respondida ao cliente") { openQuoteView(quote.id, "outcome"); return; }
      if (canRegisterWaitingReturn(task, currentEmployee, state.teams)) {
        setWaitingReturnTaskId(id);
      }
    },
    [currentEmployee, state.tasks, state.quotes, state.teams, openQuoteView],
  );
  const registerWaitingReturn = useCallback(
    (id: any, input: any) => {
      const task = state.tasks.find((item: any) => item.id === id);
      if (!canRegisterWaitingReturn(task, currentEmployee, state.teams)) {
        showNotice("Você não pode registrar este retorno.", 5200);
        return Promise.resolve(false);
      }
      const mentionedEmployeeIds = mentionedEmployees(input.text, state.employees).map((employee) => employee.id);
      const operationInput = {
        ...input,
        returnId: globalThis.crypto?.randomUUID?.() || `return-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        actorEmployeeId: currentEmployee?.id || "",
        actorUserId: currentEmployee?.userId || "",
        mentionedEmployeeIds,
      };
      return runOptimisticMutation(
        (current: any) => addOptimisticReturn(
          applyOptimisticTaskPatch(current, id, { status: "doing", actorEmployeeId: currentEmployee?.id || "", actorUserId: currentEmployee?.userId || "", actorName: currentEmployee?.name || "Executor não identificado" }),
          id,
          { id: input.returnId, text: input.text, createdAt: new Date().toISOString(), author: currentEmployee?.name || "Você" },
        ),
        () => store.resolveWaitingReturn(state, id, { ...operationInput, actorName: currentEmployee?.name || "Executor não identificado" }),
        store.live ? "Registrando retorno..." : "Registrando retorno no mock local...",
        store.live ? "Retorno registrado." : "Retorno registrado localmente.",
      ).then((success) => {
        if (success && selectedId === id) setSelectedId("");
        return success;
      });
    },
    [currentEmployee, selectedId, showNotice, state, store, runOptimisticMutation],
  );
  const completeTask = useCallback(
    (id: any) => {
      const task = state.tasks.find((item: any) => item.id === id);
      if (!task || ["done", "cancelled"].includes(task.status))
        return Promise.resolve(false);
      if (isQuoteTask(task) && !task.parentTaskId)
        return saveTask(id, { status: "done" });
      const previousPatch = { status: task.status };
      const completePatch = { status: "done" };
      prepareCompletionSound();
      return runOptimisticMutation(
        (current: any) => applyOptimisticTaskPatch(current, id, { ...completePatch, actorEmployeeId: currentEmployee?.id || "", actorUserId: currentEmployee?.userId || "", actorName: currentEmployee?.name || "Executor não identificado" }),
        () => store.updateTask(state, id, { ...completePatch, actorEmployeeId: currentEmployee?.id || "", actorUserId: currentEmployee?.userId || "", actorName: currentEmployee?.name || "Executor não identificado" }),
        "",
        "",
      ).then((success) => {
        if (!success) return false;
        playCompletionSound();
        showNotice("Tarefa concluída.", 5600, {
          label: "Desfazer",
          onClick: () =>
            runOptimisticMutation(
              (current: any) => applyOptimisticTaskPatch(current, id, previousPatch),
              () =>
                store.updateTask(
                  confirmedStateRef.current || state,
                  id,
                  previousPatch,
                ),
              "",
              "Tarefa reaberta.",
            ),
        });
        return true;
      });
    },
    [state, store, runOptimisticMutation, showNotice, saveTask],
  );
  const collectTask = useCallback(
    (id: any) => {
      if (!store.collectTask) return Promise.resolve(false);
      const input = { actorEmployeeId: currentEmployee?.id || "", actorUserId: currentEmployee?.userId || "", actorName: currentEmployee?.name || "Você" };
      return runOptimisticMutation(
        (current: any) => ({ ...current, collectionEvents: [...(current.collectionEvents || []), { taskId: id, referenceDate: localDateKey(), occurredAt: new Date().toISOString(), actorEmployeeId: input.actorEmployeeId }] }),
        () => store.collectTask(state, id, input),
        store.live ? "Enviando cobrança..." : "Registrando cobrança local...",
        store.live ? "Cobrança enviada." : "Cobrança registrada.",
      );
    },
    [currentEmployee, runOptimisticMutation, state, store],
  );
  const deleteTask = useCallback(
    (id: any) => {
      const shouldCloseDrawer = selectedId === id;
      return runOptimisticMutation(
        (current: any) => ({
          ...current,
          tasks: current.tasks.filter((taskItem: any) => taskItem.id !== id),
        }),
        () => store.deleteTask(state, id),
        "",
        "",
      ).then((success) => {
        if (success && shouldCloseDrawer) setSelectedId("");
        return success;
      });
    },
    [state, store, runOptimisticMutation, selectedId],
  );
  const saveContact = useCallback(
    (input: any = {}) => {
      const { attachments: draftAttachments = [], ...inputWithoutAttachments } = input;
      const existing = (state.contacts || []).find((item: any) => item.id === inputWithoutAttachments.id);
      const actor = {
        actorEmployeeId: currentEmployee?.id || "",
        actorUserId: currentEmployee?.userId || "",
        actorName: currentEmployee?.name || "Você",
      };
      const hasAssignment = ["assignmentMode", "teamIds", "teamId", "assigneeIds", "assigneeName", "assigneeNames"]
        .some((key) => inputWithoutAttachments[key] !== undefined);
      const assignmentInput = hasAssignment
        ? inputWithoutAttachments
        : {
          ...inputWithoutAttachments,
          assigneeIds: inputWithoutAttachments.ownerEmployeeId ? [inputWithoutAttachments.ownerEmployeeId] : [],
          assigneeName: inputWithoutAttachments.ownerName ? [inputWithoutAttachments.ownerName] : [],
        };
      const assignment = resolveTaskAssignment(assignmentInput, state.teams || [], state.employees || []);
      const ownerId = inputWithoutAttachments.ownerEmployeeId || assignment.assigneeIds[0] || currentEmployee?.id || "";
      const owner = (state.employees || []).find((employee: any) => employee.id === ownerId);
      const contactInput = {
        ...inputWithoutAttachments,
        ...assignment,
        assigneeName: assignment.assigneeNames,
        ownerEmployeeId: ownerId,
        ownerName: inputWithoutAttachments.ownerName || owner?.name || assignment.teamName || "Não atribuído",
      };
      if (existing) {
        const patch = { ...contactInput, ...actor };
        return runOptimisticMutation(
          (current: any) => ({
            ...current,
            contacts: current.contacts.map((item: any) => item.id === existing.id
              ? normalizeContact({ ...item, ...patch }, { now: new Date().toISOString() })
              : item),
          }),
          () => store.updateContact(state, existing.id, patch),
          store.live ? "Caso em sincronização..." : "Caso atualizado no mock local.",
          store.live ? "Caso sincronizado." : "Caso atualizado.",
        );
      }
      const created = createContactPayload({ ...contactInput, ...actor }, owner || currentEmployee || {});
      const optimistic = { ...created, id: `optimistic-contact-${Date.now()}`, history: [] };
      return runOptimisticMutation(
        (current: any) => ({ ...current, contacts: [optimistic, ...(current.contacts || [])] }),
        () => Promise.resolve(store.createContact(state, { ...contactInput, ...actor })).then((createdState) => {
          if (!draftAttachments.length) return createdState;
          const createdContact = (createdState?.contacts || []).find((item: any) => item.subject === contactInput.subject && item.senderName === contactInput.senderName);
          if (!createdContact?.id) throw new Error("O caso foi criado, mas não foi possível localizar seu registro para enviar os anexos.");
          return draftAttachments.reduce(
            (queue: any, attachment: any) => queue.then((currentState: any) => store.addContactAttachment(currentState, createdContact.id, attachment.file || attachment, attachment.previewUrl || "")),
            Promise.resolve(createdState),
          );
        }),
        store.live ? "Caso em sincronização..." : "Caso adicionado no mock local.",
        store.live ? "Caso sincronizado." : "Caso criado.",
      );
    },
    [currentEmployee, runOptimisticMutation, state, store],
  );
  const handleWhatsAppIntake = useCallback(async (input: any) => {
    if (!store.createContactFromWhatsAppIntake) throw new Error("Integração WhatsApp não disponível neste modo.");
    const result = await store.createContactFromWhatsAppIntake(confirmedStateRef.current || state, {
      ...input,
      actorEmployeeId: currentEmployee?.id || "",
      actorUserId: currentEmployee?.userId || "",
      actorName: currentEmployee?.name || "Você",
    });
    if (!result?.state) throw new Error("Planner não retornou o estado após o intake WhatsApp.");
    confirmedStateRef.current = result.state;
    setState(applyPendingMutations(result.state));
    showNotice(result.status === "duplicate" ? "Triagem já registrada." : result.status === "updated" ? "Caso WhatsApp atualizado." : "Caso WhatsApp criado.");
    return { status: result.status, contactId: result.contactId, taskId: result.taskId };
  }, [applyPendingMutations, currentEmployee, showNotice, state, store]);
  useEffect(() => installPlannerBridge({ onIntake: handleWhatsAppIntake }), [handleWhatsAppIntake]);
  const createQuote = useCallback(async (input: any = {}) => {
    if (!store.createQuote) return Promise.resolve(false);
    const { attachments = [], ...quoteInput } = input;
    const previousIds = new Set((confirmedStateRef.current || state).quotes?.map((quote: any) => quote.id) || []);
    let linkedTaskId = "";
    const created = await runOptimisticMutation(
      (current: any) => current,
      async () => {
        const next = await store.createQuote(confirmedStateRef.current || state, { ...quoteInput, actorEmployeeId: currentEmployee?.id || "" });
        const quote = (next.quotes || []).find((item: any) => !previousIds.has(item.id));
        linkedTaskId = (next.tasks || []).find((task: any) => task.quoteId === quote?.id && !task.parentTaskId)?.id || "";
        return next;
      },
      store.live ? "Cotação em sincronização…" : "Criando cotação no mock local…",
      store.live ? "Cotação enviada para sincronização." : "Cotação criada no mock local.",
    );
    if (!created || !attachments.length) return created;
    if (!linkedTaskId) { showNotice("Cotação criada, mas a tarefa para anexos não foi localizada.", 5200); return true; }
    let failures = 0;
    for (const file of attachments) {
      try {
        showNotice(`Enviando anexo ${attachments.indexOf(file) + 1} de ${attachments.length}…`);
        const previewUrl = store.live ? "" : await fileToDataUrl(file);
        const next = await store.addAttachment(confirmedStateRef.current || state, linkedTaskId, file, previewUrl);
        confirmedStateRef.current = next;
        setState(applyPendingMutations(next));
      } catch (error: any) {
        failures += 1;
        console.warn("[Planner] anexo da cotação não enviado", error);
      }
    }
    showNotice(failures ? `Cotação criada. ${failures} anexo(s) não foram enviados; abra a cotação para tentar novamente.` : `Cotação criada com ${attachments.length} anexo(s).`, failures ? 6000 : 3000);
    return true;
  }, [applyPendingMutations, currentEmployee, runOptimisticMutation, showNotice, state, store]);
  const updateQuote = useCallback((id: any, patch: any = {}) => {
    if (!store.updateQuote) return Promise.resolve(false);
    return runOptimisticMutation(
      (current: any) => ["Cotada", "Respondida ao cliente"].includes(patch.status) ? current : ({ ...current, quotes: (current.quotes || []).map((quote: any) => quote.id === id ? { ...quote, ...patch, syncStatus: "syncing" } : quote), tasks: patch.status && patch.status !== current.quotes?.find((quote: any) => quote.id === id)?.status ? (current.tasks || []).map((task: any) => task.quoteId === id && !task.parentTaskId ? { ...task, status: taskStatusForQuoteStatus(patch.status), quoteStatus: patch.status, ...(patch.waitingContext ? { waitingContext: normalizeWaitingContext(patch.waitingContext) } : {}) } : task) : current.tasks }),
      () => store.updateQuote(confirmedStateRef.current || state, id, { ...patch, actorEmployeeId: currentEmployee?.id || "" }),
      store.live ? "Cotação em sincronização…" : "Cotação atualizada no mock local.",
      store.live ? "Cotação sincronizada." : "Cotação atualizada.",
    );
  }, [currentEmployee, runOptimisticMutation, state, store]);
  const waitingQuote = state.quotes.find((quote: any) => quote.id === waitingQuoteId);
  const waitingQuoteTask = waitingQuote && state.tasks.find((task: any) => task.quoteId === waitingQuoteId && !task.parentTaskId);
  const saveWaitingQuote = useCallback((id: any, waitingContext: any) => {
    const quote = state.quotes.find((item: any) => item.id === waitingQuoteId);
    if (!quote || !state.tasks.some((task: any) => task.id === id && task.quoteId === quote.id)) return Promise.resolve(false);
    return updateQuote(quote.id, { status: "Aguardando informação", waitingContext });
  }, [state.quotes, state.tasks, updateQuote, waitingQuoteId]);
  const markQuoteSent = useCallback((id: any, proposal: any = {}) => {
    if (!store.markQuoteSent) return Promise.resolve(false);
    return runOptimisticMutation(
      (current: any) => current,
      () => store.markQuoteSent(confirmedStateRef.current || state, id, proposal),
      "Confirmando resposta…",
      "Resposta registrada. Aguardando decisão do cliente.",
    );
  }, [runOptimisticMutation, state, store]);
  const setQuoteOutcome = useCallback((id: any, outcome: any, reason = "", accepted: any = {}) => {
    if (!store.setQuoteOutcome) return Promise.resolve(false);
    const finalizationAt = new Date().toISOString();
    return runOptimisticMutation(
      (current: any) => ({ ...current, quotes: (current.quotes || []).map((quote: any) => {
        if (quote.id !== id) return quote;
        const { option, version } = outcome === "Aceita pelo cliente" ? resolveQuoteAcceptance(quote, accepted) : {};
        return { ...quote, status: outcome, lossReason: outcome === "Perdida" ? reason : "", ...(outcome === "Aceita pelo cliente" && option ? { acceptedOptionId: option.id, acceptedProposalVersionId: version?.id || "", value: option.value, commercialTerms: option.commercialTerms || "" } : {}), finalizationAt };
      }), tasks: (current.tasks || []).map((task: any) => task.quoteId === id && !task.parentTaskId ? { ...task, status: "done", quoteStatus: outcome, completedAt: finalizationAt } : task) }),
      () => store.setQuoteOutcome(confirmedStateRef.current || state, id, outcome, reason, accepted),
      store.live ? "Registrando resultado…" : "Registrando resultado no mock…",
      store.live ? "Resultado registrado." : "Resultado registrado no mock.",
    );
  }, [runOptimisticMutation, state, store]);
  const deleteQuote = useCallback((id: any) => {
    if (!store.deleteQuote) return Promise.resolve(false);
    return runOptimisticMutation(
      (current: any) => current,
      () => store.deleteQuote(confirmedStateRef.current || state, id),
      store.live ? "Excluindo cotação e tarefas vinculadas…" : "Excluindo cotação local…",
      "Cotação excluída.",
    ).then((success) => {
      if (success) setQuoteToOpenId("");
      return success;
    });
  }, [runOptimisticMutation, state, store]);
  const archiveContact = useCallback(
    (contact: any) => {
      const archivedAt = new Date().toISOString();
      const actor = { actorEmployeeId: currentEmployee?.id || "", author: currentEmployee?.name || "Você" };
      return runOptimisticMutation(
        (current: any) => ({
          ...current,
          contacts: current.contacts.map((item: any) => item.id === contact.id
            ? { ...item, archivedAt, updatedAt: archivedAt, history: [...(item.history || []), createContactEvent("archived", item, actor, archivedAt)] }
            : item),
        }),
        () => store.archiveContact(state, contact.id, actor),
        store.live ? "Caso em sincronização..." : "Arquivando caso...",
        store.live ? "Caso arquivado." : "Caso arquivado no mock local.",
      ).then((success) => {
        if (success) closeContact();
        return success;
      });
    },
    [closeContact, currentEmployee, runOptimisticMutation, state, store],
  );
  const addContactNote = useCallback(
    (id: any, value: any) => {
      const note = { id: `optimistic-note-${Date.now()}`, text: String(value || "").trim(), author: currentEmployee?.name || "Você", createdAt: new Date().toISOString() };
      if (!note.text) return Promise.resolve(false);
      return runOptimisticMutation(
        (current: any) => ({ ...current, contacts: current.contacts.map((item: any) => item.id === id ? { ...item, notes: [...(item.notes || []), note], history: [...(item.history || []), { id: note.id, type: "note", text: "Nota interna adicionada.", createdAt: note.createdAt, author: note.author }] } : item) }),
        () => store.addContactNote(state, id, value, { actorEmployeeId: currentEmployee?.id || "", author: currentEmployee?.name || "Você" }),
        store.live ? "Nota em sincronização..." : "Nota salva no mock local.",
        store.live ? "Nota sincronizada." : "Nota adicionada.",
      );
    },
    [currentEmployee, runOptimisticMutation, state, store],
  );
  const addContactAttachment = useCallback(
    (id: any, filesOrFile: any) => {
      const files = toAttachmentFiles(filesOrFile);
      if (!files.length) return Promise.resolve(false);
      return files.reduce((queue, file, index) => queue.then(() => {
        const baseState = confirmedStateRef.current || state;
        return fileToDataUrl(file).then((previewUrl) => runOptimisticMutation(
          (current: any) => ({ ...current, contacts: current.contacts.map((item: any) => item.id === id ? { ...item, attachments: [...(item.attachments || []), { id: `optimistic-contact-file-${Date.now()}-${index}`, name: file.name || "Arquivo", mimeType: file.type || "", size: file.size || 0, previewUrl, createdAt: new Date().toISOString(), syncStatus: "syncing" }] } : item) }),
          () => store.addContactAttachment(baseState, id, file, previewUrl),
          files.length > 1 ? `Anexo ${index + 1} de ${files.length} na fila...` : store.live ? "Anexo em envio..." : "Anexo adicionado no mock local.",
          files.length > 1 ? `Anexo ${index + 1} de ${files.length} salvo.` : store.live ? "Anexo salvo no SharePoint." : "Anexo salvo localmente.",
        ));
      }), Promise.resolve(true));
    },
    [runOptimisticMutation, state, store],
  );
  const removeContactAttachment = useCallback(
    (id: any, attachment: any) => runOptimisticMutation(
      (current: any) => ({ ...current, contacts: current.contacts.map((item: any) => item.id === id ? { ...item, attachments: (item.attachments || []).filter((entry: any) => entry.id !== attachment.id) } : item) }),
      () => store.deleteContactAttachment(confirmedStateRef.current || state, id, attachment),
      store.live ? "Anexo removido. Sincronizando SharePoint..." : "Anexo removido no mock local.",
      store.live ? "Anexo removido do SharePoint." : "Anexo removido localmente.",
    ),
    [runOptimisticMutation, state, store],
  );
  const [taskFromContact, setTaskFromContact] = useState<any>(null);
  const createTaskFromContact = useCallback((contact: any) => {
    setTaskFromContact(buildLinkedTaskInput(contact));
  }, []);
  const saveTeam = useCallback(
    (input: any) => {
      const operation = input.id
        ? store.updateTeam(state, input.id, input)
        : store.createTeam(state, input);
      return Promise.resolve(operation)
        .then((next) => {
          confirmedStateRef.current = next;
          setState(applyPendingMutations(next));
          showNotice(input.id ? "Equipe atualizada." : "Equipe criada.");
          return true;
        })
        .catch((failure) => {
          showNotice(failure.message || "Não foi possível salvar a equipe.", 5200);
          return false;
        });
    },
    [applyPendingMutations, showNotice, state, store],
  );
  const deleteTeam = useCallback(
    (id: any) => Promise.resolve(store.deleteTeam(state, id))
      .then((next) => {
        confirmedStateRef.current = next;
        setState(applyPendingMutations(next));
        showNotice("Equipe apagada.");
        return true;
      })
      .catch((failure) => {
        showNotice(failure.message || "Não foi possível apagar a equipe.", 5200);
        return false;
      }),
    [applyPendingMutations, showNotice, state, store],
  );
  const importPlannerTasks = useCallback(
    (rows: any) => Promise.resolve(store.importPlannerTasks(confirmedStateRef.current || state, rows))
      .then((result) => {
        confirmedStateRef.current = result.nextState;
        setState(applyPendingMutations(result.nextState));
        showNotice(`${result.createdCount} tarefa(s) importada(s).`);
        return result;
      })
      .catch((failure) => {
        showNotice(failure.message || "Não foi possível importar as tarefas.", 5200);
        throw failure;
      }),
    [applyPendingMutations, showNotice, state, store],
  );
  const createNewTask = useCallback(
    (input: any) => {
      const {
        subtasks = [],
        attachments = [],
        onProgress,
        ...taskInput
      } = input;
      const assignment = resolveTaskAssignment(taskInput, state.teams || [], state.employees || []);
      const commonTask = {
        ...buildTaskCreationInput(taskInput),
        ...assignment,
        assigneeName: assignment.assigneeNames.join(", "),
        actorEmployeeId: currentEmployee?.id || "",
        actorUserId: currentEmployee?.userId || "",
      };
      const operation = () => {
        onProgress?.({
          label: "Criando tarefa…",
          detail: "Salvando dados da tarefa",
          current: 0,
          total: 1 + attachments.length,
        });
        return store.createTask(state, commonTask).then((nextState: any) => {
          const parent = findCreatedMainTask(
            state.tasks,
            nextState.tasks,
            commonTask.title,
          );
          if (!parent) throw new Error("Tarefa criada, mas não foi possível localizar o registro para enviar os anexos.");
          const withTags = (commonTask as any).personalTagIds !== undefined && store.replaceTaskPersonalTags
            ? store.replaceTaskPersonalTags(nextState, parent.id, (commonTask as any).personalTagIds, state.currentUserId || currentEmployee?.userId || "")
            : nextState;
          return Promise.resolve(withTags).then((taggedState) => {
            onProgress?.({
            label: attachments.length
              ? "Tarefa criada. Preparando anexos…"
              : "Finalizando tarefa…",
            detail: "Tarefa salva",
            current: 1,
            total: 1 + attachments.length,
          });
          const withSubtasks = subtasks.reduce(
            (promise: any, title: any) =>
              promise.then((currentState: any) =>
                store.createSubtask(currentState, parent.id, {
                  title,
                  description: "",
                  priority: "medium",
                  assigneeName: "Não atribuído",
                  teamName: "Operação",
                  dueDate: "",
                }),
              ),
            Promise.resolve(taggedState),
          );
          return attachments.reduce(
            (promise: any, attachment: any, index: any) =>
              promise.then((currentState: any) => {
                onProgress?.({
                  label: `Enviando anexo ${index + 1} de ${attachments.length}…`,
                  detail: attachment.name || "Arquivo selecionado",
                  current: index + 1,
                  total: 1 + attachments.length,
                });
                return store
                  .addAttachment(
                    currentState,
                    parent.id,
                    attachment.file,
                    attachment.previewUrl,
                  )
                  .then((result: any) => {
                    onProgress?.({
                      label: "Atualizando anexos…",
                      detail: `${index + 1} de ${attachments.length} concluído`,
                      current: index + 2,
                      total: 1 + attachments.length,
                    });
                    return mergeAttachmentDetailsIntoState(
                      currentState,
                      parent.id,
                      result,
                    );
                  });
              }),
            withSubtasks,
          );
          });
        });
      };
      return runOptimisticCreate(
        commonTask,
        operation,
        store.live ? "Tarefa sincronizada." : "Tarefa salva localmente.",
      );
    },
    [state, store, runOptimisticCreate, currentEmployee],
  );
  const createSubtask = useCallback(
    (parentId: any, title: any, allowUnassigned = false) => {
      const parent = state.tasks.find((taskItem: any) => taskItem.id === parentId);
      if (isQuoteTask(parent || {})) {
        const checklistItem = { id: `check-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: String(title || "").trim(), done: false };
        if (!checklistItem.title) return Promise.resolve(false);
        return runOptimisticMutation(
          (current: any) => applyOptimisticTaskPatch(current, parentId, { checklist: [...(current.tasks.find((taskItem: any) => taskItem.id === parentId)?.checklist || []), checklistItem] }),
          () => store.updateTask(state, parentId, { checklist: [...(parent.checklist || []), checklistItem] }),
          store.live ? "Checklist sincronizado." : "Item adicionado ao checklist.",
          "Item adicionado ao checklist.",
        );
      }
      const input = {
        title,
        description: "",
        priority: "medium",
        assigneeName: "Não atribuído",
        teamName: "Operação",
        dueDate: "",
      };
      const missingResponsible = !hasTaskResponsible(input);
      const missingDueDate = !String(input.dueDate || "").trim();
      if (!allowUnassigned && (missingResponsible || missingDueDate)) {
        setPendingUnassignedCreate({ kind: "subtask", parentId, title, missingResponsible, missingDueDate });
        return Promise.resolve(false);
      }
      runOptimisticCreate(
        input,
        () => store.createSubtask(state, parentId, input),
        store.live ? "Subtarefa sincronizada." : "Subtarefa salva localmente.",
        parentId,
      );
    },
    [state, store, runOptimisticCreate, runOptimisticMutation],
  );
  const createQualityTask = useCallback(
    (item: any, allowUnassigned = false) => {
      const input = {
        title: item.title,
        description: item.description,
        dueDate: item.dueDate,
        sourceType: "quality",
        sourceId: item.id,
        sourceCode: item.code,
        sourceLabel:
          item.type === "error" ? "Erro operacional" : "Ação operacional",
      };
      const missingResponsible = !hasTaskResponsible(input);
      const missingDueDate = !String(input.dueDate || "").trim();
      if (!allowUnassigned && (missingResponsible || missingDueDate)) {
        setPendingUnassignedCreate({ kind: "quality", item, missingResponsible, missingDueDate });
        return Promise.resolve(false);
      }
      runOptimisticCreate(
        input,
        () => store.createQualityTask(state, item),
        store.live
          ? "Tarefa de qualidade sincronizada."
          : "Tarefa de qualidade salva localmente.",
      );
    },
    [state, store, runOptimisticCreate],
  );
  const reloadData = useCallback(() => {
    runMutation(store.reset(), "Dados recarregados.");
    if (!store.live) window.dispatchEvent(new Event("planner-service-types-changed"));
    setSelectedId("");
  }, [store, runMutation]);
  const adminCleanup = useCallback((action: any) => runMutation(store.adminCleanup(state, action), "Limpeza administrativa concluída."), [state, store, runMutation]);
  const sendNotificationTest = useCallback((input: any) => {
    if (!store.live || !store.sendNotificationTest) return Promise.reject(new Error("O envio de teste exige o ambiente Dataverse conectado."));
    const actor = resolveCurrentEmployee(state.employees, store.live, state.currentUserEmail);
    return store.sendNotificationTest(state, { ...input, actorEmployeeId: actor?.id || "", actorUserId: actor?.userId || "" }).then((result: any) => {
      const next = result?.state || result;
      confirmedStateRef.current = next;
      setState(applyPendingMutations(next));
      const delivery = result?.emailDispatch;
      if (delivery?.status === "sent") showNotice("Push de teste enviado.");
      else if (delivery?.status === "failed" || delivery?.status === "noAddress" || delivery?.status === "unknown") showNotice(delivery.text || "Push de teste não enviado.", 5200);
      else showNotice("Evento criado. O Flow ainda não confirmou o push.", 4200);
      return delivery || true;
    });
  }, [applyPendingMutations, showNotice, state, store]);
  const addComment = useCallback(
    (id: any, text: any) => {
      const actor = resolveCurrentEmployee(
        state.employees,
        store.live,
        state.currentUserEmail,
      );
      const mentionedEmployeeIds = mentionedEmployees(text, state.employees).map((employee) => employee.id);
      const context = { actorEmployeeId: actor?.id || "", actorUserId: actor?.userId || "", mentionedEmployeeIds };
      return (
      runOptimisticMutation(
        (current: any) => addOptimisticComment(current, id, text),
        async () => {
          const next = await store.addComment(state, id, text, context);
          if (!store.live || !store.loadNotifications || !actor?.id) return next;
          return { ...next, notifications: await store.loadNotifications(actor.id) };
        },
        store.live
          ? "Comentário adicionado. Sincronizando..."
          : "Comentário adicionado no mock local.",
        store.live
          ? "Comentário sincronizado."
          : "Comentário salvo localmente.",
      ));
    },
    [state, store, runOptimisticMutation],
  );
  const addAttachment = useCallback(
    (id: any, filesOrFile: any) => {
      const files = toAttachmentFiles(filesOrFile);
      if (!files.length) return Promise.resolve(false);
      return files.reduce(
        (queue, file, index) =>
          queue.then(() => {
            const baseState = confirmedStateRef.current || state;
            const previewPromise = store.live
              ? Promise.resolve(
                  globalThis.URL?.createObjectURL
                    ? globalThis.URL.createObjectURL(file)
                    : "",
                )
              : fileToDataUrl(file);
            return previewPromise.then((previewUrl) =>
              runOptimisticMutation(
                (current: any) =>
                  addOptimisticAttachment(current, id, file, (previewUrl as any)),
                () =>
                  Promise.resolve(
                    store.addAttachment(baseState, id, file, previewUrl),
                  ).then((result) =>
                    mergeAttachmentDetailsIntoState(baseState, id, result),
                  ),
                files.length > 1
                  ? `Anexo ${index + 1} de ${files.length} na fila...`
                  : store.live
                    ? "Anexo em envio..."
                    : "Anexo adicionado no mock local.",
                files.length > 1
                  ? `Anexo ${index + 1} de ${files.length} salvo.`
                  : store.live
                    ? "Anexo salvo no SharePoint."
                    : "Anexo salvo localmente.",
              ),
            );
          }),
        Promise.resolve(true),
      );
    },
    [state, store, runOptimisticMutation],
  );
  const removeAttachment = useCallback(
    (taskId: any, attachment: any) =>
      runOptimisticMutation(
        (current: any) => ({
          ...current,
          tasks: current.tasks.map((taskItem: any) =>
            taskItem.id === taskId
              ? {
                  ...taskItem,
                  attachments: (taskItem.attachments || []).filter(
                    (item: any) => item.id !== attachment.id,
                  ),
                  returns: (taskItem.returns || []).map((returnItem: any) => ({
                    ...returnItem,
                    attachments: (returnItem.attachments || []).filter(
                      (item: any) => item.id !== attachment.id,
                    ),
                  })),
                }
              : taskItem,
          ),
        }),
        () =>
          Promise.resolve(
            store.deleteAttachment(
              confirmedStateRef.current || state,
              taskId,
              attachment,
            ),
          ),
        store.live
          ? "Anexo removido. Sincronizando SharePoint..."
          : "Anexo removido no mock local.",
        store.live
          ? "Anexo removido do SharePoint."
          : "Anexo removido localmente.",
      ),
    [state, store, runOptimisticMutation],
  );
  const workItems = useMemo(
    () => normalizeWorkItems(state || {}, currentEmployee),
    [state?.tasks, state?.quality, state?.teams, currentEmployee?.id],
  );
  useEffect(() => {
    if (!currentEmployee?.id || !store.loadNotifications) return undefined;
    let activeRequest = true;
    const refresh = () => store.loadNotifications(currentEmployee.id)
      .then((notifications: any) => {
        if (activeRequest) {
          const current = confirmedStateRef.current || {};
          mergeConfirmed({
            notifications,
            loadErrors: { ...(current.loadErrors || {}), notifications: undefined },
          });
        }
      })
      .catch((failure: any) => {
        if (activeRequest) {
          const current = confirmedStateRef.current || {};
          mergeConfirmed({
            loadErrors: { ...(current.loadErrors || {}), notifications: failure.message || "Notificações indisponíveis." },
          });
        }
      });
    refresh();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(refresh, 15000);
    return () => { activeRequest = false; document.removeEventListener("visibilitychange", onVisibilityChange); window.clearInterval(timer); };
  }, [currentEmployee?.id, mergeConfirmed, store]);
  const markNotificationRead = useCallback((notificationId: any) => {
    if (!store.markNotificationRead) return;
    const notification = (state.notifications || []).find((item: any) => item.id === notificationId);
    if (!notification || notification.readAt) return;
    const optimisticReadAt = new Date().toISOString();
    setState((current: any) => ({
      ...current,
      notifications: (current.notifications || []).map((item: any) => item.id === notificationId ? { ...item, readAt: optimisticReadAt } : item),
    }));
    showNotice("Notificação marcada como lida.", 2400);
    store.markNotificationRead(state, notificationId).then(setState).catch((failure: any) => {
      setState((current: any) => ({
        ...current,
        notifications: (current.notifications || []).map((item: any) => item.id === notificationId && item.readAt === optimisticReadAt ? { ...item, readAt: "" } : item),
      }));
      showNotice(`Falha ao atualizar notificação: ${failure.message}`, 4200);
    });
  }, [state, store, showNotice]);
  useEffect(() => {
    if (selectedId) markTaskNotificationsRead(selectedId);
  }, [selectedId, markTaskNotificationsRead]);
  const markAllNotificationsRead = useCallback(() => {
    if (!currentEmployee?.id || !store.markAllNotificationsRead) return;
    const optimisticReadAt = new Date().toISOString();
    const unreadIds = new Set(
      notificationsVisibleToEmployee(state.notifications || [], state.tasks || [], currentEmployee, state.teams || [])
        .filter((item: any) => item.recipientEmployeeId === currentEmployee.id && !item.readAt)
        .map((item: any) => item.id),
    );
    if (!unreadIds.size) return;
    setState((current: any) => ({
      ...current,
      notifications: (current.notifications || []).map((item: any) => unreadIds.has(item.id) ? { ...item, readAt: optimisticReadAt } : item),
    }));
    showNotice("Todas as notificações foram marcadas como lidas.", 2600);
    store.markAllNotificationsRead(state, currentEmployee.id).then(setState).catch((failure: any) => {
      setState((current: any) => ({
        ...current,
        notifications: (current.notifications || []).map((item: any) => unreadIds.has(item.id) && item.readAt === optimisticReadAt ? { ...item, readAt: "" } : item),
      }));
      showNotice(`Falha ao atualizar notificações: ${failure.message}`, 4200);
    });
  }, [currentEmployee?.id, state, store, showNotice]);
  const openNotification = useCallback((item: any) => {
    if (item.contactId) {
      if (!item.readAt) markNotificationRead(item.id);
      openContact(item.contactId);
    } else if (item.taskId) {
      openTask(item.taskId);
    }
  }, [markNotificationRead, openContact, openTask]);
  const onTaskScopeChange = useCallback(
    (scope: any) => {
      setTaskScope(scope);
      setFilters((current: any) => ({
        ...current,
        assignee:
          scope === "mine" && currentEmployee?.name
            ? [currentEmployee.name]
            : [],
      }));
    },
    [currentEmployee?.name],
  );
  const onCentralModeChange = useCallback(
    (mode: any) => {
      setActive(mode === "mine" ? "dashboard" : "team");
      onTaskScopeChange(mode === "mine" ? "mine" : "all");
    },
    [onTaskScopeChange],
  );
  const navigate = useCallback(
    (target: any) => {
      if (target === "dashboard") return onCentralModeChange("mine");
      if (target === "team") return onCentralModeChange("team");
      setActive(target);
    },
    [onCentralModeChange],
  );
  const visibleTasks = useMemo(
    () => (state.tasks || []).filter((task: any) => isTaskVisibleToEmployee(task, currentEmployee, state.teams)),
    [currentEmployee, state.tasks, state.teams],
  );
  const visibleNotifications = useMemo(
    () => notificationsVisibleToEmployee(
      (state.notifications || []).filter((item: any) => item.recipientEmployeeId === currentEmployee?.id),
      state.tasks || [],
      currentEmployee,
      state.teams || [],
    ),
    [currentEmployee, state.notifications, state.tasks, state.teams],
  );
  return {
    navigationWindowRef,
    initialUrlStateRef,
    active,
    setActive,
    readyView,
    setReadyView,
    store,
    state,
    setState,
    currentEmployee,
    showManagement,
    selectedId,
    setSelectedId,
    quoteToOpenId,
    setQuoteToOpenId,
    quoteActionRequest,
    setQuoteActionRequest,
    selectQuote,
    consumeQuoteAction,
    openQuoteView,
    selectedContactId,
    setSelectedContactId,
    waitingTaskId,
    setWaitingTaskId,
    waitingQuoteId,
    setWaitingQuoteId,
    waitingReturnTaskId,
    setWaitingReturnTaskId,
    creating,
    setCreating,
    creatingStatus,
    setCreatingStatus,
    creatingInput,
    setCreatingInput,
    filters,
    setFilters,
    taskScope,
    setTaskScope,
    checklistVisibility,
    setChecklistVisibility,
    notice,
    setNotice,
    noticeAction,
    setNoticeAction,
    error,
    setError,
    failedTaskDraft,
    setFailedTaskDraft,
    pendingTaskDraft,
    setPendingTaskDraft,
    pendingUnassignedCreate,
    setPendingUnassignedCreate,
    quoteCompletionRequest,
    setQuoteCompletionRequest,
    refreshing,
    setRefreshing,
    confirmedStateRef,
    pendingMutationsRef,
    refreshInFlightRef,
    noticeTimerRef,
    launchHandledRef,
    urlStateRef,
    handlingHistoryRef,
    failedTaskReopenTimerRef,
    dismissNotice,
    showNotice,
    defaultEmployee,
    applyPendingMutations,
    mergeConfirmed,
    refreshInBackground,
    searchQuotes,
    ensureTaskDetails,
    runMutation,
    runOptimisticMutation,
    runOptimisticCreate,
    selected,
    markTaskNotificationsRead,
    openTask,
    openContact,
    closeTask,
    requestQuoteCompletion,
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
    handleWhatsAppIntake,
    createQuote,
    updateQuote,
    waitingQuote,
    waitingQuoteTask,
    saveWaitingQuote,
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
  }
}

export type PlannerModel = ReturnType<typeof usePlanner>
