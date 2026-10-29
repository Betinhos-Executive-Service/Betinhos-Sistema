export const OPTIONS = {
  errorStatus: {
    100000000: "Novo",
    100000002: "Em tratamento",
    100000003: "Aguardando terceiro",
    100000004: "Resolvido",
    100000005: "Encerrado",
    100000006: "Cancelado",
  },
  severity: {
    100000000: "Baixa",
    100000001: "Média",
    100000002: "Alta",
    100000003: "Crítica",
  },
  category: {
    100000000: "Planejamento",
    100000001: "Escala de motorista",
    100000002: "Veículo",
    100000003: "Comunicação",
    100000004: "Atendimento ao passageiro",
    100000005: "Fornecedor",
    100000006: "Financeiro/Cobrança",
    100000007: "Tecnologia/Sistema",
    100000008: "Documentação",
    100000009: "Outro",
  },
  origin: {
    100000000: "Monitoramento",
    100000001: "Motorista",
    100000002: "Passageiro/Cliente",
    100000003: "Operação",
    100000004: "Fornecedor",
    100000005: "Sistema",
    100000006: "Auditoria",
    100000007: "Outro",
  },
  actionStatus: {
    100000000: "Planejada",
    100000001: "Em andamento",
    100000002: "Aguardando",
    100000003: "Concluída",
    100000004: "Cancelada",
  },
  actionType: {
    100000000: "Correção imediata",
    100000001: "Ação corretiva",
    100000002: "Ação preventiva",
    100000003: "Retorno/Follow-up",
  },
  priority: {
    100000000: "Baixa",
    100000001: "Média",
    100000002: "Alta",
    100000003: "Crítica",
  },
};

export const CHOICE_FIELDS = [
  { key: "category", label: "Categorias", entity: "cr40f_errooperacional", attribute: "cr40f_categoria", mode: "full", protectedValues: [100000000], description: "Classifica a natureza do erro operacional." },
  { key: "origin", label: "Origens do relato", entity: "cr40f_errooperacional", attribute: "cr40f_origem", mode: "full", protectedValues: [100000003], description: "Indica de onde a ocorrência foi identificada." },
  { key: "actionType", label: "Tipos de ação", entity: "cr40f_acaooperacional", attribute: "cr40f_tipoacao", mode: "full", protectedValues: [100000001], description: "Organiza as ações corretivas, preventivas e retornos." },
  { key: "severity", label: "Gravidades", entity: "cr40f_errooperacional", attribute: "cr40f_gravidade", mode: "labels", protectedValues: [], description: "Escala estrutural usada nos indicadores e destaques." },
  { key: "priority", label: "Prioridades", entity: "cr40f_acaooperacional", attribute: "cr40f_prioridade", mode: "labels", protectedValues: [], description: "Escala estrutural usada na ordenação da agenda." },
  { key: "errorStatus", label: "Status das ocorrências", entity: "cr40f_errooperacional", attribute: "cr40f_status", mode: "labels", protectedValues: [], description: "Fluxo protegido: os valores controlam regras de resolução e encerramento." },
  { key: "actionStatus", label: "Status das ações", entity: "cr40f_acaooperacional", attribute: "cr40f_status", mode: "labels", protectedValues: [], description: "Fluxo protegido: os valores controlam conclusão, atraso e cancelamento." },
];

export const choiceEntries = (source) =>
  Object.entries(source).map(([value, label]) => ({ value: Number(value), label }));

const DAY_IN_MS = 86400000;
const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function defaultChoiceDefinitions() {
  return CHOICE_FIELDS.map((field) => ({
    ...field,
    options: choiceEntries(OPTIONS[field.key]).map((option) => ({
      ...option,
      locked: field.mode !== "full" || field.protectedValues.includes(option.value),
    })),
  }));
}

export function applyChoiceDefinitions(definitions) {
  for (const definition of definitions || []) {
    if (!OPTIONS[definition.key]) continue;
    for (const key of Object.keys(OPTIONS[definition.key])) delete OPTIONS[definition.key][key];
    for (const option of definition.options || []) OPTIONS[definition.key][option.value] = option.label;
  }
}

export function validateChoiceLabel(label, options = [], currentValue = null) {
  const normalized = String(label || "").trim().replace(/\s+/g, " ");
  if (normalized.length < 2) return "Informe um nome com pelo menos 2 caracteres.";
  if (normalized.length > 100) return "Use no máximo 100 caracteres.";
  const duplicate = options.some((option) => option.value !== currentValue && option.label.localeCompare(normalized, "pt-BR", { sensitivity: "accent" }) === 0);
  if (duplicate) return "Já existe uma opção com esse nome.";
  return "";
}

export function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return (withTime ? DATE_TIME_FORMATTER : DATE_FORMATTER).format(date);
}

export function isOpenError(item) {
  return ![100000004, 100000005, 100000006].includes(Number(item.cr40f_status));
}

export function isOpenAction(item) {
  return ![100000003, 100000004].includes(Number(item.cr40f_status));
}

export function isOverdue(item, now = new Date()) {
  return Boolean(item.cr40f_prazo) && isOpenAction(item) && new Date(item.cr40f_prazo) < now;
}

export function calculateStats(errors, actions, now = new Date()) {
  const resolvedLimit = new Date(now);
  resolvedLimit.setDate(resolvedLimit.getDate() - 30);
  let open = 0;
  let critical = 0;
  let resolved30 = 0;
  let durationSum = 0;
  let durationCount = 0;

  for (const item of errors) {
    const openError = isOpenError(item);
    if (openError) {
      open += 1;
      if (Number(item.cr40f_gravidade) === 100000003) critical += 1;
    }

    if (!item.cr40f_dataresolucao) continue;
    const resolutionDate = new Date(item.cr40f_dataresolucao);
    if (!(resolutionDate >= resolvedLimit)) continue;
    resolved30 += 1;

    const duration = (resolutionDate - new Date(item.cr40f_dataocorrencia)) / DAY_IN_MS;
    if (Number.isFinite(duration) && duration >= 0) {
      durationSum += duration;
      durationCount += 1;
    }
  }

  let overdue = 0;
  for (const item of actions) {
    if (isOverdue(item, now)) overdue += 1;
  }

  return {
    open,
    critical,
    overdue,
    resolved30,
    averageDays: durationCount ? durationSum / durationCount : 0,
  };
}

export function filterErrors(errors, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("pt-BR");
  const selectedIds = (value) =>
    new Set((Array.isArray(value) ? value : value ? [value] : []).map(String));
  const statusIds = selectedIds(filters.status);
  const categoryIds = selectedIds(filters.category);
  const severityIds = selectedIds(filters.severity);
  const responsibleIds = selectedIds(filters.responsible);
  const fromTime = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
  const toTime = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : null;
  return errors.filter((item) => {
    if (query) {
      const haystack = [
        item.cr40f_codigo,
        item.cr40f_titulo,
        item.cr40f_reservanome,
        item.cr40f_motoristanome,
        item.cr40f_veiculonome,
        item.cr40f_responsavelnome,
      ].join(" ").toLocaleLowerCase("pt-BR");
      if (!haystack.includes(query)) return false;
    }
    if (statusIds.size && !statusIds.has(String(item.cr40f_status))) return false;
    if (categoryIds.size && !categoryIds.has(String(item.cr40f_categoria))) return false;
    if (severityIds.size && !severityIds.has(String(item.cr40f_gravidade))) return false;
    if (responsibleIds.size && !responsibleIds.has(String(item.cr40f_responsavelid))) return false;
    if (fromTime !== null || toTime !== null) {
      const occurrenceTime = new Date(item.cr40f_dataocorrencia).getTime();
      if (fromTime !== null && occurrenceTime < fromTime) return false;
      if (toTime !== null && occurrenceTime > toTime) return false;
    }
    return true;
  });
}

export function sortErrors(errors, sort = "recent") {
  const copy = [...errors];
  if (sort === "severity") return copy.sort((a, b) => Number(b.cr40f_gravidade) - Number(a.cr40f_gravidade));
  if (sort === "deadline") return copy.sort((a, b) => new Date(a.cr40f_prazoresolucao || 8640000000000000) - new Date(b.cr40f_prazoresolucao || 8640000000000000));
  return copy.sort((a, b) => new Date(b.cr40f_dataocorrencia) - new Date(a.cr40f_dataocorrencia));
}

function normalizedId(value) {
  return String(value || "").replace(/[{}]/g, "").toLowerCase();
}

export function isAssignedToUser(item, userId) {
  const currentUserId = normalizedId(userId);
  if (!currentUserId) return false;
  return [item.cr40f_responsavelid, item._cr40f_responsavel_value, item._ownerid_value]
    .some((value) => normalizedId(value) === currentUserId);
}

export function agendaActions(actions, mode = "week", now = new Date(), status = "all", assignee = "all", userId = "") {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startTime = start.getTime();
  const todayEnd = startTime + DAY_IN_MS;
  const weekEnd = startTime + (7 * DAY_IN_MS);
  const nowTime = now.getTime();
  const matches = [];

  for (const item of actions) {
    const openAction = isOpenAction(item);
    const dueValue = item.cr40f_prazo;
    const dueTime = dueValue ? new Date(dueValue).getTime() : Number.NaN;
    const overdue = Boolean(dueValue) && openAction && dueTime < nowTime;

    if (status === "pending" && !openAction) continue;
    if (status === "overdue" && !overdue) continue;
    if (assignee === "mine" && !isAssignedToUser(item, userId)) continue;
    const targetTime = item.cr40f_agendadoem
      ? new Date(item.cr40f_agendadoem).getTime()
      : dueTime;

    if (mode === "overdue" && !overdue) continue;
    if (mode === "today" && !(targetTime >= startTime && targetTime < todayEnd)) continue;
    if (mode === "week" && !(targetTime >= startTime && targetTime < weekEnd)) continue;

    matches.push({ item, targetTime });
  }

  return matches
    .sort((a, b) => a.targetTime - b.targetTime)
    .map(({ item }) => item);
}

export function validateError(form) {
  if (!form.cr40f_titulo?.trim()) return "Informe o título do erro.";
  if (!form.cr40f_dataocorrencia) return "Informe a data da ocorrência.";
  if (!form.cr40f_descricao?.trim()) return "Descreva o que aconteceu.";
  if ([100000004, 100000005].includes(Number(form.cr40f_status)) && !form.cr40f_solucao?.trim()) {
    return "Informe a solução antes de resolver ou encerrar.";
  }
  return "";
}

export function validateAction(form) {
  if (!form.cr40f_titulo?.trim()) return "Informe o título da ação.";
  if (!form.cr40f_descricao?.trim()) return "Descreva a ação.";
  if (!form.cr40f_prazo) return "Informe o prazo da ação.";
  if (!form.responsavelId) return "Selecione o responsável.";
  if (Number(form.cr40f_status) === 100000003 && !form.cr40f_resultado?.trim()) {
    return "Informe o resultado antes de concluir.";
  }
  return "";
}
