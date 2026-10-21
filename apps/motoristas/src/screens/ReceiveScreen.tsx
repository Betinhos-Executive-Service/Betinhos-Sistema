import { useRef, useState } from "react";
import invoiceReceiptIcon from "../assets/icons/invoice-receipt.svg";
import { ActionBar, ActionButton, type ActionButtonState } from "../components/common/ActionButton";
import { PhotoAddButton } from "../components/common/PhotoAddButton";
import { AppShell } from "../components/layout/AppShell";
import { useCameraScroll } from "../app/cameraScroll";
import { FormMenu } from "../components/navigation/FormMenu";
import { SystemIcon } from "../components/icons/SystemIcon";
import type { DetailData } from "../types";
import type { ExpensePhoto } from "../lib/expenses";
import { formatQrChargeAmount } from "../lib/qrCharge";

// Estado da cobrança por QR no Recebimento, reidratado pelo resumo do plugin.
export type ReceiveQrCharge = {
  paidCents: number;
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
  proofWaived = false
}: ReceiveScreenProps) {
  const isSubmitting = submitState !== "idle";
  const cameraScroll = useCameraScroll(`receber:${detail.id}`);
  const photosRef = useRef<HTMLDivElement | null>(null);
  const [photosError, setPhotosError] = useState("");
  // O motorista precisa ver quanto e como cobrar sem voltar ao detalhe.
  const amountToReceive = getFieldValue(detail, "valorareceber");
  const operationNote = getFieldValue(detail, "obsdeoperacao");
  const isVideo = (photo: ExpensePhoto) => photo.mediaType === "video" || Boolean(photo.rawBlob) || photo.dataUrl.startsWith("data:video/");

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
    onContinue();
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
              {amountToReceive ? (
                <div className="finalize-input-block receive-amount">
                  <span className="form-field-label">Valor a receber</span>
                  <strong>{amountToReceive}</strong>
                  {operationNote ? <p>{operationNote}</p> : null}
                </div>
              ) : null}

              {qrCharge?.paidCents ? (
                <p className="qr-charge-alert qr-charge-alert-icon is-success" role="status">
                  <SystemIcon name="check" />
                  <span>
                    {proofWaived
                      ? `Pago por QR code: ${formatQrChargeAmount(qrCharge.paidCents)}. O comprovante é opcional.`
                      : `Pago por QR: ${formatQrChargeAmount(qrCharge.paidCents)}. Envie o comprovante do restante (${formatQrChargeAmount(qrCharge.balanceCents)}).`}
                  </span>
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
            <ActionButton className="finalize-primary receive-primary" variant="primary" idleLabel="FINALIZAR" loadingLabel="ENVIANDO" successLabel="ENVIADO" state={submitState} onClick={continueFlow} />
          </ActionBar>
        </article>
      </section>
    </AppShell>
  );
}
