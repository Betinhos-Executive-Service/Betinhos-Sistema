// Drawer "Nova ideia": nome, detalhe e anexos (áudio gravado, foto, vídeo, PDF) por clique, arrastar ou Ctrl+V.
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Dialog, Drawer, Field, Input, Textarea } from "@betinhos/ui";
import { FileText, ImagePlus, Paperclip, Plus, Trash2, UploadCloud } from "lucide-react";
import { reasonText, type Source } from "../projetos/data/source";
import { STATUS, autorDoPerfil } from "../projetos/domain/choices";
import { MAX_ANEXOS } from "../projetos/domain/anexos";
import { codigoEtapa1 } from "../projetos/domain/regras";
import type { Atualizacao, Etapa, Perfil, Projeto } from "../projetos/domain/types";
import { acceptFiles, attachmentKind, namePastedFile } from "../domain/projectsBoard";
import { AudioRecorder } from "./AudioRecorder";

const NAME_MAX = 200;
const ACCEPT = "image/*,video/*,audio/*,application/pdf";

export type CreatedProject = { projeto: Projeto; etapa: Etapa; atualizacao: Atualizacao | null; warning: string | null };

type Props = {
  open: boolean;
  source: Source;
  perfil: Perfil;
  onClose: () => void;
  onCreated: (created: CreatedProject) => void;
};

const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

function FilePreview({ file, url, onRemove, disabled }: { file: File; url: string; onRemove: () => void; disabled: boolean }) {
  const kind = attachmentKind(file.type);
  return (
    <li className={`projects-attachment is-${kind}`}>
      <div className="projects-attachment-media">
        {kind === "image" && <img src={url} alt="" />}
        {kind === "video" && <video src={url} muted playsInline preload="metadata" />}
        {kind === "audio" && <audio src={url} controls preload="metadata" aria-label={`Ouvir ${file.name}`} />}
        {kind === "file" && <FileText size={22} aria-hidden="true" />}
      </div>
      <div className="projects-attachment-copy">
        <strong title={file.name}>{file.name}</strong>
        <small>{kind === "audio" ? "Áudio" : kind === "image" ? "Foto" : kind === "video" ? "Vídeo" : "PDF"} · {sizeLabel(file.size)}</small>
      </div>
      <button type="button" className="projects-icon-button" onClick={onRemove} disabled={disabled} aria-label={`Remover ${file.name}`} title="Remover">
        <Trash2 size={15} />
      </button>
    </li>
  );
}

export function NewProjectDrawer({ open, source, perfil, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [nameError, setNameError] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [saving, setSaving] = useState("");
  const [dragging, setDragging] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const dirty = Boolean(name.trim() || detail.trim() || files.length);
  const busy = Boolean(saving);

  const urls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);

  const reset = () => { setName(""); setDetail(""); setFiles([]); setNameError(""); setNotices([]); setSaving(""); setDragging(false); dragDepth.current = 0; };
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Lido pelo ouvinte de colar, que não é recriado a cada arquivo.
  const filesRef = useRef(files);
  filesRef.current = files;
  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    const { accepted, errors } = acceptFiles(filesRef.current, incoming);
    setNotices(errors);
    if (accepted.length) {
      filesRef.current = [...filesRef.current, ...accepted];
      setFiles(filesRef.current);
    }
  };

  // Ctrl+V em qualquer lugar do drawer: print, foto ou vídeo copiados viram anexo; texto colado segue normal.
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (event: ClipboardEvent) => {
      if (busy) return;
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (!pasted.length) return;
      event.preventDefault();
      addFiles(pasted.map((file) => namePastedFile(file)));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open, busy]);

  const requestClose = () => {
    if (busy) return;
    if (dirty) { setConfirmDiscard(true); return; }
    reset();
    onClose();
  };

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy) return;
    const nome = name.trim();
    if (!nome) { setNameError("Dê um nome para a ideia."); nameRef.current?.focus(); return; }
    setNameError("");
    const texto = detail.trim();
    let created: { id: string; codigo: string } | null = null;
    try {
      setSaving("Criando a ideia...");
      created = await source.createProjeto({ cr40f_name: nome, ...(texto ? { cr40f_briefing: texto } : {}) });
      const codigo = codigoEtapa1(created.codigo);
      const etapaId = await source.createEtapa({ cr40f_status: STATUS.ideia }, { projetoId: created.id, numero: 1, codigo });
      const projeto: Projeto = { id: created.id, codigo: created.codigo, nome, briefing: texto, checklist: [], prazo: null };
      const etapa: Etapa = { id: etapaId, projetoId: created.id, numero: 1, codigo, nome: "", status: STATUS.ideia, prazo: null, andamento: 0, linkPr: "", publicadoProd: null, motivoPausa: "" };
      let atualizacao: Atualizacao | null = null;
      let warning: string | null = null;
      if (files.length) {
        setSaving(files.length === 1 ? "Enviando o anexo..." : `Enviando ${files.length} anexos...`);
        try {
          atualizacao = await source.addAtualizacao(
            { projetoId: created.id, etapaId: null, data: new Date().toISOString(), autor: autorDoPerfil(perfil), texto: texto || "Anexos da ideia.", prova: false },
            files,
          );
        } catch (reason) {
          warning = `A ideia ${created.codigo} foi criada, mas os anexos não subiram: ${reasonText(reason)} Abra o projeto e anexe de novo.`;
        }
      }
      onCreated({ projeto, etapa, atualizacao, warning });
      reset();
    } catch (reason) {
      setSaving("");
      setNotices([created ? `A ideia ${created.codigo} foi criada pela metade: ${reasonText(reason)} Atualize a tela antes de tentar de novo.` : `Não foi possível criar a ideia. ${reasonText(reason)}`]);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        eyebrow="Projetos"
        title="Nova ideia"
        footer={
          <div className="projects-drawer-foot">
            <Button variant="secondary" onClick={requestClose} disabled={busy}>Cancelar</Button>
            <Button type="submit" form="projects-new-idea" icon={<Plus size={16} />} loading={busy} aria-busy={busy}>
              {saving || "Salvar ideia"}
            </Button>
          </div>
        }
      >
        <form
          id="projects-new-idea"
          className={`projects-new-idea${dragging ? " is-dragging" : ""}`}
          onSubmit={save}
          onDragEnter={(event) => { if (!hasFiles(event) || busy) return; event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
          onDragOver={(event) => { if (!hasFiles(event) || busy) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
          onDrop={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (!busy) addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <Field label="Ideia" required error={nameError || undefined}>
            <Input
              ref={nameRef}
              value={name}
              maxLength={NAME_MAX}
              disabled={busy}
              placeholder="Ex.: painel de pontualidade por cliente"
              onChange={(event) => { setName(event.target.value); if (nameError) setNameError(""); }}
            />
          </Field>
          <Field label="Detalhe" hint="Para quem é e que problema resolve. Se preferir, grave um áudio.">
            <Textarea value={detail} rows={4} disabled={busy} onChange={(event) => setDetail(event.target.value)} />
          </Field>

          <AudioRecorder disabled={busy} onRecorded={(file) => addFiles([file])} onError={(message) => setNotices([message])} />

          <button
            type="button"
            className="projects-dropzone"
            onClick={() => inputRef.current?.click()}
            disabled={busy || files.length >= MAX_ANEXOS}
          >
            <span className="projects-dropzone-icon"><UploadCloud size={22} /></span>
            <span>
              <strong>Arraste fotos, vídeos ou PDF aqui</strong>
              <small>ou clique para escolher. <kbd>Ctrl</kbd> + <kbd>V</kbd> cola um print direto. Até {MAX_ANEXOS} arquivos de 5 MB.</small>
            </span>
            <ImagePlus size={18} className="projects-dropzone-plus" aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }}
          />

          {notices.length > 0 && (
            <Alert tone="danger" onDismiss={() => setNotices([])}>
              {notices.map((notice) => <div key={notice}>{notice}</div>)}
            </Alert>
          )}

          {files.length > 0 && (
            <section className="projects-attachments" aria-label="Anexos da ideia">
              <h3><Paperclip size={14} /> Anexos <span>{files.length}</span></h3>
              <ul>
                {files.map((file, index) => (
                  <FilePreview key={`${file.name}-${file.lastModified}-${index}`} file={file} url={urls[index]} disabled={busy} onRemove={() => setFiles((list) => list.filter((_, i) => i !== index))} />
                ))}
              </ul>
            </section>
          )}

          {dragging && (
            <div className="projects-drop-overlay" aria-hidden="true">
              <UploadCloud size={32} />
              <strong>Solte para anexar</strong>
            </div>
          )}
        </form>
      </Drawer>
      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Descartar alterações?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Continuar editando</Button>
            <Button variant="danger" onClick={() => { setConfirmDiscard(false); reset(); onClose(); }}>Descartar</Button>
          </>
        }
      >
        A ideia e os anexos ainda não foram salvos.
      </Dialog>
    </>
  );
}
