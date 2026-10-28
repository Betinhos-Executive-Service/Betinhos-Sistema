import type { ExpenseDraft } from "./expenses.types.ts";

export const ATTACHMENT_STATUS = { pending: 100000000, sent: 100000001, failed: 100000002, processing: 100000004 } as const;

export type ExpenseUploadItem = {
  id: string;
  attemptId: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  order: number;
  dispatchStarted: boolean;
  previousAttemptId?: string;
};

export type ExpenseSubmission = {
  expenseId: string;
  expenseConfirmed: boolean;
  draft: ExpenseDraft;
  payload: Record<string, unknown>;
  motoristaId: string;
  vehicleId?: string;
  items: ExpenseUploadItem[];
};

export type ExpenseUploadRow = {
  cr40f_anexodespesaoperacionalid: string;
  cr40f_status: number;
  new_uploadattemptid: string;
  new_uploaderror?: string;
};

export function summarizeExpenseUploads(items: ExpenseUploadItem[], rows: ExpenseUploadRow[]) {
  const matched = items.map(item => rows.find(row => row.cr40f_anexodespesaoperacionalid === item.id && row.new_uploadattemptid === item.attemptId));
  const sent = matched.filter(row => row?.cr40f_status === ATTACHMENT_STATUS.sent).length;
  const failed = matched.filter(row => row?.cr40f_status === ATTACHMENT_STATUS.failed).length;
  const pending = items.length - sent - failed;
  return { sent, failed, pending, complete: sent === items.length, canRetry: pending === 0 && failed > 0 };
}

export function canDispatchExpenseUpload(item: ExpenseUploadItem, row?: ExpenseUploadRow) {
  return !item.dispatchStarted && row?.cr40f_status === ATTACHMENT_STATUS.pending && row.new_uploadattemptid === item.attemptId;
}

export type ExpenseSubmissionStatus = {
  state: "interrupted" | "processing" | "unclaimed" | "failed" | "complete";
  text: string;
  action?: "continue" | "retry" | "verify";
};

// The journal holds several expenses so a slow receipt never blocks the next one.
export function normalizeStoredExpenseSubmissions(value: unknown): ExpenseSubmission[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray((value as { submissions?: unknown }).submissions)) return (value as { submissions: ExpenseSubmission[] }).submissions;
  return typeof (value as ExpenseSubmission).expenseId === "string" ? [value as ExpenseSubmission] : [];
}

export function describeExpenseSubmission(submission: ExpenseSubmission, rows: ExpenseUploadRow[]): ExpenseSubmissionStatus {
  if (!submission.expenseConfirmed || submission.items.some(item => !item.dispatchStarted || item.previousAttemptId)) {
    return { state: "interrupted", text: "Aguardando conexão para enviar.", action: "continue" };
  }
  const summary = summarizeExpenseUploads(submission.items, rows);
  if (summary.complete) return { state: "complete", text: "Comprovante anexado." };
  if (summary.canRetry) return { state: "failed", text: "Comprovante não foi anexado.", action: "retry" };
  const unclaimed = submission.items.some(item => rows.some(row => row.cr40f_anexodespesaoperacionalid === item.id && row.new_uploadattemptid === item.attemptId && row.cr40f_status === ATTACHMENT_STATUS.pending));
  if (unclaimed) return { state: "unclaimed", text: "Servidor ainda não confirmou o comprovante.", action: "verify" };
  const done = summary.sent + summary.failed;
  return { state: "processing", text: submission.items.length > 1 ? `Anexando comprovantes (${done} de ${submission.items.length}).` : "Anexando comprovante." };
}
