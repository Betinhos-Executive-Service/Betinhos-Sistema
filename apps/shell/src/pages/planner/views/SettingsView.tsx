// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import AdminCleanupPanel from '../components/AdminCleanupPanel'
import { InputSelect } from '../components/AssignmentFields'
import NotificationTestPanel from '../components/NotificationTestPanel'
import PageHeader from '../components/PageHeader'
import { PersonalTagManager } from '../components/PersonalTags'
import { SearchableMultiSelect } from '../components/SearchableSelect'
import { TEAM_ICON_OPTIONS, TeamIcon } from '../components/teamIcons'
import { APP_VERSION } from '../data/version'
import { teamResponsibilitySummary, validateTeamComposition } from '../domain/domain'
import { Check, ChevronDown, ChevronRight, LoaderCircle, RotateCcw, Tag, Target, Trash2, Users, X } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'

// Traz o login Microsoft (MSAL, ~300 kB): só baixa quando alguém abre as configurações.
// Falha ao baixar (build antigo apagado, rede) afeta só este painel, não a tela de Configurações.
const PlannerImportView = lazy(() => import('./PlannerImportView').catch(() => ({
  default: (_props: any) => <p>Não foi possível carregar a importação do Planner. Recarregue a página.</p>,
})))


export function TeamManager({ teams = [], tasks = [], employees = [], onSave, onDelete }: any) {
  const emptyDraft = { id: "", name: "", iconName: "users", memberIds: [], primaryMemberId: "" };
  const [draft, setDraft] = useState<any>(emptyDraft);
  const [teamDrawerOpen, setTeamDrawerOpen] = useState<any>(false);
  const [expandedTeamId, setExpandedTeamId] = useState<any>("");
  const [saving, setSaving] = useState<any>(false);
  const [deleting, setDeleting] = useState<any>(false);
  const [validationError, setValidationError] = useState<any>("");
  const employeeOptions = employees.map((employee: any) => ({ value: employee.id, label: employee.name }));
  const employeeNameById = new Map(employees.map((employee: any) => [String(employee.id), employee.name]));
  const responsibilitiesByTeam = useMemo(
    () => new Map(teams.map((team: any) => [String(team.id), teamResponsibilitySummary(team, tasks, employees)])),
    [teams, tasks, employees],
  );
  const memberSummary = (team: any) => {
    const names = (team.memberIds || []).map((id: any) => employeeNameById.get(String(id))).filter(Boolean);
    if (!names.length) return "Nenhum membro selecionado";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  };
  const startEdit = (team: any) => {
    setDraft({ id: team.id, name: team.name, iconName: team.iconName || "users", memberIds: [...(team.memberIds || [])], primaryMemberId: team.primaryMemberId || "" });
    setExpandedTeamId(team.id);
    setTeamDrawerOpen(true);
    setValidationError("");
  };
  const submit = () => {
    const name = draft.name.trim();
    if (!name) {
      setValidationError("Informe um nome para a equipe.");
      return;
    }
    const composition = validateTeamComposition(draft.memberIds, draft.primaryMemberId);
    if (!composition.valid) {
      setValidationError(composition.error);
      return;
    }
    setSaving(true);
    Promise.resolve(onSave({ ...draft, name, primaryMemberId: composition.primaryMemberId }))
      .then((success) => {
        if (success) {
          setDraft(emptyDraft);
          setValidationError("");
          setTeamDrawerOpen(false);
        }
      })
      .catch((failure) => setValidationError(failure.message || "Não foi possível salvar a equipe."))
      .finally(() => setSaving(false));
  };
  const remove = () => {
    if (!draft.id || !window.confirm(`Apagar a equipe "${draft.name}"? As tarefas existentes serão preservadas.`)) return;
    setDeleting(true);
    Promise.resolve(onDelete(draft.id))
      .then((success) => {
        if (success) {
          setDraft(emptyDraft);
          setValidationError("");
        }
      })
      .catch((failure) => setValidationError(failure.message || "Não foi possível apagar a equipe."))
      .finally(() => setDeleting(false));
  };
  return (
    <section className="panel teams-settings-panel" aria-labelledby="teams-settings-title">
      <div className="panel-heading teams-panel-heading">
        <div>
          <h2 id="teams-settings-title">Equipes do Planner</h2>
        </div>
        <div className="team-panel-actions">
          <div className="team-total" aria-label={`${teams.length} ${teams.length === 1 ? "equipe cadastrada" : "equipes cadastradas"}`}><strong>{teams.length}</strong><span>{teams.length === 1 ? "equipe" : "equipes"}</span></div>
          <button className="button button-primary team-new-button" type="button" onClick={() => { setDraft(emptyDraft); setValidationError(""); setTeamDrawerOpen(true); }}><Users size={15} />Nova equipe</button>
        </div>
      </div>
      <div className="team-manager-body">
        <div className="team-list-column">
          <div className="team-list">
          {teams.length ? teams.map((team: any, index: any) => {
            const isExpanded = expandedTeamId === team.id;
            const summary = responsibilitiesByTeam.get(String(team.id)) || { totalTaskCount: 0, members: [] };
            const detailsId = `team-details-${index}`;
            return (
              <article className={`team-list-item${isExpanded ? " is-expanded" : ""}`} key={team.id}>
                <button className="team-list-row" type="button" onClick={() => setExpandedTeamId((current: any) => current === team.id ? "" : team.id)} aria-expanded={isExpanded} aria-controls={detailsId}>
                  <span className="team-list-icon" aria-hidden="true"><TeamIcon name={team.iconName} size={17} /></span>
                  <span className="team-list-copy">
                    <strong>{team.name}</strong>
                    <span className="team-list-meta">
                      <span>{(team.memberIds || []).length} {(team.memberIds || []).length === 1 ? "membro" : "membros"}</span>
                      <span aria-hidden="true">·</span>
                      <span>Principal: {employeeNameById.get(String(team.primaryMemberId)) || memberSummary(team)}</span>
                    </span>
                  </span>
                  <span className="team-list-action"><span>{(summary as any).totalTaskCount} {(summary as any).totalTaskCount === 1 ? "tarefa aberta" : "tarefas abertas"}</span><ChevronDown size={15} aria-hidden="true" /></span>
                </button>
                <div className="team-expansion" id={detailsId} aria-hidden={!isExpanded}>
                  <div className="team-expansion-content">
                    <div className="team-expansion-heading"><span>Membros da equipe</span><span>{(summary as any).totalTaskCount} {(summary as any).totalTaskCount === 1 ? "tarefa aberta" : "tarefas abertas"}</span></div>
                    {(summary as any).members.length ? <div className="team-member-list">{(summary as any).members.map((member: any) => (
                      <div className="team-member-row" key={member.id}>
                        <span className="team-member-avatar" aria-hidden="true">{(member.apelido || member.name).split(" ").map((part: any) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
                        <span className="team-member-copy"><strong>{member.name}</strong><span>{String(member.id) === String(team.primaryMemberId) ? "Responsável principal" : "Consultor"}</span></span>
                      </div>
                    ))}</div> : <p className="team-members-empty">Inclua membros para identificar quem compõe esta equipe.</p>}
                    <div className="team-expansion-footer"><span>{(summary as any).totalTaskCount === 1 ? "1 tarefa aberta sob responsabilidade da equipe" : `${(summary as any).totalTaskCount} tarefas abertas sob responsabilidade da equipe`}</span><button className="text-button" type="button" onClick={() => startEdit(team)}>Editar equipe <ChevronRight size={14} aria-hidden="true" /></button></div>
                  </div>
                </div>
              </article>
            );
          }) : <div className="team-list-empty"><Users size={18} /><strong>Nenhuma equipe cadastrada</strong><span>Crie a primeira para acelerar a atribuição de tarefas.</span></div>}
          </div>
        </div>
        {teamDrawerOpen && <div className="drawer-layer team-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTeamDrawerOpen(false); }}>
          <aside className="task-drawer team-editor-drawer" role="dialog" aria-modal="true" aria-labelledby="team-editor-title">
            <header className="drawer-header"><div><span className="eyebrow">Atribuição rápida</span><h2 id="team-editor-title">{draft.id ? "Editar equipe" : "Nova equipe"}</h2></div><button className="icon-button" type="button" aria-label="Fechar formulário" onClick={() => setTeamDrawerOpen(false)}><X size={19} /></button></header>
            <div className="drawer-body">
        <div className="team-form">
          <div className="team-form-fields">
            <label className="team-form-field">
              <span className="team-form-label"><span>Nome da equipe</span><span className="team-form-required">Obrigatório</span></span>
              <input value={draft.name} onChange={(event) => setDraft((current: any) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Operação" />
            </label>
            <div className="team-form-field">
              <span className="team-form-label"><span>Quem faz parte?</span><span className="team-form-selection">{draft.memberIds.length} {draft.memberIds.length === 1 ? "membro" : "membros"}</span></span>
              <SearchableMultiSelect value={draft.memberIds} onChange={(memberIds: any) => setDraft((current: any) => ({ ...current, memberIds, primaryMemberId: memberIds.length === 1 ? memberIds[0] : memberIds.includes(current.primaryMemberId) ? current.primaryMemberId : "" }))} options={employeeOptions} placeholder="Buscar e adicionar membros" />
              <span className="team-form-hint">A mesma pessoa pode estar em mais de uma equipe.</span>
            </div>
            <div className="team-form-field">
              <span className="team-form-label"><span>Responsável principal</span><span className="team-form-selection">{draft.memberIds.length > 1 ? "Obrigatório" : "Automático com 1 membro"}</span></span>
              <InputSelect
                value={draft.primaryMemberId}
                onChange={(primaryMemberId: any) => setDraft((current: any) => ({ ...current, primaryMemberId }))}
                options={employeeOptions.filter((option: any) => draft.memberIds.includes(option.value))}
                placeholder={draft.memberIds.length ? "Escolha quem responde pela equipe" : "Adicione membros primeiro"}
                disabled={!draft.memberIds.length || draft.memberIds.length === 1}
              />
              <span className="team-form-hint">Os demais membros serão consultores derivados nas tarefas abertas.</span>
            </div>
            <div className="team-form-field">
              <span className="team-form-label"><span>Ícone da equipe</span><span className="team-form-selection">Exibido nos cards</span></span>
              <div className="team-icon-options" role="radiogroup" aria-label="Ícone da equipe">
                {TEAM_ICON_OPTIONS.map(({ id, label }: any) => <button key={id} className={`team-icon-option${draft.iconName === id ? " is-selected" : ""}`} type="button" role="radio" aria-checked={draft.iconName === id} aria-label={label} title={label} onClick={() => setDraft((current: any) => ({ ...current, iconName: id }))}><TeamIcon name={id} size={17} /><span>{label}</span></button>)}
              </div>
            </div>
          </div>
          {validationError && <div className="form-error" role="alert">{validationError}</div>}
          <div className="team-form-footer">
            {draft.id ? <div className="team-form-secondary-actions">
              <button className="text-button" type="button" onClick={() => setDraft(emptyDraft)} disabled={saving || deleting}>Cancelar edição</button>
              <button className="text-button team-delete-button" type="button" onClick={remove} disabled={saving || deleting}>
                {deleting ? <LoaderCircle size={13} className="spin" /> : <Trash2 size={13} />}
                Apagar equipe
              </button>
            </div> : <span className="team-form-footer-hint">Você poderá editar membros depois.</span>}
            <button className="button button-primary team-form-submit" type="button" onClick={submit} disabled={saving || deleting || !draft.name.trim()}>
              {saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
              {saving ? "Salvando…" : draft.id ? "Salvar alterações" : "Criar equipe"}
            </button>
          </div>
        </div>
            </div>
          </aside>
        </div>}
      </div>
    </section>
  );
}

export function SettingsView({ onReset, onAdminCleanup, onSendNotificationTest, live, teams = [], tasks = [], contacts = [], notifications = [], employees = [], personalTags = [], onSaveTeam, onDeleteTeam, onImportPlannerTasks, onCreatePersonalTag, onUpdatePersonalTag, onArchivePersonalTag, onReorderPersonalTags }: any) {
  return (
    <div className="page-content">
      <PageHeader
        eyebrow={live ? "Ambiente Dataverse" : "Execução local"}
        title="Configurações"
        description={
          live
            ? "Dados operacionais carregados diretamente do ambiente autenticado."
            : "Dados de demonstração mantidos somente neste navegador."
        }
      />
      <section className="settings-grid">
        <div className="panel setting-card">
          <div className="setting-icon">
            <RotateCcw size={19} />
          </div>
          <div>
            <h2>{live ? "Recarregar dados" : "Restaurar cenário inicial"}</h2>
            <p>
              {live
                ? "Busca novamente cotações, tarefas e registros de qualidade no Dataverse."
                : "Repõe as cotações e tarefas sintéticas do mock local."}
            </p>
            <button className="button button-secondary" onClick={onReset}>
              <RotateCcw size={15} />
              {live ? "Recarregar" : "Restaurar mock"}
            </button>
          </div>
        </div>
        <div className="panel setting-card">
          <div className="setting-icon setting-icon-blue">
            <Target size={19} />
          </div>
          <div>
            <h2>Fonte de dados</h2>
            <p>
              {live
                ? "O Planner usa dados do ambiente autenticado."
                : "O Planner usa mock data local e não cria registros no Dataverse."}
            </p>
            <span className="status-note">
              <span className="pulse-dot" />
              {live ? "Dataverse conectado" : "Modo local · mock"}
            </span>
          </div>
        </div>
        <div className="panel setting-card">
          <div className="setting-icon setting-icon-blue">
            <span className="version-glyph">v</span>
          </div>
          <div>
            <h2>Versão do aplicativo</h2>
            <p>Identificação da versão publicada neste ambiente.</p>
            <span className="version-value">{APP_VERSION}</span>
          </div>
        </div>
        <Suspense fallback={null}>
          <PlannerImportView live={live} employees={employees} onImport={onImportPlannerTasks} />
        </Suspense>
      </section>
      <NotificationTestPanel live={live} tasks={tasks} onSend={onSendNotificationTest} />
      <AdminCleanupPanel live={live} counts={{ tasks: tasks.length, completedTasks: tasks.filter((task: any) => task.status === "done").length, personalTags: personalTags.length, notifications: notifications.length, teams: teams.length, contacts: contacts.length, taskActivity: tasks.reduce((total: any, task: any) => total + (task.comments?.length || 0) + (task.returns?.length || 0) + (task.history?.length || 0), 0), taskAttachments: tasks.reduce((total: any, task: any) => total + (task.attachments?.length || 0), 0), assignedTasks: tasks.filter((task: any) => task.assigneeIds?.length || task.teamIds?.length || task.teamId).length, datedTasks: tasks.filter((task: any) => task.dueDate).length, plannerRecords: tasks.length + personalTags.length + notifications.length + teams.length + contacts.length }} employees={employees} teams={teams} tasks={tasks} contacts={contacts} onCleanup={onAdminCleanup} />
      <div className="settings-secondary-grid">
        <section className="panel personal-tags-settings-panel" aria-labelledby="personal-tags-settings-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Personalização</span>
              <h2 id="personal-tags-settings-title">Minhas tags</h2>
              <p className="panel-copy">Crie e organize etiquetas privadas para encontrar suas tarefas mais rápido.</p>
            </div>
            <Tag size={19} aria-hidden="true" />
          </div>
          <PersonalTagManager tags={personalTags} onCreate={onCreatePersonalTag} onUpdate={onUpdatePersonalTag} onArchive={onArchivePersonalTag} />
        </section>
        <TeamManager teams={teams} tasks={tasks} employees={employees} onSave={onSaveTeam} onDelete={onDeleteTeam} />
      </div>
    </div>
  );
}
