// Porte de Tela Planner/src/AdminCleanupPanel.jsx (sem mudança de comportamento).
import React, { useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";
import SearchableSelect from './SearchableSelect';

const ACTIONS = [
  { id: "completed_tasks", label: "Apagar tasks concluídas", detail: "Remove somente as tasks com status concluído.", countKey: "completedTasks" },
  { id: "all_tasks", label: "Apagar todas as tasks", detail: "Remove todas as tasks e seus vínculos locais.", countKey: "tasks" },
  { id: "all_tags", label: "Apagar todas as tags", detail: "Remove tags pessoais e suas associações.", countKey: "personalTags" },
  { id: "notifications", label: "Limpar notificações", detail: "Remove todo o histórico local de notificações.", countKey: "notifications" },
  { id: "all_teams", label: "Apagar todas as equipes", detail: "Remove as equipes cadastradas no Planner.", countKey: "teams" },
  { id: "all_contacts", label: "Apagar todos os contatos", detail: "Remove todos os casos do Planner.", countKey: "contacts" },
  { id: "task_activity", label: "Limpar históricos das tasks", detail: "Remove comentários, retornos e histórico operacional.", countKey: "taskActivity" },
  { id: "task_attachments", label: "Apagar anexos das tasks", detail: "Remove registros e arquivos pelo Flow do SharePoint.", countKey: "taskAttachments" },
  { id: "task_assignments", label: "Limpar responsáveis", detail: "Remove pessoas e equipes responsáveis sem apagar tasks.", countKey: "assignedTasks" },
  { id: "task_due_dates", label: "Limpar todos os prazos", detail: "Remove os prazos definidos nas tasks.", countKey: "datedTasks" },
  { id: "all_planner_data", label: "Limpar todos os dados do Planner", detail: "Remove tasks, tags, equipes, contatos e notificações do ambiente atual.", countKey: "plannerRecords" },
];

const USER_ACTIONS = [
  { id: "user_tasks", label: "Apagar tasks deste usuário", detail: "Apaga somente as tasks que correspondem aos filtros." },
  { id: "remove_user_assignments", label: "Remover usuário das tasks", detail: "Mantém as tasks e remove apenas essa pessoa dos responsáveis." },
  { id: "user_notifications", label: "Apagar notificações do usuário", detail: "Remove as notificações destinadas à pessoa selecionada." },
  { id: "user_tags", label: "Apagar tags do usuário", detail: "Remove as tags pessoais e seus vínculos." },
  { id: "user_contacts", label: "Apagar contatos do usuário", detail: "Remove casos sob responsabilidade da pessoa selecionada." },
];

export default function AdminCleanupPanel({ live, counts = {}, employees = [], teams = [], tasks = [], contacts = [], onCleanup }: any) {
  const [open, setOpen] = useState<any>(false);
  const [authenticated, setAuthenticated] = useState<any>(false);
  const [credentials, setCredentials] = useState<any>({ user: "", password: "" });
  const [error, setError] = useState<any>("");
  const [pendingAction, setPendingAction] = useState<any>("");
  const [confirmText, setConfirmText] = useState<any>("");
  const [busy, setBusy] = useState<any>(false);
  const [scope, setScope] = useState<any>({ employeeId: "", status: "", teamId: "" });

  const login = (event: any) => {
    event.preventDefault();
    if (credentials.user === "admin" && credentials.password === "admin") {
      setAuthenticated(true);
      setError("");
      return;
    }
    setError("Usuário ou senha inválidos.");
  };

  const execute = async () => {
    if (!pendingAction || confirmText !== "EXCLUIR") return;
    setBusy(true);
    setError("");
    try {
      const employee = employees.find((item: any) => item.id === scope.employeeId);
      await onCleanup({ action: pendingAction, ...scope, userId: employee?.userId || "" });
      setPendingAction("");
      setConfirmText("");
    } catch (failure: any) {
      setError(failure?.message || "Não foi possível concluir a limpeza.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel admin-cleanup-panel" aria-labelledby="admin-cleanup-title">
      <button className="admin-cleanup-trigger" type="button" onClick={() => setOpen((value: any) => !value)} aria-expanded={open}>
        <span className="setting-icon admin-cleanup-icon"><ShieldAlert size={19} /></span>
        <span><strong id="admin-cleanup-title">Ferramentas administrativas</strong><small>Limpeza controlada de dados do Planner</small></span>
        <span className="admin-cleanup-chevron">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="admin-cleanup-body">
        {!authenticated ? (
          <form className="admin-login" onSubmit={login}>
            <p>Entre para revelar as ações destrutivas {live ? "do Dataverse" : "deste navegador"}.</p>
            <div className="admin-login-fields">
              <label>Usuário<input autoComplete="username" value={credentials.user} onChange={(event) => setCredentials((value: any) => ({ ...value, user: event.target.value }))} /></label>
              <label>Senha<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((value: any) => ({ ...value, password: event.target.value }))} /></label>
            </div>
            {error && <span className="drawer-error" role="alert">{error}</span>}
            <button className="button button-secondary" type="submit">Acessar ferramentas</button>
          </form>
        ) : (
          <div className="admin-action-list">
            <div className="admin-session"><span>Acesso administrativo liberado</span><button type="button" onClick={() => { setAuthenticated(false); setPendingAction(""); setConfirmText(""); }}>Sair</button></div>
            {ACTIONS.map((action) => <div className="admin-action-row" key={action.id}>
              <div><strong>{action.label}</strong><span>{action.detail}</span></div>
              <span className="admin-action-count">{counts[action.countKey] || 0}</span>
              <button className="button button-danger" type="button" onClick={() => { setPendingAction(action.id); setConfirmText(""); setError(""); }} disabled={!counts[action.countKey]}><Trash2 size={14} />Excluir</button>
            </div>)}
            <div className="admin-user-scope">
              <strong>Limpeza por usuário</strong>
              <div>
                <label>Usuário<SearchableSelect value={scope.employeeId} onChange={(employeeId: any) => setScope((value: any) => ({ ...value, employeeId }))} options={employees.map((employee: any) => ({ value: employee.id, label: employee.name }))} placeholder="Selecione" aria-label="Usuário" /></label>
                <label>Status da task<SearchableSelect value={scope.status} onChange={(status: any) => setScope((value: any) => ({ ...value, status }))} options={[{ value: "todo", label: "A fazer" }, { value: "progress", label: "Em andamento" }, { value: "waiting", label: "Aguardando" }, { value: "done", label: "Concluída" }]} placeholder="Todos" aria-label="Status da task" /></label>
                <label>Equipe da task<SearchableSelect value={scope.teamId} onChange={(teamId: any) => setScope((value: any) => ({ ...value, teamId }))} options={teams.map((team: any) => ({ value: team.id, label: team.name }))} placeholder="Todas" aria-label="Equipe da task" /></label>
              </div>
              <small>{scope.employeeId ? `${tasks.filter((task: any) => task.assigneeIds?.includes(scope.employeeId) && (!scope.status || task.status === scope.status) && (!scope.teamId || task.teamIds?.includes(scope.teamId) || task.teamId === scope.teamId)).length} task(s) correspondem aos filtros · ${contacts.filter((contact: any) => contact.assigneeIds?.includes(scope.employeeId) || contact.ownerEmployeeId === scope.employeeId).length} contato(s)` : "Selecione um usuário para habilitar as ações abaixo."}</small>
            </div>
            {USER_ACTIONS.map((action) => <div className="admin-action-row" key={action.id}>
              <div><strong>{action.label}</strong><span>{action.detail}</span></div>
              <button className="button button-danger" type="button" onClick={() => { setPendingAction(action.id); setConfirmText(""); setError(""); }} disabled={!scope.employeeId}><Trash2 size={14} />Excluir</button>
            </div>)}
          </div>
        )}
        {pendingAction && <div className="admin-confirm" role="dialog" aria-modal="true" aria-label="Confirmar exclusão">
          <strong>Esta ação não pode ser desfeita.</strong><span>Digite <b>EXCLUIR</b> para confirmar.</span>
          <input autoFocus value={confirmText} onChange={(event) => setConfirmText(event.target.value)} aria-label="Digite EXCLUIR para confirmar" />
          <div><button className="button button-secondary" type="button" onClick={() => setPendingAction("")} disabled={busy}>Cancelar</button><button className="button button-danger" type="button" onClick={execute} disabled={confirmText !== "EXCLUIR" || busy}>{busy ? "Excluindo…" : "Confirmar exclusão"}</button></div>
        </div>}
        {authenticated && error && <span className="drawer-error" role="alert">{error}</span>}
      </div>}
    </section>
  );
}
