import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { isMockChecklists, type ChecklistFotoEnviada } from "../domain/checklists";
import { createFotos, createFotosMock, type CarregarFoto, type FotoCarregada } from "../data/fotosChecklist";

// Um carregador por sessão: o cache por link vale para o detalhe e para a aba Padrões.
let carregador: CarregarFoto | null = null;
const obterCarregador = () => (carregador ??= isMockChecklists() ? createFotosMock(new URLSearchParams(window.location.search).get("fotos") ?? "") : createFotos());

type Estado = { status: "carregando" } | { status: "pronta"; foto: FotoCarregada } | { status: "falhou"; erro: string };
type Resultado = { link: string; foto?: FotoCarregada; erro?: string };

// O resultado guarda o link: ao trocar de foto, o estado da anterior nunca aparece, e a que já chegou vem do cache na hora.
function useFoto(foto: ChecklistFotoEnviada, ativo: boolean) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [imagemFalhou, setImagemFalhou] = useState("");
  const pronta = ativo ? obterCarregador().pronta(foto.link) : undefined;
  useEffect(() => {
    if (!ativo || pronta) return;
    let vivo = true;
    const { link } = foto;
    obterCarregador()(foto).then(
      (carregada) => { if (vivo) setResultado({ link, foto: carregada }); },
      (error: unknown) => { if (vivo) setResultado({ link, erro: error instanceof Error ? error.message : String(error) }); }
    );
    return () => { vivo = false; };
  }, [ativo, pronta, foto.link, foto.nomeArquivo]);
  const atual = resultado?.link === foto.link ? resultado : null;
  // O blob pode não ser uma imagem que o navegador abre (ex.: HEIC): trata como falha.
  const carregada = pronta ?? atual?.foto;
  const estado: Estado = imagemFalhou === foto.link ? { status: "falhou", erro: "O navegador não abre este formato." }
    : carregada ? { status: "pronta", foto: carregada }
    : atual?.erro !== undefined ? { status: "falhou", erro: atual.erro }
    : { status: "carregando" };
  return { estado, onImagemErro: () => setImagemFalhou(foto.link) };
}

// Só carrega quando a miniatura chega perto da tela; sem IntersectionObserver, carrega logo.
function useVisivel<T extends Element>() {
  const ref = useRef<T>(null);
  const [visivel, setVisivel] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (visivel || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisivel(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visivel]);
  return { ref, visivel };
}

function Falha({ foto, erro, className }: { foto: ChecklistFotoEnviada; erro: string; className: string }) {
  return (
    <span className={className} title={erro}>
      <a href={foto.link} target="_blank" rel="noreferrer"><Icon name="externalLink" size={14} />Abrir foto</a>
      <small>Sem prévia</small>
    </span>
  );
}

function Miniatura({ foto, alt, onAbrir }: { foto: ChecklistFotoEnviada; alt: string; onAbrir: (botao: HTMLButtonElement) => void }) {
  const { ref, visivel } = useVisivel<HTMLSpanElement>();
  const { estado, onImagemErro } = useFoto(foto, visivel);
  return (
    <span ref={ref} className="chk-thumb-slot">
      {estado.status === "pronta" ? (
        <button type="button" className="chk-thumb" onClick={(event) => onAbrir(event.currentTarget)}>
          <img src={estado.foto.url} alt={alt} loading="lazy" decoding="async" onError={onImagemErro} />
        </button>
      ) : estado.status === "falhou" ? <Falha foto={foto} erro={estado.erro} className="chk-thumb-falha" />
        : <span className="chk-thumb is-loading" role="img" aria-label={`Carregando ${alt}`} />}
    </span>
  );
}

/** Miniaturas das fotos de um item; o clique abre o visualizador com as fotos do mesmo item. */
export function FotosChecklist({ fotos, rotulo }: { fotos: ChecklistFotoEnviada[]; rotulo: string }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const origem = useRef<HTMLElement | null>(null);
  const fechar = () => {
    setAberta(null);
    // Devolve o foco a quem abriu (a miniatura continua na tela).
    requestAnimationFrame(() => origem.current?.focus({ preventScroll: true }));
  };
  return (
    <span className="chk-thumbs">
      {fotos.map((foto, index) => (
        <Miniatura key={`${foto.link}-${index}`} foto={foto} alt={`${rotulo}, foto ${index + 1}`} onAbrir={(botao) => { origem.current = botao; setAberta(index); }} />
      ))}
      {aberta !== null ? <Visualizador fotos={fotos} rotulo={rotulo} indice={aberta} onIndice={setAberta} onFechar={fechar} /> : null}
    </span>
  );
}

function Visualizador({ fotos, rotulo, indice, onIndice, onFechar }: {
  fotos: ChecklistFotoEnviada[];
  rotulo: string;
  indice: number;
  onIndice: (indice: number) => void;
  onFechar: () => void;
}) {
  const foto = fotos[indice];
  const { estado, onImagemErro } = useFoto(foto, true);
  const painel = useRef<HTMLDivElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const titulo = useId();
  const varias = fotos.length > 1;
  const ir = (delta: -1 | 1) => onIndice((indice + delta + fotos.length) % fotos.length);

  useEffect(() => { fecharRef.current?.focus(); }, []);

  // Teclado no document: clicar na foto ou numa área vazia tira o foco do painel, e Esc/setas/Tab continuam valendo.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onFechar(); return; }
      if (varias && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); ir(event.key === "ArrowLeft" ? -1 : 1); return; }
      if (event.key !== "Tab" || !painel.current) return;
      const focaveis = Array.from(painel.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"));
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const dentro = painel.current.contains(document.activeElement);
      if (event.shiftKey && (!dentro || document.activeElement === primeiro)) { event.preventDefault(); ultimo.focus(); }
      else if (!event.shiftKey && (!dentro || document.activeElement === ultimo)) { event.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });

  // O portal sai do wrapper da aba: repete a classe raiz para o CSS escopado valer no visualizador.
  return createPortal(
    <div className="gestao-checklists"><div className="gestao-modal foto-viewer-modal">
      <button type="button" className="gestao-modal-backdrop" aria-label="Fechar foto" tabIndex={-1} onClick={onFechar} />
      <div ref={painel} className="foto-viewer" role="dialog" aria-modal="true" aria-labelledby={titulo}>
        <div className="foto-viewer-head">
          <div><h2 id={titulo}>{rotulo}</h2><small aria-live="polite">Foto {indice + 1} de {fotos.length}</small></div>
          <button ref={fecharRef} type="button" className="mod-icon-button" aria-label="Fechar" onClick={onFechar}><Icon name="close" size={16} /></button>
        </div>
        <div className="foto-viewer-stage">
          {estado.status === "pronta" ? <img src={estado.foto.url} alt={`${rotulo}, foto ${indice + 1}`} onError={onImagemErro} />
            : estado.status === "falhou" ? <Falha foto={foto} erro={estado.erro} className="chk-thumb-falha is-large" />
            : <span className="foto-viewer-skeleton" role="img" aria-label={`Carregando ${rotulo}, foto ${indice + 1}`} />}
          {varias ? (
            <>
              <button type="button" className="mod-icon-button foto-viewer-nav is-prev" aria-label="Foto anterior" onClick={() => ir(-1)}><Icon name="chevronLeft" size={16} /></button>
              <button type="button" className="mod-icon-button foto-viewer-nav is-next" aria-label="Próxima foto" onClick={() => ir(1)}><Icon name="chevronRight" size={16} /></button>
            </>
          ) : null}
        </div>
        <div className="foto-viewer-actions">
          <a className="gestao-button is-secondary is-compact" href={foto.link} target="_blank" rel="noreferrer"><Icon name="externalLink" size={14} />Abrir original</a>
        </div>
      </div>
    </div></div>,
    document.body
  );
}
