import {
  findExpenseCategory,
  findExpenseCategoryByName,
  getExpenseCategoryRules,
  type ExpenseCityOption,
  type ExpenseDraft,
  type ExpenseReferenceData
} from "./expenses.ts";

export type QuickReadLeitura = {
  legivel: boolean;
  valor: number | null;
  data: string | null;
  hora: string | null;
  estabelecimento: string | null;
  cnpj: string | null;
  litros: number | null;
  /** Município do endereço impresso (flow a partir de 15/10/2026); ausente nas respostas antigas. */
  cidade?: string | null;
  uf?: string | null;
  categoria_sugerida: string | null;
  forma_pagamento_sugerida: string | null;
  motivo_ilegivel: string | null;
};

export type QuickReadOutcome = { kind: "lido"; leitura: QuickReadLeitura } | { kind: "ilegivel" } | { kind: "falha" };

export function parseQuickReadResponse(body: unknown): QuickReadOutcome {
  if (!body || typeof body !== "object") return { kind: "falha" };
  const value = body as { ok?: unknown; leitura?: Partial<QuickReadLeitura> };
  if (value.ok !== true || !value.leitura || typeof value.leitura.legivel !== "boolean") return { kind: "falha" };
  if (!value.leitura.legivel) return { kind: "ilegivel" };
  return { kind: "lido", leitura: value.leitura as QuickReadLeitura };
}

const formatDecimal = (value: number, minDigits: number, maxDigits = minDigits) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits, useGrouping: false });

/** Preenche só os campos vazios: o que o motorista já digitou nunca é sobrescrito. */
export type ApplyQuickReadOptions = {
  /** A data do rascunho é a automática (hoje) e o motorista não a alterou: pode ser trocada pela data lida. */
  replaceAutoDate?: boolean;
  /** Hoje (AAAA-MM-DD) em America/Sao_Paulo; padrão: agora. */
  today?: string;
};

/** A leitura pode definir a data: rascunho sem data ou com a data automática que o motorista não mexeu. */
const canSetQuickReadDate = (draft: ExpenseDraft, options: ApplyQuickReadOptions) => !draft.dataGasto || Boolean(options.replaceAutoDate);

const normalizeCityText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Cidade lida → id da lista do app: nome + UF exatos; senão só o nome, se for único; senão vazio. */
export function matchQuickReadCity(cities: ExpenseCityOption[], cidade: string | null | undefined, uf: string | null | undefined) {
  const name = normalizeCityText(cidade ?? "");
  if (!name) return "";
  const sameName = cities.filter((city) => normalizeCityText(city.name.split(" - ")[0] ?? city.name) === name);
  const state = (uf ?? "").trim().toUpperCase();
  if (state) {
    // Com UF lida, só o par nome + UF vale; UF que não bate fica vazia.
    const exact = sameName.filter((city) => city.uf.toUpperCase() === state);
    return exact.length === 1 ? exact[0].id : "";
  }
  return sameName.length === 1 ? sameName[0].id : "";
}

/** "Hoje" no fuso da operação (AAAA-MM-DD). */
export function todayInSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Despesa lida vale de hoje até 3 dias atrás. */
export const QUICK_READ_DATE_WINDOW_DAYS = 3;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayNumber = (iso: string) => {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return time / 86_400_000;
};

/**
 * Data lida → data da despesa: aceita só [hoje − 3 dias, hoje]. Fora disso tenta o mesmo dia/mês no ano atual e no
 * anterior (ano trocado pelo OCR, virada do ano). Sem data ou ainda fora da janela: vazio.
 */
export function resolveQuickReadDate(read: string | null | undefined, today: string) {
  const todayNumber = dayNumber(today);
  if (!read || todayNumber === null) return "";
  const inWindow = (iso: string) => {
    const value = dayNumber(iso);
    return value !== null && value <= todayNumber && value >= todayNumber - QUICK_READ_DATE_WINDOW_DAYS;
  };
  if (inWindow(read)) return read;
  const match = ISO_DATE.exec(read);
  if (!match) return "";
  const year = Number(today.slice(0, 4));
  for (const candidateYear of [year, year - 1]) {
    const candidate = `${candidateYear}-${match[2]}-${match[3]}`;
    if (inWindow(candidate)) return candidate;
  }
  return "";
}

export const QUICK_READ_DESCRIPTION_MAX = 120;

/** Descrição curta e determinística: "Categoria · Nome fantasia · 32,5 L" (litros só quando a categoria exige). */
export function buildQuickReadDescription(input: { categoria: string; estabelecimento: string | null; litros: number | null; exigeLitros: boolean }) {
  const parts = [input.categoria.trim(), (input.estabelecimento ?? "").trim()];
  if (input.exigeLitros && input.litros !== null && input.litros > 0) parts.push(`${formatDecimal(input.litros, 0, 3)} L`);
  const text = parts.filter(Boolean).join(" · ");
  return text.length > QUICK_READ_DESCRIPTION_MAX ? `${text.slice(0, QUICK_READ_DESCRIPTION_MAX - 1).trimEnd()}…` : text;
}

export function applyQuickReadToDraft(
  draft: ExpenseDraft,
  leitura: QuickReadLeitura,
  referenceData: ExpenseReferenceData,
  options: ApplyQuickReadOptions = {}
): ExpenseDraft {
  const next = { ...draft };
  if (!next.categoriaId && leitura.categoria_sugerida) next.categoriaId = findExpenseCategoryByName(referenceData, [leitura.categoria_sugerida])?.id ?? "";
  // Forma de pagamento fica com o motorista: a leitura não preenche.
  if (!next.valor && leitura.valor !== null) next.valor = formatDecimal(leitura.valor, 2);
  if (canSetQuickReadDate(draft, options)) next.dataGasto = resolveQuickReadDate(leitura.data, options.today ?? todayInSaoPaulo());
  if (!next.estabelecimento && leitura.estabelecimento) next.estabelecimento = leitura.estabelecimento.trim();
  const rules = getExpenseCategoryRules(findExpenseCategory(referenceData, next.categoriaId));
  if (!next.litros && rules.exigeLitros && leitura.litros !== null) next.litros = formatDecimal(leitura.litros, 0, 3);
  if (!next.cidadeId) next.cidadeId = matchQuickReadCity(referenceData.cities, leitura.cidade, leitura.uf);
  if (!next.descricao) {
    next.descricao = buildQuickReadDescription({
      categoria: findExpenseCategory(referenceData, next.categoriaId)?.name ?? "",
      estabelecimento: leitura.estabelecimento,
      litros: leitura.litros,
      exigeLitros: rules.exigeLitros
    });
  }
  return next;
}

export const QUICK_READ_MAX_TENTATIVAS = 3;
/** Tempo total da leitura (listas + imagem + flow). Passou disso, segue para o preenchimento manual. */
export const QUICK_READ_TIMEOUT_MS = 20_000;
/** A partir daqui a tela de leitura avisa que está demorando mais que o normal. */
export const QUICK_READ_SLOW_NOTICE_MS = 8_000;
/** Duração do passo "Enviando foto" antes de mostrar "Lendo valor e data". */
export const QUICK_READ_SEND_STEP_MS = 1_500;
/** Tempo em que "Preenchendo despesa" fica visível antes de abrir o formulário. */
export const QUICK_READ_FILL_STEP_MS = 450;

export type QuickReadStatus = "idle" | "lendo" | "preenchido" | "ilegivel" | "manual";
export type QuickReadState = { status: QuickReadStatus; tentativas: number };
export const INITIAL_QUICK_READ: QuickReadState = { status: "idle", tentativas: 0 };

export function shouldRunQuickRead(state: QuickReadState) {
  return state.status === "idle" || state.status === "ilegivel";
}

/** Começa uma leitura. Sem internet não tenta: vai direto para o preenchimento manual. */
export function startQuickReadState(state: QuickReadState, env: { online: boolean }): QuickReadState {
  return { ...state, status: env.online ? "lendo" : "manual" };
}

/**
 * Enquanto lê, a tela de gastos mostra só a leitura; com foto ilegível (1ª e 2ª), a tela de nova foto;
 * nos demais estados (lido, falha, offline, 3ª ilegível), o formulário.
 */
export function expenseFlowView(state: QuickReadState): "leitura" | "ilegivel" | "formulario" {
  if (state.status === "lendo") return "leitura";
  if (state.status === "ilegivel") return "ilegivel";
  return "formulario";
}

export type QuickReadProgress = { step: 0 | 1 | 2; slow: boolean };

/** Passos da tela de leitura: 0 enviando foto, 1 lendo valor e data, 2 preenchendo despesa (só com o resultado). */
export function quickReadProgress(elapsedMs: number, filling: boolean): QuickReadProgress {
  if (filling) return { step: 2, slow: false };
  return { step: elapsedMs < QUICK_READ_SEND_STEP_MS ? 0 : 1, slow: elapsedMs >= QUICK_READ_SLOW_NOTICE_MS };
}

/** Listas vindas do Dataverse. As listas padrão do app usam ids locais (local-*), que não existem no Dataverse. */
export function hasRemoteReferenceData(data: ExpenseReferenceData) {
  const isRemoteId = (id: string) => Boolean(id) && !id.startsWith("local-");
  return data.categories.length > 0 && data.paymentMethods.length > 0 &&
    data.categories.every((item) => isRemoteId(item.id)) && data.paymentMethods.every((item) => isRemoteId(item.id));
}

export type QuickReadPipelineDeps = {
  referenceData: ExpenseReferenceData;
  isReferenceReady: (data: ExpenseReferenceData) => boolean;
  loadReferenceData: () => Promise<ExpenseReferenceData>;
  prepareImage: () => Promise<string>;
  read: (imagemBase64: string, categorias: string[], formasPagamento: string[], timeoutMs: number) => Promise<unknown>;
  timeoutMs?: number;
};

export type QuickReadPipelineResult = { outcome: QuickReadOutcome; referenceData: ExpenseReferenceData | null };

/**
 * Leitura completa com um só prazo: espera as listas de categoria e forma de pagamento (sem ids locais), prepara a
 * imagem e chama o flow com o tempo que sobrou. Qualquer erro, lista ausente ou estouro de prazo vira falha (manual).
 */
export async function runQuickReadPipeline(deps: QuickReadPipelineDeps): Promise<QuickReadPipelineResult> {
  const timeoutMs = deps.timeoutMs ?? QUICK_READ_TIMEOUT_MS;
  const startedAt = Date.now();
  const failure: QuickReadPipelineResult = { outcome: { kind: "falha" }, referenceData: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<QuickReadPipelineResult>((resolve) => {
    timer = setTimeout(() => resolve(failure), timeoutMs);
  });
  const work = (async (): Promise<QuickReadPipelineResult> => {
    try {
      const referencePromise = deps.isReferenceReady(deps.referenceData)
        ? Promise.resolve(deps.referenceData)
        : deps.loadReferenceData().catch(() => null);
      const [referenceData, base64] = await Promise.all([referencePromise, deps.prepareImage()]);
      if (!referenceData || !deps.isReferenceReady(referenceData)) return failure;
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) return failure;
      const body = await deps.read(
        base64,
        referenceData.categories.map((category) => category.name),
        referenceData.paymentMethods.map((method) => method.name),
        remaining
      );
      return { outcome: parseQuickReadResponse(body), referenceData };
    } catch {
      return failure;
    }
  })();
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export type QuickReadFilledFields = Partial<Record<keyof ExpenseDraft, string>>;

/** Campos que a leitura preencheu (valor depois da leitura diferente do anterior). */
export function quickReadFilledFields(before: ExpenseDraft, after: ExpenseDraft): QuickReadFilledFields {
  const filled: QuickReadFilledFields = {};
  for (const key of Object.keys(after) as Array<keyof ExpenseDraft>) {
    if (after[key] && after[key] !== before[key]) filled[key] = after[key];
  }
  return filled;
}

/** Aplica a leitura e diz o que destacar; a data é destacada sempre que veio da leitura, mesmo igual à de hoje. */
export function applyQuickRead(before: ExpenseDraft, leitura: QuickReadLeitura, referenceData: ExpenseReferenceData, options: ApplyQuickReadOptions = {}) {
  const draft = applyQuickReadToDraft(before, leitura, referenceData, options);
  const filled = quickReadFilledFields(before, draft);
  if (canSetQuickReadDate(before, options) && draft.dataGasto) filled.dataGasto = draft.dataGasto;
  return { draft, filled };
}

/** Destaque some quando o motorista muda o campo. */
export function isQuickReadFieldHighlighted(draft: ExpenseDraft, filled: QuickReadFilledFields, key: keyof ExpenseDraft) {
  return filled[key] !== undefined && draft[key] === filled[key];
}

export function nextQuickReadState(state: QuickReadState, outcome: QuickReadOutcome): QuickReadState {
  if (outcome.kind === "lido") return { status: "preenchido", tentativas: state.tentativas + 1 };
  if (outcome.kind === "falha") return { status: "manual", tentativas: state.tentativas };
  const tentativas = state.tentativas + 1;
  return { status: tentativas >= QUICK_READ_MAX_TENTATIVAS ? "manual" : "ilegivel", tentativas };
}

export const QUICK_READ_MAX_SIDE = 1600;

export function quickReadTargetSize(width: number, height: number) {
  const scale = Math.min(1, QUICK_READ_MAX_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Reduz a foto para no máximo 1600 px no maior lado, JPEG 0,8, e devolve o base64 sem o prefixo data:. */
export async function downscaleForQuickRead(dataUrl: string): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const { width, height } = quickReadTargetSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponivel para a leitura rapida.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.8).replace(/^data:image\/jpeg;base64,/, "");
}
