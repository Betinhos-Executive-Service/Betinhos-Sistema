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
