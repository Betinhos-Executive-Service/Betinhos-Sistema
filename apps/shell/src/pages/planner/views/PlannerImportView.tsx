// Porte de Tela Planner/src/PlannerImportView.jsx (sem mudança de comportamento).
import { plannerPortalRoot } from '../components/portalRoot'
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FileJson,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import {
  analyzePlannerImport,
  graphQueryUrls,
  importPriorityLabel,
  importStatusLabel,
  plannerDetailBatches,
} from '../domain/plannerImport';
import { acquirePlannerToken, getMicrosoftAccount, getRedirectBridgeStatus, loginMicrosoft, msalConfigured } from '../data/msal';
import { fetchPlannerExport, fetchPlannerPlans } from '../domain/plannerGraph';
import SearchableSelect from '../components/SearchableSelect';
const STEPS = [
  { id: 1, label: "Começar" },
  { id: 2, label: "Tarefas" },
  { id: 3, label: "Buckets" },
  { id: 4, label: "Detalhes" },
  { id: 5, label: "Responsáveis" },
  { id: 6, label: "Revisar" },
];

function legacyCopyText(value: any) {
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("aria-hidden", "true");
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  helper.style.top = "0";
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  helper.setSelectionRange(0, helper.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  helper.remove();
  return copied;
}

async function copyText(value: any) {
  // Execute dentro do clique, antes de qualquer await, para preservar a user activation do iframe.
  if (legacyCopyText(value)) return true;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // O fallback visual abaixo cobre WebResource, iframe e navegadores sem permissao de clipboard.
    }
  }
  return false;
}

function CopyButton({ value, label = "Copiar" }: any) {
  const [copied, setCopied] = useState<any>(false);
  const [copyFailed, setCopyFailed] = useState<any>(false);
  const fallbackRef = useRef<any>(null);
  const copy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      setCopied(false);
      setCopyFailed(true);
      window.requestAnimationFrame(() => {
        fallbackRef.current?.focus();
        fallbackRef.current?.select();
      });
    }
  };
  return <span className="import-copy-control"><button className="button button-tertiary import-copy-button" type="button" onClick={(event) => { event.stopPropagation(); copy(); }}><Copy size={14} />{copied ? "Copiado" : copyFailed ? "Selecione e copie" : label}</button>{copyFailed && <span className="import-copy-fallback"><textarea ref={fallbackRef} readOnly value={value} rows={2} aria-label="Texto para copiar manualmente" onFocus={(event) => event.currentTarget.select()} /><small>O navegador bloqueou a cópia automática. Pressione Ctrl+C.</small></span>}</span>;
}

function JsonField({ label, hint, value, onChange, required = false, rows = 8 }: any) {
  return (
    <label className="import-json-field">
      <span><strong>{label}</strong>{required ? <em>Obrigatório</em> : <small>Opcional</small>}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} spellCheck="false" placeholder="Cole o JSON aqui…" />
      <small>{hint}</small>
    </label>
  );
}

function Metric({ value, label, tone = "" }: any) {
  return <div className={`import-metric ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function IssueList({ title, items, warning = false }: any) {
  if (!items.length) return null;
  return <div className={`import-issues ${warning ? "is-warning" : "is-error"}`}><strong>{title}</strong><ul>{items.map((item: any) => <li key={item}>{item}</li>)}</ul></div>;
}

function parseEmployeeMap(text: any) {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function authErrorMessage(error: any) {
  if (error?.errorCode === "interaction_in_progress") {
    return "Já existe uma janela de login Microsoft aberta. Feche-a, atualize esta página e clique em Conectar Microsoft uma única vez.";
  }
  if (error?.errorCode === "redirect_bridge_origin_mismatch") {
    return `${error.message} Abra o app na mesma origem cadastrada no Microsoft Entra ID.`;
  }
  if (error?.errorCode === "timed_out" || error?.subError === "redirect_bridge_timeout") {
    return "A Microsoft não devolveu o login para esta página. Confirme se o redirect bridge está publicado e cadastrado no Microsoft Entra ID, feche o popup e tente novamente.";
  }
  return error?.message || "Não foi possível conectar a conta Microsoft.";
}

function plannerErrorMessage(error: any) {
  const message = String(error?.message || "");
  if (/\b401\b/.test(message)) return "A sessão Microsoft expirou. Clique em Trocar conta e conecte novamente.";
  if (/\b403\b/.test(message)) return "A conta entrou, mas não tem permissão para ler este plano. Confirme que ela é membro do plano e que Tasks.Read foi concedida no Microsoft Entra ID.";
  if (/\b404\b/.test(message)) return "Este plano não foi encontrado ou a conta não tem acesso a ele. Atualize os planos e tente novamente.";
  if (/\b429\b/.test(message)) return "A Microsoft limitou temporariamente as consultas. Aguarde alguns segundos e tente novamente.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) return "Não foi possível acessar a Microsoft Graph. Verifique a conexão e tente novamente.";
  return message || "Não foi possível carregar os dados do Microsoft Planner.";
}

export default function PlannerImportView({ live, onImport, employees = [] }: any) {
  const [open, setOpen] = useState<any>(false);
  const [step, setStep] = useState<any>(1);
  const [planId, setPlanId] = useState<any>("");
  const [tasksText, setTasksText] = useState<any>("");
  const [bucketsText, setBucketsText] = useState<any>("");
  const [detailsText, setDetailsText] = useState<any>("");
  const [categoryDescriptions, setCategoryDescriptions] = useState<any>({});
  const [categoryDescriptionsText, setCategoryDescriptionsText] = useState<any>("");
  const [employeeMapText, setEmployeeMapText] = useState<any>("");
  const [analysis, setAnalysis] = useState<any>(null);
  const [confirmed, setConfirmed] = useState<any>(false);
  const [importing, setImporting] = useState<any>(false);
  const [result, setResult] = useState<any>(null);
  const [submitError, setSubmitError] = useState<any>("");
  const [microsoftAccount, setMicrosoftAccount] = useState<any>(null);
  const [plannerUsers, setPlannerUsers] = useState<any>([]);
  const [plans, setPlans] = useState<any>([]);
  const [plansBusy, setPlansBusy] = useState<any>(false);
  const [authBusy, setAuthBusy] = useState<any>(false);
  const [autoBusy, setAutoBusy] = useState<any>(false);
  const [autoProgress, setAutoProgress] = useState<any>(null);
  const [autoError, setAutoError] = useState<any>("");
  const [autoWarning, setAutoWarning] = useState<any>("");
  const redirectStatus = getRedirectBridgeStatus();
  const [mode, setMode] = useState<any>(msalConfigured ? "automatic" : "manual");
  const urls = useMemo(() => graphQueryUrls(planId), [planId]);
  const detailBatches = useMemo(() => plannerDetailBatches(tasksText), [tasksText]);
  const employeeMap = useMemo(() => parseEmployeeMap(employeeMapText), [employeeMapText]);
  const workflowSteps = mode === "automatic"
    ? [{ id: 1, label: "Conta" }, { id: 5, label: "Ajustes" }, { id: 6, label: "Confirmar" }]
    : STEPS;
  const workflowStepNumber = (id: any) => workflowSteps.findIndex((item) => item.id === id) + 1;
  const modalBusy = importing || autoBusy || plansBusy || authBusy;
  const selectedPlanName = plans.find((plan: any) => plan.id === planId)?.displayName || "";
  const missingDetails = Boolean(analysis && analysis.stats.detailsRequired > analysis.stats.detailsLoaded);

  const loadPlans = async () => {
    setPlansBusy(true);
    setAutoError("");
    setAutoWarning("");
    setAutoProgress(null);
    try {
      const token = await acquirePlannerToken();
      const nextPlans = await fetchPlannerPlans({ token, onProgress: setAutoProgress });
      setPlans(nextPlans);
      const nextPlanId = nextPlans.length === 1 ? nextPlans[0].id : "";
      setPlanId((current: any) => nextPlans.some((plan) => plan.id === current) ? current : nextPlanId);
      if (!nextPlans.length) setAutoWarning("Nenhum plano foi encontrado para esta conta Microsoft.");
      if (nextPlans.length === 1) window.queueMicrotask(() => collectAutomatically(nextPlanId));
    } catch (error: any) {
      setAutoError(plannerErrorMessage(error));
    } finally {
      setPlansBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !msalConfigured) return;
    getMicrosoftAccount().then((account) => {
      setMicrosoftAccount(account);
      if (account) loadPlans();
    }).catch(() => {
      setMicrosoftAccount(null);
      setPlans([]);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: any) => {
      if (event.key === "Escape" && !modalBusy) setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, modalBusy]);

  const runValidation = () => {
    const next = analyzePlannerImport({ planId, tasksText, bucketsText, detailsText, employeeMapText, categoryDescriptions: mode === "automatic" ? categoryDescriptions : {}, categoryDescriptionsText: mode === "manual" ? categoryDescriptionsText : "" });
    setAnalysis(next);
    setConfirmed(false);
    setSubmitError("");
    return next;
  };

  const connectMicrosoft = async () => {
    setAuthBusy(true);
    setAutoError("");
    try {
      const account = await loginMicrosoft();
      setMicrosoftAccount(account);
      setPlans([]);
      setPlanId("");
      setAnalysis(null);
      setPlannerUsers([]);
      setAuthBusy(false);
      await loadPlans();
    } catch (error: any) {
      setAutoError(authErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const changeMicrosoftAccount = async () => {
    setAuthBusy(true);
    setAutoError("");
    try {
      const account = await loginMicrosoft();
      setMicrosoftAccount(account);
      setPlans([]);
      setPlannerUsers([]);
      setPlanId("");
      setAnalysis(null);
      setConfirmed(false);
      setAuthBusy(false);
      await loadPlans();
    } catch (error: any) {
      setAutoError(authErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const switchToAutomatic = async () => {
    setMode("automatic");
    setStep(1);
    setAutoError("");
    setAutoWarning("");
    if (microsoftAccount) await loadPlans();
  };

  const collectAutomatically = async (selectedPlanId = planId) => {
    const targetPlanId = String(selectedPlanId || "").trim();
    if (!targetPlanId || autoBusy) return;
    setAutoBusy(true);
    setAutoError("");
    setAutoWarning("");
    try {
      const token = await acquirePlannerToken();
      const exported = await fetchPlannerExport({
        planId: targetPlanId,
        token,
        employees,
        onProgress: setAutoProgress,
      });
      setTasksText(exported.tasksText);
      setBucketsText(exported.bucketsText);
      setDetailsText(exported.detailsText);
      setCategoryDescriptions(exported.categoryDescriptions || {});
      setCategoryDescriptionsText("");
      setEmployeeMapText(exported.employeeMapText);
      setPlannerUsers(exported.plannerUsers || []);
      setAutoWarning(exported.userWarning || "");
      setAutoProgress({ stage: "ready", label: "Dados prontos para revisão." });
      const nextAnalysis = analyzePlannerImport({ planId: targetPlanId, tasksText: exported.tasksText, bucketsText: exported.bucketsText, detailsText: exported.detailsText, employeeMapText: exported.employeeMapText, categoryDescriptions: exported.categoryDescriptions || {} });
      setAnalysis(nextAnalysis);
      setStep(nextAnalysis.unresolvedAssignees.length ? 5 : 6);
    } catch (error: any) {
      setAutoError(plannerErrorMessage(error));
    } finally {
      setAutoBusy(false);
    }
  };

  const goNext = () => {
    if (step === 1 && !planId.trim()) return;
    if (mode === "automatic" && step === 1) {
      collectAutomatically();
      return;
    }
    if (step === 5) {
      const next = runValidation();
      if (next.canImport) setStep(6);
      return;
    }
    setStep((current: any) => Math.min(6, current + 1));
  };

  const goBack = () => {
    const currentIndex = workflowSteps.findIndex((item) => item.id === step);
    setStep(workflowSteps[Math.max(0, currentIndex - 1)]?.id || 1);
  };

  const updateEmployeeMapping = (graphUserId: any, employeeId: any) => {
    const nextEmployeeMapText = JSON.stringify({ ...employeeMap, [graphUserId]: employeeId }, null, 2);
    setEmployeeMapText(nextEmployeeMapText);
    setAnalysis(analyzePlannerImport({ planId, tasksText, bucketsText, detailsText, employeeMapText: nextEmployeeMapText, categoryDescriptions: mode === "automatic" ? categoryDescriptions : {}, categoryDescriptionsText: mode === "manual" ? categoryDescriptionsText : "" }));
    setConfirmed(false);
  };

  const handlePlanChange = (nextPlanId: any) => {
    setPlanId(nextPlanId);
    setAnalysis(null);
    setCategoryDescriptions({});
    setCategoryDescriptionsText("");
    setConfirmed(false);
    if (nextPlanId) collectAutomatically(nextPlanId);
  };

  const switchToManual = () => {
    setCategoryDescriptions({});
    setCategoryDescriptionsText("");
    setMode("manual");
  };

  const submit = async () => {
    if (!analysis?.canImport || !confirmed || importing) return;
    setImporting(true);
    setSubmitError("");
    try {
      const imported = await onImport(analysis.rows);
      setResult(imported);
      setStep(6);
    } catch (error: any) {
      setSubmitError(error?.message || "Não foi possível importar as tarefas.");
    } finally {
      setImporting(false);
    }
  };

  const retryAutomaticSearch = () => {
    if (mode === "automatic") collectAutomatically();
  };

  const resetWizard = () => {
    setResult(null);
    setAnalysis(null);
    setCategoryDescriptions({});
    setCategoryDescriptionsText("");
    setPlannerUsers([]);
    setConfirmed(false);
    setSubmitError("");
    setStep(1);
  };

  const handleBackdropClick = (event: any) => {
    if (event.target === event.currentTarget && !modalBusy) setOpen(false);
  };

  return (
    <>
      <button className="panel setting-card planner-import-card" type="button" onClick={() => setOpen(true)}>
        <span className="setting-icon setting-icon-blue"><UploadCloud size={19} /></span>
        <span>
          <span className="setting-card-title">Importar tarefas</span>
          <span className="setting-card-description">Traga tarefas do Microsoft Planner com revisão antes de gravar no app.</span>
          <span className="button button-secondary planner-import-card-action"><UploadCloud size={15} />Começar importação</span>
        </span>
      </button>

      {open && createPortal(
        <div className="import-modal-layer" role="presentation" onMouseDown={handleBackdropClick}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="planner-import-title" aria-describedby="planner-import-description">
            <header className="import-modal-header">
              <div>
                <span className="eyebrow">Migração controlada</span>
                <h2 id="planner-import-title">Importar tarefas do Microsoft Planner</h2>
                <p id="planner-import-description">Uma etapa por vez. Nada é gravado antes da sua confirmação final.</p>
              </div>
              <button className="icon-button import-modal-close" type="button" aria-label="Fechar importação" onClick={() => setOpen(false)} disabled={modalBusy}><X size={19} /></button>
            </header>

            <div className="import-modal-body">
              <div className="import-steps" aria-label="Etapas da importação">
                {workflowSteps.map((item, index) => <button key={item.id} type="button" className={`import-step ${step === item.id ? "is-active" : ""} ${step > item.id ? "is-done" : ""}`} onClick={() => item.id < step && setStep(item.id)} disabled={item.id > step}><span>{step > item.id ? <Check size={14} /> : index + 1}</span>{item.label}</button>)}
              </div>

              {!live && <div className="import-blocked"><AlertTriangle size={18} /><div><strong>Modo de teste local</strong><span>A importação fica salva neste navegador. “Restaurar mock” remove essas tarefas e volta ao cenário inicial.</span></div></div>}

              {step === 1 && (
                <div className="import-step-content">
                  <div className="import-step-kicker">
                    <span className="import-step-number">1</span>
                    <div>
                      <strong>Comece pelo plano</strong>
                      <span>{mode === "automatic" ? "Conecte a conta Microsoft e o app buscará tudo sozinho." : "Informe o ID e cole as respostas do Microsoft Graph nas próximas etapas."}</span>
                    </div>
                  </div>

                  {msalConfigured && (
                    <div className="import-auth-card">
                      <div className="import-auth-heading">
                        <ShieldCheck size={19} />
                        <div>
                          <strong>Importação automática</strong>
                          <span>Sem copiar URLs, sem montar lotes e sem repetir requisições.</span>
                        </div>
                      </div>

                      {microsoftAccount ? (
                        <div className="import-account-row">
                          <span>
                            <strong>{microsoftAccount.name || microsoftAccount.username}</strong>
                            <small>{microsoftAccount.username}</small>
                          </span>
                          <button className="button button-quiet" type="button" onClick={changeMicrosoftAccount} disabled={authBusy || plansBusy || autoBusy}>
                            {authBusy ? "Abrindo login…" : plansBusy ? "Carregando planos…" : "Trocar conta"}
                          </button>
                        </div>
                      ) : (
                        <button className="button button-primary" type="button" onClick={connectMicrosoft} disabled={!redirectStatus.valid || authBusy || autoBusy}>
                          {authBusy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}
                          {authBusy ? "Abrindo login…" : "Conectar Microsoft"}
                        </button>
                      )}

                      {!redirectStatus.valid && <IssueList title="Abra o app no endereço correto" items={[`Esta página está em ${window.location.origin}. Para o login voltar ao app, abra ${redirectStatus.expectedOrigin || "o endereço cadastrado no Microsoft Entra ID"}.`]} warning />}

                      <label className="import-input-label">
                        <span><strong>Plano</strong><em>Obrigatório</em></span>
                        <SearchableSelect
                          value={planId}
                          onChange={handlePlanChange}
                          options={[{ value: "", label: plansBusy ? "Carregando seus planos…" : plans.length ? "Selecione um plano" : "Nenhum plano disponível" }, ...plans.map((plan: any) => ({ value: plan.id, label: plan.displayName }))]}
                          placeholder={plansBusy ? "Carregando seus planos…" : plans.length ? "Selecione um plano" : "Nenhum plano disponível"}
                          disabled={plansBusy || autoBusy || !plans.length}
                          required
                          clearable={false}
                          aria-label="Plano obrigatório"
                          className="planner-import-plan-select"
                        />
                        <small>{plans.length ? "Selecione pelo nome. A busca começa automaticamente; o identificador fica oculto." : "Conecte a conta para carregar os planos disponíveis."}</small>
                      </label>

                      {microsoftAccount && <button className="import-manual-switch" type="button" onClick={loadPlans} disabled={plansBusy || autoBusy}><RefreshCw size={13} className={plansBusy ? "spin" : ""} /> Atualizar planos</button>}

                      {microsoftAccount && (
                        <button className="button button-secondary import-auto-button" type="button" onClick={collectAutomatically} disabled={!planId.trim() || autoBusy || authBusy || plansBusy}>
                          {autoBusy ? <LoaderCircle size={15} className="spin" /> : <UploadCloud size={15} />}
                          {autoBusy ? autoProgress?.label || "Buscando dados…" : "Buscar e preparar tudo"}
                        </button>
                      )}

                      {autoProgress && (
                        <div className="import-progress" aria-live="polite">
                          <div>
                            <strong>{autoProgress.label}</strong>
                            {autoProgress.total > 0 && <span>{autoProgress.completed || 0} de {autoProgress.total}</span>}
                          </div>
                          {autoProgress.total > 0 && <progress value={autoProgress.completed || 0} max={autoProgress.total} />}
                        </div>
                      )}
                      {autoError && <IssueList title="Não foi possível conectar" items={[autoError]} />}
                      {autoWarning && <IssueList title="Atenção" items={[autoWarning]} warning />}
                    </div>
                  )}

                  {msalConfigured && (
                    <button className="import-manual-switch" type="button" onClick={switchToManual}>
                      Usar importação manual com JSON
                    </button>
                  )}

                  {mode === "manual" && (
                    <>
                      <label className="import-input-label">
                        <span><strong>ID do plano</strong><em>Obrigatório</em></span>
                        <input value={planId} onChange={(event) => setPlanId(event.target.value.trim())} placeholder="Ex.: urbQSMNVBk27gbeEEF7WpWUAFuVG" />
                      </label>
                      <div className="import-howto">
                        <strong>Importação manual</strong>
                        <span>A outra pessoa deve abrir o Graph Explorer com a conta que tem acesso ao plano. Você só precisa trazer os JSONs para cá.</span>
                      </div>
                      {msalConfigured && <button className="import-manual-switch" type="button" onClick={switchToAutomatic}><ShieldCheck size={13} /> Voltar para importação automática</button>}
                    </>
                  )}
                </div>
              )}

              {step === 2 && <div className="import-step-content">
                <div className="import-step-kicker"><span className="import-step-number">2</span><div><strong>Traga as tarefas</strong><span>Copie a resposta completa da consulta de tarefas e cole abaixo.</span></div></div>
                <div className="import-query-row"><div><small>Consulta desta etapa</small><code>{urls.tasks}</code></div><CopyButton value={urls.tasks} /><a className="import-external-link" href={urls.graphExplorer} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir Graph Explorer</a></div>
                <JsonField label="Resposta de tarefas" required value={tasksText} onChange={setTasksText} rows={15} hint="Pode ser uma resposta única, várias páginas em um array ou um pacote com tasks." />
                <div className="import-paste-note"><ShieldCheck size={16} /><span>Não edite o JSON. O app identifica os campos do Microsoft Planner sozinho.</span></div>
              </div>}

              {step === 3 && <div className="import-step-content">
                <div className="import-step-kicker"><span className="import-step-number">3</span><div><strong>Traga os buckets</strong><span>Copie a resposta de buckets e cole. Esta etapa é opcional.</span></div></div>
                <div className="import-query-row"><div><small>Consulta desta etapa</small><code>{urls.buckets}</code></div><CopyButton value={urls.buckets} /><a className="import-external-link" href={urls.graphExplorer} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir Graph Explorer</a></div>
                <JsonField label="Resposta de buckets" value={bucketsText} onChange={setBucketsText} rows={15} hint={`Consulta: ${urls.buckets}`} />
                <div className="import-query-row"><div><small>Consulta das tags do Planner</small><code>{urls.categoryDescriptions}</code></div><CopyButton value={urls.categoryDescriptions} /><a className="import-external-link" href={urls.graphExplorer} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir Graph Explorer</a></div>
                <JsonField label="Descrições das categorias (tags)" value={categoryDescriptionsText} onChange={setCategoryDescriptionsText} rows={8} hint='Cole a resposta completa ou somente o objeto categoryDescriptions, por exemplo: { "category1": "VIP" }.' />
                <div className="import-paste-note"><ShieldCheck size={16} /><span>Se você não tiver buckets, clique em Continuar. As tarefas ainda serão importadas.</span></div>
              </div>}

              {step === 4 && <div className="import-step-content">
                <div className="import-step-kicker"><span className="import-step-number">4</span><div><strong>Busque os detalhes em lote</strong><span>O app já separou as tarefas em lotes de até 20 consultas. Você não precisa montar nada.</span></div></div>
                <div className="import-query-row"><div><small>Endpoint desta etapa</small><code>{urls.batch}</code></div><CopyButton value={urls.batch} /><a className="import-external-link" href={urls.graphExplorer} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir Graph Explorer</a></div>
                {detailBatches.error && <div className="import-issues is-error"><strong>Não foi possível montar os lotes</strong><ul><li>{detailBatches.error}</li></ul></div>}
                {!detailBatches.error && <><div className="import-batch-summary"><strong>{detailBatches.detailTaskCount || 0} tarefa(s) precisam de detalhes</strong><span>{detailBatches.batches.length ? `${detailBatches.batches.length} lote(s) pronto(s). Copie, execute no Graph Explorer e repita para cada lote.` : "Nenhum lote é necessário para este conjunto de tarefas."}</span></div>{detailBatches.batches.map((batch) => <details className="import-batch-card" key={batch.id} open={batch.id === 1}><summary><span><strong>Lote {batch.id}</strong><small>{batch.taskCount} consulta(s) de detalhe</small></span><CopyButton value={JSON.stringify(batch.payload, null, 2)} label="Copiar JSON do lote" /></summary><textarea readOnly value={JSON.stringify(batch.payload, null, 2)} rows={Math.min(12, batch.taskCount + 3)} aria-label={`JSON do lote ${batch.id}`} /></details>)}</>}
                <JsonField label="Respostas dos lotes" value={detailsText} onChange={setDetailsText} rows={12} hint="Cole aqui as respostas do Graph. Se houver mais de um lote, junte as respostas em um array." />
                <div className="import-paste-note"><ShieldCheck size={16} /><span>Execute cada lote no Graph Explorer e cole as respostas juntas neste campo. O app associa cada resposta à tarefa automaticamente.</span></div>
              </div>}

              {step === 5 && <div className="import-step-content">
                <div className="import-step-kicker"><span className="import-step-number">{workflowStepNumber(5)}</span><div><strong>{mode === "automatic" ? "Confira os responsáveis" : "Relacione os responsáveis"}</strong><span>{mode === "automatic" ? "O app tentou relacionar cada pessoa Microsoft ao funcionário correspondente." : "Converta o ID Microsoft de cada pessoa para o funcionário do seu app."}</span></div></div>
                {mode === "automatic" && <>
                  {analysis?.unresolvedAssignees?.length ? <div className="import-assignee-map">{analysis.unresolvedAssignees.map(({ graphUserId, taskCount }: any) => { const user = plannerUsers.find((item: any) => item.id === graphUserId); return <label className="import-assignee-map-row" key={graphUserId}><span><strong>{user?.displayName || "Responsável Microsoft"}</strong><small>{user?.email || `${taskCount} tarefa(s) atribuída(s)`}</small></span><SearchableSelect value={employeeMap[graphUserId] || ""} onChange={(value: any) => updateEmployeeMapping(graphUserId, value)} options={[{ value: "", label: "Selecione o funcionário" }, ...employees.map((employee: any) => ({ value: employee.id, label: employee.name }))]} placeholder="Selecione o funcionário" clearable={false} aria-label={`Funcionário para ${user?.displayName || "Responsável Microsoft"}`} /></label>; })}</div> : <div className="import-paste-note"><CheckCircle2 size={16} /><span>Todos os responsáveis foram relacionados automaticamente pelo e-mail Microsoft.</span></div>}
                </>}
                {mode === "manual" && <div className="import-two-columns"><JsonField label="Mapa de responsáveis" value={employeeMapText} onChange={setEmployeeMapText} rows={10} hint={'Ex.: { "ID_MICROSOFT": "GUID_FUNCIONARIO" }'} /><div className="import-map-help"><strong>Copie este modelo</strong><p>Use o ID Microsoft que aparece em <code>assignments</code> e o GUID do funcionário correspondente no Dataverse.</p><div className="import-map-example"><code>{'{\n  "3389545f-…": "GUID_DO_FUNCIONARIO"\n}'}</code><CopyButton value={'{\n  "ID_MICROSOFT": "GUID_DO_FUNCIONARIO"\n}'} label="Copiar modelo" /></div></div></div>}
                {analysis && <><div className="import-metrics"><Metric value={analysis.stats.tasks} label="tarefas" /><Metric value={analysis.stats.detailsLoaded} label="detalhes carregados" tone={analysis.stats.detailsLoaded === analysis.stats.detailsRequired ? "is-good" : "is-warning"} /><Metric value={analysis.stats.checklistTaskCount} label="com checklist" /><Metric value={analysis.stats.taggedTaskCount} label="com tags" tone={analysis.stats.taggedTaskCount ? "is-good" : ""} /><Metric value={analysis.stats.unresolvedAssignees} label="responsáveis pendentes" tone={analysis.stats.unresolvedAssignees ? "is-warning" : "is-good"} /></div><IssueList title="Corrija antes de continuar" items={analysis.errors} /><IssueList title="Observações" items={analysis.warnings} warning />{mode === "automatic" && missingDetails && <button className="button button-secondary" type="button" onClick={retryAutomaticSearch} disabled={autoBusy}><RefreshCw size={15} className={autoBusy ? "spin" : ""} />{autoBusy ? "Buscando detalhes…" : "Tentar buscar detalhes novamente"}</button>}{mode === "automatic" && autoError && <IssueList title="Não foi possível repetir a busca" items={[autoError]} />}{mode === "automatic" && autoWarning && <IssueList title="Atenção" items={[autoWarning]} warning />}</>}
              </div>}

              {step === 6 && <div className="import-step-content">
                {result ? <div className="import-success"><CheckCircle2 size={29} /><h3>Importação concluída</h3><p>{result.createdCount || 0} tarefa(s) criada(s). {result.existingCount || 0} já existia(m) e não foi(ram) duplicada(s).</p><button className="button button-secondary" type="button" onClick={resetWizard}>Nova importação</button></div> : <><div className="import-step-kicker"><span className="import-step-number">{workflowStepNumber(6)}</span><div><strong>Revise e confirme</strong><span>Confira o resumo. O botão final só libera depois da sua confirmação.</span></div></div>{analysis && <><div className="import-review-banner"><strong>{analysis.stats.tasks} tarefas serão avaliadas</strong><span>{selectedPlanName ? `Plano: ${selectedPlanName} · ` : ""}Origem: {mode === "automatic" ? "Microsoft Planner autenticado" : "manual"} · sem vínculo automático com cotação ou qualidade.</span></div><div className="import-review-grid"><div><small>Status</small><p>{Object.entries(analysis.stats.statusCounts).map(([key, count]: any) => `${count} ${importStatusLabel(key)}`).join(" · ")}</p></div><div><small>Prioridade</small><p>{Object.entries(analysis.stats.priorityCounts).map(([key, count]: any) => `${count} ${importPriorityLabel(key)}`).join(" · ")}</p></div><div><small>Checklist</small><p>{analysis.stats.checklistTaskCount} tarefa(s) com itens preservados.</p></div><div><small>Tags</small><p>{analysis.stats.taggedTaskCount} tarefa(s) com tags do Planner.</p></div></div><IssueList title="Observações" items={analysis.warnings} warning />{mode === "automatic" && autoWarning && <IssueList title="Atenção" items={[autoWarning]} warning />}{mode === "automatic" && missingDetails && <button className="button button-secondary" type="button" onClick={retryAutomaticSearch} disabled={autoBusy}><RefreshCw size={15} className={autoBusy ? "spin" : ""} />{autoBusy ? "Buscando detalhes…" : "Tentar buscar detalhes novamente"}</button>}{mode === "automatic" && autoError && <IssueList title="Não foi possível repetir a busca" items={[autoError]} />}<IssueList title="Corrija antes de continuar" items={analysis.errors} /><label className="import-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Eu conferi os dados e autorizo a gravação {live ? "no Dataverse" : "no mock local"}.</strong><small>{live ? "Esta etapa cria registros e relações de responsáveis. Tarefas já importadas serão ignoradas." : "Os registros ficam neste navegador até você clicar em “Restaurar mock”."}</small></span></label></>}</>}
                {submitError && <div className="import-issues is-error"><strong>Não foi possível concluir</strong><ul><li>{submitError}</li></ul></div>}
              </div>}
            </div>

            {!result && <footer className="import-footer"><button className="button button-secondary" type="button" onClick={goBack} disabled={step === 1 || importing}><ArrowLeft size={15} />Voltar</button><span>Etapa {Math.max(1, workflowSteps.findIndex((item) => item.id === step) + 1)} de {workflowSteps.length}</span>{!(mode === "automatic" && step === 1) && (step < 6 ? <button className="button button-primary" type="button" onClick={goNext} disabled={(step === 1 && (!planId.trim() || plansBusy || autoBusy)) || (step === 2 && !tasksText.trim())}><ArrowRight size={15} />{step === 5 ? "Validar e revisar" : "Continuar"}</button> : <button className="button button-primary" type="button" onClick={submit} disabled={!analysis?.canImport || !confirmed || importing}>{importing ? <LoaderCircle size={15} className="spin" /> : <UploadCloud size={15} />}{importing ? "Importando…" : "Importar tarefas"}</button>)}</footer>}
          </section>
        </div>,
        plannerPortalRoot(),
      )}
    </>
  );
}
