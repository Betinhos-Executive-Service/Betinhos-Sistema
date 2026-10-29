import { useEffect, useRef, useState } from "react";
import type { ToastTone } from "../../shared/ui/LocalToast";
import { expenseSubmissionStorageKey, loadExpenseUploadRowsRemote, resolveExpenseUploadModeRemote } from "../../lib/dataverse";
import { type DriverContext } from "../../data/dataverse/cliente";
import { reportAppError } from "../../shared/appErrorLogger";
import { clearMediaDraft, loadMediaDraft, saveMediaDraft } from "../fotos/mediaDraftStore";
import type { ExpenseSendState } from "./ExpenseSendOverlay";
import type { ExpenseUploadMode } from "./expenseUploadMode";
import { describeExpenseSubmission, normalizeStoredExpenseSubmissions, type ExpenseSubmission, type ExpenseUploadRow } from "./expenseUploadState";

type Options = {
  remoteMode: boolean;
  driverContext: DriverContext | null;
  notify: (message: string, tone?: ToastTone) => void;
  onCriticalError: (message: string) => void;
};

// Envio assíncrono de despesas: diário durável (IndexedDB) das tentativas, acompanhamento dos anexos
// no Dataverse e worker em segundo plano que retoma, tenta de novo e encerra envios sem o motorista esperar.
export function useExpenseUploads({ remoteMode, driverContext, notify, onCriticalError }: Options) {
  const [expenseSubmissions, setExpenseSubmissions] = useState<ExpenseSubmission[]>([]);
  const [expenseUploadRows, setExpenseUploadRows] = useState<Record<string, ExpenseUploadRow[]>>({});
  const [expenseUploadReady, setExpenseUploadReady] = useState(false);
  const [expenseUploadMode, setExpenseUploadMode] = useState<ExpenseUploadMode | "pending">("pending");
  const expenseSubmissionsRef = useRef<ExpenseSubmission[]>([]);
  const expenseJournalQueueRef = useRef<Promise<void>>(Promise.resolve());
  const expenseNoticeRef = useRef(new Set<string>());
  const expenseSubmitBusyRef = useRef(false);
  const [expenseSend, setExpenseSend] = useState<ExpenseSendState | null>(null);
  const expenseRunningRef = useRef(new Set<string>());
  const [expenseRunningIds, setExpenseRunningIds] = useState<string[]>([]);
  const expenseUploadRowsRef = useRef(expenseUploadRows);
  expenseUploadRowsRef.current = expenseUploadRows;
  const expenseAutoResumeAtRef = useRef(new Map<string, number>());
  const expenseAutoRetryCountRef = useRef(new Map<string, number>());
  const expenseUnclaimedSinceRef = useRef(new Map<string, number>());
  const expenseWorkerRef = useRef<{
    run: (submission: ExpenseSubmission, motoristaId: string, retryFailed: boolean) => Promise<boolean>;
    verify: (submission: ExpenseSubmission, announceError: boolean) => Promise<void>;
  } | null>(null);
  const expenseUploadStatuses = expenseSubmissions
    .map(submission => ({
      submission,
      status: expenseRunningIds.includes(submission.expenseId)
        ? { state: "processing" as const, text: "Enviando gasto." }
        : describeExpenseSubmission(submission, expenseUploadRows[submission.expenseId] ?? [])
    }))
    // Only expenses that need attention are listed; normal processing stays silent.
    .filter(entry => entry.status.state !== "complete" && entry.status.state !== "processing");

  // Ref first, then the durable write, serialized so concurrent updates never drop a journal entry.
  const commitExpenseSubmissions = (motoristaId: string, update: (list: ExpenseSubmission[]) => ExpenseSubmission[]) => {
    const list = update(expenseSubmissionsRef.current);
    expenseSubmissionsRef.current = list;
    setExpenseSubmissions([...list]);
    const key = expenseSubmissionStorageKey(motoristaId);
    const write = expenseJournalQueueRef.current.then(() => list.length ? saveMediaDraft({ submissions: list }, key) : clearMediaDraft(key));
    expenseJournalQueueRef.current = write.catch(() => undefined);
    return write;
  };
  const upsertExpenseSubmission = (motoristaId: string, submission: ExpenseSubmission) => commitExpenseSubmissions(motoristaId, list =>
    list.some(item => item.expenseId === submission.expenseId) ? list.map(item => item.expenseId === submission.expenseId ? submission : item) : [...list, submission]);
  const removeExpenseSubmission = (motoristaId: string, expenseId: string) => commitExpenseSubmissions(motoristaId, list => list.filter(item => item.expenseId !== expenseId));

  useEffect(() => {
    if (!remoteMode) return;
    let active = true;
    // Decide pela configuracao do ambiente (Flow assincrono configurado), nao pela URL; nunca rejeita.
    resolveExpenseUploadModeRemote().then(mode => { if (active) setExpenseUploadMode(mode); });
    return () => { active = false; };
  }, [remoteMode]);

  useEffect(() => {
    if (!remoteMode || !driverContext || expenseUploadMode !== "async") return;
    let active = true;
    setExpenseUploadReady(false);
    loadMediaDraft<unknown>(expenseSubmissionStorageKey(driverContext.id)).then(saved => {
      if (!active) return;
      const list = normalizeStoredExpenseSubmissions(saved);
      expenseSubmissionsRef.current = list;
      setExpenseSubmissions(list);
      setExpenseUploadReady(true);
    }).catch(error => { if (active) onCriticalError(error instanceof Error ? error.message : "Falha ao restaurar envio de despesa."); });
    return () => { active = false; };
  }, [remoteMode, driverContext?.id, expenseUploadMode]);

  useEffect(() => {
    const tracked = expenseSubmissions.filter(submission => submission.expenseConfirmed).map(submission => submission.expenseId);
    if (!tracked.length || !remoteMode) return;
    let active = true;
    let busy = false;
    let reportedFailure = false;
    const refresh = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const entries = await Promise.all(tracked.map(async id => [id, await loadExpenseUploadRowsRemote(id)] as const));
        if (active) setExpenseUploadRows(current => ({ ...current, ...Object.fromEntries(entries) }));
        reportedFailure = false;
      } catch (error) {
        if (active && !reportedFailure) reportAppError(error, { severity: "warning", source: "app", action: "expenseUploadStatus", phase: "poll", screen: "gastos", detailId: tracked[0] });
        reportedFailure = true;
      } finally { busy = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    const onVisible = () => { void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [expenseSubmissions, remoteMode]);

  // Background outcome: finished expenses leave the journal; problems are announced once.
  useEffect(() => {
    if (!driverContext) return;
    for (const submission of expenseSubmissionsRef.current) {
      if (expenseRunningIds.includes(submission.expenseId)) continue;
      const status = describeExpenseSubmission(submission, expenseUploadRows[submission.expenseId] ?? []);
      if (status.state === "complete") {
        void removeExpenseSubmission(driverContext.id, submission.expenseId);
      } else if (status.state === "failed" && (expenseAutoRetryCountRef.current.get(submission.expenseId) ?? 0) >= 2 && !expenseNoticeRef.current.has(submission.expenseId)) {
        expenseNoticeRef.current.add(submission.expenseId);
        notify("Um comprovante de gasto não foi anexado. Abra Registrar gasto e toque em Tentar de novo.", "warning");
      }
    }
  }, [expenseUploadRows, expenseSubmissions, expenseRunningIds, driverContext?.id]);

  // Background worker: resumes interrupted sends, retries confirmed failures twice and
  // closes attempts the server never picked up, without the driver having to wait.
  useEffect(() => {
    if (!remoteMode || !driverContext || !expenseUploadReady) return;
    const motoristaId = driverContext.id;
    const tick = () => {
      const worker = expenseWorkerRef.current;
      if (!worker || !navigator.onLine) return;
      const now = Date.now();
      for (const submission of expenseSubmissionsRef.current) {
        const id = submission.expenseId;
        if (expenseRunningRef.current.has(id) || now - (expenseAutoResumeAtRef.current.get(id) ?? 0) < 30000) continue;
        const status = describeExpenseSubmission(submission, expenseUploadRowsRef.current[id] ?? []);
        if (status.state !== "unclaimed") expenseUnclaimedSinceRef.current.delete(id);
        if (status.state === "interrupted") {
          expenseAutoResumeAtRef.current.set(id, now);
          void worker.run(submission, motoristaId, false);
        } else if (status.state === "failed" && (expenseAutoRetryCountRef.current.get(id) ?? 0) < 2) {
          expenseAutoResumeAtRef.current.set(id, now);
          expenseAutoRetryCountRef.current.set(id, (expenseAutoRetryCountRef.current.get(id) ?? 0) + 1);
          void worker.run(submission, motoristaId, true);
        } else if (status.state === "unclaimed") {
          const since = expenseUnclaimedSinceRef.current.get(id) ?? now;
          expenseUnclaimedSinceRef.current.set(id, since);
          if (now - since < 120000) continue;
          expenseAutoResumeAtRef.current.set(id, now);
          expenseUnclaimedSinceRef.current.delete(id);
          void worker.verify(submission, false);
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 10000);
    window.addEventListener("online", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("online", tick); };
  }, [remoteMode, driverContext?.id, expenseUploadReady]);

  return {
    expenseAutoResumeAtRef,
    expenseNoticeRef,
    expenseRunningRef,
    expenseSend,
    setExpenseSend,
    expenseSubmissionsRef,
    expenseSubmitBusyRef,
    expenseUploadMode,
    expenseUploadReady,
    expenseUploadRows,
    setExpenseUploadRows,
    expenseUploadStatuses,
    expenseWorkerRef,
    setExpenseRunningIds,
    upsertExpenseSubmission
  };
}
