// Detalhe do projeto no Planner: coluna (só leitura) e prazo no topo; título, descrição e checklist (Salvar) e anexos com áudio (enviados na hora).
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dialog, Drawer, Textarea, useToast } from "@betinhos/ui";
import { Paperclip, Plus, X } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import type { Row } from "@betinhos/dataverse";
import { reasonText, type Source } from "../projetos/data/source";
import { AnexoAudio, AnexoMiniatura } from "../projetos/components/AnexoMiniatura";
import { ehAudio } from "../projetos/domain/anexos";
import { MAX_ITEM, gravarChecklist, progresso, type ChecklistItem } from "../projetos/domain/checklist";
import type { Atualizacao, Perfil, Projeto } from "../projetos/domain/types";
import { gravarPrazo, mesmoPrazo, type Prazo } from "../projetos/domain/prazo";
import { STATUS, autorDoPerfil } from "../projetos/domain/choices";
import { PrazoCampo } from "../projetos/components/PrazoCampo";
import { COLUMN_STYLE, labelOf } from "../projetos/components/colunas";
import { acceptFiles, namePastedFile, type ProjectCard } from "../domain/projectsBoard";
import "../projetos/projetos.css";

const ACCEPT = "image/*,video/*,audio/*,application/pdf";
const NOME_MAX = 200;

type Props = {
  projeto: Projeto | null;
  atualizacoes: Atualizacao[];
  /** Cartão do projeto no quadro: coluna atual e motivo da pausa. */
  card: ProjectCard | null;
  perfil: Perfil;
  source: Source;
  onClose: () => void;
  onSaved: (p: Projeto) => void;
  onAtualizacao: (a: Atualizacao) => void;
};

export function ProjectDetailDrawer({ projeto, ...rest }: Props) {
  return projeto ? <Detalhe key={projeto.id} projeto={projeto} {...rest} /> : <Drawer open={false} onClose={rest.onClose} title="Projeto">{null}</Drawer>;
}

function Detalhe({ projeto, atualizacoes, card, perfil, source, onClose, onSaved, onAtualizacao }: Props & { projeto: Projeto }) {
  const toast = useToast();
  const [nome, setNome] = useState(projeto.nome);
  const [descricao, setDescricao] = useState(projeto.briefing);
  const [itens, setItens] = useState<ChecklistItem[]>(projeto.checklist);
  const [novoItem, setNovoItem] = useState("");
  const [prazo, setPrazo] = useState<Prazo | null>(projeto.prazo);
  const [nomeErro, setNomeErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");
  // Contador: gravação e colagem podem subir juntas; só libera o fechar quando todas terminam.
  const [envios, setEnvios] = useState(0);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [descartar, setDescartar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tituloRef = useRef<HTMLInputElement>(null);

  const enviando = envios > 0;
  const ocupado = salvando || enviando;
  const sujo = nome.trim() !== projeto.nome || descricao.trim() !== projeto.briefing.trim() || gravarChecklist(itens) !== gravarChecklist(projeto.checklist) || Boolean(novoItem.trim())
    || !mesmoPrazo(prazo, projeto.prazo);
  const doProjeto = useMemo(() => atualizacoes.filter((a) => a.projetoId === projeto.id).sort((a, b) => b.data.localeCompare(a.data)), [atualizacoes, projeto.id]);
  // A transcrição é da atualização: aparece só sob o primeiro áudio dela.
  const anexos = doProjeto.flatMap((a) => {
    const primeiroAudio = a.anexos.findIndex((x) => ehAudio(x.tipo));
    return a.anexos.map((anexo, i) => ({ anexo, transcricao: i === primeiroAudio ? a.transcricao || "Transcrição pendente" : "" }));
  });
  const arquivos = anexos.filter(({ anexo }) => !ehAudio(anexo.tipo));
  const audios = anexos.filter(({ anexo }) => ehAudio(anexo.tipo));

  function fechar() {
    if (ocupado) { toast({ tone: "info", message: "Aguarde o envio terminar." }); return; }
    if (sujo) { setDescartar(true); return; }
    onClose();
  }

  function adicionarItem() {
    const texto = novoItem.trim();
    if (!texto) return;
    setItens((lista) => [...lista, { texto, feito: false }]);
    setNovoItem("");
  }

  async function salvar(event?: React.FormEvent) {
    event?.preventDefault();
    if (ocupado) return;
    const titulo = nome.trim();
    if (!titulo) { setNomeErro("Dê um título para o projeto."); return; }
    setNomeErro("");
    // Item digitado e não adicionado entra junto, para não se perder.
    const lista = novoItem.trim() ? [...itens, { texto: novoItem.trim(), feito: false }] : itens;
    const texto = descricao.trim();
    // Só as colunas que mudaram: não sobrescreve o que um agente gravou nas outras
    // nem apaga um checklist que a tela não soube ler.
    const changes: Row = {};
    if (titulo !== projeto.nome) changes.cr40f_name = titulo;
    if (texto !== projeto.briefing.trim()) changes.cr40f_briefing = texto || null;
    if (gravarChecklist(lista) !== gravarChecklist(projeto.checklist)) changes.cr40f_checklist = gravarChecklist(lista);
    if (!mesmoPrazo(prazo, projeto.prazo)) Object.assign(changes, gravarPrazo(prazo));
    setSalvando(true);
    try {
      if (Object.keys(changes).length) await source.updateProjeto(projeto.id, changes);
      setErroSalvar("");
      setItens(lista);
      setNovoItem("");
      onSaved({ ...projeto, nome: titulo, briefing: texto, checklist: lista, prazo });
      toast({ tone: "success", message: `${projeto.codigo} salvo.` });
    } catch (reason) {
      setErroSalvar(`Não foi possível salvar. ${reasonText(reason)}`);
    } finally {
      setSalvando(false);
    }
  }

  // Anexo sobe na hora, como atualização sem etapa (anexo do projeto).
  async function anexar(incoming: File[]) {
    if (!incoming.length) return;
    if (salvando) { setAvisos(["Aguarde o salvamento terminar para anexar."]); return; }
    const { accepted, errors } = acceptFiles([], incoming);
    setAvisos(errors);
    if (!accepted.length) return;
    setEnvios((n) => n + 1);
    try {
      const nova = await source.addAtualizacao({ projetoId: projeto.id, etapaId: null, data: new Date().toISOString(), autor: autorDoPerfil(perfil), texto: "", prova: false }, accepted);
      onAtualizacao(nova);
    } catch (reason) {
      setAvisos([...errors, `Não foi possível anexar. ${reasonText(reason)}`]);
    } finally {
      setEnvios((n) => n - 1);
    }
  }

  // Ctrl+V com o detalhe aberto: print ou arquivo copiado vira anexo; texto colado segue normal.
  const anexarRef = useRef(anexar);
  anexarRef.current = anexar;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      // Texto colado num campo segue normal, mesmo que o Excel/Word mande uma imagem junto.
      const alvo = event.target as HTMLElement | null;
      const editavel = alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || Boolean(alvo?.isContentEditable);
      if (editavel && event.clipboardData?.types.includes("text/plain")) return;
      event.preventDefault();
      void anexarRef.current(files.map((file) => namePastedFile(file)));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // O <dialog> põe o foco no primeiro campo (o título) e ele abriria com cara de edição: o foco vai para o X.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === tituloRef.current) tituloRef.current?.closest("dialog")?.querySelector<HTMLElement>(".bt-drawer__close")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const feito = progresso(itens);
  const status = card?.status ?? STATUS.ideia;
  const coluna = COLUMN_STYLE[status] ?? COLUMN_STYLE[STATUS.ideia];
  const ColunaIcon = coluna.icon;
  const motivoPausa = status === STATUS.pausada ? card?.etapa?.motivoPausa ?? "" : "";
  return (
    <>
      <Drawer open onClose={fechar} size="wide" eyebrow={projeto.codigo}
        title={<>
          {/* Nome do painel para leitor de tela (o título visível é o campo editável). */}
          <span className="bt-sr-only">{projeto.codigo} · {projeto.nome}</span>
          <input ref={tituloRef} className="pj-titulo" form="pj-detalhe" value={nome} maxLength={NOME_MAX} disabled={salvando} aria-label="Título"
            aria-invalid={nomeErro ? true : undefined} aria-describedby={nomeErro ? "pj-titulo-erro" : undefined}
            onChange={(event) => { setNome(event.target.value); if (nomeErro) setNomeErro(""); }} />
        </>}
        footer={
          <div className="projects-drawer-foot">
            <Button variant="secondary" onClick={fechar} disabled={ocupado}>Fechar</Button>
            <Button type="submit" form="pj-detalhe" loading={salvando} disabled={!sujo || enviando}>Salvar</Button>
          </div>
        }>
        <form id="pj-detalhe" className="pj-detalhe" onSubmit={salvar}
          onDragOver={(event) => { if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault(); }}
          onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); void anexar(Array.from(event.dataTransfer.files)); }}>
          {nomeErro && <p id="pj-titulo-erro" className="pj-erro" role="alert">{nomeErro}</p>}
          {erroSalvar && <Alert tone="danger" onDismiss={() => setErroSalvar("")}>{erroSalvar}</Alert>}
          <dl className="pj-props">
            <div className="pj-props__linha">
              <dt>Coluna</dt>
              <dd>
                <span className={`pj-coluna is-${coluna.key}`} title={coluna.hint}><ColunaIcon size={14} aria-hidden="true" />{labelOf(status)}</span>
                {motivoPausa && <p className="pj-props__nota">{motivoPausa}</p>}
              </dd>
            </div>
            <div className="pj-props__linha">
              <dt>Prazo</dt>
              <dd><PrazoCampo value={prazo} onChange={setPrazo} disabled={salvando} concluido={status === STATUS.concluida} /></dd>
            </div>
          </dl>

          <section className="pj-bloco" aria-labelledby="pj-descricao">
            <h3 id="pj-descricao" className="pj-lbl">Descrição</h3>
            <Textarea className="pj-desc" aria-labelledby="pj-descricao" value={descricao} rows={2} disabled={salvando} placeholder="O que é, para quem e por quê."
              onChange={(event) => setDescricao(event.target.value)} />
          </section>

          <section className="pj-bloco" aria-labelledby="pj-checklist">
            <h3 id="pj-checklist" className="pj-lbl">Checklist {feito && <span className="pj-num">{feito}</span>}</h3>
            {itens.length > 0 && (
              <div className="pj-barra" aria-hidden="true">
                <span style={{ width: `${(itens.filter((item) => item.feito).length / itens.length) * 100}%` }} />
              </div>
            )}
            <ul className="pj-check">
              {itens.map((item, index) => (
                <li key={`${index}-${item.texto}`} className={item.feito ? "is-feito" : undefined}>
                  <Checkbox label={item.texto} checked={item.feito} disabled={salvando}
                    onChange={() => setItens((lista) => lista.map((it, i) => (i === index ? { ...it, feito: !it.feito } : it)))} />
                  <button type="button" className="pj-check__rm" disabled={salvando} aria-label={`Remover ${item.texto}`}
                    onClick={() => setItens((lista) => lista.filter((_, i) => i !== index))}><X size={14} /></button>
                </li>
              ))}
              <li className="pj-check__novo">
                <Plus size={16} aria-hidden="true" />
                <input value={novoItem} maxLength={MAX_ITEM} disabled={salvando} placeholder="Adicionar item" aria-label="Novo item do checklist"
                  onChange={(event) => setNovoItem(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); adicionarItem(); } }} />
              </li>
            </ul>
          </section>

          <section className="pj-bloco" aria-labelledby="pj-anexos">
            <div className="pj-bloco__topo">
              <h3 id="pj-anexos" className="pj-lbl">Anexos {anexos.length > 0 && <span className="pj-num">{anexos.length}</span>}</h3>
              <div className="pj-acoes">
                <button type="button" className="pj-acao" disabled={ocupado} onClick={() => inputRef.current?.click()}>
                  <Paperclip size={16} aria-hidden="true" /> {enviando ? "Enviando..." : "Anexar"}
                </button>
                <AudioRecorder compact disabled={ocupado} onRecorded={(file) => void anexar([file])} onError={(message) => setAvisos([message])} />
              </div>
            </div>
            {arquivos.length > 0 && (
              <div className="pj-gal">
                {arquivos.map(({ anexo }) => <AnexoMiniatura key={anexo.id} anexo={anexo} source={source} />)}
              </div>
            )}
            {audios.length > 0 && (
              <ul className="pj-audios">
                {audios.map(({ anexo, transcricao }) => (
                  <li key={anexo.id}>
                    <AnexoAudio anexo={anexo} source={source} />
                    {transcricao && <p className="pj-brief__transcricao">{transcricao}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="pj-muted">Arraste ou cole (<kbd>Ctrl</kbd> + <kbd>V</kbd>) imagens, vídeos, áudios ou PDF de até 5 MB.</p>
            <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden aria-label="Escolher anexos"
              onChange={(event) => { void anexar(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            {avisos.length > 0 && (
              <Alert tone="danger" onDismiss={() => setAvisos([])}>
                {avisos.map((aviso) => <div key={aviso}>{aviso}</div>)}
              </Alert>
            )}
          </section>

        </form>
      </Drawer>
      <Dialog open={descartar} onClose={() => setDescartar(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setDescartar(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setDescartar(false); onClose(); }}>Descartar</Button>
        </>}>
        As alterações deste projeto (título, descrição, prazo ou checklist) ainda não foram salvas.
      </Dialog>
    </>
  );
}
