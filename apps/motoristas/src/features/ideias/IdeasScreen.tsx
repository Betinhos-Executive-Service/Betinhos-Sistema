import { useCallback, useEffect, useRef, useState } from "react";
import { ActionBar, ActionButton, type ActionButtonState } from "../../shared/ui/ActionButton";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { TextAreaField, TextInputField } from "../../shared/ui/FormFields";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { FormMenu } from "../../shared/ui/navigation/FormMenu";
import { formatVideoDuration, getVideoDurationSecondsFromUrl } from "../../shared/camera/photoOrientation";
import {
  IDEA_ATTACHMENT_MAX,
  IDEA_DETAILS_MAX_LENGTH,
  IDEA_TITLE_MAX_LENGTH,
  IdeaAttachmentsUnavailableError,
  classifyIdeaFile,
  formatIdeaDate,
  getIdeaStatusOption,
  ideaAttachmentLabel,
  summarizeAttachments,
  validateIdeaDraft,
  validateIdeaMedia,
  type Idea,
  type IdeaAttachment,
  type IdeaDraft,
  type IdeaDraftErrors,
  type IdeaMediaFile
} from "./ideas";
import { BrandLoader } from "../../shared/ui/BrandLoader";

type IdeasScreenProps = {
  onBack: () => void;
  loadIdeas: () => Promise<Idea[]>;
  createIdea: (draft: IdeaDraft) => Promise<Idea>;
  uploadAttachment: (idea: Pick<Idea, "id" | "title">, media: IdeaMediaFile, order: number) => Promise<IdeaAttachment>;
  localNotice?: string;
};

type MediaStatus = "pendente" | "enviando" | "ok" | "falhou";

type MediaItem = IdeaMediaFile & {
  key: string;
  previewUrl: string;
  order: number;
  status: MediaStatus;
  attachment?: IdeaAttachment;
};

const EMPTY_DRAFT: IdeaDraft = { title: "", details: "" };
const STATUS_LABEL: Record<MediaStatus, string> = { pendente: "Aguardando", enviando: "Enviando", ok: "Enviado", falhou: "Falhou" };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function IdeasScreen({ onBack, loadIdeas, createIdea, uploadAttachment, localNotice }: IdeasScreenProps) {
  const [view, setView] = useState<"lista" | "nova">("lista");
  const [draft, setDraft] = useState<IdeaDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<IdeaDraftErrors>({});
  const [items, setItems] = useState<MediaItem[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [reading, setReading] = useState(false);
  const [createdIdea, setCreatedIdea] = useState<Idea | null>(null);
  const [submitState, setSubmitState] = useState<ActionButtonState>("idle");
  const [progress, setProgress] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const titleRef = useRef<HTMLInputElement | null>(null);
  const detailsRef = useRef<HTMLTextAreaElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<MediaItem[]>([]);
  const keyRef = useRef(0);
  const isSubmitting = submitState !== "idle";
  const busy = isSubmitting || reading;
  const failedCount = items.filter((item) => item.status === "falhou").length;
  const full = items.length >= IDEA_ATTACHMENT_MAX;
  const locked = isSubmitting || Boolean(createdIdea);

  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setIdeas(await loadIdeas());
    } catch (error) {
      setLoadError(getErrorMessage(error, "Não foi possível carregar suas ideias. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }, [loadIdeas]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetComposition = () => {
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setMediaError("");
    setSubmitError("");
    setProgress("");
    setCreatedIdea(null);
    setSubmitState("idle");
  };

  const openComposition = () => {
    resetComposition();
    setNotice("");
    setView("nova");
  };

  const closeComposition = () => {
    resetComposition();
    setConfirmLeave(false);
    setView("lista");
  };

  const handleBack = () => {
    if (view === "lista") return onBack();
    if (createdIdea || draft.title.trim() || draft.details.trim() || items.length) return setConfirmLeave(true);
    closeComposition();
  };

  const updateDraft = (updates: Partial<IdeaDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
    setSubmitError("");
    const keys = Object.keys(updates) as (keyof IdeaDraft)[];
    if (keys.some((key) => errors[key])) {
      setErrors((current) => {
        const next = { ...current };
        keys.forEach((key) => delete next[key]);
        return next;
      });
    }
  };

  const addFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setReading(true);
    setMediaError("");
    const messages: string[] = [];
    const accepted: MediaItem[] = [];
    let count = itemsRef.current.length;
    for (const file of files) {
      const kind = classifyIdeaFile(file);
      let duration: number | null = null;
      let previewUrl = "";
      if (kind) previewUrl = URL.createObjectURL(file);
      if (kind === "video") duration = await getVideoDurationSecondsFromUrl(previewUrl);
      const reason = validateIdeaMedia(count, file, duration);
      if (reason || !kind) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        messages.push(reason);
        continue;
      }
      count += 1;
      keyRef.current += 1;
      accepted.push({ key: `m${keyRef.current}`, file, kind, durationSeconds: duration, previewUrl, order: 0, status: "pendente" });
    }
    if (accepted.length) {
      setItems((current) => [...current, ...accepted].slice(0, IDEA_ATTACHMENT_MAX));
      setSubmitError("");
    }
    setMediaError(messages.join(" "));
    setReading(false);
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    void addFiles(files).finally(() => {
      event.target.value = "";
    });
  };

  const removeItem = (key: string) => {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
    setMediaError("");
  };

  const patchItem = (key: string, patch: Partial<MediaItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const upsertIdea = (idea: Idea, attachments: IdeaAttachment[]) =>
    setIdeas((current) => [{ ...idea, attachments }, ...current.filter((item) => item.id !== idea.id)]);

  const finish = (idea: Idea, sent: IdeaAttachment[], message: string) => {
    upsertIdea(idea, sent);
    resetComposition();
    setNotice(message);
    setView("lista");
  };

  const submit = async () => {
    if (busy) return;
    if (!createdIdea) {
      const nextErrors = validateIdeaDraft(draft);
      setErrors(nextErrors);
      if (nextErrors.title) return titleRef.current?.focus();
      if (nextErrors.details) return detailsRef.current?.focus();
    }

    setSubmitState("loading");
    setSubmitError("");
    let idea = createdIdea;
    try {
      if (!idea) {
        setProgress("Enviando a ideia…");
        idea = await createIdea(draft);
        setCreatedIdea(idea);
      }
    } catch (error) {
      setSubmitState("idle");
      setProgress("");
      setSubmitError(getErrorMessage(error, "Não foi possível enviar a ideia. Tente novamente."));
      return;
    }

    // Arquivo já enviado mantém a ordem gravada; os demais pegam o menor número livre (nunca repete, para não sobrescrever o arquivo no SharePoint).
    const taken = new Set(itemsRef.current.flatMap((item) => (item.status === "ok" && item.attachment ? [item.attachment.order] : [])));
    const nextFreeOrder = () => {
      let order = 1;
      while (taken.has(order)) order += 1;
      taken.add(order);
      return order;
    };
    const snapshot = itemsRef.current.map((item) => ({ ...item, order: item.status === "ok" && item.attachment ? item.attachment.order : nextFreeOrder() }));
    const todo = snapshot.filter((item) => item.status !== "ok");
    let unavailable = false;
    for (let index = 0; index < todo.length; index += 1) {
      const item = todo[index];
      setProgress(`Enviando ${index + 1} de ${todo.length}…`);
      patchItem(item.key, { status: "enviando", order: item.order });
      try {
        const attachment = await uploadAttachment(idea, item, item.order);
        item.status = "ok";
        item.attachment = attachment;
        patchItem(item.key, { status: "ok", attachment });
      } catch (error) {
        item.status = "falhou";
        patchItem(item.key, { status: "falhou" });
        if (error instanceof IdeaAttachmentsUnavailableError) {
          unavailable = true;
          break;
        }
      }
    }

    const sent = snapshot.filter((item) => item.status === "ok").map((item) => item.attachment).filter((item): item is IdeaAttachment => Boolean(item));
    const failed = snapshot.filter((item) => item.status === "falhou").length;
    setProgress("");
    if (unavailable) return finish(idea, [], "Ideia enviada. Os anexos ainda não estão disponíveis, então só o texto foi enviado.");
    if (failed) {
      upsertIdea(idea, sent);
      setSubmitState("idle");
      return;
    }
    setSubmitState("success");
    window.setTimeout(() => finish(idea, sent, "Ideia enviada. A equipe vai avaliar e você acompanha o status aqui."), 600);
  };

  const mediaButtons = (
    <div className="ideas-media-actions" role="group" aria-label="Adicionar fotos ou vídeos">
      <button type="button" className="ideas-media-button" disabled={locked || full || reading} onClick={() => photoInputRef.current?.click()}>
        <span aria-hidden="true" className="ideas-media-icon"><SystemIcon name="camera" /></span>
        <span>Tirar foto</span>
      </button>
      <button type="button" className="ideas-media-button" disabled={locked || full || reading} onClick={() => videoInputRef.current?.click()}>
        <span aria-hidden="true" className="ideas-media-icon"><SystemIcon name="video" /></span>
        <span>Gravar vídeo</span>
      </button>
      <button type="button" className="ideas-media-button" disabled={locked || full || reading} onClick={() => galleryInputRef.current?.click()}>
        <span aria-hidden="true" className="ideas-media-icon">
          <svg viewBox="0 0 48 48"><rect x="6" y="9" width="36" height="30" rx="4" fill="none" stroke="currentColor" strokeWidth="3.2" /><circle cx="17" cy="20" r="3.5" fill="currentColor" /><path d="m8 36 11-10 8 7 6-5 9 8" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" /></svg>
        </span>
        <span>Da galeria</span>
      </button>
      <input ref={photoInputRef} className="ideas-file-input" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-label="Tirar foto com a câmera" onChange={onPick} />
      <input ref={videoInputRef} className="ideas-file-input" type="file" accept="video/*" capture="environment" tabIndex={-1} aria-label="Gravar vídeo com a câmera" onChange={onPick} />
      <input ref={galleryInputRef} className="ideas-file-input" type="file" accept="image/*,video/*" multiple tabIndex={-1} aria-label="Escolher fotos ou vídeos da galeria" onChange={onPick} />
    </div>
  );

  const composition = (
    <div className="finalize-form ideas-form">
      <TextInputField
        ref={titleRef}
        required
        label="1. O que você viu?"
        error={errors.title}
        hint={`${draft.title.trim().length}/${IDEA_TITLE_MAX_LENGTH}`}
        maxLength={IDEA_TITLE_MAX_LENGTH}
        placeholder="Ex.: água gelada nos carros executivos"
        disabled={locked}
        value={draft.title}
        onChange={(event) => updateDraft({ title: event.target.value })}
      />

      <TextAreaField
        ref={detailsRef}
        label="2. Como resolveria? (opcional)"
        error={errors.details}
        maxLength={IDEA_DETAILS_MAX_LENGTH}
        rows={4}
        placeholder="Conte o problema e como sua ideia ajudaria."
        disabled={locked}
        value={draft.details}
        onChange={(event) => updateDraft({ details: event.target.value })}
      />

      <section className="ideas-media" aria-labelledby="ideas-media-title">
        <div className="ideas-media-heading">
          <h2 id="ideas-media-title">3. Fotos ou vídeos (opcional, até {IDEA_ATTACHMENT_MAX})</h2>
          <span>{items.length}/{IDEA_ATTACHMENT_MAX}</span>
        </div>
        {mediaButtons}
        {mediaError ? <div className="ideas-feedback ideas-feedback--error" role="alert">{mediaError}</div> : null}
        {items.length ? (
          <ul className="ideas-thumbs">
            {items.map((item, index) => (
              <li className={`ideas-thumb is-${item.status}`} key={item.key}>
                <div className="ideas-thumb-media">
                  {item.kind === "video" ? (
                    <>
                      <video src={`${item.previewUrl}#t=0.1`} preload="metadata" muted playsInline aria-label={`Vídeo ${index + 1}`} />
                      <span className="ideas-thumb-play" aria-hidden="true">&#9654;</span>
                      {item.durationSeconds !== null ? <span className="ideas-thumb-duration">{formatVideoDuration(item.durationSeconds)}</span> : null}
                    </>
                  ) : (
                    <img src={item.previewUrl} alt={`Foto ${index + 1}`} />
                  )}
                  {item.status !== "pendente" ? <span className={`ideas-thumb-state ideas-thumb-state--${item.status}`}>{STATUS_LABEL[item.status]}</span> : null}
                </div>
                <button type="button" className="ideas-thumb-remove" disabled={busy || item.status === "ok" || item.status === "enviando"} onClick={() => removeItem(item.key)} aria-label={`Remover ${ideaAttachmentLabel(item.kind).toLowerCase()} ${index + 1}`}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {full ? <p className="ideas-media-full">Limite de {IDEA_ATTACHMENT_MAX} arquivos atingido.</p> : null}
      </section>

      {submitError ? <div className="ideas-feedback ideas-feedback--error" role="alert">{submitError}</div> : null}
      {createdIdea && failedCount && !isSubmitting ? (
        <div className="ideas-feedback ideas-feedback--error" role="alert">
          Ideia enviada, mas {plural(failedCount, "arquivo não foi", "arquivos não foram")}. Toque em &quot;Tentar de novo&quot; para reenviar só {failedCount === 1 ? "ele" : "eles"}.
        </div>
      ) : null}
      {progress ? <div className="ideas-feedback ideas-feedback--info" role="status">{progress}</div> : null}

      <ActionBar className="finalize-actions ideas-actions">
        <ActionButton
          className="finalize-primary"
          variant="primary"
          idleLabel={createdIdea ? (failedCount ? "TENTAR DE NOVO" : "CONCLUIR") : "ENVIAR IDEIA"}
          loadingLabel="ENVIANDO"
          successLabel="ENVIADA"
          state={submitState}
          disabled={reading}
          onClick={() => void submit()}
        />
      </ActionBar>
    </div>
  );

  const list = (
    <div className="finalize-form ideas-form">
      <p className="ideas-intro">Viu algo que pode melhorar no dia a dia? Conte para a equipe.</p>
      {localNotice ? <div className="ideas-feedback ideas-feedback--info" role="status">{localNotice}</div> : null}
      {notice ? <div className="ideas-feedback ideas-feedback--success" role="status">{notice}</div> : null}

      <ActionBar className="finalize-actions ideas-actions">
        <ActionButton className="finalize-primary" variant="primary" idleLabel="NOVA IDEIA" onClick={openComposition} />
      </ActionBar>

      <section className="ideas-list-section" aria-labelledby="ideas-list-title" aria-busy={loading}>
        <div className="ideas-list-heading">
          <h2 id="ideas-list-title">Suas ideias</h2>
          {!loading && !loadError ? <span>{ideas.length}</span> : null}
        </div>

        {loadError ? (
          <div className="ideas-feedback ideas-feedback--error" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => void refresh()}>Tentar novamente</button>
          </div>
        ) : loading && !ideas.length ? (
          <BrandLoader variant="inline" size="md" label="Carregando ideias" text="Carregando ideias" />
        ) : ideas.length ? (
          <ul className="ideas-list">
            {ideas.map((idea) => {
              const status = getIdeaStatusOption(idea.status);
              const summary = summarizeAttachments(idea.attachments);
              return (
                <li className="idea-item" key={idea.id}>
                  <div className="idea-item-head">
                    <strong>{idea.title}</strong>
                    <span className={`idea-status idea-status--${status?.tone ?? "info"}`}>{status?.label ?? "Sem status"}</span>
                  </div>
                  {idea.details ? <p>{idea.details}</p> : null}
                  {idea.createdAt ? <small>Enviada em {formatIdeaDate(idea.createdAt)}</small> : null}
                  {summary ? (
                    <div className="idea-attachments">
                      <small>{summary}</small>
                      <div className="idea-attachment-links">
                        {idea.attachments.filter((attachment) => attachment.link).map((attachment, index) => (
                          <a key={attachment.id || `${attachment.order}-${index}`} href={attachment.link} target="_blank" rel="noreferrer">
                            {ideaAttachmentLabel(attachment.kind)} {attachment.order || index + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="ideas-empty">
            <strong>Nenhuma ideia enviada ainda</strong>
            <span>Conte a primeira: toque em &quot;Nova ideia&quot; e diga o que você viu.</span>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <AppShell screenLabel="TelaBoasIdeias">
      <FormMenu
        title={view === "nova" ? "Nova ideia" : "Boas ideias"}
        onBack={busy ? undefined : handleBack}
        rightIcon={view === "lista" ? "refresh" : undefined}
        rightLabel={view === "lista" ? "Atualizar ideias" : undefined}
        onRightClick={view === "lista" && !loading ? () => void refresh() : undefined}
      />
      <section className="main-panel ideas-main">
        <article className="finalize-card ideas-card">
          <div className="finalize-scroll">{view === "nova" ? composition : list}</div>
        </article>
      </section>
      {confirmLeave ? (
        <ConfirmDialog
          tone="confirm"
          title={createdIdea ? "Sair sem os arquivos?" : "Descartar a ideia?"}
          message={createdIdea ? `A ideia já foi enviada, mas ${plural(failedCount, "arquivo ficou", "arquivos ficaram")} de fora.` : "O que você escreveu e escolheu será perdido."}
          confirmLabel={createdIdea ? "Sair" : "Descartar"}
          cancelLabel="Continuar editando"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={closeComposition}
        />
      ) : null}
    </AppShell>
  );
}
