import { memo, useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { ActionBar, ActionButton } from "../components/common/ActionButton";
import { MoneyInputField } from "../components/common/FormFields";
import { SystemIcon } from "../components/icons/SystemIcon";
import { AppShell } from "../components/layout/AppShell";
import { FormMenu } from "../components/navigation/FormMenu";
import { formatCurrencyInputOnBlur } from "../lib/currencyInput";
import {
  formatCountdown,
  formatQrChargeAmount,
  getRemainingSeconds,
  parseAmountToCents,
  validateQrChargeAmount,
  type QrCharge
} from "../lib/qrCharge";
import type { DetailData } from "../types";

const POLL_INTERVAL_MS = 3000;
const QR_QUIET_ZONE = 4;

type QrChargeScreenProps = {
  detail: DetailData;
  maxCents: number;
  onBack: () => void;
  onPaid: (charge: QrCharge) => void;
  createCharge: (valorCentavos: number) => Promise<QrCharge>;
  updateCharge: (sessionId: string, acao: "consultar" | "cancelar") => Promise<QrCharge>;
};

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Não foi possível falar com o Stripe.";
}

// Desenha o QR a partir da matriz, sem mandar o link para serviço externo.
// Módulos escuros vizinhos na mesma linha viram um só retângulo, para o path não ficar enorme.
const QrCodeSvg = memo(function QrCodeSvg({ value }: { value: string }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (!qr.isDark(row, col)) continue;
        let run = 1;
        while (col + run < count && qr.isDark(row, col + run)) run += 1;
        d += `M${col + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${run}v1h-${run}z`;
        col += run - 1;
      }
    }
    return { path: d, size: count + QR_QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg className="qr-charge-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code de pagamento" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#0f172a" />
    </svg>
  );
});

// Só o texto da contagem re-renderiza a cada segundo.
function Countdown({ expiraEm }: { expiraEm: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  return <span className="qr-charge-countdown">{formatCountdown(getRemainingSeconds(expiraEm, now))}</span>;
}

export function QrChargeScreen({ detail, maxCents, onBack, onPaid, createCharge, updateCharge }: QrChargeScreenProps) {
  const [amountText, setAmountText] = useState(() => formatCurrencyInputOnBlur((maxCents / 100).toFixed(2)));
  const [amountError, setAmountError] = useState("");
  const [charge, setCharge] = useState<QrCharge | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [busy, setBusy] = useState<"" | "creating" | "cancelling">("");
  const [error, setError] = useState("");
  const amountRef = useRef<HTMLInputElement | null>(null);

  const paid = charge?.status === "pago";
  const expired = charge?.status === "expirado" || (charge?.status === "aguardando" && timedOut);
  const open = charge?.status === "aguardando" && !timedOut;
  const openSessionId = open ? charge.sessionId : "";
  const openExpiraEm = open ? charge.expiraEm : "";

  const applyUpdate = (next: QrCharge) => {
    setCharge(next);
    // O motorista pode estar olhando para o passageiro: a vibração avisa que caiu.
    if (next.status === "pago") navigator.vibrate?.([120, 80, 120]);
  };

  useEffect(() => {
    if (!openExpiraEm) return;
    const timer = window.setTimeout(() => setTimedOut(true), getRemainingSeconds(openExpiraEm) * 1000);
    return () => window.clearTimeout(timer);
  }, [openExpiraEm]);

  useEffect(() => {
    if (!openSessionId) return;
    // Uma consulta por vez: a próxima só é agendada quando a anterior volta.
    // Resposta que chega depois de cancelar ou sair da tela é descartada.
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      // Tela apagada ou app em segundo plano: não gasta execução do Flow; volta a consultar ao reabrir.
      if (document.hidden) {
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      try {
        const next = await updateCharge(openSessionId, "consultar");
        if (!stopped) applyUpdate(next);
      } catch {
        // Falha de rede não interrompe a cobrança; a próxima rodada tenta de novo.
      }
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [openSessionId, updateCharge]);

  const generate = async () => {
    const cents = parseAmountToCents(amountText);
    const validation = validateQrChargeAmount(cents, maxCents);
    setAmountError(validation);
    if (validation) {
      amountRef.current?.focus();
      return;
    }
    setBusy("creating");
    setError("");
    try {
      setCharge(await createCharge(cents));
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    if (!charge) return;
    setBusy("cancelling");
    setError("");
    try {
      applyUpdate(await updateCharge(charge.sessionId, "cancelar"));
    } catch (cancelError) {
      setError(errorMessage(cancelError));
    } finally {
      setBusy("");
    }
  };

  const startOver = () => {
    setCharge(null);
    setTimedOut(false);
    setError("");
  };

  const chargeLabel = charge ? formatQrChargeAmount(charge.valorCentavos) : "";

  return (
    <AppShell screenLabel="TelaCobrancaQr">
      <FormMenu title="Cobrar por QR code" onBack={busy ? undefined : onBack} />
      <section className="main-panel maintenance-request-main">
        <article className="finalize-card maintenance-request-card qr-charge-card">
          <div className="finalize-title">Recebimento - {detail.id}</div>
          <div className="finalize-scroll">
            {!charge ? (
              <div className="finalize-form maintenance qr-charge-form">
                <MoneyInputField
                  ref={amountRef}
                  id="qr-charge-amount"
                  label="Valor da cobrança"
                  autoComplete="off"
                  value={amountText}
                  disabled={Boolean(busy)}
                  error={amountError}
                  hint={`Até ${formatQrChargeAmount(maxCents)}, o valor a receber. Cartão estrangeiro paga em reais; o banco do passageiro converte.`}
                  onChange={(event) => {
                    setAmountText(event.target.value);
                    setAmountError("");
                  }}
                />
              </div>
            ) : (
              <div className="qr-charge-result">
                {paid ? (
                  <div className="qr-charge-paid" role="status">
                    <span className="qr-charge-paid-mark" aria-hidden="true"><SystemIcon name="check" /></span>
                    <strong>Pagamento confirmado</strong>
                    <span className="qr-charge-paid-amount">{chargeLabel}</span>
                    <p>O Stripe confirmou o pagamento. Pode liberar o passageiro.</p>
                  </div>
                ) : (
                  <div className="qr-charge-amount">
                    <span className="form-field-label">Valor da cobrança</span>
                    <strong>{chargeLabel}</strong>
                  </div>
                )}

                {open ? (
                  <>
                    <p className="qr-charge-waiting" role="status">
                      <span className="qr-charge-waiting-dot" aria-hidden="true" />
                      Aguardando pagamento. Não libere o passageiro ainda.
                    </p>
                    <QrCodeSvg value={charge.url} />
                    {charge.recusa ? (
                      <p className="qr-charge-alert is-danger" role="alert">
                        Pagamento recusado: {charge.recusa} Peça outro cartão; o mesmo QR code continua valendo.
                      </p>
                    ) : null}
                    <p className="qr-charge-help">
                      O passageiro lê o QR code com a câmera do celular. Expira em <Countdown expiraEm={charge.expiraEm} />.
                    </p>
                  </>
                ) : null}

                {expired ? (
                  <p className="qr-charge-alert is-warning" role="status">O QR code expirou e não aceita mais pagamento. Gere outro para cobrar.</p>
                ) : null}
                {charge.status === "cancelado" ? (
                  <p className="qr-charge-alert is-neutral" role="status">Cobrança cancelada. O QR code não aceita mais pagamento.</p>
                ) : null}
              </div>
            )}

            {error ? <p className="qr-charge-alert is-danger" role="alert">{error}</p> : null}
          </div>

          <ActionBar className="finalize-actions qr-charge-actions">
            {!charge ? (
              <>
                <ActionButton className="finalize-secondary" label="Voltar" disabled={Boolean(busy)} onClick={onBack} />
                <ActionButton
                  className="finalize-primary"
                  variant="primary"
                  idleLabel="Gerar QR code"
                  loadingLabel="Gerando"
                  state={busy === "creating" ? "loading" : "idle"}
                  onClick={generate}
                />
              </>
            ) : paid ? (
              <ActionButton className="finalize-primary" variant="primary" label="Continuar" onClick={() => onPaid(charge)} />
            ) : open ? (
              <ActionButton
                className="finalize-secondary"
                label="Cancelar cobrança"
                loadingLabel="Cancelando"
                state={busy === "cancelling" ? "loading" : "idle"}
                onClick={cancel}
              />
            ) : (
              <>
                <ActionButton className="finalize-secondary" label="Voltar" onClick={onBack} />
                <ActionButton className="finalize-primary" variant="primary" label="Gerar outro QR code" onClick={startOver} />
              </>
            )}
          </ActionBar>
        </article>
      </section>
    </AppShell>
  );
}
