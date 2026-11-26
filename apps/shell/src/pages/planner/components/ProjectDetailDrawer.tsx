// Detalhe do projeto no Planner: título, descrição e checklist (Salvar) e anexos com áudio (enviados na hora).
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dialog, Drawer, Field, Input, Textarea, useToast } from "@betinhos/ui";
import { ImagePlus, Plus, X } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import type { Row } from "@betinhos/dataverse";
import { reasonText, type Source } from "../projetos/data/source";
import { AnexoAudio, AnexoMiniatura } from "../projetos/components/AnexoMiniatura";
import { ehAudio } from "../projetos/domain/anexos";
import { autorDoPerfil } from "../projetos/domain/choices";
import { MAX_ITEM, gravarChecklist, progresso, type ChecklistItem } from "../projetos/domain/checklist";
import type { Atualizacao, Perfil, Projeto } from "../projetos/domain/types";
import { acceptFiles, namePastedFile } from "../domain/projectsBoard";
import "../projetos/projetos.css";

const ACCEPT = "image/*,video/*,audio/*,application/pdf";
const NOME_MAX = 200;

type Props = {
  projeto: Projeto | null;
  atualizacoes: Atualizacao[];
  perfil: Perfil;
  source: Source;
  onClose: () => void;
  onSaved: (p: Projeto) => void;
  onAtualizacao: (a: Atualizacao) => void;
};

export function ProjectDetailDrawer({ projeto, ...rest }: Props) {
  return projeto ? <Detalhe key={projeto.id} projeto={projeto} {...rest} /> : <Drawer open={false} onClose={rest.onClose} title="Projeto">{null}</Drawer>;
}

function Detalhe({ projeto, atualizacoes, perfil, source, onClose, onSaved, onAtualizacao }: Props & { projeto: Projeto }) {
  const toast = useToast();
  const [nome, setNome] = useState(projeto.nome);
  const [descricao, setDescricao] = useState(projeto.briefing);
  const [itens, setItens] = useState<ChecklistItem[]>(projeto.checklist);
  const [novoItem, setNovoItem] = useState("");
  const [nomeErro, setNomeErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Contador: gravação e colagem podem subir juntas; só libera o fechar quando todas terminam.
  const [envios, setEnvios] = useState(0);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [descartar, setDescartar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const enviando = envios > 0;
  const ocupado = salvando || enviando;
  const sujo = nome.trim() !== projeto.nome || descricao.trim() !== projeto.briefing.trim() || gravarChecklist(itens) !== gravarChecklist(projeto.checklist) || Boolean(novoItem.trim());
  const doProjeto = useMemo(() => atualizacoes.filter((a) => a.projetoId === projeto.id).sort((a, b) => b.data.localeCompare(a.data)), [atualizacoes, projeto.id]);
  // A transcrição é da atualização: aparece só sob o primeiro áudio dela.
  const anexos = doProjeto.flatMap((a) => {
    const primeiroAudio = a.anexos.findIndex((x) => ehAudio(x.tipo));
    return a.anexos.map((anexo, i) => ({ anexo, transcricao: i === primeiroAudio ? a.transcricao || "Transcrição pendente" : "" }));
  });

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
    setSalvando(true);
    try {
      if (Object.keys(changes).length) await source.updateProjeto(projeto.id, changes);
      setAvisos([]);
      setItens(lista);
      setNovoItem("");
      onSaved({ ...projeto, nome: titulo, briefing: texto, checklist: lista });
      toast({ tone: "success", message: `${projeto.codigo} salvo.` });
    } catch (reason) {
      setAvisos([`Não foi possível salvar. ${reasonText(reason)}`]);
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

  const feito = progresso(itens);
  return (
    <>
      <Drawer open onClose={fechar} size="wide" eyebrow="Projetos" title={`${projeto.codigo} · ${projeto.nome}`}
        footer={
          <div className="projects-drawer-foot">
            <Button variant="secondary" onClick={fechar} disabled={ocupado}>Fechar</Button>
            <Button type="submit" form="pj-detalhe" loading={salvando} disabled={!sujo || enviando}>Salvar</Button>
          </div>
        }>
        <form id="pj-detalhe" className="pj-detalhe" onSubmit={salvar}
          onDragOver={(event) => { if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault(); }}
          onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); void anexar(Array.from(event.dataTransfer.files)); }}>
          <Field label="Título" required error={nomeErro || undefined}>
            <Input value={nome} maxLength={NOME_MAX} disabled={salvando} onChange={(event) => { setNome(event.target.value); if (nomeErro) setNomeErro(""); }} />
          </Field>
          <Field label="Descrição">
            <Textarea value={descricao} rows={5} disabled={salvando} onChange={(event) => setDescricao(event.target.value)} />
          </Field>

          <section className="pj-bloco" aria-labelledby="pj-checklist">
            <h3 id="pj-checklist" className="pj-lbl">Checklist {feito && <span className="pj-num">{feito}</span>}</h3>
            {itens.length > 0 && (
              <ul className="pj-check">
                {itens.map((item, index) => (
                  <li key={`${index}-${item.texto}`} className={item.feito ? "is-feito" : undefined}>
                    <Checkbox label={item.texto} checked={item.feito} disabled={salvando}
                      onChange={() => setItens((lista) => lista.map((it, i) => (i === index ? { ...it, feito: !it.feito } : it)))} />
                    <button type="button" className="pj-check__rm" disabled={salvando} aria-label={`Remover ${item.texto}`}
                      onClick={() => setItens((lista) => lista.filter((_, i) => i !== index))}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="pj-check__novo">
              <Input value={novoItem} maxLength={MAX_ITEM} disabled={salvando} placeholder="Novo item" aria-label="Novo item do checklist"
                onChange={(event) => setNovoItem(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); adicionarItem(); } }} />
              <Button variant="secondary" icon={<Plus size={16} />} disabled={salvando || !novoItem.trim()} onClick={adicionarItem}>Adicionar item</Button>
            </div>
          </section>

          <section className="pj-bloco" aria-labelledby="pj-anexos">
            <h3 id="pj-anexos" className="pj-lbl">Anexos {anexos.length > 0 && <span className="pj-num">{anexos.length}</span>}</h3>
            <div className="pj-gal">
              {anexos.map(({ anexo, transcricao }) => ehAudio(anexo.tipo) ? (
                <div key={anexo.id} className="pj-gal__audio">
                  <AnexoAudio anexo={anexo} source={source} />
                  {transcricao && <p className="pj-brief__transcricao">{transcricao}</p>}
                </div>
              ) : <AnexoMiniatura key={anexo.id} anexo={anexo} source={source} />)}
              <button type="button" className="pj-gal__add" disabled={ocupado} onClick={() => inputRef.current?.click()}>
                <ImagePlus size={16} aria-hidden="true" /> {enviando ? "Enviando..." : "Anexar"}
              </button>
            </div>
            <p className="pj-muted">Arraste ou cole (<kbd>Ctrl</kbd> + <kbd>V</kbd>) imagens, vídeos, áudios ou PDF de até 5 MB.</p>
            <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden aria-label="Escolher anexos"
              onChange={(event) => { void anexar(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            <AudioRecorder disabled={ocupado} onRecorded={(file) => void anexar([file])} onError={(message) => setAvisos([message])} />
          </section>

          {avisos.length > 0 && (
            <Alert tone="danger" onDismiss={() => setAvisos([])}>
              {avisos.map((aviso) => <div key={aviso}>{aviso}</div>)}
            </Alert>
          )}
        </form>
      </Drawer>
      <Dialog open={descartar} onClose={() => setDescartar(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setDescartar(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setDescartar(false); onClose(); }}>Descartar</Button>
        </>}>
        O título, a descrição ou o checklist deste projeto ainda não foram salvos.
      </Dialog>
    </>
  );
}
