import { useEffect, useMemo, useRef, useState } from "react";
import { ActionBar, ActionButton, type ActionButtonState } from "../components/common/ActionButton";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { FieldError, MoneyInputField, SelectField, TextAreaField } from "../components/common/FormFields";
import { DitadoField } from "../components/common/DitadoButton";
import { PhotoAddButton } from "../components/common/PhotoAddButton";
import { SystemIcon } from "../components/icons/SystemIcon";
import { AppShell } from "../components/layout/AppShell";
import { useCameraScroll } from "../app/cameraScroll";
import { FormMenu } from "../components/navigation/FormMenu";
import { appendDitado } from "../lib/useDitado";
import { isExchangeOutsideWindow, organizeObservationRemote, type ExchangeWindowCheck } from "../lib/dataverse";
import {
  activeSummary,
  generateSummary,
  NO_OBSERVATION,
  summaryFinalValue,
  topicKind,
  type OrganizeObservation,
  type SummaryState,
  type TopicKind
} from "../lib/observacaoOrganizada";
import { matchesExpenseCitySearch, type ExpenseReferenceData } from "../lib/expenses";
import { buildWhatsAppUrl, openExternalUrl } from "../lib/localWorkflow";
import { validateMaintenanceFinalizeFields, type MaintenanceFinalizeErrors } from "../lib/maintenanceFinalize";
import type { DetailData, MaintenancePhotoKind } from "../types";

type FinalizeScreenProps = {
  detail: DetailData;
  onBack: () => void;
  onDone: (fields: Record<string, string>) => void;
  confirmedPhotos: MaintenancePhotoKind[];
  maintenancePhotos: Partial<Record<MaintenancePhotoKind, string>>;
  maintenanceDraft?: MaintenanceFinalizeDraft;
  onMaintenanceDraftChange?: (draft: MaintenanceFinalizeDraft) => void;
  expenseReferenceData: ExpenseReferenceData;
  expenseReferenceLoading: boolean;
  expenseReferenceError?: string;
  onPreviewMaintenancePhoto: (kind: MaintenancePhotoKind) => void;
  onClearPhotos?: () => void;
  submitState?: ActionButtonState;
  initialServiceObservation?: string;
  organizeObservation?: OrganizeObservation;
};

export type MaintenanceFinalizeDraft = {
  serviceDone: string;
  value: string;
  payment: string;
  cidadeId: string;
  establishment: string;
  notes: string;
};

function focusInvalidField(element: HTMLElement | null) {
  window.setTimeout(() => {
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  }, 40);
}

function FinalizeActions({ onNone, onConfirm, submitState, noneLabel = "Não tenho", confirmLabel = "Confirmar", confirmDisabled = false, confirmLoadingLabel }: { onNone: () => void; onConfirm: () => void; submitState: ActionButtonState; noneLabel?: string; confirmLabel?: string; confirmDisabled?: boolean; confirmLoadingLabel?: string }) {
  const [activeAction, setActiveAction] = useState<"none" | "confirm" | "">("");

  useEffect(() => {
    if (submitState === "idle") setActiveAction("");
  }, [submitState]);

  return (
    <ActionBar className="finalize-actions">
      <ActionButton
        className="finalize-secondary"
        idleLabel={noneLabel}
        state={submitState}
        active={activeAction === "none"}
        variant="secondary"
        onClick={() => {
          setActiveAction("none");
          onNone();
        }}
      />
      <ActionButton
        className="finalize-primary"
        idleLabel={confirmLabel}
        loadingLabel={confirmLoadingLabel}
        disabled={confirmDisabled}
        state={submitState}
        active={activeAction === "confirm"}
        variant="primary"
        onClick={() => {
          setActiveAction("confirm");
          onConfirm();
        }}
      />
    </ActionBar>
  );
}

function TextAreaBlock({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextAreaField
      fieldClassName="finalize-input-block shadow"
      label={label}
      placeholder="Digite aqui"
      rows={5}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const TOPIC_ICON_PATHS: Record<TopicKind, string> = {
  atraso: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  espera: "M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4",
  pedagio: "M3 20V8l9-5 9 5v12M3 20h18M9 20v-6h6v6",
  combustivel: "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 11h10M14 8l3 3v6a2 2 0 0 0 4 0V9l-3-3",
  passageiro: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  ocorrencia: "M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  local: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  rota: "M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 16h6a3 3 0 0 0 0-6h-2M6 13V8",
  cafe: "M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8ZM6 2v3M10 2v3M14 2v3",
  refeicao: "M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11M17 22V2c-3 2-4 6-4 9h4",
  pagamento: "M3 6h18v12H3zM3 10h18M7 15h3",
  veiculo: "M5 17H3v-5l2-5h14l2 5v5h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M9 17h6M3 12h18",
  aeroporto: "M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2l-1.4 1.4 6.3 3.4-3.2 3.2-3-.5-1 1 4 2 2 4 1-1-.5-3 3.2-3.2 3.4 6.3Z",
  bagagem: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM9 21V6M15 21V6",
  documento: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5",
  contato: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z",
  limpeza: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z",
  clima: "M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 0 1 0 9ZM8 22l1-2M12 22l1-2M16 22l1-2",
  elogio: "M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6H7V10l4.3-8a2.4 2.4 0 0 1 3.7 2Z",
  reclamacao: "M17 14V2M9 18.1 10 14H4.2a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 5.6 3H17v12l-4.3 8a2.4 2.4 0 0 1-3.7-2Z",
  cancelamento: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM15 9l-6 6M9 9l6 6",
  seguranca: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM9 12l2 2 4-4",
  hospedagem: "M3 21V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v13M3 21h18M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M10 21v-3h4v3",
  concluido: "M21.8 10A10 10 0 1 1 17 3.3M9 11l3 3L22 4",
  outros: "M5 12h.01M12 12h.01M19 12h.01"
};

function TopicIcon({ topic }: { topic: string }) {
  const kind = topicKind(topic);
  return (
    <span className={`observation-topic-icon is-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d={TOPIC_ICON_PATHS[kind]} /></svg>
    </span>
  );
}

function ObservationSummary({ summary }: { summary: SummaryState }) {
  if (summary.status === "failed") {
    return (
      <p className="observation-review-warning" role="alert">
        <SystemIcon name="warning" />
        Não foi possível resumir agora
      </p>
    );
  }
  return (
    <section className="observation-review shadow" aria-label="Resumo do serviço">
      <ul className="observation-review-topics">
        {summary.topicos.map((topic, index) => (
          <li key={`${index}-${topic}`}>
            <TopicIcon topic={topic} />
            <span>{topic}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ServiceFinalize({
  detail,
  onDone,
  submitState,
  initialObservation = "",
  organizeObservation
}: {
  detail: DetailData;
  onDone: (fields: Record<string, string>) => void;
  submitState: ActionButtonState;
  initialObservation?: string;
  organizeObservation: OrganizeObservation;
}) {
  const [obs, setObs] = useState(initialObservation);
  const [generating, setGenerating] = useState(false);
  const [summaryState, setSummaryState] = useState<SummaryState | null>(null);

  useEffect(() => {
    setObs(initialObservation);
    setSummaryState(null);
  }, [detail.id, initialObservation]);

  // Etapa 1: sem resumo para o texto atual (digitar ou ditar depois do resumo volta para cá).
  const summary = activeSummary(summaryState, obs);
  const hasObservation = obs.trim() !== "";
  const finish = (value: string) => onDone({ "Observação Final": value });

  const generate = async () => {
    setGenerating(true);
    setSummaryState(await generateSummary(obs, organizeObservation));
    setGenerating(false);
  };

  const confirmLabel = !summary ? "Gerar resumo" : summary.status === "ready" ? "Confirmar" : "Enviar";

  return (
    <article className="finalize-card">
      <div className="finalize-title">{summary?.status === "ready" ? "Confira o resumo do serviço" : hasObservation ? "Confira sua observação" : "Digite abaixo sua observação"}</div>
      <div className="finalize-scroll">
        <div className="finalize-form observation-review-form">
          {summary ? <ObservationSummary summary={summary} /> : null}
          <DitadoField stopWhen={submitState !== "idle" || generating} onFinal={(text) => setObs((current) => appendDitado(current, text))}>
            <TextAreaBlock label="Observação do serviço" value={obs} onChange={setObs} />
          </DitadoField>
        </div>
      </div>
      <FinalizeActions
        noneLabel="Não tenho observação"
        confirmLabel={confirmLabel}
        confirmDisabled={!hasObservation || generating}
        onNone={() => finish(NO_OBSERVATION)}
        onConfirm={() => (summary ? finish(summaryFinalValue(summary)) : void generate())}
        submitState={generating ? "loading" : submitState}
        confirmLoadingLabel={generating ? "Gerando resumo…" : undefined}
      />
    </article>
  );
}

function ExchangeFinalize({ detail, onDone, submitState }: { detail: DetailData; onDone: (fields: Record<string, string>) => void; submitState: ActionButtonState }) {
  const [obs, setObs] = useState("");
  const [reason, setReason] = useState("");
  const [reasonMissing, setReasonMissing] = useState(false);
  const record = detail.dataverse?.record as { __windowCheck?: ExchangeWindowCheck } | undefined;
  const outside = isExchangeOutsideWindow(record?.__windowCheck);

  // Fora do combinado o motivo é obrigatório (o servidor também exige).
  const finish = (observation: string) => {
    if (outside && !reason.trim()) {
      setReasonMissing(true);
      return;
    }
    onDone({ "Observações": observation, ...(outside ? { "Motivo fora da janela": reason.trim() } : {}) });
  };

  return (
    <article className="finalize-card">
      <div className="finalize-title">{detail.id}</div>
      <div className="finalize-scroll">
        <div className="finalize-form">
          {outside ? (
            <>
              <p className="form-error-summary" role="status">A troca está fora do combinado. Conte rapidamente o motivo.</p>
              <TextAreaBlock label="Motivo da troca fora do combinado" value={reason} onChange={(value) => { setReason(value); setReasonMissing(false); }} />
              <FieldError error={reasonMissing ? "Escreva o motivo para confirmar." : ""} />
            </>
          ) : null}
          <TextAreaBlock label="Observação da troca" value={obs} onChange={setObs} />
        </div>
      </div>
      <FinalizeActions
        noneLabel={obs.trim() ? "Enviar sem observação" : "Não tenho"}
        onNone={() => finish("Sem observação.")}
        onConfirm={() => finish(obs.trim() || "Sem observação.")}
        submitState={submitState}
      />
    </article>
  );
}

function MaintenancePhotoGrid({
  label,
  kinds,
  photos,
  isInvalid,
  required = false,
  isSubmitting,
  allowMultiple = false,
  onPreview
}: {
  label: string;
  kinds: MaintenancePhotoKind[];
  photos: Partial<Record<MaintenancePhotoKind, string>>;
  isInvalid?: boolean;
  required?: boolean;
  isSubmitting: boolean;
  allowMultiple?: boolean;
  /** `anchor` identifica a grade para a rolagem voltar a ela depois da câmera. */
  onPreview: (kind: MaintenancePhotoKind, anchor: string) => void;
}) {
  const invoiceItems = Object.entries(photos)
    .filter(([kind, dataUrl]) => kind.startsWith("NOTAFISCAL") && Boolean(dataUrl))
    .sort(([left], [right]) => {
      const leftIndex = left === "NOTAFISCAL" ? 1 : Number(left.replace("NOTAFISCAL_", ""));
      const rightIndex = right === "NOTAFISCAL" ? 1 : Number(right.replace("NOTAFISCAL_", ""));
      return leftIndex - rightIndex;
    })
    .map(([kind, dataUrl]) => ({ kind: kind as MaintenancePhotoKind, dataUrl: dataUrl as string }));
  const fixedItems = kinds
    .map((kind) => ({ kind, dataUrl: photos[kind] }))
    .filter((item): item is { kind: MaintenancePhotoKind; dataUrl: string } => Boolean(item.dataUrl));
  const photoItems = allowMultiple ? invoiceItems : fixedItems;
  const nextEmptyKind = allowMultiple
    ? ((invoiceItems.length === 0 ? "NOTAFISCAL" : `NOTAFISCAL_${invoiceItems.length + 1}`) as MaintenancePhotoKind)
    : (kinds.find((kind) => !photos[kind]) ?? kinds[kinds.length - 1]);

  return (
    <div className={`finalize-input-block maintenance-photo-block ${isInvalid ? "is-invalid" : ""}`} data-scroll-anchor={kinds[0]}>
      <label className="form-field-label">
        <span>{label}</span>
        {required ? <span className="form-field-required" aria-hidden="true">*</span> : null}
      </label>
      <div className="maintenance-photo-grid">
        {photoItems.map((photo, index) => (
          <button
            key={photo.kind}
            type="button"
            className="maintenance-photo-thumb"
            disabled={isSubmitting}
            onClick={() => onPreview(photo.kind, kinds[0])}
            aria-label={`Ver ${label} ${index + 1}`}
          >
            {photo.dataUrl.startsWith("data:video/") ? (
              <>
                <video src={photo.dataUrl} muted playsInline preload="metadata" />
                <span className="media-video-badge">Vídeo</span>
              </>
            ) : (
              <img src={photo.dataUrl} alt={`${label} ${index + 1}`} />
            )}
          </button>
        ))}
        <PhotoAddButton disabled={isSubmitting} onClick={() => onPreview(nextEmptyKind, kinds[0])} ariaLabel={`Adicionar ${label}`} />
      </div>
    </div>
  );
}

function MaintenanceFinalize({
  detail,
  onDone,
  confirmedPhotos,
  maintenancePhotos,
  draft,
  onDraftChange,
  expenseReferenceData,
  expenseReferenceLoading,
  expenseReferenceError = "",
  onPreviewMaintenancePhoto,
  submitState
}: {
  detail: DetailData;
  onDone: (fields: Record<string, string>) => void;
  confirmedPhotos: MaintenancePhotoKind[];
  maintenancePhotos: Partial<Record<MaintenancePhotoKind, string>>;
  draft?: MaintenanceFinalizeDraft;
  onDraftChange?: (draft: MaintenanceFinalizeDraft) => void;
  expenseReferenceData: ExpenseReferenceData;
  expenseReferenceLoading: boolean;
  expenseReferenceError?: string;
  onPreviewMaintenancePhoto: (kind: MaintenancePhotoKind) => void;
  submitState: ActionButtonState;
}) {
  const isSubmitting = submitState !== "idle";
  const cameraScroll = useCameraScroll(`finalizar:${detail.id}`);
  const serviceDoneRef = useRef<HTMLTextAreaElement | null>(null);
  const valueRef = useRef<HTMLInputElement | null>(null);
  const paymentRef = useRef<HTMLButtonElement | null>(null);
  const cityRef = useRef<HTMLButtonElement | null>(null);
  const establishmentRef = useRef<HTMLTextAreaElement | null>(null);
  const [serviceDone, setServiceDone] = useState(draft?.serviceDone ?? "");
  const [value, setValue] = useState(draft?.value ?? "");
  const [payment, setPayment] = useState(draft?.payment ?? "");
  const [cidadeId, setCidadeId] = useState(draft?.cidadeId ?? "");
  const [establishment, setEstablishment] = useState(draft?.establishment ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [errors, setErrors] = useState<MaintenanceFinalizeErrors>({});

  const paymentOptions = [
    { value: "Pedido de compra", label: "Pedido de compra" },
    { value: "Cartão de crédito", label: "Cartão de crédito" },
    { value: "Pix", label: "Pix" }
  ];

  const cityOptions = useMemo(
    () => expenseReferenceData.cities.map((city) => ({
      value: city.id,
      label: city.name,
      subtitle: city.codigoIbge ? `${city.pais} - ${city.codigoIbge}` : city.pais,
      searchText: `${city.name} ${city.uf} ${city.pais} ${city.codigoIbge}`
    })),
    [expenseReferenceData.cities]
  );
  const cityById = useMemo(
    () => new Map(expenseReferenceData.cities.map((city) => [city.id, city])),
    [expenseReferenceData.cities]
  );

  const updateDraft = (updates: Partial<MaintenanceFinalizeDraft>) => {
    const nextDraft = { serviceDone, value, payment, cidadeId, establishment, notes, ...updates };
    onDraftChange?.(nextDraft);
  };

  const clearError = (key: keyof MaintenanceFinalizeErrors) => {
    if (!errors[key]) return;
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const finish = () => {
    if (isSubmitting) return;

    const fields = {
      "Serviço Realizado": serviceDone || "Serviço registrado localmente.",
      Valor: value ? `R$ ${value}` : "R$ 0,00",
      "Forma de Pagamento": payment || "Não informado",
      Cidade: cidadeId,
      Estabelecimento: establishment || "Não informado",
      "Comentários do Colaborador": notes || "Sem comentários.",
      Fotos: confirmedPhotos.length ? `${confirmedPhotos.length} foto(s) confirmada(s)` : "Nenhuma foto confirmada"
    };

    const nextErrors = validateMaintenanceFinalizeFields({
      serviceDone,
      value,
      payment,
      cidadeId,
      validCityIds: new Set(expenseReferenceData.cities.map((city) => city.id)),
      establishment,
      confirmedPhotos
    });

    setErrors(nextErrors);

    if (nextErrors.serviceDone) return focusInvalidField(serviceDoneRef.current);
    if (nextErrors.value) return focusInvalidField(valueRef.current);
    if (nextErrors.payment) return focusInvalidField(paymentRef.current);
    if (nextErrors.cidadeId) return focusInvalidField(cityRef.current);
    if (nextErrors.establishment) return focusInvalidField(establishmentRef.current);

    onDone(fields);
  };

  const previewPhoto = (kind: MaintenancePhotoKind, anchor: string) => {
    if (isSubmitting) return;
    cameraScroll.remember(anchor);
    onPreviewMaintenancePhoto(kind);
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <article className="finalize-card">
      <div className="finalize-title">{detail.id}</div>
      <div className="finalize-scroll" ref={cameraScroll.ref}>
        <div className="finalize-form maintenance">
          {errorCount ? <div className="form-error-summary">Revise {errorCount} campo(s) destacado(s).</div> : null}

          <TextAreaField
            ref={serviceDoneRef}
            required
            label="Manutenção Realizada"
            error={errors.serviceDone}
            placeholder="Digite aqui"
            rows={4}
            value={serviceDone}
            onChange={(event) => {
              setServiceDone(event.target.value);
              updateDraft({ serviceDone: event.target.value });
              clearError("serviceDone");
            }}
          />

          <MoneyInputField
            ref={valueRef}
            required
            label="Valor (R$)"
            error={errors.value}
            inputMode="decimal"
            pattern="[0-9.,]*"
            autoComplete="off"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              updateDraft({ value: event.target.value });
              clearError("value");
            }}
          />

          <SelectField
            ref={paymentRef}
            required
            label="Forma de Pagamento"
            error={errors.payment}
            value={payment}
            options={paymentOptions}
            placeholder="Selecione"
            ariaLabel="Selecionar forma de pagamento"
            onChange={(nextValue) => {
              setPayment(nextValue);
              updateDraft({ payment: nextValue });
              clearError("payment");
            }}
          />

          {expenseReferenceLoading ? <div className="form-error-summary">Carregando cidades.</div> : null}
          {!expenseReferenceLoading && expenseReferenceError ? <div className="form-error-summary">{expenseReferenceError}</div> : null}
          <SelectField
            ref={cityRef}
            required
            label="Cidade"
            error={errors.cidadeId}
            value={cidadeId}
            options={cityOptions}
            placeholder="Digite cidade, UF ou IBGE"
            ariaLabel="Selecionar cidade"
            disabled={isSubmitting || expenseReferenceLoading}
            emptyLabel="Nenhuma cidade encontrada."
            maxVisible={50}
            filterOption={(option, normalizedQuery) => {
              const city = cityById.get(option.value);
              return city ? matchesExpenseCitySearch(city, normalizedQuery) : false;
            }}
            onChange={(nextValue) => {
              setCidadeId(nextValue);
              updateDraft({ cidadeId: nextValue });
              clearError("cidadeId");
            }}
          />

          <TextAreaField
            ref={establishmentRef}
            required
            label="Estabelecimento"
            error={errors.establishment}
            placeholder="Digite aqui"
            rows={3}
            value={establishment}
            onChange={(event) => {
              setEstablishment(event.target.value);
              updateDraft({ establishment: event.target.value });
              clearError("establishment");
            }}
          />

          <MaintenancePhotoGrid
            label="Fotos da nota fiscal"
            kinds={["NOTAFISCAL"]}
            photos={maintenancePhotos}
            isInvalid={Boolean(errors.invoicePhoto)}
            required
            isSubmitting={isSubmitting}
            allowMultiple
            onPreview={previewPhoto}
          />
          <FieldError error={errors.invoicePhoto} />

          <MaintenancePhotoGrid
            label="Fotos da manutenção"
            kinds={["FOTO1", "FOTO2", "FOTO3"]}
            photos={maintenancePhotos}
            isInvalid={Boolean(errors.maintenancePhoto)}
            required
            isSubmitting={isSubmitting}
            onPreview={previewPhoto}
          />
          <FieldError error={errors.maintenancePhoto} />

          <TextAreaField
            label="Observações da Manutenção"
            placeholder="Digite aqui"
            rows={4}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              updateDraft({ notes: event.target.value });
            }}
          />

          <div className="finalize-help">
            <span>Dúvidas?</span>
            <button
              type="button"
              onClick={() => openExternalUrl(buildWhatsAppUrl("+55 (12) 99723-6961", "Olá Júnior, preciso de ajuda com uma manutenção."))}
            >
              Contatar o Júnior
            </button>
          </div>
        </div>
      </div>
      <ActionBar className="finalize-actions maintenance-actions">
        <ActionButton className="finalize-primary" variant="primary" idleLabel="FINALIZAR" loadingLabel="ENVIANDO" successLabel="ENVIADO" state={submitState} onClick={finish} />
      </ActionBar>
    </article>
  );
}

export function FinalizeScreen({
  detail,
  onBack,
  onDone,
  confirmedPhotos,
  maintenancePhotos,
  maintenanceDraft,
  onMaintenanceDraftChange,
  expenseReferenceData,
  expenseReferenceLoading,
  expenseReferenceError,
  onPreviewMaintenancePhoto,
  onClearPhotos,
  submitState = "idle",
  initialServiceObservation = "",
  organizeObservation = organizeObservationRemote
}: FinalizeScreenProps) {
  const title = detail.type === "MANUTENCAO" ? "Detalhes da Manutenção" : "Observação final";
  const isSubmitting = submitState !== "idle";
  const [confirmClearPhotos, setConfirmClearPhotos] = useState(false);
  // O apagador só remove fotos; por isso aparece apenas na manutenção e quando há foto.
  const photoCount = Object.values(maintenancePhotos).filter(Boolean).length;
  const canClearPhotos = detail.type === "MANUTENCAO" && photoCount > 0 && Boolean(onClearPhotos);

  return (
    <AppShell screenLabel="TelaFinalizar">
      <FormMenu
        title={title}
        onBack={isSubmitting ? undefined : onBack}
        rightIcon={canClearPhotos ? "eraser" : undefined}
        rightLabel="Apagar fotos"
        onRightClick={isSubmitting ? undefined : () => setConfirmClearPhotos(true)}
      />
      {confirmClearPhotos ? (
        <ConfirmDialog
          title={photoCount === 1 ? "Apagar 1 foto?" : `Apagar ${photoCount} fotos?`}
          message="As fotos da nota fiscal e da manutenção desta tela serão removidas. Os textos continuam."
          confirmLabel="Apagar"
          onCancel={() => setConfirmClearPhotos(false)}
          onConfirm={() => {
            setConfirmClearPhotos(false);
            onClearPhotos?.();
          }}
        />
      ) : null}
      <section className="main-panel finalize-main">
        {detail.type === "TROCA" ? <ExchangeFinalize detail={detail} onDone={onDone} submitState={submitState} /> : null}
        {detail.type === "SERVICO" ? <ServiceFinalize detail={detail} onDone={onDone} submitState={submitState} initialObservation={initialServiceObservation} organizeObservation={organizeObservation} /> : null}
        {detail.type === "MANUTENCAO" ? (
          <MaintenanceFinalize
            detail={detail}
            onDone={onDone}
            confirmedPhotos={confirmedPhotos}
            maintenancePhotos={maintenancePhotos}
            draft={maintenanceDraft}
            onDraftChange={onMaintenanceDraftChange}
            expenseReferenceData={expenseReferenceData}
            expenseReferenceLoading={expenseReferenceLoading}
            expenseReferenceError={expenseReferenceError}
            onPreviewMaintenancePhoto={onPreviewMaintenancePhoto}
            submitState={submitState}
          />
        ) : null}
      </section>
    </AppShell>
  );
}



