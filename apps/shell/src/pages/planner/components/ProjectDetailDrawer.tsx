// Detalhe do projeto no Planner: coluna (só leitura) e prazo no topo; título, descrição e checklist (Salvar) e anexos com áudio (enviados na hora).
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dialog, Drawer, Textarea, useToast } from "@betinhos/ui";
import { Check, Clock, FileText, Film, Image as ImageIcon, LoaderCircle, Mic, Paperclip, Plus, Quote, Upload, X } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import type { Row } from "@betinhos/dataverse";
import { reasonText, type Source } from "../projetos/data/source";
import { AnexoAudio, AnexoEnviando, AnexoMiniatura } from "../projetos/components/AnexoMiniatura";
import { ehAudio, ehImagem } from "../projetos/domain/anexos";
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
/** Lote de arquivos subindo como uma atualização; `erro` preenchido = falhou e espera tentar de novo ou descartar. */
type Envio = { id: number; arquivos: File[]; previas: string[]; erro: string };

// Rótulo do atalho de salvar: ⌘ no Mac, Ctrl no resto (o atalho aceita os dois).
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl";

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
  // "Salvo" aparece no rodapé por alguns segundos depois de gravar.
  const [salvo, setSalvo] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");
  // Anexos aparecem na hora, cada lote com seu estado; gravação e colagem podem subir juntas.
  const [envios, setEnvios] = useState<Envio[]>([]);
  const envioSeq = useRef(0);
  // Painel ainda aberto: erro de salvar vira alerta aqui; fechado, vira toast.
  const montado = useRef(true);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [descartar, setDescartar] = useState(false);
  // Item recém-adicionado entra com animação; só ele, para não piscar a lista inteira.
  const [novoIndex, setNovoIndex] = useState(-1);
  // Arquivo sendo arrastado sobre o painel: destaca a zona de soltar.
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tituloRef = useRef<HTMLInputElement>(null);

  // Só lote em voo segura o fechar; lote que falhou fica na tela até tentar de novo ou descartar.
  const enviando = envios.some((e) => !e.erro);
  const falhados = envios.some((e) => e.erro);
  const sujo = nome.trim() !== projeto.nome || descricao.trim() !== projeto.briefing.trim() || gravarChecklist(itens) !== gravarChecklist(projeto.checklist) || Boolean(novoItem.trim())
    || !mesmoPrazo(prazo, projeto.prazo);
  const doProjeto = useMemo(() => atualizacoes.filter((a) => a.projetoId === projeto.id).sort((a, b) => b.data.localeCompare(a.data)), [atualizacoes, projeto.id]);
  // A transcrição é da atualização: aparece só sob o primeiro áudio dela.
  const anexos = doProjeto.flatMap((a) => {
    const primeiroAudio = a.anexos.findIndex((x) => ehAudio(x.tipo));
    // null: não é o primeiro áudio (sem transcrição); "": transcrição pendente.
    return a.anexos.map((anexo, i) => ({ anexo, transcricao: i === primeiroAudio ? a.transcricao : null }));
  });
  const arquivos = anexos.filter(({ anexo }) => !ehAudio(anexo.tipo));
  const audios = anexos.filter(({ anexo }) => ehAudio(anexo.tipo));
  // Anexos que já estavam ao abrir não animam; os que sobem depois entram com destaque.
  const [iniciais] = useState(() => new Set(anexos.map(({ anexo }) => anexo.id)));
  const novoAnexo = (id: string) => (iniciais.has(id) ? undefined : "is-novo");

  function fechar() {
    // Durante o salvamento não fecha: evita duas gravações do mesmo projeto em paralelo e o desfazer de uma apagar a outra.
    if (salvando) { toast({ tone: "info", message: "Aguarde o salvamento terminar." }); return; }
    if (enviando) { toast({ tone: "info", message: "Aguarde o envio dos anexos terminar." }); return; }
    if (sujo || falhados) { setDescartar(true); return; }
    onClose();
  }

  function adicionarItem() {
    const texto = novoItem.trim();
    if (!texto) return;
    setNovoIndex(itens.length);
    setItens((lista) => [...lista, { texto, feito: false }]);
    setNovoItem("");
  }

  /** Otimista: o quadro e o painel já mostram o salvo; se a gravação falhar, voltam ao anterior e o texto editado fica nos campos. */
  async function salvar(event?: React.FormEvent) {
    event?.preventDefault();
    if (salvando) return;
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
    const antes = projeto;
    setErroSalvar("");
    setItens(lista);
    setNovoItem("");
    onSaved({ ...projeto, nome: titulo, briefing: texto, checklist: lista, prazo });
    if (!Object.keys(changes).length) return;
    setSalvando(true);
    setSalvo(false);
    try {
      await source.updateProjeto(projeto.id, changes);
      if (montado.current) setSalvo(true);
      else toast({ tone: "success", message: `${projeto.codigo} salvo.` });
    } catch (reason) {
      onSaved(antes);
      if (montado.current) setErroSalvar(`Não foi possível salvar; o projeto voltou ao que estava. Suas alterações continuam nos campos. ${reasonText(reason)}`);
      else toast({ tone: "danger", message: `Não foi possível salvar ${projeto.codigo}; as alterações foram desfeitas. ${reasonText(reason)}` });
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => {
    if (!salvo) return undefined;
    const timer = window.setTimeout(() => setSalvo(false), 2500);
    return () => window.clearTimeout(timer);
  }, [salvo]);
  useEffect(() => { if (sujo) setSalvo(false); }, [sujo]);

  // Anexo aparece na hora (imagem com prévia) e sobe como atualização sem etapa (anexo do projeto).
  function anexar(incoming: File[]) {
    if (!incoming.length) return;
    const { accepted, errors } = acceptFiles([], incoming);
    setAvisos(errors);
    if (!accepted.length) return;
    const envio: Envio = { id: ++envioSeq.current, arquivos: accepted, previas: accepted.map((f) => (ehImagem(f.type) ? URL.createObjectURL(f) : "")), erro: "" };
    setEnvios((lista) => [...lista, envio]);
    void enviar(envio);
  }

  async function enviar(envio: Envio) {
    if (envio.erro) setAvisos((lista) => lista.filter((a) => a !== envio.erro));
    setEnvios((lista) => lista.map((e) => (e.id === envio.id ? { ...e, erro: "" } : e)));
    try {
      const nova = await source.addAtualizacao({ projetoId: projeto.id, etapaId: null, data: new Date().toISOString(), autor: autorDoPerfil(perfil), texto: "", prova: false }, envio.arquivos);
      onAtualizacao(nova);
      descartarEnvio(envio);
    } catch (reason) {
      const erro = `Não foi possível anexar ${envio.arquivos.map((f) => f.name).join(", ")}. ${reasonText(reason)}`;
      setEnvios((lista) => lista.map((e) => (e.id === envio.id ? { ...e, erro } : e)));
      // O motivo fica visível também no toque (o title do botão só aparece com mouse).
      setAvisos((lista) => (lista.includes(erro) ? lista : [...lista, erro]));
    }
  }

  function descartarEnvio(envio: Envio) {
    envio.previas.forEach((url) => { if (url) URL.revokeObjectURL(url); });
    if (envio.erro) setAvisos((lista) => lista.filter((a) => a !== envio.erro));
    setEnvios((lista) => lista.filter((e) => e.id !== envio.id));
  }

  // Prévias locais são liberadas ao fechar o painel.
  const enviosRef = useRef(envios);
  enviosRef.current = envios;
  useEffect(() => () => enviosRef.current.forEach((e) => e.previas.forEach((url) => { if (url) URL.revokeObjectURL(url); })), []);
  const pendentes = envios.flatMap((envio) => envio.arquivos.map((arquivo, i) => ({ envio, arquivo, previa: envio.previas[i], chave: `${envio.id}-${i}` })));
  const arquivosPendentes = pendentes.filter(({ arquivo }) => !ehAudio(arquivo.type));
  const audiosPendentes = pendentes.filter(({ arquivo }) => ehAudio(arquivo.type));

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
      anexarRef.current(files.map((file) => namePastedFile(file)));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // Ctrl/Cmd + S (ou + Enter) salva de qualquer ponto do painel, inclusive do título no cabeçalho.
  const salvarRef = useRef<() => void>(() => {});
  salvarRef.current = () => {
    if (!sujo || descartar) return;
    void salvar();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || (event.key.toLowerCase() !== "s" && event.key !== "Enter")) return;
      event.preventDefault();
      salvarRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
          <input ref={tituloRef} className="pj-titulo" form="pj-detalhe" value={nome} maxLength={NOME_MAX} aria-label="Título"
            aria-invalid={nomeErro ? true : undefined} aria-describedby={nomeErro ? "pj-titulo-erro" : undefined}
            onChange={(event) => { setNome(event.target.value); if (nomeErro) setNomeErro(""); }} />
        </>}
        footer={
          <div className="projects-drawer-foot">
            {/* Região viva sempre montada: o leitor de tela só anuncia o que muda dentro dela. */}
            <span className="pj-sujo" role="status">
              {salvando ? <span className="pj-sujo__txt is-salvando"><LoaderCircle size={13} className="pj-spin" aria-hidden="true" />Salvando…</span>
                : sujo ? <span className="pj-sujo__txt">Alterações não salvas<span className="pj-sujo__atalho"> · <kbd>{MOD}</kbd> + <kbd>S</kbd></span></span>
                  : salvo ? <span className="pj-sujo__txt is-salvo"><Check size={13} aria-hidden="true" />Salvo</span> : null}
            </span>
            <Button variant="secondary" onClick={fechar} disabled={enviando || salvando}>Fechar</Button>
            <Button type="submit" form="pj-detalhe" disabled={!sujo || salvando}>Salvar</Button>
          </div>
        }>
        <form id="pj-detalhe" className="pj-detalhe" onSubmit={salvar}
          onDragOver={(event) => { if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) { event.preventDefault(); if (!arrastando) setArrastando(true); } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setArrastando(false); }}
          onDrop={(event) => { setArrastando(false); if (!event.dataTransfer.files.length) return; event.preventDefault(); anexar(Array.from(event.dataTransfer.files)); }}>
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
              <dd><PrazoCampo value={prazo} onChange={setPrazo} concluido={status === STATUS.concluida} /></dd>
            </div>
          </dl>

          <section className="pj-bloco" aria-labelledby="pj-descricao">
            <h3 id="pj-descricao" className="pj-lbl">Descrição</h3>
            <Textarea className="pj-desc" aria-labelledby="pj-descricao" value={descricao} rows={2} placeholder="O que é, para quem e por quê."
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
                <li key={`${index}-${item.texto}`} className={[item.feito && "is-feito", index === novoIndex && "is-novo"].filter(Boolean).join(" ") || undefined}>
                  <Checkbox label={item.texto} checked={item.feito}
                    onChange={() => setItens((lista) => lista.map((it, i) => (i === index ? { ...it, feito: !it.feito } : it)))} />
                  <button type="button" className="pj-check__rm" aria-label={`Remover ${item.texto}`}
                    onClick={() => { setNovoIndex(-1); setItens((lista) => lista.filter((_, i) => i !== index)); }}><X size={14} /></button>
                </li>
              ))}
              <li className="pj-check__novo">
                <Plus size={16} aria-hidden="true" />
                <input value={novoItem} maxLength={MAX_ITEM} placeholder="Adicionar item" aria-label="Novo item do checklist"
                  onChange={(event) => setNovoItem(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); adicionarItem(); } }} />
              </li>
            </ul>
          </section>

          <section className="pj-bloco" aria-labelledby="pj-anexos">
            <div className="pj-bloco__topo">
              <h3 id="pj-anexos" className="pj-lbl">Anexos {anexos.length + pendentes.length > 0 && <span className="pj-num">{anexos.length + pendentes.length}</span>}</h3>
              <div className="pj-acoes">
                <button type="button" className="pj-acao" onClick={() => inputRef.current?.click()}>
                  <Paperclip size={16} aria-hidden="true" /> Anexar
                </button>
                <AudioRecorder compact onRecorded={(file) => anexar([file])} onError={(message) => setAvisos([message])} />
              </div>
            </div>
            {arquivos.length + arquivosPendentes.length > 0 && (
              <div className="pj-gal">
                {arquivosPendentes.map(({ envio, arquivo, previa, chave }) => (
                  <div key={chave} className="is-novo"><AnexoEnviando arquivo={arquivo} previa={previa} erro={envio.erro} onRetry={() => void enviar(envio)} onDiscard={() => descartarEnvio(envio)} /></div>
                ))}
                {arquivos.map(({ anexo }) => <div key={anexo.id} className={novoAnexo(anexo.id)}><AnexoMiniatura anexo={anexo} source={source} /></div>)}
              </div>
            )}
            {audios.length + audiosPendentes.length > 0 && (
              <ul className="pj-audios">
                {audiosPendentes.map(({ envio, arquivo, previa, chave }) => (
                  <li key={chave} className="is-novo"><AnexoEnviando arquivo={arquivo} previa={previa} erro={envio.erro} onRetry={() => void enviar(envio)} onDiscard={() => descartarEnvio(envio)} /></li>
                ))}
                {audios.map(({ anexo, transcricao }) => (
                  <li key={anexo.id} className={novoAnexo(anexo.id)}>
                    <AnexoAudio anexo={anexo} source={source} />
                    {transcricao !== null && (transcricao
                      ? <p className="pj-transcricao"><span className="pj-transcricao__lbl"><Quote size={12} aria-hidden="true" />Transcrição</span>{transcricao}</p>
                      : <p className="pj-transcricao is-pendente"><Clock size={12} aria-hidden="true" />Transcrição pendente</p>)}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={arrastando ? "pj-drop is-arrastando" : "pj-drop"} onClick={() => inputRef.current?.click()}>
              <span className="pj-drop__icone" aria-hidden="true"><Upload size={20} /></span>
              <span className="pj-drop__texto">
                <strong>{arrastando ? "Solte para anexar" : "Arraste, cole ou clique para anexar"}</strong>
                <span className="pj-drop__tipos">
                  <span className="is-imagem"><ImageIcon size={12} aria-hidden="true" />Imagem</span>
                  <span className="is-video"><Film size={12} aria-hidden="true" />Vídeo</span>
                  <span className="is-audio"><Mic size={12} aria-hidden="true" />Áudio</span>
                  <span className="is-pdf"><FileText size={12} aria-hidden="true" />PDF</span>
                  <small>até 5 MB</small>
                </span>
              </span>
            </button>
            <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden aria-label="Escolher anexos"
              onChange={(event) => { anexar(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
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
        As alterações deste projeto (título, descrição, prazo, checklist ou anexos que falharam) ainda não foram salvas.
      </Dialog>
    </>
  );
}
