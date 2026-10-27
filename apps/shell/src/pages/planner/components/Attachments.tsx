// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { plannerPortalRoot } from './portalRoot'
import { formatCommentTimestamp } from '../pageHelpers'
import { Avatar } from './Badges'
import { attachmentCacheKey, attachmentPreviewCache, attachmentTypeLabel, formatAttachmentSize, isImageAttachment, isPdfAttachment, toAttachmentFiles } from './attachmentFiles'
import { CheckCircle2, ChevronDown, Clock3, File, FileArchive, FileImage, FileSpreadsheet, FileText, LoaderCircle, Paperclip, Trash2, UploadCloud, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'


export function AttachmentTypeIcon({ attachment }: any) {
  const type = attachmentTypeLabel(attachment);
  const Icon =
    type === "Imagem"
      ? FileImage
      : type === "Planilha"
        ? FileSpreadsheet
        : type === "Arquivo compactado"
          ? FileArchive
          : type === "PDF"
            ? FileText
            : File;
  return (
    <span
      className={`attachment-file-icon attachment-file-icon-${type.toLowerCase().replace(/\s/g, "-")}`}
      aria-hidden="true"
    >
      <Icon size={17} />
    </span>
  );
}

export function AttachmentPreview({ attachment, loadAttachmentContent, onOpen }: any) {
  const cacheKey = attachmentCacheKey(attachment);
  const canPreview =
    isImageAttachment(attachment) || isPdfAttachment(attachment);
  const slotRef = useRef<any>(null);
  const [visible, setVisible] = useState<any>(Boolean(attachment?.previewUrl));
  const [state, setState] = useState<any>(() => ({
    dataUrl:
      attachment?.previewUrl || attachmentPreviewCache.get(cacheKey) || "",
    loading: false,
    error: "",
  }));
  useEffect(
    () => () => {
      if (
        attachment?.syncStatus !== "pending" &&
        attachment?.previewUrl?.startsWith("blob:") &&
        globalThis.URL?.revokeObjectURL
      )
        globalThis.setTimeout(
          () => globalThis.URL.revokeObjectURL(attachment.previewUrl),
          60000,
        );
    },
    [attachment?.previewUrl],
  );
  useEffect(() => {
    if (
      attachment?.previewUrl ||
      typeof window === "undefined" ||
      typeof window.IntersectionObserver !== "function"
    ) {
      setVisible(true);
      return undefined;
    }
    const node = slotRef.current;
    if (!node) return undefined;
    const observer = new window.IntersectionObserver(
      ([entry]: any) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [attachment?.previewUrl, cacheKey]);
  useEffect(() => {
    if (
      !visible ||
      attachment?.previewUrl ||
      !canPreview ||
      !loadAttachmentContent ||
      !cacheKey ||
      (!attachment?.sharePointId &&
        !attachment?.fileLocator &&
        !attachment?.path) ||
      attachmentPreviewCache.has(cacheKey)
    )
      return undefined;
    let active = true;
    setState({ dataUrl: "", loading: true, error: "" });
    loadAttachmentContent(attachment)
      .then((result: any) => {
        if (!active) return;
        attachmentPreviewCache.set(cacheKey, result.dataUrl);
        setState({ dataUrl: result.dataUrl, loading: false, error: "" });
      })
      .catch((error: any) => {
        if (active)
          setState({
            dataUrl: "",
            loading: false,
            error: error.message || "Prévia indisponível.",
          });
      });
    return () => {
      active = false;
    };
  }, [attachment, cacheKey, canPreview, loadAttachmentContent, visible]);
  if (!canPreview) return null;
  const openPreview = () =>
    onOpen?.({ ...attachment, previewUrl: state.dataUrl });
  return (
    <div className="attachment-preview-slot" ref={slotRef}>
      {state.dataUrl ? (
        isPdfAttachment(attachment) ? (
          <div
            className="attachment-preview attachment-preview-pdf"
            role="button"
            tabIndex={0}
            onClick={openPreview}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openPreview();
              }
            }}
            aria-label={`Abrir prévia de ${attachment.name || "PDF anexado"}`}
          >
            <iframe
              src={state.dataUrl}
              title={attachment.name || "Prévia do PDF"}
            />
          </div>
        ) : (
          <button
            className="attachment-preview"
            type="button"
            onClick={openPreview}
            aria-label={`Abrir prévia de ${attachment.name || "imagem anexada"}`}
          >
            <img
              src={state.dataUrl}
              alt={attachment.name || "Imagem anexada"}
              loading="lazy"
              decoding="async"
            />
          </button>
        )
      ) : state.loading ? (
        <div className="attachment-preview-placeholder">
          <LoaderCircle size={15} className="spin" />
          <span>Preparando prévia…</span>
        </div>
      ) : state.error ? (
        <div className="attachment-preview-placeholder attachment-preview-error">
          <AttachmentTypeIcon attachment={attachment} />
          <span>Prévia indisponível</span>
        </div>
      ) : (
        <div className="attachment-preview-placeholder">
          <AttachmentTypeIcon attachment={attachment} />
          <span>
            {isPdfAttachment(attachment) ? "PDF anexado" : "Imagem anexada"}
          </span>
        </div>
      )}
    </div>
  );
}

export function AttachmentSection({
  taskId,
  attachments = [],
  loadAttachmentContent,
  onAttachment,
  onDeleteAttachment,
  helperText,
  itemLabel = "à tarefa",
  showPreview = true,
  allowOpen = true,
  compact = false,
}: any) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState<any>(false);
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);
  const [openingId, setOpeningId] = useState<any>("");
  const [pendingDeleteId, setPendingDeleteId] = useState<any>("");
  const [deletingId, setDeletingId] = useState<any>("");
  const [openError, setOpenError] = useState<any>("");
  const addFiles = (value: any) => {
    const files = toAttachmentFiles(value);
    if (files.length) onAttachment(taskId, files);
  };
  const handleDrop = (event: any) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };
  const previewUrl =
    previewAttachment?.previewUrl ||
    attachmentPreviewCache.get(attachmentCacheKey(previewAttachment));
  const openAttachment = async (attachment: any) => {
    if (typeof window === "undefined") return;
    setOpenError("");
    const popup = window.open("", "_blank");
    if (!popup) {
      setOpenError(
        "O navegador bloqueou a nova aba. Permita pop-ups para abrir anexos.",
      );
      return;
    }
    popup.opener = null;
    popup.document.title = attachment.name || "Anexo";
    setOpeningId(attachment.id);
    try {
      let source =
        attachment.previewUrl ||
        attachmentPreviewCache.get(attachmentCacheKey(attachment));
      if (!source && loadAttachmentContent) {
        const result = await loadAttachmentContent(attachment);
        source = result?.dataUrl || result?.previewUrl || "";
        if (source)
          attachmentPreviewCache.set(attachmentCacheKey(attachment), source);
      }
      if (!source)
        throw new Error("Não foi possível carregar o conteúdo deste anexo.");
      const response = await fetch(source);
      if (!response.ok)
        throw new Error("O conteúdo do anexo não respondeu corretamente.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const downloadLink = popup.document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = attachment.name || "Anexo";
      downloadLink.textContent = "Download iniciado.";
      popup.document.body.append(downloadLink);
      downloadLink.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error: any) {
      popup.close();
      setOpenError(error.message || "Não foi possível abrir o anexo.");
    } finally {
      setOpeningId("");
    }
  };
  const confirmDelete = (attachment: any) => {
    setPendingDeleteId("");
    setDeletingId(attachment.id);
    Promise.resolve(onDeleteAttachment?.(taskId, attachment)).finally(() =>
      setDeletingId(""),
    );
  };
  return (
    <section className={`drawer-section attachment-section${compact ? " is-compact" : ""}`}>
      <div className="drawer-section-heading">
        <div className="attachment-heading-copy">
          <h3>Anexos</h3>
          <span className="section-count">{attachments.length}</span>
        </div>
        <span className="section-hint">Até 5 MB por arquivo</span>
      </div>
      {helperText && <p className="attachment-helper">{helperText}</p>}
      <label
        className={`attachment-dropzone ${isDragging ? "is-dragging" : ""}`}
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <span className="attachment-upload-icon">
          <UploadCloud size={19} />
        </span>
        <span className="attachment-dropzone-copy">
          <strong>
            {isDragging
              ? "Solte os arquivos aqui"
              : `Adicione arquivos ${itemLabel}`}
          </strong>
          <small>{compact ? "Clique ou arraste arquivos" : "Cole com Ctrl+V, clique para escolher ou arraste arquivos para cá"}</small>
        </span>
        <span className="attachment-dropzone-action">Escolher arquivos</span>
        <input
          id={inputId}
          type="file"
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {openError && (
        <div
          className="attachment-feedback attachment-feedback-error"
          role="alert"
        >
          {openError}
        </div>
      )}
      {attachments.length ? (
        <div className="attachment-list">
          {attachments.map((item: any) => (
            <article
              className={`attachment-item ${item.syncStatus === "syncing" ? "item-syncing" : ""}`}
              key={item.id}
            >
              {showPreview && <AttachmentPreview
                attachment={item}
                loadAttachmentContent={loadAttachmentContent}
                onOpen={setPreviewAttachment}
              />}
              <div className="attachment-card">
                {allowOpen ? <button
                  className="attachment-open-button"
                  type="button"
                  onClick={() => openAttachment(item)}
                  disabled={openingId === item.id || deletingId === item.id}
                  aria-label={`Abrir ${item.name || "anexo"} em nova aba`}
                >
                  <AttachmentTypeIcon attachment={item} />
                  <span className="attachment-file-main">
                    <strong title={item.name}>
                      {item.name || "Arquivo sem nome"}
                    </strong>
                    <span>
                      {attachmentTypeLabel(item)} ·{" "}
                      {formatAttachmentSize(item.size)} · Abrir em nova aba
                    </span>
                  </span>
                </button> : <div className="attachment-file-summary">
                  <AttachmentTypeIcon attachment={item} />
                  <span className="attachment-file-main">
                    <strong title={item.name}>{item.name || "Arquivo sem nome"}</strong>
                    <span>{attachmentTypeLabel(item)} · {formatAttachmentSize(item.size)}</span>
                  </span>
                </div>}
                <div className="attachment-card-actions">
                  <span
                    className={`attachment-status ${item.syncStatus === "syncing" ? "is-syncing" : ""} ${item.syncStatus === "pending" ? "is-pending" : ""}`}
                  >
                    {item.syncStatus === "syncing" ? (
                      <>
                        <LoaderCircle size={13} className="spin" />
                        Enviando
                      </>
                    ) : item.syncStatus === "pending" ? (
                      <>
                        <Clock3 size={13} />
                        Aguardando salvar
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} />
                        Salvo
                      </>
                    )}
                  </span>
                  {onDeleteAttachment &&
                    (pendingDeleteId === item.id ? (
                      <div
                        className="attachment-remove-confirm"
                        role="group"
                        aria-label={`Confirmar remoção de ${item.name || "anexo"}`}
                      >
                        <button
                          className="button button-danger"
                          type="button"
                          onClick={() => confirmDelete(item)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? "Removendo…" : "Remover"}
                        </button>
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={() => setPendingDeleteId("")}
                          disabled={deletingId === item.id}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="attachment-delete-button"
                        type="button"
                        onClick={() => setPendingDeleteId(item.id)}
                        disabled={
                          item.syncStatus === "syncing" ||
                          deletingId === item.id
                        }
                        aria-label={`Remover ${item.name || "anexo"}`}
                        title="Remover anexo"
                      >
                        <Trash2 size={15} />
                      </button>
                    ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="attachment-empty">
          <Paperclip size={16} />
          <span>
            <strong>Nenhum anexo ainda</strong>
            <small>
              Inclua briefing, evidência ou qualquer arquivo útil para a
              execução.
            </small>
          </span>
        </div>
      )}
      {showPreview && previewAttachment &&
      previewUrl &&
      typeof document !== "undefined" &&
      document.body
        ? createPortal(
            <div
              className="attachment-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`Prévia de ${previewAttachment.name || "arquivo anexado"}`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setPreviewAttachment(null);
              }}
            >
              <button
                className="icon-button attachment-lightbox-close"
                type="button"
                onClick={() => setPreviewAttachment(null)}
                aria-label="Fechar prévia"
              >
                <X size={19} />
              </button>
              {isPdfAttachment(previewAttachment) ? (
                <iframe
                  src={previewUrl}
                  title={previewAttachment.name || "Prévia do PDF"}
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={previewAttachment.name || "Imagem anexada"}
                />
              )}
            </div>,
            plannerPortalRoot(),
          )
        : null}
    </section>
  );
}

export function ReturnEvidenceList({ taskId, attachments = [], loadAttachmentContent, onDeleteAttachment }: any) {
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);
  const [previewError, setPreviewError] = useState<any>("");
  const [pendingDeleteId, setPendingDeleteId] = useState<any>("");
  const [deletingId, setDeletingId] = useState<any>("");
  if (!attachments.length) return null;
  const openEvidence = async (attachment: any) => {
    setPreviewError("");
    if (!isImageAttachment(attachment) && !isPdfAttachment(attachment)) {
      setPreviewError("A prévia está disponível apenas para imagens e PDFs.");
      return;
    }
    try {
      const cacheKey = attachmentCacheKey(attachment);
      let previewUrl = attachment.previewUrl || attachmentPreviewCache.get(cacheKey);
      if (!previewUrl && loadAttachmentContent) {
        const result = await loadAttachmentContent(attachment);
        previewUrl = result?.dataUrl || result?.previewUrl || "";
        if (previewUrl) attachmentPreviewCache.set(cacheKey, previewUrl);
      }
      if (!previewUrl) throw new Error("Não foi possível carregar a evidência.");
      setPreviewAttachment({ ...attachment, previewUrl });
    } catch (error: any) {
      setPreviewError(error.message || "Não foi possível abrir a evidência.");
    }
  };
  const confirmDelete = (attachment: any) => {
    setPendingDeleteId("");
    setDeletingId(attachment.id);
    Promise.resolve(onDeleteAttachment?.(taskId, attachment)).finally(() => setDeletingId(""));
  };
  return (
    <div className="return-evidence" aria-label="Evidências do retorno">
      <span className="return-evidence-label"><Paperclip size={13} aria-hidden="true" /> Evidências</span>
      <div className="return-evidence-list">
        {attachments.map((attachment: any) => (
          <div className="return-evidence-item" key={attachment.id}>
            <button className="attachment-open-button" type="button" onClick={() => openEvidence(attachment)} aria-label={`Abrir prévia de ${attachment.name || "evidência"}`}>
              <AttachmentTypeIcon attachment={attachment} />
              <span className="attachment-file-main">
                <strong title={attachment.name}>{attachment.name || "Arquivo"}</strong>
                <span>{attachmentTypeLabel(attachment)} · {formatAttachmentSize(attachment.size)} · Abrir prévia</span>
              </span>
            </button>
            <div className="attachment-card-actions">
              <span className="attachment-status"><CheckCircle2 size={13} /> Salvo</span>
              {onDeleteAttachment && (pendingDeleteId === attachment.id ? (
                <div className="attachment-remove-confirm" role="group" aria-label={`Confirmar remoção de ${attachment.name || "evidência"}`}>
                  <button className="button button-danger" type="button" onClick={() => confirmDelete(attachment)} disabled={deletingId === attachment.id}>{deletingId === attachment.id ? "Removendo…" : "Remover"}</button>
                  <button className="button button-quiet" type="button" onClick={() => setPendingDeleteId("")} disabled={deletingId === attachment.id}>Cancelar</button>
                </div>
              ) : (
                <button className="attachment-delete-button" type="button" onClick={() => setPendingDeleteId(attachment.id)} disabled={deletingId === attachment.id} aria-label={`Remover ${attachment.name || "evidência"}`} title={`Remover ${attachment.name || "evidência"}`}><Trash2 size={14} /></button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {previewError && <div className="attachment-feedback attachment-feedback-error" role="alert">{previewError}</div>}
      {previewAttachment && typeof document !== "undefined" && document.body
        ? createPortal(
            <div className="attachment-lightbox" role="dialog" aria-modal="true" aria-label={`Prévia de ${previewAttachment.name || "evidência"}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewAttachment(null); }}>
              <button className="icon-button attachment-lightbox-close" type="button" onClick={() => setPreviewAttachment(null)} aria-label="Fechar prévia"><X size={19} /></button>
              {isPdfAttachment(previewAttachment) ? <iframe src={previewAttachment.previewUrl} title={previewAttachment.name || "Prévia do PDF"} /> : <img src={previewAttachment.previewUrl} alt={previewAttachment.name || "Imagem anexada"} />}
            </div>,
            plannerPortalRoot(),
          )
        : null}
    </div>
  );
}

export function TaskReturnsSection({ task, currentEmployee, loadAttachmentContent, onDeleteAttachment }: any) {
  const [showAllReturns, setShowAllReturns] = useState<any>(false);
  useEffect(() => { setShowAllReturns(false); }, [task?.id]);
  const returns = [...(task?.returns || [])].sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
  const latestReturn = returns.at(-1);
  const returnSeenKey = `planner:return-seen:${currentEmployee?.id || "anonymous"}:${task?.id || ""}`;
  const seenReturnAt = globalThis.localStorage?.getItem(returnSeenKey) || "";
  const hasUnreadReturn = Boolean(latestReturn?.createdAt && seenReturnAt < latestReturn.createdAt);
  useEffect(() => {
    if (latestReturn?.createdAt) globalThis.localStorage?.setItem(returnSeenKey, latestReturn.createdAt);
  }, [latestReturn?.createdAt, returnSeenKey]);
  if (!returns.length) return null;
  const visibleReturns = showAllReturns ? [...returns].reverse() : [latestReturn];
  const olderReturnsCount = returns.length - visibleReturns.length;
  return (
    <section className="drawer-section returns-section">
      <div className="drawer-section-heading">
        <div className="comment-section-title"><h3>Retornos</h3><span className="section-count">{returns.length}</span></div>
        <span className="comment-section-helper">Respostas recebidas</span>
      </div>
      {visibleReturns.map((item) => (
        <article className={`return-card ${item.id === latestReturn?.id ? "is-latest" : ""}`} key={item.id}>
          <header className="return-card-header">
            <div className="return-card-author"><Avatar name={item.author} small /><span><strong>{item.author}</strong><small>{formatCommentTimestamp(item.createdAt)}</small></span></div>
            {item.id === latestReturn?.id && <span className={`return-card-badge ${hasUnreadReturn ? "is-new" : ""}`}>{hasUnreadReturn ? "Novo retorno" : "Mais recente"}</span>}
          </header>
          <p className="return-card-text">{item.text}</p>
          <ReturnEvidenceList taskId={task.id} attachments={item.attachments} loadAttachmentContent={loadAttachmentContent} onDeleteAttachment={onDeleteAttachment} />
        </article>
      ))}
      {!showAllReturns && olderReturnsCount > 0 && <button className="comment-history-toggle" type="button" onClick={() => setShowAllReturns(true)}><ChevronDown size={14} aria-hidden="true" /> Mostrar {olderReturnsCount} {olderReturnsCount === 1 ? "retorno anterior" : "retornos anteriores"}</button>}
    </section>
  );
}
