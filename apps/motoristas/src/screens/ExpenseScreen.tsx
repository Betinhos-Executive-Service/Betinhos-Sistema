import { useEffect, useMemo, useRef, useState } from "react";
import { ActionBar, ActionButton, type ActionButtonState } from "../components/common/ActionButton";
import { FormField, MoneyInputField, SelectField, TextAreaField, TextInputField } from "../components/common/FormFields";
import { PhotoAddButton } from "../components/common/PhotoAddButton";
import { AppShell } from "../components/layout/AppShell";
import { useCameraScroll } from "../app/cameraScroll";
import { FormMenu } from "../components/navigation/FormMenu";
import {
  findExpenseCategory,
  getExpenseCategoryRules,
  matchesExpenseCitySearch,
  normalizeExpenseFields,
  validateExpenseDraft,
  type ExpenseDraft,
  type ExpensePhoto,
  type ExpenseReferenceData,
  type ExpenseValidationErrors
} from "../lib/expenses";
import type { MaintenanceRequestVehicleOption } from "../lib/dataverse";
import { parseCurrencyInput } from "../lib/expenses";
import type { ExpenseSubmissionStatus } from "../lib/expenseUploadState";
import { validarDescricao, formatDiaMes } from "../lib/gastosCartao";
import { SystemIcon, type SystemIconName } from "../components/icons/SystemIcon";

export type ExpenseUploadListItem = {
  id: string;
  draft: ExpenseDraft;
  status: ExpenseSubmissionStatus;
};

const UPLOAD_ICON: Record<ExpenseSubmissionStatus["state"], SystemIconName> = {
  interrupted: "warning",
  processing: "sync",
  unclaimed: "warning",
  failed: "error",
  complete: "check"
};

const UPLOAD_ACTION_LABEL = { continue: "Enviar agora", retry: "Tentar de novo", verify: "Verificar" } as const;

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
import { QUICK_READ_MAX_TENTATIVAS, isQuickReadFieldHighlighted, type QuickReadFilledFields, type QuickReadState } from "../lib/receiptQuickRead";

type ExpenseScreenProps = {
  uploads?: ExpenseUploadListItem[];
  onUploadAction?: (expenseId: string) => void;
  submitDisabled?: boolean;
  draft: ExpenseDraft;
  photos: ExpensePhoto[];
  referenceData: ExpenseReferenceData;
  referenceLoading: boolean;
  referenceError?: string;
  onDraftChange: (draft: ExpenseDraft) => void;
  onAddPhoto: () => void;
  onPreviewPhoto: (photoId: string) => void;
  onBack: () => void;
  onSubmit: (draft: ExpenseDraft) => void;
  submitState: ActionButtonState;
  vehicles: MaintenanceRequestVehicleOption[];
  vehiclesLoading: boolean;
  currentVehicleId: string;
  quickRead?: QuickReadState;
  /** Campos preenchidos pela leitura rápida (destacados até o motorista alterar). */
  quickReadFilled?: QuickReadFilledFields;
  /** Completar gasto do cartão: valor, data, forma e estabelecimento ficam somente leitura. */
  cartaoGasto?: { cartaoFinal: string; estabelecimento: string };
};

function CartaoResumo({ gasto, valor, dataGasto }: { gasto: { cartaoFinal: string; estabelecimento: string }; valor: string; dataGasto: string }) {
  return (
    <section className="expense-card-summary" aria-label="Dados do cartão">
      <div className="expense-card-summary-row">
        <span className="expense-card-summary-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></svg>
        </span>
        <span className="expense-card-summary-text">
          <strong>{gasto.estabelecimento || "Estabelecimento não informado"}</strong>
          <span>{formatDiaMes(dataGasto)} · {gasto.cartaoFinal ? `final ${gasto.cartaoFinal}` : "cartão corporativo"}</span>
        </span>
        <strong className="expense-card-summary-value">{BRL.format(parseCurrencyInput(valor) || 0)}</strong>
      </div>
      <p className="expense-card-summary-note">Dados do banco, não editáveis. Complete os campos abaixo.</p>
    </section>
  );
}

function focusInvalidField(element: HTMLElement | null) {
  element?.focus({ preventScroll: false });
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function ExpenseScreen({
  uploads = [],
  onUploadAction,
  submitDisabled = false,
  draft,
  photos,
  referenceData,
  referenceLoading,
  referenceError = "",
  onDraftChange,
  onAddPhoto,
  onPreviewPhoto,
  onBack,
  onSubmit,
  submitState,
  vehicles,
  vehiclesLoading,
  currentVehicleId,
  quickRead,
  quickReadFilled = {},
  cartaoGasto
}: ExpenseScreenProps) {
  const isSubmitting = submitState !== "idle";
  const cameraScroll = useCameraScroll("gastos");
  const quickReadClass = (key: keyof ExpenseDraft) =>
    isQuickReadFieldHighlighted(draft, quickReadFilled, key) ? "finalize-input-block is-quick-read-filled" : undefined;
  const categoryRef = useRef<HTMLButtonElement | null>(null);
  const vehicleRef = useRef<HTMLButtonElement | null>(null);
  const valueRef = useRef<HTMLInputElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const paymentRef = useRef<HTMLButtonElement | null>(null);
  const cityRef = useRef<HTMLButtonElement | null>(null);
  const kmRef = useRef<HTMLInputElement | null>(null);
  const litersRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<HTMLDivElement | null>(null);
  const [errors, setErrors] = useState<ExpenseValidationErrors>({});
  const [descricaoError, setDescricaoError] = useState("");
  const descricaoRef = useRef<HTMLTextAreaElement | null>(null);

  const category = findExpenseCategory(referenceData, draft.categoriaId);
  const rules = getExpenseCategoryRules(category);
  const categoriesReady = referenceData.categories.length > 0;
  const paymentReady = referenceData.paymentMethods.length > 0;
  const citiesReady = referenceData.cities.length > 0;

  const categoryOptions = useMemo(
    () => referenceData.categories.map((item) => ({ value: item.id, label: item.name })),
    [referenceData.categories]
  );
  const paymentOptions = useMemo(
    () => referenceData.paymentMethods.map((item) => ({ value: item.id, label: item.name })),
    [referenceData.paymentMethods]
  );
  const cityOptions = useMemo(
    () => referenceData.cities.map((city) => ({
      value: city.id,
      label: city.name,
      subtitle: city.codigoIbge ? `${city.pais} · ${city.codigoIbge}` : city.pais,
      searchText: `${city.name} ${city.uf} ${city.pais} ${city.codigoIbge}`
    })),
    [referenceData.cities]
  );
  const cityById = useMemo(
    () => new Map(referenceData.cities.map((city) => [city.id, city])),
    [referenceData.cities]
  );
  const vehicleOptions = useMemo(
    () => vehicles.map((vehicle) => ({
      value: vehicle.id,
      label: vehicle.isCurrent ? `${vehicle.label} - atual` : vehicle.label
    })),
    [vehicles]
  );

  useEffect(() => {
    if (!currentVehicleId || draft.veiculoId) return;
    if (rules.exigeVeiculo) onDraftChange({ ...draft, veiculoId: currentVehicleId });
  }, [currentVehicleId, draft, onDraftChange, rules.exigeVeiculo]);

  const updateDraft = (updates: Partial<ExpenseDraft>) => onDraftChange({ ...draft, ...updates });

  const clearError = (key: keyof ExpenseValidationErrors) => {
    if (!errors[key]) return;
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = () => {
    if (isSubmitting || submitDisabled) return;
    const validated = validateExpenseDraft(draft, photos, referenceData);
    // Valor, data e forma vêm do banco e ficam ocultos no modo cartão: não podem travar o envio.
    const nextErrors = cartaoGasto ? { ...validated, valor: undefined, dataGasto: undefined, formaPagamentoId: undefined } : validated;
    setErrors(nextErrors);
    const nextDescricaoError = cartaoGasto ? validarDescricao(draft) : "";
    setDescricaoError(nextDescricaoError);
    if (nextErrors.categoriaId) return focusInvalidField(categoryRef.current);
    if (nextErrors.veiculoId) return focusInvalidField(vehicleRef.current);
    if (nextErrors.valor) return focusInvalidField(valueRef.current);
    if (nextErrors.dataGasto) return focusInvalidField(dateRef.current);
    if (nextErrors.formaPagamentoId) return focusInvalidField(paymentRef.current);
    if (nextErrors.cidadeId) return focusInvalidField(cityRef.current);
    if (nextErrors.kmInformado) return focusInvalidField(kmRef.current);
    if (nextErrors.litros) return focusInvalidField(litersRef.current);
    if (nextDescricaoError) return focusInvalidField(descricaoRef.current);
    if (nextErrors.photos) return focusInvalidField(photosRef.current);
    normalizeExpenseFields(draft, photos, referenceData);
    onSubmit(draft);
  };

  const addPhoto = () => {
    clearError("photos");
    cameraScroll.remember("comprovantes");
    onAddPhoto();
  };

  const labels = cartaoGasto ? ["ENVIAR", "ENVIANDO", "ENVIADO"] : ["REGISTRAR", "REGISTRANDO", "REGISTRADO"];
  const errorCount = Object.values(errors).filter(Boolean).length + (descricaoError ? 1 : 0);
  const isVideo = (photo: ExpensePhoto) => photo.mediaType === "video" || Boolean(photo.rawBlob) || photo.dataUrl.startsWith("data:video/");
  const uploadTitle = (item: ExpenseUploadListItem) => {
    const name = findExpenseCategory(referenceData, item.draft.categoriaId)?.name ?? "Gasto";
    const [, month, day] = item.draft.dataGasto.split("-");
    return [name, BRL.format(parseCurrencyInput(item.draft.valor) || 0), day && month ? `${day}/${month}` : ""].filter(Boolean).join(" · ");
  };

  return (
    <AppShell screenLabel="TelaGastos">
      <FormMenu title={cartaoGasto ? "Completar gasto do cartão" : "Registrar gasto"} onBack={isSubmitting ? undefined : onBack} />
      <section className="main-panel maintenance-request-main">
        <article className="finalize-card maintenance-request-card">
          <div className="finalize-scroll" ref={cameraScroll.ref}>
            {uploads.length ? (
              <section className="expense-uploads" aria-label="Envios pendentes">
                <p className="expense-uploads-title">Envios pendentes</p>
                <ul>
                  {uploads.map((item) => (
                    <li key={item.id} className={`expense-upload is-${item.status.state}`}>
                      <span className="expense-upload-icon" aria-hidden="true"><SystemIcon name={UPLOAD_ICON[item.status.state]} /></span>
                      <span className="expense-upload-text">
                        <strong>{uploadTitle(item)}</strong>
                        <span role="status">{item.status.text}</span>
                      </span>
                      {item.status.action && onUploadAction ? (
                        <button type="button" className="expense-upload-action" disabled={isSubmitting} onClick={() => onUploadAction(item.id)}>
                          {UPLOAD_ACTION_LABEL[item.status.action]}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <fieldset disabled={isSubmitting} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} className="finalize-form maintenance maintenance-request-form expense-form">
              {referenceLoading ? <div className="form-error-summary">Carregando regras de despesa.</div> : null}
              {!referenceLoading && referenceError ? <div className="form-error-summary">{referenceError}</div> : null}
              {!referenceLoading && !referenceError && (!categoriesReady || !paymentReady || !citiesReady) ? (
                <div className="form-error-summary">Categorias, formas de pagamento ou cidades não encontradas no Dataverse.</div>
              ) : null}
              {errorCount ? <div className="form-error-summary">Revise {errorCount} campo(s) destacado(s).</div> : null}
              {quickRead?.status === "lendo" ? <div className="form-error-summary is-info" role="status" aria-live="polite">Lendo comprovante…</div> : null}
              {quickRead?.status === "preenchido" ? <div className="form-error-summary is-info" role="status">Confira os campos destacados, lidos do comprovante.</div> : null}
              {quickRead?.status === "manual" && quickRead.tentativas < QUICK_READ_MAX_TENTATIVAS ? (
                <div className="form-error-summary is-info" role="status">Preencha os dados do comprovante.</div>
              ) : null}

              {cartaoGasto ? (
                <CartaoResumo gasto={cartaoGasto} valor={draft.valor} dataGasto={draft.dataGasto} />
              ) : null}

              {!cartaoGasto ? (
              <TextInputField
                ref={dateRef}
                required
                label="Data do gasto"
                fieldClassName={quickReadClass("dataGasto")}
                error={errors.dataGasto}
                type="date"
                value={draft.dataGasto}
                onChange={(event) => {
                  updateDraft({ dataGasto: event.target.value });
                  clearError("dataGasto");
                }}
              />
              ) : null}

              <SelectField
                ref={categoryRef}
                required
                label="Categoria"
                fieldClassName={quickReadClass("categoriaId")}
                error={errors.categoriaId}
                value={draft.categoriaId}
                options={categoryOptions}
                placeholder="Selecione"
                ariaLabel="Selecionar categoria"
                disabled={isSubmitting || referenceLoading}
                onChange={(value) => {
                  const nextCategory = findExpenseCategory(referenceData, value);
                  const nextRules = getExpenseCategoryRules(nextCategory);
                  updateDraft({
                    categoriaId: value,
                    veiculoId: nextRules.exigeVeiculo ? draft.veiculoId || currentVehicleId : "",
                    kmInformado: nextRules.exigeKm ? draft.kmInformado : "",
                    litros: nextRules.exigeLitros ? draft.litros : ""
                  });
                  clearError("categoriaId");
                }}
              />

              {!cartaoGasto ? (
              <>
              <MoneyInputField
                ref={valueRef}
                required
                label="Valor"
                fieldClassName={quickReadClass("valor")}
                error={errors.valor}
                inputMode="decimal"
                pattern="[0-9.,]*"
                autoComplete="off"
                value={draft.valor}
                onChange={(event) => {
                  updateDraft({ valor: event.target.value });
                  clearError("valor");
                }}
              />

              <SelectField
                ref={paymentRef}
                required
                label="Forma de pagamento"
                fieldClassName={quickReadClass("formaPagamentoId")}
                error={errors.formaPagamentoId}
                value={draft.formaPagamentoId}
                options={paymentOptions}
                placeholder="Selecione"
                ariaLabel="Selecionar forma de pagamento"
                disabled={isSubmitting || referenceLoading}
                onChange={(value) => {
                  updateDraft({ formaPagamentoId: value });
                  clearError("formaPagamentoId");
                }}
              />
              </>
              ) : null}

              <SelectField
                ref={cityRef}
                required
                label="Cidade"
                fieldClassName={quickReadClass("cidadeId")}
                error={errors.cidadeId}
                value={draft.cidadeId}
                options={cityOptions}
                placeholder="Digite cidade, UF ou IBGE"
                ariaLabel="Selecionar cidade"
                disabled={isSubmitting || referenceLoading}
                emptyLabel="Nenhuma cidade encontrada."
                maxVisible={50}
                filterOption={(option, normalizedQuery) => {
                  const city = cityById.get(option.value);
                  return city ? matchesExpenseCitySearch(city, normalizedQuery) : false;
                }}
                onChange={(value) => {
                  updateDraft({ cidadeId: value });
                  clearError("cidadeId");
                }}
              />

              {rules.exigeVeiculo ? (
                <SelectField
                  ref={vehicleRef}
                  required
                  label="Veículo"
                  error={errors.veiculoId}
                  value={draft.veiculoId}
                  options={vehicleOptions}
                  placeholder={vehiclesLoading ? "Carregando veículos" : "Selecione"}
                  ariaLabel="Selecionar veículo"
                  disabled={isSubmitting || vehiclesLoading}
                  onChange={(value) => {
                    updateDraft({ veiculoId: value });
                    clearError("veiculoId");
                  }}
                />
              ) : null}

              {rules.exigeKm ? (
                <TextInputField
                  ref={kmRef}
                  required
                  label="KM"
                  error={errors.kmInformado}
                  inputMode="numeric"
                  placeholder="Ex.: 58230"
                  value={draft.kmInformado}
                  onChange={(event) => {
                    updateDraft({ kmInformado: event.target.value });
                    clearError("kmInformado");
                  }}
                />
              ) : null}

              {rules.exigeLitros ? (
                <TextInputField
                  ref={litersRef}
                  required
                  label="Litros"
                  fieldClassName={quickReadClass("litros")}
                  error={errors.litros}
                  inputMode="decimal"
                  placeholder="Ex.: 42,5"
                  value={draft.litros}
                  onChange={(event) => {
                    updateDraft({ litros: event.target.value });
                    clearError("litros");
                  }}
                />
              ) : null}

              {!cartaoGasto ? (
              <TextInputField
                label="Estabelecimento"
                fieldClassName={quickReadClass("estabelecimento")}
                placeholder="Ex.: Posto, estacionamento, hotel"
                value={draft.estabelecimento}
                onChange={(event) => updateDraft({ estabelecimento: event.target.value })}
              />
              ) : null}

              <TextAreaField
                ref={descricaoRef}
                label="Descrição"
                required={Boolean(cartaoGasto)}
                error={descricaoError}
                fieldClassName={quickReadClass("descricao")}
                placeholder={cartaoGasto ? "O que foi este gasto?" : "Opcional"}
                rows={3}
                value={draft.descricao}
                onChange={(event) => {
                  updateDraft({ descricao: event.target.value });
                  if (descricaoError) setDescricaoError("");
                }}
              />

              <FormField label="Comprovantes" error={errors.photos} required>
                <div ref={photosRef} tabIndex={-1} data-scroll-anchor="comprovantes">
                  <div className="maintenance-photo-grid">
                    {photos.map((photo, index) => (
                      <button
                        type="button"
                        className="maintenance-photo-thumb"
                        key={photo.id}
                        disabled={isSubmitting}
                        onClick={() => { cameraScroll.remember("comprovantes"); onPreviewPhoto(photo.id); }}
                        aria-label={`Ver comprovante ${index + 1}`}
                      >
                        {isVideo(photo) ? (
                          <>
                            {photo.posterUrl ? <img src={photo.posterUrl} alt={`Vídeo ${index + 1}`} /> : <video src={photo.previewUrl || photo.dataUrl} muted playsInline preload="metadata" />}
                            <span className="media-video-badge">{photo.durationLabel || "Vídeo"}</span>
                          </>
                        ) : (
                          <img src={photo.dataUrl} alt={`Comprovante ${index + 1}`} />
                        )}
                      </button>
                    ))}
                    <PhotoAddButton disabled={isSubmitting} onClick={addPhoto} ariaLabel="Adicionar comprovante" />
                  </div>
                </div>
              </FormField>
            </fieldset>
          </div>
          <ActionBar className="finalize-actions maintenance-actions">
            <ActionButton
              className="finalize-primary"
              variant="primary"
              idleLabel={labels[0]}
              disabled={submitDisabled}
              loadingLabel={labels[1]}
              successLabel={labels[2]}
              state={submitState}
              onClick={submit}
            />
          </ActionBar>
        </article>
      </section>
    </AppShell>
  );
}
