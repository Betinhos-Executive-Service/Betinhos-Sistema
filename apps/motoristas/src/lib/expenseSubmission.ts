import { canDispatchExpenseUpload, type ExpenseSubmission, type ExpenseUploadRow } from "./expenseUploadState.ts";

export type ExpenseSubmissionDependencies = {
  save: (value: ExpenseSubmission) => Promise<void>;
  ensure: (value: ExpenseSubmission) => Promise<void>;
  loadRows: (id: string) => Promise<ExpenseUploadRow[]>;
  retry: (id: string, attempt: string, next: string) => Promise<unknown>;
  dispatch: (item: ExpenseSubmission["items"][number]) => Promise<void>;
  report: (error: unknown, attachmentId: string, attemptId: string) => void;
};

// Journal changes before every mutation, including a retry and the dispatch itself.
export async function resumeExpenseSubmission(submission: ExpenseSubmission, deps: ExpenseSubmissionDependencies, retryFailed = false) {
  await deps.save(submission);
  await deps.ensure(submission);
  submission.expenseConfirmed = true;
  await deps.save(submission);
  let rows = await deps.loadRows(submission.expenseId);
  for (const item of submission.items) {
    let row = rows.find(value => value.cr40f_anexodespesaoperacionalid === item.id);
    if (retryFailed && row?.cr40f_status === 100000002 && row.new_uploadattemptid === item.attemptId) {
      item.previousAttemptId = item.attemptId;
      item.attemptId = crypto.randomUUID();
      item.dispatchStarted = false;
      await deps.save(submission);
    }
    if (item.previousAttemptId) {
      if (row?.new_uploadattemptid === item.previousAttemptId && row.cr40f_status === 100000002) {
        await deps.retry(item.id, item.previousAttemptId, item.attemptId);
      }
      rows = await deps.loadRows(submission.expenseId);
      row = rows.find(value => value.cr40f_anexodespesaoperacionalid === item.id);
      if (row?.new_uploadattemptid !== item.attemptId) continue;
      delete item.previousAttemptId;
      await deps.save(submission);
    }
    if (!canDispatchExpenseUpload(item, row)) continue;
    item.dispatchStarted = true;
    await deps.save(submission);
    try { await deps.dispatch(item); }
    catch (error) { deps.report(error, item.id, item.attemptId); }
  }
  return deps.loadRows(submission.expenseId);
}
