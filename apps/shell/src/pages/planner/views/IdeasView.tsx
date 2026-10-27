// Porte de Tela Planner/src/IdeasView.jsx (sem mudança de comportamento).
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Columns3, Lightbulb, List, Plus, RefreshCw, Search, X } from "lucide-react";
import PageHeader from '../components/PageHeader';
import SearchableSelect from '../components/SearchableSelect';

const IDEA_STATUSES = [
  { value: 100000000, label: "Nova" },
  { value: 100000001, label: "Em avaliação" },
  { value: 100000002, label: "Aprovada" },
  { value: 100000003, label: "Implementada" },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigas" },
];
const PAGE_SIZE = 20;
const VIEW_STORAGE_KEY = "planner.ideas.view";

function searchText(value: any) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

function formatDate(value: any) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: any) {
  return IDEA_STATUSES.find((item) => item.value === status)?.label || "Status indefinido";
}

function readStoredView() {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
}

function IdeaDrawer({ idea, onClose, onSave, onArchive }: any) {
  const isNew = !idea;
  const initial = useMemo(() => ({ title: idea?.title || "", details: idea?.details || "", status: idea?.status ?? 100000000 }), [idea]);
  const [draft, setDraft] = useState<any>(initial);
  const [saving, setSaving] = useState<any>(false);
  const [error, setError] = useState<any>("");
  const [confirm, setConfirm] = useState<any>("");
  const titleRef = useRef<any>(null);
  const dirty = draft.title !== initial.title || draft.details !== initial.details || draft.status !== initial.status;

  useEffect(() => { titleRef.current?.focus(); }, []);

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirm("discard");
    else onClose();
  }

  useEffect(() => {
    function onKey(event: any) {
      if (event.key !== "Escape") return;
      if (confirm) setConfirm("");
      else requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function submit(event: any) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ title, details: draft.details.trim(), status: draft.status });
    } catch (saveError: any) {
      setError(saveError.message || "Não foi possível salvar a ideia.");
      setSaving(false);
    }
  }

  async function archive() {
    setConfirm("");
    setSaving(true);
    setError("");
    try {
      await onArchive(idea);
    } catch (archiveError: any) {
      setError(archiveError.message || "Não foi possível arquivar a ideia.");
      setSaving(false);
    }
  }

  return (
    <div className="drawer-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <aside className="task-drawer idea-drawer" aria-labelledby="ideas-form-title">
        <header className="drawer-header">
          <div className="ideas-section-heading">
            <span className="ideas-icon" aria-hidden="true"><Lightbulb size={18} /></span>
            <div>
              <h2 id="ideas-form-title">{isNew ? "Compartilhe uma ideia" : "Detalhes da ideia"}</h2>
              <p>{isNew ? "Descreva o que pode melhorar no trabalho da equipe." : [idea.author, formatDate(idea.createdAt)].filter(Boolean).join(" · ") || "Ideia da equipe"}</p>
            </div>
          </div>
          <button className="ideas-icon-button" type="button" onClick={requestClose} disabled={saving} aria-label="Fechar formulário"><X size={18} /></button>
        </header>
        <form id="idea-form" className="drawer-body ideas-form" onSubmit={submit}>
          <label>
            <span>Título</span>
            <input ref={titleRef} maxLength={100} value={draft.title} onChange={(event) => setDraft((current: any) => ({ ...current, title: event.target.value }))} placeholder="Ex.: facilitar as trocas de veículo" required disabled={saving} />
            <small>Uma frase curta que explique a sugestão. {draft.title.length}/100</small>
          </label>
          <label>
            <span>Como funcionaria? <small>Opcional</small></span>
            <textarea maxLength={2000} value={draft.details} onChange={(event) => setDraft((current: any) => ({ ...current, details: event.target.value }))} rows={7} placeholder="Conte o problema e como sua ideia ajudaria." disabled={saving} />
            <small>{draft.details.length}/2000</small>
          </label>
          {!isNew && <label className="idea-status-field"><span>Status</span><SearchableSelect value={draft.status} onChange={(value: any) => setDraft((current: any) => ({ ...current, status: Number(value) }))} options={IDEA_STATUSES} clearable={false} disabled={saving} aria-label="Status da ideia" /></label>}
          {error && <p className="ideas-feedback ideas-feedback-error" role="alert">{error}</p>}
        </form>
        <footer className="drawer-footer">
          {!isNew && <button className="button button-danger ideas-archive" type="button" onClick={() => setConfirm("archive")} disabled={saving}><Archive size={15} /> Arquivar</button>}
          <button className="button button-quiet ideas-cancel" type="button" disabled={saving} onClick={requestClose}>Cancelar</button>
          <button className="button button-primary ideas-submit" type="submit" form="idea-form" disabled={saving || !draft.title.trim() || (!isNew && !dirty)}>{saving ? "Salvando..." : <><Check size={15} /> {isNew ? "Enviar ideia" : "Salvar alterações"}</>}</button>
        </footer>
      </aside>
      {confirm && <div className="drawer-confirm-layer" onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setConfirm(""); }}>
        <div className="drawer-confirm" role="dialog" aria-modal="true" aria-labelledby="idea-confirm-title">
          {confirm === "discard" ? <>
            <h2 id="idea-confirm-title">Descartar alterações?</h2>
            <p>Você tem alterações que ainda não foram salvas.</p>
            <div className="drawer-confirm-actions"><button className="button button-quiet" type="button" onClick={() => setConfirm("")}>Continuar editando</button><button className="button button-danger" type="button" onClick={onClose}>Descartar</button></div>
          </> : <>
            <h2 id="idea-confirm-title">Arquivar ideia?</h2>
            <p>“{idea.title}” sai da lista da equipe. O registro continua no Dataverse e pode ser reativado por um administrador.</p>
            <div className="drawer-confirm-actions"><button className="button button-quiet" type="button" onClick={() => setConfirm("")}>Voltar</button><button className="button button-danger" type="button" onClick={archive}>Arquivar</button></div>
          </>}
        </div>
      </div>}
    </div>
  );
}

export default function IdeasView({ store }: any) {
  const [ideas, setIdeas] = useState<any>([]);
  const [drawer, setDrawer] = useState<any>(null);
  const [view, setView] = useState<any>(readStoredView);
  const [query, setQuery] = useState<any>("");
  const [statusFilter, setStatusFilter] = useState<any>("all");
  const [sort, setSort] = useState<any>("newest");
  const [visibleCount, setVisibleCount] = useState<any>(PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState<any>(0);
  const [loading, setLoading] = useState<any>(true);
  const [updatingId, setUpdatingId] = useState<any>("");
  const [loadError, setLoadError] = useState<any>("");
  const [rowErrors, setRowErrors] = useState<any>({});
  const [notice, setNotice] = useState<any>("");
  const [dragId, setDragId] = useState<any>("");
  const [dropStatus, setDropStatus] = useState<any>(null);

  useEffect(() => {
    let current = true;
    store.loadIdeas().then((items: any) => {
      if (current) {
        setIdeas(items);
        setLoadError("");
      }
    }).catch((loadError: any) => {
      if (current) setLoadError(loadError.message || "Não foi possível carregar as ideias.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [store, reloadKey]);

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* preferência opcional */ }
  }, [view]);

  const counts = useMemo(() => {
    const result = new Map(IDEA_STATUSES.map(({ value }: any) => [value, 0]));
    ideas.forEach(({ status }: any) => result.set(status, (result.get(status) || 0) + 1));
    return result;
  }, [ideas]);

  const searchedIdeas = useMemo(() => {
    const term = searchText(query.trim());
    const items = ideas.filter((idea: any) => !term || searchText(`${idea.title} ${idea.details} ${idea.author}`).includes(term));
    const time = (idea: any) => new Date(idea.createdAt).getTime() || 0;
    return items.sort((a: any, b: any) => sort === "oldest" ? time(a) - time(b) : time(b) - time(a));
  }, [ideas, query, sort]);

  const filteredIdeas = useMemo(
    () => searchedIdeas.filter((idea: any) => statusFilter === "all" || idea.status === Number(statusFilter)),
    [searchedIdeas, statusFilter]
  );

  function refresh() {
    setLoading(true);
    setReloadKey((current: any) => current + 1);
  }

  function openNew() {
    setNotice("");
    setDrawer({ idea: null });
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setVisibleCount(PAGE_SIZE);
  }

  async function handleSave(input: any) {
    if (!drawer.idea) {
      const idea = await store.createIdea(null, { title: input.title, details: input.details });
      setIdeas((current: any) => [idea, ...current]);
      clearFilters();
      setNotice("Ideia registrada para a equipe.");
    } else {
      const original = drawer.idea;
      const patch = {};
      if (input.title !== original.title) (patch as any).title = input.title;
      if (input.details !== original.details) (patch as any).details = input.details;
      if (input.status !== original.status) (patch as any).status = input.status;
      await store.updateIdea(null, original.id, patch);
      setIdeas((current: any) => current.map((item: any) => item.id === original.id ? { ...item, ...patch } : item));
      setNotice(`“${input.title}” atualizada.`);
    }
    setDrawer(null);
  }

  async function handleArchive(idea: any) {
    await store.archiveIdea(null, idea.id);
    setIdeas((current: any) => current.filter((item: any) => item.id !== idea.id));
    setDrawer(null);
    setNotice(`“${idea.title}” arquivada.`);
  }

  async function handleStatusChange(idea: any, status: any) {
    if (status === idea.status || updatingId) return;
    setUpdatingId(idea.id);
    setRowErrors((current: any) => ({ ...current, [idea.id]: "" }));
    setNotice("");
    setIdeas((current: any) => current.map((item: any) => item.id === idea.id ? { ...item, status } : item));
    try {
      await store.updateIdea(null, idea.id, { status });
      setNotice(`“${idea.title}” movida para ${statusLabel(status)}.`);
    } catch (updateError: any) {
      setIdeas((current: any) => current.map((item: any) => item.id === idea.id ? { ...item, status: idea.status } : item));
      setRowErrors((current: any) => ({ ...current, [idea.id]: updateError.message || "Não foi possível atualizar o status." }));
    } finally {
      setUpdatingId("");
    }
  }

  function handleDrop(event: any, status: any) {
    event.preventDefault();
    const idea = ideas.find((item: any) => item.id === (event.dataTransfer.getData("text/plain") || dragId));
    setDragId("");
    setDropStatus(null);
    if (idea) handleStatusChange(idea, status);
  }

  const hasFilter = query.trim() || (view === "list" && statusFilter !== "all");
  const metaLine = (idea: any) => [idea.author, formatDate(idea.createdAt)].filter(Boolean).join(" · ") || "Ideia da equipe";

  function renderEmpty() {
    return <div className="ideas-empty"><Lightbulb size={22} aria-hidden="true" /><strong>{hasFilter ? "Nenhuma ideia encontrada" : "As ideias começam aqui"}</strong><span>{hasFilter ? "Ajuste a busca ou o status para ver outras sugestões." : "Compartilhe a primeira sugestão com a equipe."}</span>{hasFilter ? <button className="button" type="button" onClick={clearFilters}>Limpar filtros</button> : <button className="button button-primary" type="button" onClick={openNew}>Nova ideia</button>}</div>;
  }

  function renderList() {
    if (!filteredIdeas.length) return renderEmpty();
    return <>
      <div className="ideas-list">
        {filteredIdeas.slice(0, visibleCount).map((idea: any) => (
          <article className="idea-card" key={idea.id}>
            <button className="idea-card-copy idea-open" type="button" onClick={() => setDrawer({ idea })} aria-label={`Abrir ideia ${idea.title}`}>
              <span className="idea-title-line"><span className="idea-title">{idea.title}</span><span className={`idea-status-badge idea-status-${idea.status}`}>{statusLabel(idea.status)}</span></span>
              {idea.details && <span className="idea-details">{idea.details}</span>}
              <small>{metaLine(idea)}</small>
            </button>
            <div className="idea-card-action">
              <label className="idea-status-field"><span>Alterar status</span><SearchableSelect value={idea.status} onChange={(value: any) => handleStatusChange(idea, Number(value))} options={IDEA_STATUSES} clearable={false} disabled={Boolean(updatingId)} aria-label={`Status da ideia ${idea.title}`} /></label>
              {updatingId === idea.id && <small role="status">Salvando status...</small>}
              {rowErrors[idea.id] && <small className="idea-row-error" role="alert">{rowErrors[idea.id]}</small>}
            </div>
          </article>
        ))}
      </div>
      {filteredIdeas.length > visibleCount && <button className="ideas-more" type="button" onClick={() => setVisibleCount((current: any) => current + PAGE_SIZE)}>Mostrar mais {Math.min(PAGE_SIZE, filteredIdeas.length - visibleCount)} ideias</button>}
    </>;
  }

  function renderBoard() {
    if (!searchedIdeas.length && hasFilter) return renderEmpty();
    return (
      <div className="ideas-board" role="list" aria-label="Quadro de ideias por status">
        {IDEA_STATUSES.map(({ value, label }: any) => {
          const column = searchedIdeas.filter((idea: any) => idea.status === value);
          return (
            <section key={value} role="listitem" className={`ideas-column${dropStatus === value ? " is-drop-target" : ""}`} aria-label={`${label}: ${column.length}`}
              onDragOver={(event) => { if (dragId) { event.preventDefault(); setDropStatus(value); } }}
              onDragLeave={(event) => { if (!event.currentTarget.contains((event.relatedTarget as any))) setDropStatus(null); }}
              onDrop={(event) => handleDrop(event, value)}>
              <header className="ideas-column-header"><span className={`idea-status-dot idea-status-${value}`} aria-hidden="true" /><strong>{label}</strong><span>{column.length}</span></header>
              <div className="ideas-column-body">
                {column.map((idea: any) => (
                  <article key={idea.id} className={`idea-board-card${dragId === idea.id ? " is-dragging" : ""}`} draggable={!updatingId}
                    onDragStart={(event) => { event.dataTransfer.setData("text/plain", idea.id); event.dataTransfer.effectAllowed = "move"; setDragId(idea.id); }}
                    onDragEnd={() => { setDragId(""); setDropStatus(null); }}>
                    <button className="idea-open" type="button" onClick={() => setDrawer({ idea })} aria-label={`Abrir ideia ${idea.title}`}>
                      <span className="idea-title">{idea.title}</span>
                      {idea.details && <span className="idea-details">{idea.details}</span>}
                      <small>{metaLine(idea)}</small>
                    </button>
                    <div className="idea-move"><SearchableSelect value={idea.status} onChange={(value: any) => handleStatusChange(idea, Number(value))} options={IDEA_STATUSES.map((item) => ({ value: item.value, label: item.value === idea.status ? item.label : `Mover para ${item.label}` }))} clearable={false} disabled={Boolean(updatingId)} aria-label={`Mover ${idea.title} para`} /></div>
                    {updatingId === idea.id && <small role="status">Salvando status...</small>}
                    {rowErrors[idea.id] && <small className="idea-row-error" role="alert">{rowErrors[idea.id]}</small>}
                  </article>
                ))}
                {!column.length && <p className="ideas-column-empty">{dragId ? "Solte aqui" : "Nenhuma ideia"}</p>}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`page-content ideas-page${view === "board" ? " is-board" : ""}`}>
      <PageHeader
        eyebrow="Melhoria contínua"
        title="Boas ideias"
        description="Sugestões da equipe, da proposta à implementação."
        action={<button className="button button-primary ideas-new-button" type="button" onClick={openNew}><Plus size={16} /> Nova ideia</button>}
      />

      <section className="ideas-list-section" aria-labelledby="ideas-list-title">
        <div className="ideas-list-heading">
          <div>
            <h2 id="ideas-list-title">Ideias da equipe</h2>
            <p>{ideas.length} {ideas.length === 1 ? "ideia registrada" : "ideias registradas"}</p>
          </div>
          <div className="ideas-heading-actions">
            <div className="task-view-selector" aria-label="Visualização das ideias">
              <button className={`task-view-button ${view === "list" ? "active" : ""}`} type="button" onClick={() => setView("list")} aria-label="Visualização Lista" aria-pressed={view === "list"} title="Lista"><List size={16} aria-hidden="true" /></button>
              <button className={`task-view-button ${view === "board" ? "active" : ""}`} type="button" onClick={() => setView("board")} aria-label="Visualização Quadro" aria-pressed={view === "board"} title="Quadro"><Columns3 size={16} aria-hidden="true" /></button>
            </div>
            <button className="ideas-refresh" type="button" onClick={refresh} disabled={loading} aria-label="Atualizar ideias"><RefreshCw size={15} /> Atualizar</button>
          </div>
        </div>
        <div className="ideas-toolbar">
          {view === "list" ? <div className="ideas-status-filters" role="group" aria-label="Filtrar ideias por status">
            <button className={statusFilter === "all" ? "ideas-filter is-active" : "ideas-filter"} type="button" aria-pressed={statusFilter === "all"} onClick={() => { setStatusFilter("all"); setVisibleCount(PAGE_SIZE); }}>Todas <span>{ideas.length}</span></button>
            {IDEA_STATUSES.map(({ value, label }: any) => <button key={value} className={statusFilter === String(value) ? "ideas-filter is-active" : "ideas-filter"} type="button" aria-pressed={statusFilter === String(value)} onClick={() => { setStatusFilter(String(value)); setVisibleCount(PAGE_SIZE); }}>{label} <span>{counts.get(value)}</span></button>)}
          </div> : <p className="ideas-board-hint">Arraste os cards entre colunas ou use “Mover para”.</p>}
          <div className="ideas-sort"><SearchableSelect value={sort} onChange={(value: any) => setSort(value)} options={SORT_OPTIONS} clearable={false} aria-label="Ordenar ideias" /></div>
          <label className="ideas-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar ideias</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} placeholder="Buscar ideias" /></label>
        </div>
        {notice && <p className="ideas-feedback ideas-feedback-success" role="status">{notice}</p>}
        {loadError && <div className="ideas-feedback ideas-feedback-error" role="alert"><span>{loadError}</span><button type="button" onClick={refresh}>Tentar novamente</button></div>}
        {loading && !ideas.length ? <div className="ideas-loading" role="status" aria-label="Carregando ideias"><span /><span /><span /></div> : !loadError && (view === "board" ? renderBoard() : renderList())}
      </section>
      {drawer && <IdeaDrawer idea={drawer.idea} onClose={() => setDrawer(null)} onSave={handleSave} onArchive={handleArchive} />}
    </div>
  );
}
