// Projetos no Planner: quadro dos projetos do módulo #/projetos (cr40f_projeto), por situação.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, ToastProvider, useToast } from "@betinhos/ui";
import { ArrowRight, ChevronLeft, CircleCheck, ExternalLink, Film, Image as ImageIcon, Lightbulb, Mic, PauseCircle, Plus, RefreshCw, Wrench, Eye } from "lucide-react";
import PageHeader from '../components/PageHeader';
import { NewProjectDrawer, type CreatedProject } from '../components/NewProjectDrawer';
import type { Host } from '../../../host';
import { hrefFor } from '../../../nav/useHashRoute';
import { createSource, reasonText } from '../../projetos/data/source';
import { useProjetos } from '../../projetos/useProjetos';
import { STATUS } from '../../projetos/domain/choices';
import { codigoEtapa1 } from '../../projetos/domain/regras';
import type { Perfil } from '../../projetos/domain/types';
import { BOARD_COLUMNS, attachmentKind, cardsByStatus, moveError, projectCards, type ProjectCard } from '../domain/projectsBoard';

const COLUMN_STYLE: Record<number, { key: string; icon: any; hint: string }> = {
  [STATUS.ideia]: { key: "idea", icon: Lightbulb, hint: "Anotada, ainda sem forma" },
  [STATUS.andamento]: { key: "build", icon: Wrench, hint: "Em construção" },
  [STATUS.validacao]: { key: "review", icon: Eye, hint: "Pronta para conferir" },
  [STATUS.concluida]: { key: "live", icon: CircleCheck, hint: "Entregue e em uso" },
  [STATUS.pausada]: { key: "paused", icon: PauseCircle, hint: "Parada por enquanto" },
};
// Ordem do fluxo para avançar e voltar; Pausado fica fora da sequência.
const FLOW = [STATUS.ideia, STATUS.andamento, STATUS.validacao, STATUS.concluida];
const labelOf = (status: number) => BOARD_COLUMNS.find((c) => c.value === status)?.label ?? "Ideia";

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
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 280, easing: "cubic-bezier(.23, 1, .32, 1)" });
    });
    rects.current = next;
  }, [listKey]);
  return (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
}

function AttachmentCounts({ card }: { card: ProjectCard }) {
  const counts = { audio: 0, image: 0, video: 0 };
  for (const anexo of card.anexos) {
    const kind = attachmentKind(anexo.tipo);
    if (kind in counts) counts[kind as keyof typeof counts] += 1;
  }
  const items = [
    { n: counts.audio, Icon: Mic, label: "áudio" },
    { n: counts.image, Icon: ImageIcon, label: "foto" },
    { n: counts.video, Icon: Film, label: "vídeo" },
  ].filter((item) => item.n > 0);
  if (!items.length) return null;
  return (
    <span className="projects-card-media" aria-label={items.map((i) => `${i.n} ${i.label}${i.n > 1 ? "s" : ""}`).join(", ")}>
      {items.map(({ n, Icon, label }) => <span key={label}><Icon size={13} aria-hidden="true" />{n}</span>)}
    </span>
  );
}

function Board({ host }: { host?: Host }) {
  const source = useMemo(() => createSource(host ?? { mode: "mock" }), [host]);
  const data = useProjetos(source);
  const toast = useToast();
  const [perfil, setPerfil] = useState<Perfil>("gestor");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragId, setDragId] = useState("");
  const [dropStatus, setDropStatus] = useState<number | null>(null);
  const [movingId, setMovingId] = useState("");
  const [freshId, setFreshId] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => { let alive = true; void source.perfil().then((p) => { if (alive) setPerfil(p); }); return () => { alive = false; }; }, [source]);
  useEffect(() => {
    if (!freshId) return undefined;
    const timer = window.setTimeout(() => setFreshId(""), 1200);
    return () => window.clearTimeout(timer);
  }, [freshId]);

  const cards = useMemo(() => projectCards(data.projetos, data.etapas, data.atualizacoes), [data.projetos, data.etapas, data.atualizacoes]);
  const columns = useMemo(() => cardsByStatus(cards), [cards]);
  const flipRef = useFlip(cards.map((c) => `${c.projeto.id}:${c.status}`).join("|"));
  const canMove = perfil === "renan";

  async function move(card: ProjectCard, novo: number) {
    if (movingId) return;
    const erro = moveError(card, novo, perfil, data.atualizacoes);
    if (erro) { toast({ tone: "warning", message: erro }); return; }
    if (novo === card.status) return;
    setMovingId(card.projeto.id);
    try {
      if (card.etapa) {
        await source.updateEtapa(card.etapa.id, { cr40f_status: novo });
        data.upsertEtapa({ ...card.etapa, status: novo });
      } else {
        const codigo = codigoEtapa1(card.projeto.codigo);
        const id = await source.createEtapa({ cr40f_status: novo }, { projetoId: card.projeto.id, numero: 1, codigo });
        data.upsertEtapa({ id, projetoId: card.projeto.id, numero: 1, codigo, nome: "", status: novo, prazo: null, andamento: 0, linkPr: "", publicadoProd: null });
      }
      setAnnouncement(`${card.projeto.nome} agora em ${labelOf(novo)}.`);
      if (novo === STATUS.concluida) setFreshId(card.projeto.id);
    } catch (reason) {
      toast({ tone: "danger", message: `Não foi possível mover ${card.projeto.codigo}. ${reasonText(reason)}` });
    } finally {
      setMovingId("");
    }
  }

  const drop = (status: number) => {
    const card = cards.find((c) => c.projeto.id === dragId);
    setDragId("");
    setDropStatus(null);
    if (card && card.status !== status) void move(card, status);
  };

  const onCreated = ({ projeto, etapa, atualizacao, warning }: CreatedProject) => {
    data.upsert(projeto);
    data.upsertEtapa(etapa);
    if (atualizacao) data.addAtualizacao(atualizacao);
    setDrawerOpen(false);
    setFreshId(projeto.id);
    if (warning) toast({ tone: "warning", message: warning });
    else toast({ tone: "success", message: `Ideia ${projeto.codigo} registrada.` });
  };

  const header = (
    <PageHeader
      eyebrow="Software"
      title="Projetos"
      description="Ideias de software da anotação à entrega, num quadro só."
      action={
        <button className="button button-primary" type="button" onClick={() => setDrawerOpen(true)}>
          <Plus size={16} /> Nova ideia
        </button>
      }
    />
  );

  return (
    <div className="page-content projects-page">
      {header}
      {data.error && (
        <Alert tone="danger" action={<Button variant="secondary" size="compact" icon={<RefreshCw size={14} />} onClick={() => void data.reload()}>Tentar de novo</Button>}>
          Não foi possível carregar os projetos. {data.error} Se o erro falar de permissão, peça o papel Projetos.
        </Alert>
      )}
      {!canMove && data.loaded && (
        <p className="projects-footnote">Só o Renan muda a situação dos projetos. Você pode registrar novas ideias.</p>
      )}

      <div className="projects-board" aria-busy={!data.loaded}>
        {BOARD_COLUMNS.map((column, columnIndex) => {
          const style = COLUMN_STYLE[column.value];
          const Icon = style.icon;
          const items = columns.get(column.value) ?? [];
          return (
            <section
              key={column.value}
              className={`projects-column is-${style.key}${dropStatus === column.value ? " is-drop-target" : ""}`}
              style={{ "--i": columnIndex } as any}
              aria-labelledby={`projects-column-${style.key}`}
              onDragOver={(event) => { if (!dragId) return; event.preventDefault(); if (dropStatus !== column.value) setDropStatus(column.value); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropStatus(null); }}
              onDrop={(event) => { event.preventDefault(); drop(column.value); }}
            >
              <header className="projects-column-head">
                <span className="projects-column-icon"><Icon size={16} /></span>
                <div>
                  <h2 id={`projects-column-${style.key}`}>{column.label}</h2>
                  <small>{style.hint}</small>
                </div>
                <span key={items.length} className="projects-column-count">{data.loaded ? items.length : "–"}</span>
              </header>
              <div className="projects-column-list">
                {!data.loaded && <span className="projects-card-skeleton" aria-hidden="true" />}
                {data.loaded && items.length === 0 && (
                  <p className="projects-empty">{column.value === STATUS.ideia ? "Registre a primeira ideia em Nova ideia." : canMove ? "Arraste um projeto para cá." : "Nenhum projeto aqui."}</p>
                )}
                {items.map((card, index) => {
                  const flowIndex = FLOW.indexOf(card.status as (typeof FLOW)[number]);
                  const previous = flowIndex > 0 ? FLOW[flowIndex - 1] : null;
                  const next = flowIndex >= 0 && flowIndex < FLOW.length - 1 ? FLOW[flowIndex + 1] : card.status === STATUS.pausada ? STATUS.andamento : null;
                  const id = card.projeto.id;
                  return (
                    <article
                      key={id}
                      ref={flipRef(id)}
                      className={`projects-card${dragId === id ? " is-dragging" : ""}${freshId === id ? " is-fresh" : ""}${movingId === id ? " is-moving" : ""}`}
                      style={{ "--i": Math.min(index, 8) } as any}
                      draggable={canMove && !movingId}
                      aria-busy={movingId === id}
                      onDragStart={(event) => { setDragId(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }}
                      onDragEnd={() => { setDragId(""); setDropStatus(null); }}
                    >
                      <span className="projects-card-code">{card.projeto.codigo || "Novo"}</span>
                      <h3>{card.projeto.nome}</h3>
                      {card.projeto.briefing && <p>{card.projeto.briefing}</p>}
                      {card.etapa?.nome && <p className="projects-card-next"><strong>Falta:</strong> {card.etapa.nome}</p>}
                      {flowIndex >= 0 && (
                        <div className="projects-progress" role="img" aria-label={`Etapa ${flowIndex + 1} de ${FLOW.length}: ${column.label}`}>
                          {FLOW.map((step, i) => <span key={step} className={i <= flowIndex ? "is-done" : ""} />)}
                        </div>
                      )}
                      <footer className="projects-card-foot">
                        <AttachmentCounts card={card} />
                        <span className="projects-card-actions">
                          <a className="projects-icon-button" href={hrefFor("projetos", { projeto: id })} aria-label={`Abrir ${card.projeto.nome} em Projetos`} title="Abrir no módulo Projetos"><ExternalLink size={15} /></a>
                          {canMove && previous != null && (
                            <button className="projects-icon-button" type="button" disabled={Boolean(movingId)} onClick={() => void move(card, previous)} aria-label={`Voltar ${card.projeto.nome} para ${labelOf(previous)}`} title={`Voltar para ${labelOf(previous)}`}><ChevronLeft size={15} /></button>
                          )}
                          {canMove && next != null && (
                            <button className="projects-chip-button" type="button" disabled={Boolean(movingId)} onClick={() => void move(card, next)} aria-label={`Mover ${card.projeto.nome} para ${labelOf(next)}`}>
                              {labelOf(next)} <ArrowRight size={14} />
                            </button>
                          )}
                        </span>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <NewProjectDrawer open={drawerOpen} source={source} perfil={perfil} onClose={() => setDrawerOpen(false)} onCreated={onCreated} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}

export default function ProjectsView({ host }: { host?: Host }) {
  return <ToastProvider><Board host={host} /></ToastProvider>;
}
