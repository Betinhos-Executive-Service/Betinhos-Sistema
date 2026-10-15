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
