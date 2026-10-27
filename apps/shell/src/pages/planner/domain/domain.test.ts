import { assert, test } from "vitest";
import { addOptimisticAttachment, addOptimisticComment, addOptimisticReturn, applyOptimisticTaskPatch, buildAssigneeOptions, buildOptimisticTask, buildTaskCreationInput, canRegisterWaitingReturn, deriveExecutionActor, filterTasks, findCreatedMainTask, formatDate, formatLongDate, getDueBucket, getDueBucketForEmployee, hasTaskResponsible, isOverdue, isTaskVisibleToEmployee, mentionedEmployees, migrateLegacyTeams, normalizeAssigneeNames, normalizePersonalTag, normalizePersonalTagIds, normalizeTeam, normalizeWaitingContext, quoteTaskTitle, resolveOwnedPersonalTagIds, resolveTaskAssignment, responsibilityFromIds, sortBoardTasks, sortTasks, STATUSES, taskDisplayDueDate, taskStats, teamResponsibilitySummary, validatePersonalTag, validateTeamComposition, validateWaitingContext, waitingContextSummary } from "./domain";

const tasks = [
  { id: "1", title: "Atrasada", quoteTitle: "Cotação A", assigneeName: "Marina", status: "todo", priority: "high", dueDate: "2026-08-01" },
  { id: "2", title: "Hoje", quoteTitle: "Cotação B", assigneeName: "Rafael", status: "doing", priority: "medium", dueDate: "2026-08-03" },
  { id: "3", title: "Concluída", quoteTitle: "Cotação C", assigneeName: "Camila", status: "done", priority: "low", dueDate: "2026-08-01" },
];

test("deriva executor atual pela entrada mais recente em Em andamento", () => {
  const task = {
    status: "doing",
    history: [
      { id: "h1", field: "status", nextValue: "doing", authorId: "e1", author: "Marina", createdAt: "2026-09-14T10:00:00Z" },
      { id: "h2", field: "status", nextValue: "waiting", authorId: "e2", author: "Rafael", createdAt: "2026-09-14T11:00:00Z" },
      { id: "h3", field: "status", nextValue: "doing", authorId: "e3", author: "Camila", createdAt: "2026-09-14T12:00:00Z" },
    ],
  };
  assert.deepEqual(deriveExecutionActor(task), { id: "e3", userId: "", name: "Camila", occurredAt: "2026-09-14T12:00:00Z", eventId: "h3" });
  assert.strictEqual(deriveExecutionActor({ ...task, status: "waiting" }), null);
  assert.strictEqual(deriveExecutionActor({ status: "doing", history: [] }), null);
  const employees = [{ id: "employee-keila", userId: "e3", emailMicrosoft: "keila@empresa.com", name: "Ana Souza" }];
  assert.strictEqual(deriveExecutionActor(task, employees)!.name, "Ana Souza");
  assert.strictEqual(deriveExecutionActor(task, employees)!.id, "employee-keila");
  assert.strictEqual(deriveExecutionActor(task, [{ id: "other", userId: "other", name: "Outra" }])!.name, "Executor não identificado");
});

test("identifica atraso sem marcar tarefa concluída", () => {
  const today = new Date("2026-08-03T12:00:00");
  assert.strictEqual(isOverdue(tasks[0], today), true);
  assert.strictEqual(isOverdue(tasks[2], today), false);
});

test("classifica prazos em atraso, hoje, amanhã e próximos no fuso do app", () => {
  const today = new Date("2026-08-03T12:00:00-03:00");
  assert.strictEqual(getDueBucket({ status: "todo", dueDate: "2026-08-02" }, today), "overdue");
  assert.strictEqual(getDueBucket({ status: "todo", dueDate: "2026-08-03" }, today), "today");
  assert.strictEqual(getDueBucket({ status: "todo", dueDate: "2026-08-04" }, today), "tomorrow");
  assert.strictEqual(getDueBucket({ status: "todo", dueDate: "2026-08-05" }, today), "upcoming");
  assert.strictEqual(getDueBucket({ status: "done", dueDate: "2026-08-02" }, today), "none");
  assert.strictEqual(getDueBucket({ status: "todo" }, today), "none");
});

test("usa prazo do retorno apenas para responsável de Aguardando", () => {
  const task = {
    status: "waiting",
    dueDate: "2026-08-20",
    waitingContext: {
      subject: "confirmação",
      onType: "employee",
      onIds: ["employee-marina"],
      onNames: ["Marina Alves"],
      expectedDate: "2026-08-28",
    },
  };
  const responsible = { id: "employee-marina", name: "Marina Alves" };
  const viewer = { id: "employee-rafael", name: "Rafael Lima" };

  assert.strictEqual(taskDisplayDueDate(task, responsible), "2026-08-28");
  assert.strictEqual(taskDisplayDueDate(task, viewer), "2026-08-20");
  assert.strictEqual(getDueBucketForEmployee(task, responsible, [], new Date("2026-08-28T12:00:00-03:00")), "today");
  assert.strictEqual(filterTasks([task], { assignee: ["Marina Alves"] }, responsible).length, 1);

  const teamTask = {
    ...task,
    waitingContext: { ...task.waitingContext, onType: "team", onIds: ["team-operation"], onNames: ["Operação"] },
  };
  assert.strictEqual(taskDisplayDueDate(teamTask, viewer, [{ id: "team-operation", name: "Operação", memberIds: ["employee-rafael"] }]), "2026-08-28");
});

test("filtra por texto, status e prioridade", () => {
  assert.strictEqual(filterTasks(tasks, { query: "Rafael", status: "", priority: "" }).length, 1);
  assert.strictEqual(filterTasks(tasks, { query: "", status: ["doing", "waiting"], priority: ["medium", "high"] }).length, 1);
});

test("aplica visibilidade restrita por criador, responsável, equipe e usuário externo", () => {
  const restricted = {
    id: "restricted-1",
    restrictedVisibility: true,
    creatorEmployeeId: "employee-creator",
    creatorUserId: "user-creator",
    assigneeIds: ["employee-assignee"],
    assigneeNames: ["Pessoa responsável"],
    teamIds: ["team-operation"],
    teamNames: ["Operação"],
  };
  const teams = [{ id: "team-operation", name: "Operação", memberIds: ["employee-team"] }];

  assert.strictEqual(isTaskVisibleToEmployee(restricted, { id: "employee-creator" }, teams), true);
  assert.strictEqual(isTaskVisibleToEmployee(restricted, { userId: "user-creator" }, teams), true);
  assert.strictEqual(isTaskVisibleToEmployee(restricted, { id: "employee-assignee", name: "Outra pessoa" }, teams), true);
  assert.strictEqual(isTaskVisibleToEmployee(restricted, { id: "employee-team" }, teams), true);
  assert.strictEqual(isTaskVisibleToEmployee(restricted, { id: "employee-external" }, teams), false);
  assert.strictEqual(isTaskVisibleToEmployee({ ...restricted, assigneeIds: [], assigneeNames: [], teamIds: [], teamNames: [] }, { id: "employee-external" }, teams), false);
  assert.strictEqual(isTaskVisibleToEmployee({ id: "public-1" }, { id: "employee-external" }, teams), true);
  assert.strictEqual(filterTasks([restricted], {}, { id: "employee-external" }, teams).length, 0);
});

test("ordena cards do quadro por prazo, prioridade, atualização, criação e título", () => {
  const boardTasks = [
    { id: "done", title: "Zeta", status: "done", priority: "high", dueDate: "2026-08-01", createdAt: "2026-08-01T10:00:00Z" },
    { id: "low", title: "Beta", status: "todo", priority: "low", dueDate: "", createdAt: "2026-08-03T10:00:00Z" },
    { id: "high", title: "Alfa", status: "todo", priority: "high", dueDate: "2026-08-04", createdAt: "2026-08-02T10:00:00Z" },
    { id: "medium", title: "Gama", status: "todo", priority: "medium", dueDate: "2026-08-02", createdAt: "2026-08-04T10:00:00Z", history: [{ createdAt: "2026-08-05T10:00:00Z" }] },
    { id: "updated", title: "Delta", status: "todo", priority: "low", dueDate: "2026-08-06", createdAt: "2026-08-05T10:00:00Z", updatedAt: "2026-08-06T10:00:00Z", history: [{ createdAt: "2026-08-07T10:00:00Z" }] },
  ];

  assert.deepEqual(sortBoardTasks(boardTasks).map((task) => task.id), ["medium", "high", "updated", "low", "done"]);
  assert.deepEqual(sortBoardTasks(boardTasks, { key: "priority", direction: "asc" }).map((task) => task.id), ["high", "medium", "updated", "low", "done"]);
  assert.deepEqual(sortBoardTasks(boardTasks, { key: "updatedAt", direction: "desc" }).map((task) => task.id), ["updated", "medium", "low", "high", "done"]);
  assert.deepEqual(sortBoardTasks(boardTasks, { key: "createdAt", direction: "asc" }).map((task) => task.id), ["high", "low", "medium", "updated", "done"]);
  assert.deepEqual(sortBoardTasks(boardTasks, { key: "createdAt", direction: "desc" }).map((task) => task.id), ["updated", "medium", "low", "high", "done"]);
  assert.deepEqual(sortBoardTasks(boardTasks, { key: "title", direction: "asc" }).map((task) => task.id), ["high", "low", "updated", "medium", "done"]);
  assert.deepEqual(sortBoardTasks(boardTasks, { key: "title", direction: "desc" }).map((task) => task.id), ["medium", "updated", "low", "high", "done"]);
});

test("filtra por uma ou mais equipes", () => {
  const teamTasks = tasks.map((task, index) => ({ ...task, teamName: index === 0 ? "Operação" : "Comercial" }));
  assert.deepEqual(filterTasks(teamTasks, { team: ["Operação", "Comercial"] }).map((task) => task.id), ["1", "2", "3"]);
  assert.strictEqual(filterTasks(teamTasks, { team: "Operação" }).length, 1);
});

test("filtra por um ou mais responsáveis", () => {
  assert.deepEqual(filterTasks(tasks, { query: "", assignee: ["Marina", "Camila"] }).map((task) => task.id), ["1", "3"]);
  assert.strictEqual(filterTasks(tasks, { query: "", assignee: "Rafael" }).length, 1);
});

test("normaliza data inválida sem quebrar a renderização", () => {
  assert.strictEqual(formatDate("não-é-uma-data"), "Sem prazo");
  assert.strictEqual(formatLongDate("2026-08-03T00:00:00.000Z"), "03 de agosto de 2026");
});

test("normaliza e valida tags pessoais por usuário", () => {
  const tag = normalizePersonalTag({ id: "tag-1", name: "  Cobrar Cliente  ", color: "#1d5ce8", sortOrder: -4 }, "user-1");
  assert.deepEqual(tag, { id: "tag-1", name: "Cobrar Cliente", color: "#1d5ce8", sortOrder: 0, archived: false, ownerUserId: "user-1" });
  assert.deepEqual(normalizePersonalTagIds(["tag-1", "tag-1", "", null]), ["tag-1"]);
  assert.strictEqual(validatePersonalTag({ name: " cobrar cliente " }, [tag]).valid, false);
  assert.strictEqual(validatePersonalTag({ name: " cobrar cliente " }, [{ ...tag, archived: true }]).valid, false);
  assert.strictEqual(validatePersonalTag({ name: "Acompanhar" }, [tag]).valid, true);
});

test("preserva tags da tarefa quando GUIDs do usuário têm caixa diferente", () => {
  const tags = [{ id: "DA985BAC-2EBC-F111-AAAF-7CED8DA8E635", ownerUserId: "5cea9f9d-0dfd-f011-8406-7ced8da87143" }];
  assert.deepEqual(resolveOwnedPersonalTagIds(tags, ["da985bac-2ebc-f111-aaaf-7ced8da8e635"], "{5CEA9F9D-0DFD-F011-8406-7CED8DA87143}"), [tags[0].id]);
  assert.throws(() => resolveOwnedPersonalTagIds(tags, ["outra-tag"], "5CEA9F9D-0DFD-F011-8406-7CED8DA87143"), /Tag pessoal não encontrada/);
});

test("filtra tarefas por qualquer uma das tags pessoais selecionadas", () => {
  const tagged = tasks.map((task, index) => ({ ...task, personalTagIds: index === 0 ? ["tag-cobrar"] : index === 1 ? ["tag-vip"] : [] }));
  assert.deepEqual(filterTasks(tagged, { personalTag: ["tag-cobrar", "tag-vip"] }).map((task) => task.id), ["1", "2"]);
  assert.strictEqual(filterTasks(tagged, { personalTag: ["tag-cobrar"], status: ["doing"] }).length, 0);
});

test("resolve menções por nome ignorando acentos e caixa", () => {
  const employees = [{ id: "1", name: "Camila Torres" }, { id: "2", name: "João Mendes" }];
  assert.deepEqual(mentionedEmployees("@CAMILA TORRES revisar e @joao mendes validar", employees).map((item) => item.id), ["1", "2"]);
});

test("resolve @all e @todos como menção para toda a equipe", () => {
  const employees = [{ id: "1", name: "Camila Torres" }, { id: "2", name: "João Mendes" }];
  assert.deepEqual(mentionedEmployees("Aviso: @all", employees).map((item) => item.id), ["1", "2"]);
  assert.deepEqual(mentionedEmployees("Atenção (@todos)!", employees).map((item) => item.id), ["1", "2"]);
});

test("resolve menção pelo apelido carregado do funcionário", () => {
  const employees = [{ id: "1", name: "Renan Martins", apelido: "Renan" }];
  assert.deepEqual(mentionedEmployees("@renan revisar", employees).map((item) => item.id), ["1"]);
});

test("normaliza múltiplos responsáveis", () => {
  assert.deepEqual(normalizeAssigneeNames(["Não atribuído", "Marina", "Marina", "Rafael"]), ["Marina", "Rafael"]);
  assert.deepEqual(normalizeAssigneeNames([]), ["Não atribuído"]);
});

test("separa responsável principal e consultores sem perder a ordem operacional", () => {
  assert.deepEqual(responsibilityFromIds(["e1", "e2", "e3"], "e2"), {
    assigneeIds: ["e2", "e1", "e3"],
    primaryAssigneeId: "e2",
    consultantIds: ["e1", "e3"],
  });
  assert.deepEqual(responsibilityFromIds(["e1", "e2"]), {
    assigneeIds: ["e1", "e2"],
    primaryAssigneeId: "e1",
    consultantIds: ["e2"],
  });
});

test("valida composição de equipe e promove único membro", () => {
  assert.strictEqual(validateTeamComposition([]).valid, false);
  assert.deepEqual(validateTeamComposition(["e1"]), { valid: true, error: "", primaryMemberId: "e1" });
  assert.strictEqual(validateTeamComposition(["e1", "e2"]).valid, false);
  assert.strictEqual(validateTeamComposition(["e1", "e2"], "e2").primaryMemberId, "e2");
});

test("identifica quando a tarefa tem ou não tem responsável", () => {
  assert.strictEqual(hasTaskResponsible({ assigneeIds: ["e1"], assigneeNames: ["Marina"] }), true);
  assert.strictEqual(hasTaskResponsible({ assignmentMode: "team", teamIds: ["team-op"] }), false);
  assert.strictEqual(hasTaskResponsible({ assignmentMode: "team", teamIds: ["team-op"], primaryAssigneeId: "e1" }), true);
  assert.strictEqual(hasTaskResponsible({ assigneeIds: [], assigneeNames: ["Não atribuído"] }), false);
  assert.strictEqual(hasTaskResponsible({ assigneeIds: [], assigneeNames: [] }), false);
});

test("normaliza equipe, preserva seu ícone e expande seus membros no snapshot da tarefa", () => {
  const team = normalizeTeam({ id: "team-op", name: "Operação", iconName: "car", memberIds: ["e1", "e1", "e2"], primaryMemberId: "e2" });
  const assignment = resolveTaskAssignment({ assignmentMode: "team", teamId: team.id }, [team], [{ id: "e1", name: "Marina" }, { id: "e2", name: "Rafael" }]);

  assert.deepEqual(team.memberIds, ["e1", "e2"]);
  assert.strictEqual(team.iconName, "car");
  assert.deepEqual(assignment, { assignmentMode: "team", teamIds: ["team-op"], teamNames: ["Operação"], teamId: "team-op", teamName: "Operação", assigneeIds: ["e2", "e1"], primaryAssigneeId: "e2", consultantIds: ["e1"], assigneeNames: ["Rafael", "Marina"], primaryAssigneeName: "Rafael", consultantNames: ["Marina"] });
});

test("resume somente tarefas abertas cuja responsabilidade é da equipe", () => {
  const summary = teamResponsibilitySummary(
    { id: "team-op", name: "Operação", memberIds: ["e1", "e2"] },
    [
      { id: "1", assignmentMode: "team", teamId: "{TEAM-OP}", assigneeIds: ["e1"], status: "todo" },
      { id: "2", assignmentMode: "team", teamIds: ["team-op"], assigneeIds: ["e1", "e2"], status: "waiting" },
      { id: "3", assignmentMode: "people", teamName: "Operação", assigneeIds: ["e2"], status: "doing" },
      { id: "4", assignmentMode: "team", teamId: "team-op", assigneeIds: ["e2"], status: "done" },
    ],
    [{ id: "e1", name: "Marina" }, { id: "e2", name: "Rafael" }],
  );

  assert.strictEqual(summary.totalTaskCount, 2);
  assert.deepEqual(summary.members.map(({ name }) => name), ["Marina", "Rafael"]);
});

test("expande múltiplas equipes e deduplica membros compartilhados", () => {
  const teams = [
    { id: "team-a", name: "Operação", memberIds: ["e1", "e2"], primaryMemberId: "e2" },
    { id: "team-b", name: "Comercial", memberIds: ["e2", "e3"], primaryMemberId: "e3" },
  ];
  const assignment = resolveTaskAssignment({ assignmentMode: "team", teamIds: ["team-a", "team-b"] }, teams, [{ id: "e1", name: "Marina" }, { id: "e2", name: "Rafael" }, { id: "e3", name: "Camila" }]);

  assert.deepEqual(assignment.teamIds, ["team-a", "team-b"]);
  assert.deepEqual(assignment.assigneeIds, ["e2", "e1", "e3"]);
  assert.strictEqual(assignment.primaryAssigneeId, "e2");
  assert.deepEqual(assignment.consultantIds, ["e1", "e3"]);
  assert.deepEqual(assignment.assigneeNames, ["Rafael", "Marina", "Camila"]);
  const reordered = resolveTaskAssignment({ assignmentMode: "team", teamIds: ["team-b", "team-a"] }, teams, [{ id: "e1", name: "Marina" }, { id: "e2", name: "Rafael" }, { id: "e3", name: "Camila" }]);
  assert.strictEqual(reordered.primaryAssigneeId, "e3");
});

test("migra equipes legadas sem alterar tarefas fora de equipe", () => {
  const migrated = migrateLegacyTeams([
    { id: "task-op", teamName: "Operação", assigneeIds: ["e1"], assigneeNames: ["Marina"] },
    { id: "task-manual", teamName: "Sem equipe", assigneeIds: ["e2"], assigneeNames: ["Rafael"] },
  ], [{ id: "e1", name: "Marina" }, { id: "e2", name: "Rafael" }], ["Operação"]);

  assert.strictEqual(migrated.teams[0].name, "Operação");
  assert.deepEqual(migrated.teams[0].memberIds, ["e1"]);
  assert.strictEqual(migrated.tasks[0].assignmentMode, "team");
  assert.strictEqual(migrated.tasks[0].teamId, "team-operacao");
  assert.strictEqual(migrated.tasks[1].assignmentMode, "people");
  assert.strictEqual(migrated.tasks[1].teamId, "");
});

test("filtra texto ignorando acentos e caixa", () => {
  const accented = [{ ...tasks[0], title: "Revisão de cotação" }];
  assert.strictEqual(filterTasks(accented, { query: "REVISAO COTACAO", status: "", priority: "" }).length, 1);
});

test("calcula indicadores operacionais", () => {
  const stats = taskStats(tasks, new Date("2026-08-03T12:00:00"));
  assert.deepEqual(stats, { open: 2, overdue: 1, today: 1, waiting: 0 });
});

test("ordena tarefas abertas antes das concluídas", () => {
  assert.deepEqual(sortTasks(tasks).map((item) => item.id), ["1", "2", "3"]);
});

test("mantém cada coluna em ordem crescente de prazo", () => {
  const sameColumn = [
    { id: "late", status: "todo", dueDate: "2026-08-20" },
    { id: "early", status: "todo", dueDate: "2026-08-05" },
    { id: "no-date", status: "todo", dueDate: "" },
  ];

  assert.deepEqual(sortTasks(sameColumn).map((item) => item.id), ["early", "late", "no-date"]);
});

test("filtra origem e status aguardando", () => {
  const qualityTask = { ...tasks[1], status: "waiting", sourceType: "quality", sourceLabel: "Erro operacional" };
  assert.strictEqual(filterTasks([tasks[0], qualityTask], { query: "", status: ["waiting"], priority: [], source: ["quality"] }).length, 1);
});

test("ordena Aguardando antes de Em andamento", () => {
  assert.deepEqual(STATUSES.map((item) => item.id), ["todo", "waiting", "doing", "done"]);
});

test("valida contexto mínimo e monta resumo de Aguardando", () => {
  assert.strictEqual(validateWaitingContext("waiting", {}).allowed, false);
  const context = { subject: "confirmação da segunda van", onType: "team", onId: "Operação", onName: "Operação", expectedDate: "2026-08-28", note: "Cobrar parceiro" };
  assert.strictEqual(validateWaitingContext("waiting", context).allowed, true);
  assert.strictEqual(waitingContextSummary(context), "Aguardando confirmação da segunda van · Operação · até 28 ago.");
  assert.strictEqual(validateWaitingContext("doing", {}).allowed, true);
});

test("preserva espaços no assunto de Aguardando durante a edição", () => {
  assert.strictEqual(
    normalizeWaitingContext({ subject: "confirmação da segunda van " }).subject,
    "confirmação da segunda van ",
  );
  assert.strictEqual(
    normalizeWaitingContext({ onType: "external", onName: "Cliente " }).onName,
    "Cliente ",
  );
  assert.strictEqual(
    normalizeWaitingContext({ note: "Cobrar retorno " }).note,
    "Cobrar retorno ",
  );
  assert.strictEqual(
    validateWaitingContext("waiting", {
      subject: "   ",
      onType: "external",
      onNames: ["Cliente XPTO"],
    }).allowed,
    false,
  );
});

test("autoriza o criador, o responsável pelo retorno e membro da equipe", () => {
  const task = {
    status: "waiting",
    creatorEmployeeId: "employee-renan",
    creatorUserId: "user-renan",
    waitingContext: { subject: "confirmação", onType: "employee", onId: "employee-rafael", onName: "Rafael Lima" },
  };
  assert.strictEqual(canRegisterWaitingReturn(task, { id: "employee-renan", userId: "user-renan" }), true);
  assert.strictEqual(canRegisterWaitingReturn(task, { id: "employee-rafael", name: "Rafael Lima" }), true);
  assert.strictEqual(canRegisterWaitingReturn(task, { id: "employee-camila" }), false);
  assert.strictEqual(canRegisterWaitingReturn({ ...task, status: "doing" }, { id: "employee-rafael" }), false);
  assert.strictEqual(canRegisterWaitingReturn({ ...task, waitingContext: { ...task.waitingContext, onType: "team", onId: "team-operation", onName: "Operação" } }, { id: "employee-camila" }, [{ id: "team-operation", name: "Operação", memberIds: ["employee-camila"] }]), true);
});

test("monta responsáveis únicos em ordem alfabética", () => {
  assert.deepEqual(buildAssigneeOptions([{ name: "Rafael Lima" }, { name: "Camila Torres" }, { name: "Camila Torres" }, { name: "" }]), ["Não atribuído", "Camila Torres", "Rafael Lima"]);
});

test("preserva vínculo manual de cotação sem deep-link", () => {
  const created = buildTaskCreationInput({ title: "Acompanhar cliente", quoteId: "quote-1008", quoteCode: "COT-1008", quoteTitle: "Transfer executivo" });

  assert.strictEqual(created.quoteId, "quote-1008");
  assert.strictEqual(created.sourceType, "quote");
  assert.strictEqual(created.quoteCode, "COT-1008");
});

test("localiza tarefa criada por ID novo antes de usar título como fallback", () => {
  const previousTasks = [{ id: "task-existing", title: "Nova tarefa", parentTaskId: null }];
  const nextTasks = [
    ...previousTasks,
    { id: "task-created", title: "Título normalizado pelo Dataverse", parentTaskId: null },
  ];

  assert.strictEqual(findCreatedMainTask(previousTasks, nextTasks, "Nova tarefa")?.id, "task-created");
});

test("cria tarefa otimista pronta para aparecer antes do Dataverse responder", () => {
  const task = buildOptimisticTask({
    title: "Confirmar motorista",
    description: "Validar escala",
    priority: "high",
    assigneeName: "Betinho",
    teamName: "Operação",
    dueDate: "2026-08-13",
  });

  assert.match(task.id, /^optimistic-/);
  assert.strictEqual(task.title, "Confirmar motorista");
  assert.strictEqual(task.status, "todo");
  assert.strictEqual(task.sourceType, "manual");
  assert.strictEqual(task.syncStatus, "syncing");
  assert.deepEqual(task.comments, []);
  assert.deepEqual(task.attachments, []);
});

test("título automático de cotação usa solicitante", () => {
  assert.strictEqual(quoteTaskTitle({ clientContact: "Maria Silva" }), "Cotação - Maria Silva");
  assert.strictEqual(quoteTaskTitle({ code: "COT-42" }), "Cotação");
  assert.strictEqual(quoteTaskTitle({}), "Cotação");
});

test("aplica alteração otimista sem mutar o estado anterior", () => {
  const state = { tasks: [{ ...tasks[0], comments: [], attachments: [] }] };
  const next = applyOptimisticTaskPatch(state, "1", { status: "doing", priority: "low" });

  assert.strictEqual(state.tasks[0].status, "todo");
  assert.strictEqual(next.tasks[0].status, "doing");
  assert.strictEqual(next.tasks[0].priority, "low");
  assert.strictEqual(next.tasks[0].syncStatus, "syncing");
});

test("inclui comentário e anexo provisórios imediatamente", () => {
  const state = { tasks: [{ ...tasks[0], comments: [], attachments: [] }] };
  const withComment = addOptimisticComment(state, "1", "Retorno solicitado");
  const withAttachment = addOptimisticAttachment(withComment, "1", { name: "briefing.pdf" });

  assert.strictEqual(withAttachment.tasks[0]!.comments![0]!.text, "Retorno solicitado");
  assert.strictEqual(withAttachment.tasks[0]!.comments![0]!.syncStatus, "syncing");
  assert.strictEqual(withAttachment.tasks[0]!.attachments![0]!.name, "briefing.pdf");
  assert.strictEqual(withAttachment.tasks[0]!.attachments![0]!.syncStatus, "syncing");
});

test("mantém retorno otimista separado de comentário", () => {
  const state = { tasks: [{ ...tasks[0], comments: [], returns: [], attachments: [] }] };
  const next = addOptimisticReturn(state, "1", { id: "return-1", text: "Confirmado", author: "Rafael" });

  assert.deepEqual(next.tasks[0].comments, []);
  assert.strictEqual(next.tasks[0]!.returns![0]!.text, "Confirmado");
  assert.strictEqual(next.tasks[0]!.returns![0]!.syncStatus, "syncing");
});
