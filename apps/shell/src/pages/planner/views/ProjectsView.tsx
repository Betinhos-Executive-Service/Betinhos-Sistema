// Projetos: gestão simples de ideias e produção de software, em quatro etapas.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, FolderKanban, Lightbulb, PenTool, Plus, Rocket, Trash2, Wrench, X } from "lucide-react";
import PageHeader from '../components/PageHeader';
import {
  PROJECT_STAGES,
  createProject,
  moveProjectTo,
  readProjects,
  shiftProject,
  stageIndex,
  writeProjects,
  type Project,
  type ProjectStage,
} from '../domain/projects';

const STAGE_ICONS: Record<ProjectStage, any> = { idea: Lightbulb, design: PenTool, build: Wrench, live: Rocket };
const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** FLIP: cartão que troca de coluna desliza da posição antiga para a nova. */
function useFlip(listKey: string) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const next = new Map<string, DOMRect>();
    nodes.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect();
      next.set(id, rect);
      const before = rects.current.get(id);
      if (!before || reduce || typeof node.animate !== "function") return;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: 280, easing: "cubic-bezier(.23, 1, .32, 1)" },
      );
    });
    rects.current = next;
  }, [listKey]);
  return (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
}

export default function ProjectsView({ currentUserName = "" }: { currentUserName?: string }) {
  const [projects, setProjects] = useState<Project[]>(() => readProjects());
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [dragId, setDragId] = useState("");
  const [dropStage, setDropStage] = useState<ProjectStage | "">("");
  const [confirmId, setConfirmId] = useState("");
  const [launchedId, setLaunchedId] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSaveFailed(!writeProjects(projects)); }, [projects]);
  useEffect(() => {
    if (!launchedId) return undefined;
    const timer = window.setTimeout(() => setLaunchedId(""), 900);
    return () => window.clearTimeout(timer);
  }, [launchedId]);

  const byStage = useMemo(() => {
    const groups: Record<ProjectStage, Project[]> = { idea: [], design: [], build: [], live: [] };
    [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).forEach((project) => groups[project.stage].push(project));
    return groups;
  }, [projects]);
  const flipKey = projects.map((project) => `${project.id}:${project.stage}`).join("|");
  const flipRef = useFlip(flipKey);
  const total = projects.length;

  const announceStage = (project: Project | undefined, stage: ProjectStage) => {
    if (!project) return;
    const label = PROJECT_STAGES[stageIndex(stage)].label;
    setAnnouncement(`${project.title} agora em ${label}.`);
    if (stage === "live") setLaunchedId(project.id);
  };

  const addProject = (event: any) => {
    event.preventDefault();
    const project = createProject(title, note, currentUserName);
    if (!project) { titleRef.current?.focus(); return; }
    setProjects((list) => [project, ...list]);
    setTitle("");
    setNote("");
    setAnnouncement(`Ideia "${project.title}" adicionada.`);
    titleRef.current?.focus();
  };

  const shift = (project: Project, step: 1 | -1) => {
    const target = PROJECT_STAGES[stageIndex(project.stage) + step]?.id;
    if (!target) return;
    setProjects((list) => shiftProject(list, project.id, step));
    announceStage(project, target);
  };

  const drop = (stage: ProjectStage) => {
    const project = projects.find((item) => item.id === dragId);
    setDragId("");
    setDropStage("");
    if (!project || project.stage === stage) return;
    setProjects((list) => moveProjectTo(list, project.id, stage));
    announceStage(project, stage);
  };

  const remove = (project: Project) => {
    setProjects((list) => list.filter((item) => item.id !== project.id));
    setConfirmId("");
    setAnnouncement(`Projeto "${project.title}" excluído.`);
  };

  return (
    <div className="page-content projects-page">
      <PageHeader
        eyebrow="Software"
        title="Projetos"
        description="Ideias de software da anotação ao ar, num quadro só."
        action={
          <button className="button button-primary" type="button" onClick={() => titleRef.current?.focus()}>
            <Plus size={16} /> Nova ideia
          </button>
        }
      />

      <section className="projects-pipeline" aria-label="Projetos por etapa">
        {PROJECT_STAGES.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.id];
          const count = byStage[stage.id].length;
          return (
            <div key={stage.id} className={`projects-pipeline-step is-${stage.id}`} style={{ "--i": index } as any}>
              <span className="projects-pipeline-icon"><Icon size={18} /></span>
              <span className="projects-pipeline-copy">
                <small>{stage.label}</small>
                <strong key={count} className="projects-count">{count}</strong>
              </span>
              <span className="projects-pipeline-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${total ? count / total : 0})` }} />
              </span>
            </div>
          );
        })}
      </section>

      <form className="panel projects-composer" onSubmit={addProject}>
        <label className="projects-field projects-field-title">
          <span>Nova ideia *</span>
          <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: painel de pontualidade por cliente" maxLength={120} required />
        </label>
        <label className="projects-field">
          <span>Detalhe</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Para quem é e que problema resolve" maxLength={280} />
        </label>
        <button className="button button-primary projects-add" type="submit" disabled={!title.trim()}>
          <Plus size={16} /> Adicionar ideia
        </button>
      </form>
      {saveFailed && (
        <p className="projects-alert" role="alert">Não foi possível guardar neste navegador. Libere o armazenamento local e tente de novo.</p>
      )}

      <div className="projects-board">
        {PROJECT_STAGES.map((stage, columnIndex) => {
          const Icon = STAGE_ICONS[stage.id];
          const items = byStage[stage.id];
          return (
            <section
              key={stage.id}
              className={`projects-column is-${stage.id}${dropStage === stage.id ? " is-drop-target" : ""}`}
              style={{ "--i": columnIndex } as any}
              aria-labelledby={`projects-column-${stage.id}`}
              onDragOver={(event) => { if (!dragId) return; event.preventDefault(); if (dropStage !== stage.id) setDropStage(stage.id); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropStage(""); }}
              onDrop={(event) => { event.preventDefault(); drop(stage.id); }}
            >
              <header className="projects-column-head">
                <span className="projects-column-icon"><Icon size={16} /></span>
                <div>
                  <h2 id={`projects-column-${stage.id}`}>{stage.label}</h2>
                  <small>{stage.hint}</small>
                </div>
                <span key={items.length} className="projects-column-count">{items.length}</span>
              </header>
              <div className="projects-column-list">
                {items.length === 0 && (
                  <p className="projects-empty">{stage.id === "idea" ? "Anote a primeira ideia acima." : "Arraste um projeto para cá ou use Avançar."}</p>
                )}
                {items.map((project, index) => {
                  const position = stageIndex(project.stage);
                  const previous = PROJECT_STAGES[position - 1];
                  const next = PROJECT_STAGES[position + 1];
                  const confirming = confirmId === project.id;
                  return (
                    <article
                      key={project.id}
                      ref={flipRef(project.id)}
                      className={`projects-card${dragId === project.id ? " is-dragging" : ""}${launchedId === project.id ? " is-launched" : ""}`}
                      style={{ "--i": Math.min(index, 8) } as any}
                      draggable
                      onDragStart={(event) => { setDragId(project.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", project.id); }}
                      onDragEnd={() => { setDragId(""); setDropStage(""); }}
                    >
                      <h3>{project.title}</h3>
                      {project.note && <p>{project.note}</p>}
                      <div className="projects-progress" role="img" aria-label={`Etapa ${position + 1} de ${PROJECT_STAGES.length}: ${stage.label}`}>
                        {PROJECT_STAGES.map((item, step) => (
                          <span key={item.id} className={step <= position ? "is-done" : ""} />
                        ))}
                      </div>
                      <footer className="projects-card-foot">
                        <small>
                          {project.author ? `${project.author.split(" ")[0]} · ` : ""}
                          {DATE_FORMATTER.format(new Date(project.createdAt))}
                        </small>
                        {confirming ? (
                          <span className="projects-card-actions">
                            <button className="projects-icon-button" type="button" onClick={() => setConfirmId("")} aria-label="Manter projeto" title="Manter"><X size={15} /></button>
                            <button className="projects-chip-button is-danger" type="button" onClick={() => remove(project)}><Check size={14} /> Excluir</button>
                          </span>
                        ) : (
                          <span className="projects-card-actions">
                            <button className="projects-icon-button" type="button" onClick={() => setConfirmId(project.id)} aria-label={`Excluir ${project.title}`} title="Excluir"><Trash2 size={15} /></button>
                            {previous && (
                              <button className="projects-icon-button" type="button" onClick={() => shift(project, -1)} aria-label={`Voltar ${project.title} para ${previous.label}`} title={`Voltar para ${previous.label}`}><ChevronLeft size={15} /></button>
                            )}
                            {next ? (
                              <button className="projects-chip-button" type="button" onClick={() => shift(project, 1)} aria-label={`Avançar ${project.title} para ${next.label}`}>
                                {next.label} <ArrowRight size={14} />
                              </button>
                            ) : (
                              <span className="projects-live-tag"><Rocket size={13} /> No ar</span>
                            )}
                          </span>
                        )}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {total === 0 && (
        <p className="projects-footnote"><FolderKanban size={14} /> Os projetos ficam guardados neste navegador.</p>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}
