import { useEffect, useRef, useState } from "react";
import { reportAppError } from "../lib/appErrorLogger";
import { AppShell } from "../components/layout/AppShell";
import { ActionBar, ActionButton } from "../components/common/ActionButton";
import { FieldError, FormField, TextAreaControl, TextInputControl } from "../components/common/FormFields";
import { PhotoAddButton } from "../components/common/PhotoAddButton";
import { FormMenu } from "../components/navigation/FormMenu";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { ChecklistAgendaCard } from "../components/checklists/ChecklistAgendaCard";
import { MediaCaptureScreen } from "./MediaCaptureScreen";
import { MaintenancePhotoPreviewScreen } from "./MaintenancePhotoPreviewScreen";
import { clearMediaDraft, loadMediaDraft, saveMediaDraft } from "../lib/mediaDraftStore";
import { uploadChecklistPhotoRemote } from "../lib/dataverse";
import {
  buildChecklistRespostasJson,
  CHECKLIST_MAX_FOTOS_POR_ITEM,
  CHECKLIST_MAX_TEXTO,
  checklistDraftKey,
  concluirChecklist,
  countChecklistProgress,
  createChecklistDraft,
  isChecklistPending,
  isMockChecklists,
  uploadChecklistPhotoMock,
  validateChecklistDraft,
  type ChecklistDraft,
  type ChecklistFotoEnviada,
  type ChecklistItem,
  type ChecklistVeiculo
} from "../lib/checklists";

export type ChecklistsLoadStatus = "loading" | "ready" | "error";

type Props = {
  items: ChecklistVeiculo[];
  loadStatus?: ChecklistsLoadStatus;
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  onBack: () => void;
  /** Quando definido, o Voltar no detalhe chama isto em vez de voltar para a lista (ex.: aberto pela aba Serviços). */
  onCloseDetail?: () => void;
  onReload: () => Promise<void>;
};

type PhotoView = { chave: string; dataUrl: string; photoId: string };

const PHOTO_MAX_SIDE = 1600;
const PHOTO_QUALITY = 0.8;

// Reduz a foto antes de guardar no aparelho e enviar: 8+ fotos em resolução cheia passam do limite do rascunho.
function shrinkPhotoDataUrl(dataUrl: string) {
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale >= 1 && dataUrl.startsWith("data:image/jpeg")) return resolve(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return resolve(dataUrl);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}

function formatNumber(value: string, unidade: string) {
  const number = Number(value);
  if (!value || !Number.isFinite(number)) return value || "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(number)}${unidade ? ` ${unidade}` : ""}`;
}

const newPhotoId = () => globalThis.crypto?.randomUUID?.() ?? `foto-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const itemDomId = (chave: string) => `checklist-item-${chave}`;

export function ChecklistsScreen({ items, loadStatus = "ready", selectedId, onSelectedIdChange, onBack, onCloseDetail, onReload }: Props) {
  const selected = items.find((item) => item.id === selectedId);
  const pending = items.filter(isChecklistPending);
  const completed = items.filter((item) => !isChecklistPending(item));

  const [draft, setDraft] = useState<ChecklistDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "success">("idle");
  const [progress, setProgress] = useState("");
  const [capturingChave, setCapturingChave] = useState("");
  const [photoView, setPhotoView] = useState<PhotoView | null>(null);
  const [retrying, setRetrying] = useState(false);
  const saveTimerRef = useRef(0);
  const locked = busy || phase === "success";

  // Abre o rascunho salvo no aparelho; sem rascunho, começa com o KM sugerido pela Infleet.
  useEffect(() => {
    setErrors({});
    setPageError("");
    setCapturingChave("");
    setPhotoView(null);
    if (!selected || !isChecklistPending(selected)) { setDraft(null); return; }
    let alive = true;
    const fresh = createChecklistDraft(selected);
    setDraft(fresh);
    loadMediaDraft<ChecklistDraft>(checklistDraftKey(selected.id))
      .then((saved) => { if (alive && saved?.checklistId === selected.id) setDraft(saved); })
      .catch((cause) => reportAppError(cause, { severity: "warning", source: "checklists", action: "loadDraft", screen: "Checklists", detailId: selected.id, detailType: "CHECKLIST", notifyUser: false }));
    return () => { alive = false; };
  }, [selected?.id, selected?.estado]);

  const persist = (next: ChecklistDraft) => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveMediaDraft(next, checklistDraftKey(next.checklistId)).catch((cause) => {
        reportAppError(cause, { severity: "warning", source: "checklists", action: "saveDraft", screen: "Checklists", detailId: next.checklistId, detailType: "CHECKLIST", notifyUser: false });
        setPageError("Não foi possível guardar o progresso neste aparelho. Envie o checklist antes de fechar o app.");
      });
    }, 400);
  };

  useEffect(() => () => window.clearTimeout(saveTimerRef.current), []);

  const updateDraft = (change: (current: ChecklistDraft) => ChecklistDraft) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...change(current), updatedAt: new Date().toISOString() };
      persist(next);
      return next;
    });
  };

  const clearError = (chave: string) => setErrors((current) => {
    if (!current[chave]) return current;
    const next = { ...current };
    delete next[chave];
    return next;
  });

  const openItem = (id: string) => {
    setNotice("");
    setPhase("idle");
    onSelectedIdChange(id);
  };

  const closeDetail = () => {
    if (locked) return;
    if (onCloseDetail) onCloseDetail();
    else onSelectedIdChange("");
  };

  const refresh = async () => {
    setPageError("");
    try { await onReload(); }
    catch (cause) {
      reportAppError(cause, { source: "checklists", action: "refresh", phase: "reload", screen: "Checklists", detailId: selectedId, detailType: "CHECKLIST", notifyUser: false });
      setPageError("Não foi possível atualizar os checklists. Tente novamente.");
    }
  };

  const confirmPhoto = () => {
    if (!photoView) return;
    const { chave, dataUrl, photoId } = photoView;
    if (!photoId) {
      updateDraft((current) => ({ ...current, fotos: { ...current.fotos, [chave]: [...(current.fotos[chave] ?? []), { id: newPhotoId(), dataUrl }] } }));
      clearError(chave);
    }
    setPhotoView(null);
  };

  const deletePhoto = () => {
    if (!photoView?.photoId) return;
    const { chave, photoId } = photoView;
    updateDraft((current) => {
      const enviadas = { ...(current.enviadas ?? {}) };
      delete enviadas[photoId];
      return { ...current, enviadas, fotos: { ...current.fotos, [chave]: (current.fotos[chave] ?? []).filter((photo) => photo.id !== photoId) } };
    });
    setPhotoView(null);
  };

  const submit = async () => {
    if (!selected || !draft || locked) return;
    setNotice("");
    setPageError("");
    const found = validateChecklistDraft(selected.itens, draft);
    setErrors(found);
    const firstInvalid = selected.itens.find((item) => found[item.chave]);
    if (firstInvalid) {
      const count = Object.keys(found).length;
      setPageError(`Revise ${count} ${count === 1 ? "item destacado" : "itens destacados"}.`);
      document.getElementById(itemDomId(firstInvalid.chave))?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setBusy(true);
    let working = draft;
    let concluded = false;
    try {
      // Envio foto a foto; o link de cada uma fica no rascunho, então uma nova tentativa continua de onde parou.
      const queue = selected.itens.flatMap((item) => item.tipo === "foto"
        ? (working.fotos[item.chave] ?? []).map((photo, index) => ({ item, photo, order: index + 1 }))
        : []);
      const missing = queue.filter(({ photo }) => !working.enviadas?.[photo.id]);
      for (let index = 0; index < missing.length; index += 1) {
        const { item, photo, order } = missing[index];
        setProgress(`Enviando foto ${index + 1} de ${missing.length}`);
        const fileLabel = `${item.rotulo}-${order}`;
        const sent: ChecklistFotoEnviada = isMockChecklists()
          ? await uploadChecklistPhotoMock(`${fileLabel}.jpg`)
          : await uploadChecklistPhotoRemote({ checklistId: selected.id, placa: selected.placa, solicitadoEm: selected.solicitadoEm, itemLabel: item.rotulo, order, dataUrl: photo.dataUrl });
        working = { ...working, enviadas: { ...(working.enviadas ?? {}), [photo.id]: sent }, updatedAt: new Date().toISOString() };
        setDraft(working);
        await saveMediaDraft(working, checklistDraftKey(working.checklistId)).catch(() => undefined);
      }

      setProgress("Registrando checklist");
      const uploaded: Record<string, ChecklistFotoEnviada[]> = {};
      for (const { item, photo } of queue) {
        const sent = working.enviadas?.[photo.id];
        if (sent) uploaded[item.chave] = [...(uploaded[item.chave] ?? []), sent];
      }
      await concluirChecklist(selected.id, buildChecklistRespostasJson(selected.itens, working, uploaded));
      concluded = true;
      setBusy(false);
      setPhase("success");
      window.clearTimeout(saveTimerRef.current);
      await clearMediaDraft(checklistDraftKey(selected.id)).catch(() => undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      await onReload();
      setNotice("Checklist enviado. Obrigado pela vistoria.");
      if (onCloseDetail) onCloseDetail(); else onSelectedIdChange("");
    } catch (cause) {
      reportAppError(cause, {
        source: "checklists",
        action: "concluirChecklist",
        phase: concluded ? "reload-after-conclude" : "upload-or-conclude",
        screen: "Checklists",
        detailId: selected.id,
        detailType: "CHECKLIST",
        payload: { concluded, fotosEnviadas: Object.keys(working.enviadas ?? {}).length },
        notifyUser: false
      });
      setPageError(concluded
        ? "Checklist enviado, mas não foi possível atualizar a lista. Toque em Atualizar."
        : cause instanceof Error && cause.message ? `${cause.message} Seu progresso continua salvo; tente enviar de novo.` : "Não foi possível enviar o checklist. Seu progresso continua salvo; tente de novo.");
    } finally {
      setBusy(false);
      setPhase("idle");
      setProgress("");
    }
  };

  // ---------- Câmera e prévia (telas cheias, como na colisão) ----------

  const capturingItem = selected?.itens.find((item) => item.chave === capturingChave);
  if (selected && capturingItem) {
    return (
      <MediaCaptureScreen
        kind="NOTAFISCAL"
        title={`Foto: ${capturingItem.rotulo}`}
        onBack={() => setCapturingChave("")}
        onCapture={(dataUrl) => {
          const chave = capturingItem.chave;
          setCapturingChave("");
          void shrinkPhotoDataUrl(dataUrl).then((small) => setPhotoView({ chave, dataUrl: small, photoId: "" }));
        }}
        onSwitchCamera={() => undefined}
      />
    );
  }

  const viewingItem = selected?.itens.find((item) => item.chave === photoView?.chave);
  if (selected && photoView && viewingItem) {
    return (
      <MaintenancePhotoPreviewScreen
        kind="NOTAFISCAL"
        title={viewingItem.rotulo}
        prompt={photoView.photoId ? "Foto deste item." : "A foto está legível?"}
        photoDataUrl={photoView.dataUrl}
        onBack={() => setPhotoView(null)}
        onRetake={() => { setPhotoView(null); setCapturingChave(viewingItem.chave); }}
        onConfirm={photoView.photoId ? () => setPhotoView(null) : confirmPhoto}
        onDelete={photoView.photoId ? deletePhoto : undefined}
        confirmLabel={photoView.photoId ? "Voltar" : "Confirmar"}
        deleteOnly={Boolean(photoView.photoId)}
      />
    );
  }

  // ---------- Detalhe pendente: formulário ----------

  if (selected && isChecklistPending(selected)) {
    const progressCount = draft ? countChecklistProgress(selected.itens, draft) : { done: 0, total: selected.itens.length };
    return (
      <AppShell screenLabel="TelaChecklist">
        <FormMenu title="Checklist do veículo" onBack={locked ? undefined : closeDetail} />
        <section className="main-panel maintenance-request-main checklist-main">
          <article className="finalize-card maintenance-request-card checklist-card">
            <div className="finalize-scroll">
              <div className="finalize-form maintenance maintenance-request-form checklist-form" aria-busy={busy}>
                <p className="checklist-sr-status" role="status" aria-live="polite">{progress}</p>
                <div className="collision-summary checklist-summary">
                  <span>Veículo</span>
                  <strong>{selected.placa || "Veículo da Betinhos"}</strong>
                  <small>{progressCount.done} de {progressCount.total} itens preenchidos · progresso salvo neste aparelho</small>
                </div>
                {pageError ? <div className="form-error-summary" role="alert">{pageError}</div> : null}
                {!draft ? <p className="checklist-loading" role="status">Carregando checklist…</p> : selected.itens.map((item) => (
                  <ChecklistField
                    key={item.chave}
                    item={item}
                    draft={draft}
                    error={errors[item.chave]}
                    disabled={locked}
                    onValue={(value) => { updateDraft((current) => ({ ...current, valores: { ...current.valores, [item.chave]: value } })); clearError(item.chave); }}
                    onAddPhoto={() => setCapturingChave(item.chave)}
                    onOpenPhoto={(photoId, dataUrl) => setPhotoView({ chave: item.chave, dataUrl, photoId })}
                  />
                ))}
              </div>
            </div>
            <ActionBar className="finalize-actions maintenance-actions">
              <ActionButton className="finalize-primary" variant="primary" idleLabel="Enviar checklist" loadingLabel={progress || "Enviando checklist"} successLabel="Checklist enviado" state={busy ? "loading" : phase === "success" ? "success" : "idle"} disabled={!draft} onClick={() => void submit()} />
            </ActionBar>
          </article>
        </section>
      </AppShell>
    );
  }

  // ---------- Detalhe concluído e lista ----------

  return (
    <AppShell screenLabel="Checklists">
      <ServicesMenu
        title="Checklist"
        eyebrow={isMockChecklists() ? "Vistoria do veículo · Mock" : "Vistoria do veículo"}
        homeLabel="Voltar"
        homeIcon="arrowLeft"
        onHome={selected ? closeDetail : onBack}
        onRefresh={refresh}
      />
      <section className="comunicado-screen checklist-screen" aria-label={selected ? "Checklist enviado" : "Lista de checklists"}>
        {pageError ? <p className="comunicado-error comunicado-page-error" role="alert">{pageError}</p> : null}
        {selected ? (
          <article className="comunicado-detail checklist-done">
            <div className="comunicado-message">
              <div className="comunicado-detail-meta" data-checklist-state="concluido">
                <span>Checklist enviado</span>
                <time>{formatDate(selected.concluidoEm)}</time>
              </div>
              <h2 className="comunicado-detail-title">{selected.placa ? `Veículo ${selected.placa}` : "Vistoria do veículo"}</h2>
              <dl className="checklist-answers">
                {(selected.respostas.length ? selected.respostas : selected.itens.map((item) => ({ chave: item.chave, rotulo: item.rotulo, tipo: item.tipo, valor: "", fotos: [] }))).map((answer) => {
                  const item = selected.itens.find((entry) => entry.chave === answer.chave);
                  return (
                    <div key={answer.chave}>
                      <dt>{answer.rotulo}</dt>
                      <dd>
                        {answer.tipo === "foto" ? (answer.fotos.length ? (
                          <span className="checklist-answer-links">
                            {answer.fotos.map((foto, index) => <a key={foto.link} href={foto.link} target="_blank" rel="noreferrer">Ver foto {index + 1}</a>)}
                          </span>
                        ) : "Sem foto") : answer.tipo === "numero" ? formatNumber(answer.valor, item?.unidade ?? "") : answer.valor || "—"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </article>
        ) : (
          <div className="comunicado-list services-panel checklist-list">
            {notice ? <p className="checklist-notice" role="status">{notice}</p> : null}
            {loadStatus === "loading" && !items.length ? (
              <div className="comunicado-skeleton" role="status" aria-busy="true" aria-label="Carregando checklists">
                <span /><span />
              </div>
            ) : loadStatus === "error" && !items.length ? (
              <div className="comunicado-load-error" role="alert">
                <p>Não foi possível carregar os checklists. Verifique a conexão e tente novamente.</p>
                <ActionButton variant="secondary" idleLabel="Tentar novamente" loadingLabel="Carregando" state={retrying ? "loading" : "idle"} onClick={() => { setRetrying(true); void refresh().finally(() => setRetrying(false)); }} />
              </div>
            ) : <>
              <h2>Para fazer <span>{pending.length}</span></h2>
              {pending.length ? pending.map((item) => <ChecklistAgendaCard key={item.id} item={item} onOpen={openItem} />)
                : <p className="comunicado-empty">Tudo em dia. A operação pede uma vistoria do seu carro a cada 15 dias e avisa por notificação.</p>}
              {completed.length ? <><h2>Enviados</h2>{completed.map((item) => <ChecklistAgendaCard key={item.id} item={item} onOpen={openItem} />)}</> : null}
            </>}
          </div>
        )}
      </section>
    </AppShell>
  );
}

type FieldProps = {
  item: ChecklistItem;
  draft: ChecklistDraft;
  error?: string;
  disabled: boolean;
  onValue: (value: string) => void;
  onAddPhoto: () => void;
  onOpenPhoto: (photoId: string, dataUrl: string) => void;
};

function ChecklistField({ item, draft, error, disabled, onValue, onAddPhoto, onOpenPhoto }: FieldProps) {
  const inputId = `checklist-input-${item.chave}`;
  if (item.tipo === "foto") {
    const photos = draft.fotos[item.chave] ?? [];
    const isComplete = photos.length > 0;
    return (
      <section id={itemDomId(item.chave)} tabIndex={-1} className={`collision-evidence-group checklist-photo-item ${error ? "is-invalid" : ""} ${isComplete ? "is-complete" : ""}`}>
        <div className="collision-evidence-group-head">
          <div>
            <strong>{item.rotulo}{item.obrigatorio ? <span className="form-field-required" aria-hidden="true"> *</span> : null}</strong>
            {item.instrucao ? <p className="checklist-instruction">{item.instrucao}</p> : null}
          </div>
          <small>{photos.length ? `${photos.length} foto${photos.length === 1 ? "" : "s"}` : item.obrigatorio ? "Obrigatória" : "Opcional"}</small>
        </div>
        <div className="collision-evidence-strip">
          {photos.map((photo, index) => (
            <button type="button" className="collision-evidence-thumb" key={photo.id} disabled={disabled} onClick={() => onOpenPhoto(photo.id, photo.dataUrl)} aria-label={`Ver ${item.rotulo} ${index + 1}`}>
              <img src={photo.dataUrl} alt={`${item.rotulo} ${index + 1}`} />
              <small>{index + 1}</small>
            </button>
          ))}
          {photos.length < CHECKLIST_MAX_FOTOS_POR_ITEM ? (
            <PhotoAddButton disabled={disabled} onClick={onAddPhoto} ariaLabel={`Tirar foto: ${item.rotulo}`} label={isComplete ? "Adicionar" : "Tirar foto"} />
          ) : null}
        </div>
        <FieldError error={error} />
      </section>
    );
  }

  const value = draft.valores[item.chave] ?? "";
  return (
    <div id={itemDomId(item.chave)} className="checklist-value-item">
      <FormField label={item.rotulo} error={error} hint={item.instrucao || undefined} required={item.obrigatorio}>
        {item.tipo === "numero" ? (
          <div className="checklist-number">
            <TextInputControl
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              aria-label={item.rotulo}
              aria-invalid={Boolean(error)}
              placeholder={item.unidade === "km" ? "Ex.: 45210" : "Ex.: 75"}
              value={value}
              disabled={disabled}
              onChange={(event) => onValue(event.target.value)}
            />
            {item.unidade ? <span className="checklist-unit" aria-hidden="true">{item.unidade}</span> : null}
          </div>
        ) : (
          <TextAreaControl
            id={inputId}
            aria-label={item.rotulo}
            aria-invalid={Boolean(error)}
            rows={3}
            maxLength={CHECKLIST_MAX_TEXTO}
            placeholder="Escreva aqui, se precisar."
            value={value}
            disabled={disabled}
            onChange={(event) => onValue(event.target.value)}
          />
        )}
      </FormField>
    </div>
  );
}
