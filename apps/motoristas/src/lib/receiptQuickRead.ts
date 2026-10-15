import {
  findExpenseCategory,
  findExpenseCategoryByName,
  findExpensePaymentMethodByName,
  getExpenseCategoryRules,
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
export function applyQuickReadToDraft(draft: ExpenseDraft, leitura: QuickReadLeitura, referenceData: ExpenseReferenceData): ExpenseDraft {
  const next = { ...draft };
  if (!next.categoriaId && leitura.categoria_sugerida) next.categoriaId = findExpenseCategoryByName(referenceData, [leitura.categoria_sugerida])?.id ?? "";
  if (!next.formaPagamentoId && leitura.forma_pagamento_sugerida) next.formaPagamentoId = findExpensePaymentMethodByName(referenceData, [leitura.forma_pagamento_sugerida])?.id ?? "";
  if (!next.valor && leitura.valor !== null) next.valor = formatDecimal(leitura.valor, 2);
  if (!next.dataGasto && leitura.data) next.dataGasto = leitura.data;
  if (!next.estabelecimento && leitura.estabelecimento) next.estabelecimento = leitura.estabelecimento.trim();
  const rules = getExpenseCategoryRules(findExpenseCategory(referenceData, next.categoriaId));
  if (!next.litros && rules.exigeLitros && leitura.litros !== null) next.litros = formatDecimal(leitura.litros, 0, 3);
  return next;
}

export const QUICK_READ_MAX_TENTATIVAS = 3;
export const QUICK_READ_TIMEOUT_MS = 10_000;

export type QuickReadStatus = "idle" | "lendo" | "preenchido" | "ilegivel" | "manual";
export type QuickReadState = { status: QuickReadStatus; tentativas: number };
export const INITIAL_QUICK_READ: QuickReadState = { status: "idle", tentativas: 0 };

export function shouldRunQuickRead(state: QuickReadState) {
  return state.status === "idle" || state.status === "ilegivel";
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
