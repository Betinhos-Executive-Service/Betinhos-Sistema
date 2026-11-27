// Projetos no Planner: quadro dos projetos (cr40f_projeto) por situação; clique no cartão abre o detalhe.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Dialog, StatusBadge, Textarea, ToastProvider, useToast } from "@betinhos/ui";
import { CalendarClock, Film, Image as ImageIcon, ListChecks, LoaderCircle, Mic, PauseCircle, Plus, RefreshCw } from "lucide-react";
import PageHeader from '../components/PageHeader';
import { NewProjectDrawer, type CreatedProject } from '../components/NewProjectDrawer';
import { ProjectDetailDrawer } from '../components/ProjectDetailDrawer';
import type { Host } from '../../../host';
import type { Row } from "@betinhos/dataverse";
import { useQueryId } from '../../../nav/queryState';
import { createSource, reasonText } from '../projetos/data/source';
import { useProjetos } from '../projetos/useProjetos';
import { STATUS } from '../projetos/domain/choices';
import { COLUMN_STYLE, labelOf } from '../projetos/components/colunas';
import { progresso } from '../projetos/domain/checklist';
import { codigoEtapa1 } from '../projetos/domain/regras';
import { faltaPrazo, hojeIso, rotuloPrazo, situacaoPrazo } from '../projetos/domain/prazo';
import type { Etapa, Perfil } from '../projetos/domain/types';
import { BOARD_COLUMNS, attachmentKind, cardsByStatus, projectCards, type ProjectCard } from '../domain/projectsBoard';

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
  // Cartões com gravação em voo: já estão na coluna nova (otimista) e não podem ser movidos de novo até a resposta.
  const [movendo, setMovendo] = useState<ReadonlySet<string>>(new Set());
  const [freshId, setFreshId] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [pausar, setPausar] = useState<ProjectCard | null>(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => { let alive = true; void source.perfil().then((p) => { if (alive) setPerfil(p); }); return () => { alive = false; }; }, [source]);
  useEffect(() => {
    if (!freshId) return undefined;
    const timer = window.setTimeout(() => setFreshId(""), 1200);
    return () => window.clearTimeout(timer);
  }, [freshId]);

  const cards = useMemo(() => projectCards(data.projetos, data.etapas, data.atualizacoes), [data.projetos, data.etapas, data.atualizacoes]);
  const columns = useMemo(() => cardsByStatus(cards), [cards]);
  const hoje = hojeIso();
  const flipRef = useFlip(cards.map((c) => `${c.projeto.id}:${c.status}`).join("|"));

  // Guarda e cartões atuais em ref: "Desfazer" e "Tentar de novo" rodam a partir de toasts antigos (closure velha).
  const movendoRef = useRef(new Set<string>());
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const cardAtual = (id: string) => cardsRef.current.find((c) => c.projeto.id === id);

  const marcarMovendo = (id: string, ligado: boolean) => setMovendo((atual) => {
    const proximo = new Set(atual);
    if (ligado) proximo.add(id); else proximo.delete(id);
    return proximo;
  });

  /**
   * Otimista: o cartão vai para a coluna nova na hora e grava por trás; se falhar, volta e avisa com "Tentar de novo".
   * Pausado grava o motivo (opcional) junto; sair de Pausado limpa o motivo. `podeDesfazer` falso no próprio desfazer.
   */
  async function move(card: ProjectCard, novo: number, motivoPausa = "", podeDesfazer = true) {
    const id = card.projeto.id;
    if (movendoRef.current.has(id) || novo === card.status) return;
    movendoRef.current.add(id);
    const motivoNovo = novo === STATUS.pausada ? motivoPausa.trim().slice(0, 500) : "";
    const anterior = card.etapa;
    const codigo = codigoEtapa1(card.projeto.codigo);
    const otimista: Etapa = anterior
      ? { ...anterior, status: novo, motivoPausa: motivoNovo }
      : { id: `tmp-${id}`, projetoId: id, numero: 1, codigo, nome: "", status: novo, prazo: null, andamento: 0, linkPr: "", publicadoProd: null, motivoPausa: motivoNovo };
    data.upsertEtapa(otimista);
    marcarMovendo(id, true);
    const nome = card.projeto.codigo || card.projeto.nome;
    try {
      let gravada = otimista;
      if (anterior) {
        const changes: Row = { cr40f_status: novo };
        if (motivoNovo !== anterior.motivoPausa) changes.cr40f_motivopausa = motivoNovo || null;
        await source.updateEtapa(anterior.id, changes);
      } else {
        const etapaId = await source.createEtapa({ cr40f_status: novo, ...(motivoNovo ? { cr40f_motivopausa: motivoNovo } : {}) }, { projetoId: id, numero: 1, codigo });
        gravada = { ...otimista, id: etapaId };
        data.removeEtapa(otimista.id);
        data.upsertEtapa(gravada);
      }
      setAnnouncement(`${card.projeto.nome} agora em ${labelOf(novo)}.`);
      if (novo === STATUS.concluida) setFreshId(id);
      toast({
        tone: "success",
        message: podeDesfazer ? `${nome} movido para ${labelOf(novo)}.` : `${nome} voltou para ${labelOf(novo)}.`,
        // Só desfaz se o cartão ainda estiver onde este movimento o deixou.
        action: podeDesfazer ? { label: "Desfazer", onClick: () => { const atual = cardAtual(id); if (atual?.status === novo) void move(atual, card.status, anterior?.motivoPausa ?? "", false); } } : undefined,
      });
    } catch (reason) {
      if (anterior) data.upsertEtapa(anterior); else data.removeEtapa(otimista.id);
      setAnnouncement(`${card.projeto.nome} voltou para ${labelOf(card.status)}.`);
      toast({
        tone: "danger",
        message: `Não foi possível mover ${nome}; ele voltou para ${labelOf(card.status)}. ${reasonText(reason)}`,
        action: { label: "Tentar de novo", onClick: () => { const atual = cardAtual(id); if (atual) void move(atual, novo, motivoPausa, podeDesfazer); } },
      });
    } finally {
      movendoRef.current.delete(id);
      marcarMovendo(id, false);
    }
  }

  const drop = (status: number) => {
    const card = cards.find((c) => c.projeto.id === dragId);
    setDragId("");
    setDropStatus(null);
    if (!card || card.status === status) return;
    if (status === STATUS.pausada) { setMotivo(""); setPausar(card); return; }
    void move(card, status);
  };

  const confirmarPausa = (comMotivo: boolean) => {
    const card = pausar;
    setPausar(null);
    if (card) void move(card, STATUS.pausada, comMotivo ? motivo : "");
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
                  const prazo = card.projeto.prazo;
                  const situacao = prazo && card.status !== STATUS.concluida ? situacaoPrazo(prazo, hoje) : "ok";
                  const motivoPausa = card.status === STATUS.pausada ? card.etapa?.motivoPausa : "";
                  return (
                    <article
                      key={id}
                      ref={flipRef(id)}
                      className={`projects-card${dragId === id ? " is-dragging" : ""}${freshId === id ? " is-fresh" : ""}${movendo.has(id) ? " is-moving" : ""}`}
                      style={{ "--i": Math.min(index, 8) } as any}
                      draggable={!movendo.has(id)}
                      aria-busy={movendo.has(id)}
                      onDragStart={(event) => { setDragId(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }}
                      onDragEnd={() => { setDragId(""); setDropStatus(null); }}
                    >
                      <span className="projects-card-code">{card.projeto.codigo || "Novo"}</span>
                      {movendo.has(id) && <span className="projects-card-salvando"><LoaderCircle size={12} className="pj-spin" aria-hidden="true" />Salvando…</span>}
                      <h3><button type="button" className="projects-card-open" onClick={() => setOpenId(id)}>{card.projeto.nome}</button></h3>
                      {card.projeto.briefing && <p>{card.projeto.briefing}</p>}
                      {motivoPausa && <p className="projects-card-pausa" title={motivoPausa}><PauseCircle size={13} aria-hidden="true" /><span><span className="sr-only">Motivo da pausa: </span>{motivoPausa}</span></p>}
                      <footer className="projects-card-foot">
                        {prazo && (
                          <span className={`projects-card-prazo is-${situacao}`} title={`Prazo: ${rotuloPrazo(prazo, hoje)}${card.status === STATUS.concluida ? "" : ` · ${faltaPrazo(prazo, hoje)}`}`}>
                            <CalendarClock size={13} aria-hidden="true" /><span className="sr-only">Prazo: </span>{rotuloPrazo(prazo, hoje)}
                            {situacao !== "ok" && <b>{faltaPrazo(prazo, hoje)}</b>}
                          </span>
                        )}
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
          card={cards.find((c) => c.projeto.id === openId) ?? null} perfil={perfil} source={source} onClose={() => setOpenId(null)} onSaved={data.upsert} onAtualizacao={data.addAtualizacao} />
      )}
      <Dialog open={!!pausar} onClose={() => setPausar(null)} title={`Pausar “${pausar?.projeto.nome ?? ""}”`}
        actions={<>
          <Button variant="secondary" onClick={() => confirmarPausa(false)}>Pausar sem motivo</Button>
          <Button onClick={() => confirmarPausa(true)}>Pausar</Button>
        </>}>
        <label className="projects-pausa-field">
          <span>Motivo (opcional)</span>
          <Textarea value={motivo} maxLength={500} rows={3} autoFocus placeholder="Ex.: esperando o financeiro definir os limites."
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setMotivo(event.target.value)}
            onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); confirmarPausa(true); } }} />
          <small>O motivo aparece no cartão enquanto ele estiver em Pausado. Ctrl+Enter pausa.</small>
        </label>
      </Dialog>
      <NewProjectDrawer open={drawerOpen} source={source} perfil={perfil} onClose={() => setDrawerOpen(false)} onCreated={onCreated} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}

export default function ProjectsView({ host }: { host?: Host }) {
  return <ToastProvider><Board host={host} /></ToastProvider>;
}
