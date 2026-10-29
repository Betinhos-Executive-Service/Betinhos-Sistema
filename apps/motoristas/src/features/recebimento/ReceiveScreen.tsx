import { useEffect, useRef, useState } from "react";
import invoiceReceiptIcon from "../../assets/icons/invoice-receipt.svg";
import { ActionBar, ActionButton, type ActionButtonState } from "../../shared/ui/ActionButton";
import { PhotoAddButton } from "../../shared/ui/PhotoAddButton";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { useCameraScroll } from "../../app/cameraScroll";
import { FormMenu } from "../../shared/ui/navigation/FormMenu";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import type { DetailData } from "../../types";
import type { ExpensePhoto } from "../despesas/expenses";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { formatQrChargeAmount, getReceivableCents } from "./qrCharge";
import { getReceiveSummaryState, proofsCoverBalance } from "./receiveProofCheck";

// Estado da cobrança por QR no Recebimento, reidratado pelo resumo do plugin.
export type ReceiveQrCharge = {
  receivableCents: number;
  paidCents: number;
  // Nome de quem pagou o último QR (sem horário), para o motorista saber quem já pagou.
  paidByName: string;
  // O que falta receber depois do QR (o próximo QR fica limitado a isto).
  balanceCents: number;
  // Resumo carregando: a tela segue usável, só o botão do QR espera.
  loading: boolean;
  failed: boolean;
  // Há uma cobrança aberta: o botão vira "Retomar cobrança".
  resumable: boolean;
  // Presente só para motorista liberado com saldo, ou com cobrança aberta para retomar.
  onOpen?: () => void;
};

type ReceiveScreenProps = {
  detail: DetailData;
  photos: ExpensePhoto[];
  onAddPhoto: () => void;
  onPreviewPhoto: (photoId: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onGeneratePersonalReceipt?: () => void;
  canGeneratePersonalReceipt?: boolean;
  submitState?: ActionButtonState;
  qrCharge?: ReceiveQrCharge;
  // QR pago no valor total: a foto do comprovante vira opcional.
  proofWaived?: boolean;
  // Leitura por IA do comprovante: devolve o valor lido em centavos ou null. Só confere, nunca bloqueia.
  checkProof?: (photo: ExpensePhoto) => Promise<number | null>;
};

const normalizeLabel = (label: string) =>
  label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function getFieldValue(detail: DetailData, normalizedLabel: string) {
  return detail.fields.find((field) => normalizeLabel(field.label) === normalizedLabel)?.value.trim() ?? "";
}

function focusInvalidField(element: HTMLElement | null) {
  element?.focus({ preventScroll: false });
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function ReceiveScreen({
  detail,
  photos,
  onAddPhoto,
  onPreviewPhoto,
  onBack,
  onContinue,
  onGeneratePersonalReceipt,
  canGeneratePersonalReceipt = false,
  submitState = "idle",
  qrCharge,
  proofWaived = false,
  checkProof
}: ReceiveScreenProps) {
  const isSubmitting = submitState !== "idle";
  const cameraScroll = useCameraScroll(`receber:${detail.id}`);
  const photosRef = useRef<HTMLDivElement | null>(null);
  const [photosError, setPhotosError] = useState("");
  // O motorista precisa ver quanto e como cobrar sem voltar ao detalhe. O valor vem do registro
  // (cr40f_valor_a_receber); no Dataverse não existe campo com o rótulo "Valor a receber".
  const totalCents = qrCharge?.receivableCents || getReceivableCents(detail);
  const paidCents = qrCharge?.paidCents ?? 0;
  const balanceCents = qrCharge ? qrCharge.balanceCents : totalCents;
  const summaryState = getReceiveSummaryState(totalCents, paidCents);
  const [checking, setChecking] = useState(false);
  const [confirmBalance, setConfirmBalance] = useState(false);
  const proofReadsRef = useRef(new Map<string, Promise<number | null>>());
  const shouldCheckProof = Boolean(checkProof) && !proofWaived && balanceCents > 0;
  const operationNote = getFieldValue(detail, "obsdeoperacao");
  const isVideo = (photo: ExpensePhoto) => photo.mediaType === "video" || Boolean(photo.rawBlob) || photo.dataUrl.startsWith("data:video/");

  // Lê cada foto assim que entra, para o FINALIZAR não esperar a IA do zero.
  useEffect(() => {
    if (!shouldCheckProof || !checkProof) return;
    for (const photo of photos) {
      if (isVideo(photo) || proofReadsRef.current.has(photo.id)) continue;
      proofReadsRef.current.set(photo.id, checkProof(photo).catch(() => null));
    }
  }, [photos, shouldCheckProof]);

  const addPhoto = () => {
    setPhotosError("");
    cameraScroll.remember("comprovantes");
    onAddPhoto();
  };

  const continueFlow = () => {
    if (isSubmitting) return;
    if (photos.length === 0 && !proofWaived) {
      setPhotosError("Adicione ao menos um comprovante para continuar.");
      focusInvalidField(photosRef.current);
      return;
    }
    if (!shouldCheckProof || checking) {
      if (!checking) onContinue();
      return;
    }
    const reads = photos.filter((photo) => !isVideo(photo)).map((photo) => proofReadsRef.current.get(photo.id) ?? Promise.resolve(null));
    setChecking(true);
    void Promise.all(reads).then((cents) => {
      setChecking(false);
      if (proofsCoverBalance(cents, balanceCents)) onContinue();
      else setConfirmBalance(true);
    });
  };

  const generatePersonalReceipt = () => {
    if (isSubmitting) return;
    onGeneratePersonalReceipt?.();
  };

  return (
    <AppShell screenLabel="TelaReceber">
      <FormMenu title="Enviar comprovante" onBack={isSubmitting ? undefined : onBack} />
      <section className="main-panel maintenance-request-main">
        <article className="finalize-card maintenance-request-card receive-card">
          <div className="finalize-title">Recebimento - {detail.id}</div>
          <div className="finalize-scroll" ref={cameraScroll.ref}>
            <div className="finalize-form maintenance maintenance-request-form expense-form receive-form">
              {summaryState === "aReceber" ? (
                <div className="finalize-input-block receive-amount">
                  <span className="form-field-label">Valor a receber</span>
                  <strong>{formatQrChargeAmount(totalCents)}</strong>
                  {operationNote ? <p>{operationNote}</p> : null}
                </div>
              ) : null}

              {summaryState === "parcial" || summaryState === "quitado" ? (
                <div className="finalize-input-block receive-summary" data-state={summaryState}>
                  <div className="receive-summary-row">
                    <span>Total do serviço</span>
                    <strong>{formatQrChargeAmount(totalCents)}</strong>
                  </div>
                  <div className="receive-summary-row">
                    <span>
                      Já pago por QR
                      {qrCharge?.paidByName ? <small>{qrCharge.paidByName}</small> : null}
                    </span>
                    <strong>{formatQrChargeAmount(paidCents)}</strong>
                  </div>
                  {summaryState === "parcial" ? (
                    <div className="receive-summary-row is-balance">
                      <span>Falta receber</span>
                      <strong>{formatQrChargeAmount(balanceCents)}</strong>
                    </div>
                  ) : (
                    <div className="receive-summary-row is-paid" role="status">
                      <span><SystemIcon name="check" /> Tudo recebido</span>
                      <strong>Comprovante opcional</strong>
                    </div>
                  )}
                  {operationNote ? <p>{operationNote}</p> : null}
                </div>
              ) : null}
              {summaryState === "parcial" && !proofWaived ? (
                <p className="qr-charge-alert qr-charge-alert-icon is-warning" role="status">
                  <SystemIcon name="warning" />
                  <span>Envie o comprovante do restante ({formatQrChargeAmount(balanceCents)}).</span>
                </p>
              ) : null}

              {qrCharge?.onOpen && !proofWaived ? (
                <ActionButton
                  className="finalize-secondary receive-qr-charge"
                  label={qrCharge.resumable ? "Retomar cobrança" : "Cobrar por QR code"}
                  loadingLabel="Conferindo cobranças"
                  state={qrCharge.loading ? "loading" : "idle"}
                  disabled={isSubmitting}
                  onClick={qrCharge.onOpen}
                />
              ) : null}
              {qrCharge?.failed ? (
                <p className="qr-charge-note" role="status">
                  <SystemIcon name="warning" />
                  <span>Não deu para conferir as cobranças por QR deste serviço agora.</span>
                </p>
              ) : null}

              <div ref={photosRef} className={`finalize-input-block ${photosError ? "is-invalid" : ""}`} tabIndex={-1} data-scroll-anchor="comprovantes">
                <label className="form-field-label">
                  <span>Comprovante(s) de pagamento</span>
                  {proofWaived ? null : <span className="form-field-required" aria-hidden="true">*</span>}
                </label>
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
                {photosError ? <div className="field-error">{photosError}</div> : null}
              </div>
            </div>
          </div>

          <ActionBar className={`finalize-actions receive-actions ${canGeneratePersonalReceipt ? "has-personal-receipt" : ""}`}>
            <ActionButton className="finalize-secondary receive-secondary" label="Voltar" disabled={isSubmitting} onClick={onBack} />
            {canGeneratePersonalReceipt ? (
              <ActionButton
                className="finalize-secondary receive-receipt"
                label="Abrir recibo personalizado"
                disabled={isSubmitting}
                onClick={generatePersonalReceipt}
                icon={<img src={invoiceReceiptIcon} alt="" />}
              />
            ) : null}
            <ActionButton
              className="finalize-primary receive-primary"
              variant="primary"
              idleLabel="FINALIZAR"
              loadingLabel={checking ? "CONFERINDO" : "ENVIANDO"}
              successLabel="ENVIADO"
              state={checking ? "loading" : submitState}
              onClick={continueFlow}
            />
          </ActionBar>
        </article>
      </section>
      {confirmBalance ? (
        <ConfirmDialog
          tone="confirm"
          title={`Você recebeu os ${formatQrChargeAmount(balanceCents)} que faltavam?`}
          message="Não conseguimos confirmar esse valor na foto do comprovante."
          confirmLabel="Sim, recebi tudo"
          cancelLabel="Ainda não"
          onCancel={() => setConfirmBalance(false)}
          onConfirm={() => {
            setConfirmBalance(false);
            onContinue();
          }}
        />
      ) : null}
    </AppShell>
  );
}
