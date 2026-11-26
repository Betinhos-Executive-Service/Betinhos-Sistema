// Projetos no Planner: quadro dos projetos (cr40f_projeto) por situação; clique no cartão abre o detalhe.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, StatusBadge, ToastProvider, useToast } from "@betinhos/ui";
import { CircleCheck, Film, Image as ImageIcon, Lightbulb, ListChecks, Mic, PauseCircle, Plus, RefreshCw, Wrench, Eye } from "lucide-react";
import PageHeader from '../components/PageHeader';
import { NewProjectDrawer, type CreatedProject } from '../components/NewProjectDrawer';
import { ProjectDetailDrawer } from '../components/ProjectDetailDrawer';
import type { Host } from '../../../host';
import { useQueryId } from '../../../nav/queryState';
import { createSource, reasonText } from '../projetos/data/source';
import { useProjetos } from '../projetos/useProjetos';
import { STATUS } from '../projetos/domain/choices';
import { progresso } from '../projetos/domain/checklist';
import { codigoEtapa1 } from '../projetos/domain/regras';
import type { Perfil } from '../projetos/domain/types';
import { BOARD_COLUMNS, attachmentKind, cardsByStatus, projectCards, type ProjectCard } from '../domain/projectsBoard';

const COLUMN_STYLE: Record<number, { key: string; icon: any; hint: string }> = {
  [STATUS.ideia]: { key: "idea", icon: Lightbulb, hint: "Anotada, ainda sem forma" },
  [STATUS.andamento]: { key: "build", icon: Wrench, hint: "Em construção" },
  [STATUS.validacao]: { key: "review", icon: Eye, hint: "Pronta para conferir" },
  [STATUS.concluida]: { key: "live", icon: CircleCheck, hint: "Entregue e em uso" },
  [STATUS.pausada]: { key: "paused", icon: PauseCircle, hint: "Parada por enquanto" },
};
// Ordem do fluxo para avançar e voltar; Pausado fica fora da sequência.
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
  const [openId, setOpenId] = useQueryId("projeto");
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

  async function move(card: ProjectCard, novo: number) {
    if (movingId) return;
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
      {source.mock && (
        <div className="projects-mock">
          <StatusBadge tone="info">Dados de exemplo</StatusBadge>
        </div>
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
                  <p className="projects-empty">{column.value === STATUS.ideia ? "Registre a primeira ideia em Nova ideia." : "Arraste um projeto para cá."}</p>
                )}
                {items.map((card, index) => {
                  const id = card.projeto.id;
                  const checklist = progresso(card.projeto.checklist);
                  return (
                    <article
                      key={id}
                      ref={flipRef(id)}
                      className={`projects-card${dragId === id ? " is-dragging" : ""}${freshId === id ? " is-fresh" : ""}${movingId === id ? " is-moving" : ""}`}
                      style={{ "--i": Math.min(index, 8) } as any}
                      draggable={!movingId}
                      aria-busy={movingId === id}
                      onDragStart={(event) => { setDragId(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }}
                      onDragEnd={() => { setDragId(""); setDropStatus(null); }}
                    >
                      <span className="projects-card-code">{card.projeto.codigo || "Novo"}</span>
                      <h3><button type="button" className="projects-card-open" onClick={() => setOpenId(id)}>{card.projeto.nome}</button></h3>
                      {card.projeto.briefing && <p>{card.projeto.briefing}</p>}
                      <footer className="projects-card-foot">
                        <span className="projects-card-meta">
                          {checklist && <span className="projects-card-media" aria-label={`Checklist ${checklist}`}><span><ListChecks size={13} aria-hidden="true" />{checklist}</span></span>}
                          <AttachmentCounts card={card} />
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

      {data.loaded && (
        <ProjectDetailDrawer projeto={data.projetos.find((p) => p.id === openId) ?? null} atualizacoes={data.atualizacoes}
          perfil={perfil} source={source} onClose={() => setOpenId(null)} onSaved={data.upsert} onAtualizacao={data.addAtualizacao} />
      )}
      <NewProjectDrawer open={drawerOpen} source={source} perfil={perfil} onClose={() => setDrawerOpen(false)} onCreated={onCreated} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}

export default function ProjectsView({ host }: { host?: Host }) {
  return <ToastProvider><Board host={host} /></ToastProvider>;
}
