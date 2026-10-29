import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { cleanGuid, dataverse, EVIDENCE_FOLDERS, formattedLookup, TABLES } from "./dataverse";
import { reportAppError, setErrorScreen } from "./appErrorLogger";
import { applyChoiceDefinitions, calculateStats, defaultChoiceDefinitions, filterErrors, sortErrors } from "./domain";
import { ActionForm, Drawer, ErrorDetails, ErrorForm } from "./forms";
import { SettingsView } from "./settings";
import { AgendaView, AppShell, Dashboard, OccurrencesView, ReportsView } from "./views";
import "./qualidade.css";

const localInput = (value = new Date()) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const isoOrNull = (value) => value ? new Date(value).toISOString() : null;

const emptyError = () => ({
  cr40f_titulo: "", cr40f_dataocorrencia: localInput(), cr40f_prazoresolucao: "",
  cr40f_categoria: 100000000, cr40f_gravidade: 100000001, cr40f_status: 100000000,
  cr40f_origem: 100000003, cr40f_descricao: "", cr40f_impacto: "", cr40f_causa: "",
  cr40f_solucao: "", cr40f_impactofinanceiro: "", reservaId: "", motoristaId: "",
  veiculoId: "", responsavelId: "",
});

const emptyAction = (erroId = "") => ({
  erroId, cr40f_titulo: "", cr40f_descricao: "", cr40f_tipoacao: 100000001,
  cr40f_status: 100000000, cr40f_prioridade: 100000001, cr40f_agendadoem: localInput(),
  cr40f_prazo: localInput(new Date(Date.now() + 86400000)), cr40f_resultado: "", responsavelId: "",
});

function getLaunchParameters() {
  // No shell os parâmetros vêm na query do hash (`#/qualidade?errorId=...`); a da página segue valendo.
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash || "";
  const hashParams = new URLSearchParams(hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "");
  for (const [key, value] of hashParams) if (!params.has(key)) params.set(key, value);
  const data = params.get("data") || "";
  const launch = new URLSearchParams(data.replace(/^\?/, ""));
  const reservaId = params.get("reservaId") || launch.get("reservaId") || "";
  const errorId = params.get("errorId") || launch.get("errorId") || "";
  const actionId = params.get("actionId") || launch.get("actionId") || "";
  return { reservaId: reservaId.replace(/[{}]/g, "").trim().toLowerCase(), errorId: errorId.replace(/[{}]/g, "").trim().toLowerCase(), actionId: actionId.replace(/[{}]/g, "").trim().toLowerCase() };
}

function normalizeError(item) {
  return {
    ...item,
    cr40f_reservaid: item.cr40f_reservaid || item._cr40f_reserva_value || "",
    cr40f_motoristaid: item.cr40f_motoristaid || item._cr40f_motorista_value || "",
    cr40f_veiculoid: item.cr40f_veiculoid || item._cr40f_veiculo_value || "",
    cr40f_responsavelid: item.cr40f_responsavelid || item._cr40f_responsavel_value || "",
    cr40f_reservanome: item.cr40f_reservanome || formattedLookup(item, "_cr40f_reserva_value"),
    cr40f_motoristanome: item.cr40f_motoristanome || formattedLookup(item, "_cr40f_motorista_value"),
    cr40f_veiculonome: item.cr40f_veiculonome || formattedLookup(item, "_cr40f_veiculo_value"),
    cr40f_responsavelnome: item.cr40f_responsavelnome || formattedLookup(item, "_cr40f_responsavel_value"),
  };
}

function normalizeAction(item) {
  return {
    ...item,
    cr40f_erroid: item.cr40f_erroid || item._cr40f_erro_value || "",
    cr40f_responsavelid: item.cr40f_responsavelid || item._cr40f_responsavel_value || "",
    cr40f_erronome: item.cr40f_erronome || formattedLookup(item, "_cr40f_erro_value"),
    cr40f_responsavelnome: item.cr40f_responsavelnome || formattedLookup(item, "_cr40f_responsavel_value"),
  };
}

function errorToForm(item) {
  return {
    ...item,
    cr40f_dataocorrencia: localInput(item.cr40f_dataocorrencia),
    cr40f_prazoresolucao: item.cr40f_prazoresolucao ? localInput(item.cr40f_prazoresolucao) : "",
    cr40f_impacto: item.cr40f_impacto || "",
    cr40f_causa: item.cr40f_causa || "",
    cr40f_solucao: item.cr40f_solucao || "",
    cr40f_impactofinanceiro: item.cr40f_impactofinanceiro || "",
    reservaId: item.cr40f_reservaid || "", motoristaId: item.cr40f_motoristaid || "",
    veiculoId: item.cr40f_veiculoid || "", responsavelId: item.cr40f_responsavelid || "",
  };
}

function actionToForm(item) {
  return {
    ...item, erroId: item.cr40f_erroid, responsavelId: item.cr40f_responsavelid,
    cr40f_agendadoem: item.cr40f_agendadoem ? localInput(item.cr40f_agendadoem) : "",
    cr40f_prazo: item.cr40f_prazo ? localInput(item.cr40f_prazo) : "",
    cr40f_resultado: item.cr40f_resultado || "",
  };
}

export default function App({ embedded = false }) {
  const [active, setActive] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState([]);
  const [actions, setActions] = useState([]);
  const [choiceDefinitions, setChoiceDefinitions] = useState(defaultChoiceDefinitions);
  const [lookups, setLookups] = useState({ reservations: [], employees: [], vehicles: [] });
  const [filters, setFilters] = useState({ query: "", status: [], category: [], severity: [], responsible: [], from: "", to: "" });
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [agendaMode, setAgendaMode] = useState("week");
  const [agendaStatus, setAgendaStatus] = useState("pending");
  const [agendaAssignee, setAgendaAssignee] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [notes, setNotes] = useState([]);
  const [evidences, setEvidences] = useState([]);
  const [errorEditor, setErrorEditor] = useState(null);
  const [actionEditor, setActionEditor] = useState(null);
  const access = useMemo(() => dataverse.getAccessProfile(), []);

  const loadData = async () => {
    setLoading(true); setErrorMessage("");
    try {
      const [errorRows, actionRows, employees, vehicles] = await Promise.all([
        dataverse.listAll(TABLES.error, "?$orderby=createdon desc&$top=250"),
        dataverse.listAll(TABLES.action, "?$orderby=cr40f_prazo asc&$top=500"),
        dataverse.listLookupOptions(TABLES.employee, "cr40f_status eq 0"),
        dataverse.listLookupOptions(TABLES.vehicle),
      ]);
      setErrors(errorRows.map(normalizeError));
      setActions(actionRows.map(normalizeAction));
      setLookups((current) => ({ ...current, employees, vehicles }));
      return true;
    } catch (error) { reportAppError(error, { severity: "error", source: "app.loadData", screen: active }); setErrorMessage(error.message); return false; }
    finally { setLoading(false); }
  };

  const refreshData = async () => {
    if (await loadData()) setNotice("Dados atualizados.");
  };

  const loadChoices = async () => {
    try {
      const definitions = await dataverse.listChoiceDefinitions();
      applyChoiceDefinitions(definitions);
      setChoiceDefinitions(definitions);
      return true;
    } catch (error) {
      reportAppError(error, { severity: "error", source: "app.loadChoices", screen: active });
      setErrorMessage(`Não foi possível sincronizar os choices: ${error.message}`);
      return false;
    }
  };

  useEffect(() => { loadData(); loadChoices(); }, []);
  useEffect(() => { setErrorScreen(active); }, [active]);

  useEffect(() => {
    const { reservaId, errorId, actionId } = getLaunchParameters();
    if (loading) return;
    if (reservaId) setErrorEditor({ ...emptyError(), reservaId });
    if (errorId) setSelectedId(errorId);
    if (actionId) setSelectedId(actions.find((item) => item.cr40f_acaooperacionalid === actionId)?.cr40f_erroid || "");
  }, [loading, actions]);

  useEffect(() => {
    if (!selectedId) { setNotes([]); setEvidences([]); return; }
    Promise.all([dataverse.listNotes(selectedId), dataverse.listEvidence(selectedId)]).then(([nextNotes, nextEvidences]) => { setNotes(nextNotes); setEvidences(nextEvidences); }).catch((error) => { reportAppError(error, { severity: "error", source: "app.loadDetail", detailId: selectedId, screen: active }); setErrorMessage(error.message); });
  }, [selectedId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selectedError = useMemo(() => errors.find((item) => item.cr40f_errooperacionalid === selectedId) || null, [errors, selectedId]);
  const canEditSelected = Boolean(selectedError) && (access.canManage || cleanGuid(selectedError._ownerid_value).toLowerCase() === access.userId);
  const selectedActions = useMemo(() => actions.filter((item) => item.cr40f_erroid === selectedId), [actions, selectedId]);
  const filtered = useMemo(() => sortErrors(filterErrors(errors, filters), sort), [errors, filters, sort]);
  const stats = useMemo(() => calculateStats(errors, actions), [errors, actions]);

  const saveError = async (form) => {
    setSaving(true); setErrorMessage("");
    try {
      const payload = {
        cr40f_titulo: form.cr40f_titulo.trim(), cr40f_dataocorrencia: isoOrNull(form.cr40f_dataocorrencia),
        cr40f_prazoresolucao: isoOrNull(form.cr40f_prazoresolucao), cr40f_categoria: Number(form.cr40f_categoria),
        cr40f_gravidade: Number(form.cr40f_gravidade), cr40f_status: Number(form.cr40f_status),
        cr40f_origem: Number(form.cr40f_origem), cr40f_descricao: form.cr40f_descricao.trim(),
        cr40f_impacto: form.cr40f_impacto?.trim() || null, cr40f_causa: form.cr40f_causa?.trim() || null,
        cr40f_solucao: form.cr40f_solucao?.trim() || null,
        cr40f_impactofinanceiro: form.cr40f_impactofinanceiro ? Number(form.cr40f_impactofinanceiro) : null,
      };
      if ([100000004, 100000005].includes(Number(form.cr40f_status))) payload.cr40f_dataresolucao = form.cr40f_dataresolucao || new Date().toISOString();
      await Promise.all([
        dataverse.addLookup(payload, "cr40f_reserva", TABLES.reservation, form.reservaId),
        dataverse.addLookup(payload, "cr40f_motorista", TABLES.employee, form.motoristaId),
        dataverse.addLookup(payload, "cr40f_veiculo", TABLES.vehicle, form.veiculoId),
        dataverse.addLookup(payload, "cr40f_responsavel", TABLES.employee, form.responsavelId),
      ]);
      const mockFields = {
        cr40f_reservaid: form.reservaId, cr40f_motoristaid: form.motoristaId, cr40f_veiculoid: form.veiculoId,
        cr40f_responsavelid: form.responsavelId,
        cr40f_reservanome: form.reservaNome || "",
        cr40f_motoristanome: lookups.employees.find((item) => item.id === form.motoristaId)?.name || "",
        cr40f_veiculonome: lookups.vehicles.find((item) => item.id === form.veiculoId)?.name || "",
        cr40f_responsavelnome: lookups.employees.find((item) => item.id === form.responsavelId)?.name || "",
      };
      const savedError = form.cr40f_errooperacionalid
        ? await dataverse.update(TABLES.error, form.cr40f_errooperacionalid, payload, mockFields)
        : await dataverse.create(TABLES.error, payload, mockFields);
      if (form.reservaId) await dataverse.update(TABLES.reservation, form.reservaId, { new_houveerro: true });
      const errorId = form.cr40f_errooperacionalid || savedError?.cr40f_errooperacionalid;
      const evidenceError = { ...form, ...savedError, cr40f_errooperacionalid: errorId };
      const registrationFiles = form.registrationFiles || [];
      const solutionFiles = form.solutionFiles || [];
      if ((registrationFiles.length || solutionFiles.length) && !errorId) throw new Error("O erro foi salvo, mas não foi possível identificar o registro para anexar as evidências.");
      if (registrationFiles.length) await dataverse.createEvidenceNotes(errorId, evidenceError, "Evidências do registro do erro", registrationFiles, EVIDENCE_FOLDERS.registration, { contexto: "REGISTRO" });
      if (solutionFiles.length) await dataverse.createEvidenceNotes(errorId, evidenceError, "Comprovação da solução", solutionFiles, EVIDENCE_FOLDERS.solution, { contexto: "SOLUCAO" });
      const evidenceCount = registrationFiles.length + solutionFiles.length;
      setErrorEditor(null); setNotice(evidenceCount ? `Erro salvo com ${evidenceCount} evidência(s) no OneDrive.` : "Erro operacional registrado."); await loadData();
    } catch (error) { reportAppError(error, { severity: "error", source: "app.saveError", detailId: form.cr40f_errooperacionalid, detailType: "erro-operacional", screen: active }); setErrorMessage(error.message); return false; }
    finally { setSaving(false); }
  };

  const saveAction = async (form) => {
    setSaving(true); setErrorMessage("");
    try {
      const payload = {
        cr40f_titulo: form.cr40f_titulo.trim(), cr40f_descricao: form.cr40f_descricao.trim(),
        cr40f_tipoacao: Number(form.cr40f_tipoacao), cr40f_status: Number(form.cr40f_status),
        cr40f_prioridade: Number(form.cr40f_prioridade), cr40f_agendadoem: isoOrNull(form.cr40f_agendadoem),
        cr40f_prazo: isoOrNull(form.cr40f_prazo), cr40f_resultado: form.cr40f_resultado?.trim() || null,
      };
      if (Number(form.cr40f_status) === 100000003) payload.cr40f_dataconclusao = form.cr40f_dataconclusao || new Date().toISOString();
      await Promise.all([
        dataverse.addLookup(payload, "cr40f_erro", TABLES.error, form.erroId),
        dataverse.addLookup(payload, "cr40f_responsavel", TABLES.employee, form.responsavelId),
      ]);
      const linkedError = errors.find((item) => item.cr40f_errooperacionalid === form.erroId);
      const mockFields = {
        cr40f_erroid: form.erroId, cr40f_responsavelid: form.responsavelId,
        cr40f_erronome: linkedError ? `${linkedError.cr40f_codigo} · ${linkedError.cr40f_titulo}` : "",
        cr40f_responsavelnome: lookups.employees.find((item) => item.id === form.responsavelId)?.name || "",
      };
      const savedAction = form.cr40f_acaooperacionalid
        ? await dataverse.update(TABLES.action, form.cr40f_acaooperacionalid, payload, mockFields)
        : await dataverse.create(TABLES.action, payload, mockFields);
      if (!form.cr40f_acaooperacionalid) {
        if (linkedError && Number(linkedError.cr40f_status) === 100000000) {
          await dataverse.update(TABLES.error, linkedError.cr40f_errooperacionalid, { cr40f_status: 100000002 });
        }
      }
      const actionFiles = form.evidenceFiles || [];
      if (actionFiles.length) {
        const actionFolder = Number(form.cr40f_status) === 100000003 ? EVIDENCE_FOLDERS.solution : EVIDENCE_FOLDERS.action;
        const evidenceError = linkedError || { cr40f_errooperacionalid: form.erroId };
        await dataverse.createEvidenceNotes(form.erroId, evidenceError, `Evidências da ação: ${form.cr40f_titulo.trim()}`, actionFiles, actionFolder, { contexto: actionFolder === EVIDENCE_FOLDERS.solution ? "SOLUCAO" : "ACAO", acaoId: form.cr40f_acaooperacionalid || savedAction?.cr40f_acaooperacionalid || "" });
      }
      setActionEditor(null); setNotice(actionFiles.length ? `Ação salva com ${actionFiles.length} evidência(s) no OneDrive.` : (form.cr40f_acaooperacionalid ? "Ação atualizada." : "Ação adicionada à agenda.")); await loadData();
    } catch (error) { reportAppError(error, { severity: "error", source: "app.saveAction", detailId: form.cr40f_acaooperacionalid, detailType: "acao-operacional", screen: active }); setErrorMessage(error.message); return false; }
    finally { setSaving(false); }
  };

  const addNote = async (text, files) => {
    setSaving(true); setErrorMessage("");
    try {
      const evidenceFiles = Array.isArray(files) ? files : files ? [files] : [];
      await dataverse.createEvidenceNotes(selectedId, selectedError, text, evidenceFiles, EVIDENCE_FOLDERS.history, { contexto: "HISTORICO" });
      const [nextNotes, nextEvidences] = await Promise.all([dataverse.listNotes(selectedId), dataverse.listEvidence(selectedId)]); setNotes(nextNotes); setEvidences(nextEvidences); setNotice(evidenceFiles.length ? `Histórico atualizado com ${evidenceFiles.length} evidência(s) no OneDrive.` : "Nota adicionada ao histórico.");
      return true;
    } catch (error) { reportAppError(error, { severity: "error", source: "app.addNote", detailId: selectedId, detailType: "erro-operacional", screen: active }); setErrorMessage(error.message); }
    finally { setSaving(false); }
    return false;
  };

  const changeChoice = async (operation, successMessage) => {
    setSaving(true); setErrorMessage("");
    try {
      await operation();
      await loadChoices();
      setNotice(successMessage);
      return true;
    } catch (error) {
      reportAppError(error, { severity: "error", source: "app.changeChoice", screen: active });
      setErrorMessage(error.message);
      return false;
    } finally { setSaving(false); }
  };

  const createChoice = (key, label) => changeChoice(
    () => dataverse.createChoiceOption(key, label),
    "Opção criada e publicada no Dataverse.",
  );
  const updateChoice = (key, value, label) => changeChoice(
    () => dataverse.updateChoiceOption(key, value, label),
    "Nome atualizado e publicado no Dataverse.",
  );
  const deleteChoice = (key, value) => changeChoice(
    () => dataverse.deleteChoiceOption(key, value),
    "Opção excluída e alteração publicada no Dataverse.",
  );

  const exportCsv = () => {
    const columns = ["Código", "Título", "Data", "Categoria", "Gravidade", "Status", "Responsável", "Reserva"];
    const rows = filtered.map((item) => [item.cr40f_codigo, item.cr40f_titulo, item.cr40f_dataocorrencia, item.cr40f_categoria, item.cr40f_gravidade, item.cr40f_status, item.cr40f_responsavelnome, item.cr40f_reservanome]);
    const csv = [columns, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "erros-operacionais.csv"; link.click(); URL.revokeObjectURL(url);
  };

  if (!dataverse.available) return <main className="connection-error"><AlertTriangle size={36} /><h1>Gestão de Erros Operacionais</h1><p>Abra este web resource dentro do model-driven app para conectar ao Dataverse.</p></main>;

  return <AppShell embedded={embedded} active={active} onNavigate={setActive} onCreate={() => setErrorEditor(emptyError())} canRegister={access.canRegister} canConfigure={access.canConfigure} mockMode={dataverse.mockMode} loading={loading} onRefresh={refreshData}>
    {errorMessage && <div className="global-alert error"><AlertTriangle size={18} /><span>{errorMessage}</span><button onClick={() => setErrorMessage("")}>×</button></div>}
    {notice && <div className="global-alert success"><span>{notice}</span></div>}
    {active === "dashboard" && <Dashboard errors={errors} actions={actions} stats={stats} onSelect={(item) => item && setSelectedId(item.cr40f_errooperacionalid)} onNavigate={setActive} />}
    {active === "occurrences" && <OccurrencesView errors={filtered} employees={lookups.employees} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} page={page} setPage={setPage} pageSize={8} onSelect={(item) => setSelectedId(item.cr40f_errooperacionalid)} onExport={exportCsv} />}
    {active === "agenda" && <AgendaView actions={actions} errors={errors} mode={agendaMode} setMode={setAgendaMode} status={agendaStatus} setStatus={setAgendaStatus} assignee={agendaAssignee} setAssignee={setAgendaAssignee} currentUserId={access.userId} onSelect={(item) => item && setSelectedId(item.cr40f_errooperacionalid)} onCreateAction={(item) => setActionEditor(emptyAction(item?.cr40f_errooperacionalid || ""))} canManage={access.canManage} />}
    {active === "reports" && <ReportsView errors={errors} actions={actions} stats={stats} />}
    {active === "settings" && access.canConfigure && <SettingsView definitions={choiceDefinitions} mockMode={dataverse.mockMode} saving={saving} onRefresh={loadChoices} onCreate={createChoice} onUpdate={updateChoice} onDelete={deleteChoice} />}
    {access.canRegister && <button className="floating-create" onClick={() => setErrorEditor(emptyError())}><Plus size={20} /><span>Registrar erro</span></button>}
    <Drawer open={Boolean(selectedError)} onClose={() => setSelectedId("")} title={selectedError?.cr40f_codigo || "Ocorrência"} subtitle="Detalhes do erro" wide>
      <ErrorDetails error={selectedError} actions={selectedActions} notes={notes} evidences={evidences} canEdit={canEditSelected} canManage={access.canManage} onEdit={() => setErrorEditor(errorToForm(selectedError))} onNewAction={() => setActionEditor(emptyAction(selectedId))} onEditAction={(item) => setActionEditor(actionToForm(item))} onAddNote={addNote} saving={saving} />
    </Drawer>
    <Drawer open={Boolean(errorEditor)} onClose={() => setErrorEditor(null)} title={errorEditor?.cr40f_errooperacionalid ? "Editar ocorrência" : "Registrar erro"} subtitle="Gestão operacional" wide>
      {errorEditor && <ErrorForm initial={errorEditor} lookups={lookups} onSubmit={saveError} saving={saving} />}
    </Drawer>
    <Drawer open={Boolean(actionEditor)} onClose={() => setActionEditor(null)} title={actionEditor?.cr40f_acaooperacionalid ? "Editar ação" : "Nova ação"} subtitle="Agenda de tratamento">
      {actionEditor && <ActionForm initial={actionEditor} errors={errors} employees={lookups.employees} onSubmit={saveAction} saving={saving} />}
    </Drawer>
  </AppShell>;
}
