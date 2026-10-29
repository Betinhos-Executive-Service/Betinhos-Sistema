import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import qrcode from "qrcode-generator";
import { ActionBar, ActionButton } from "../../shared/ui/ActionButton";
import { MoneyInputField, TextInputField } from "../../shared/ui/FormFields";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { FormMenu } from "../../shared/ui/navigation/FormMenu";
import { formatCurrencyInputOnBlur } from "../../shared/currencyInput";
import {
  formatCountdown,
  formatQrChargeAmount,
  formatQrChargeDateTime,
  getFirstInvalidQrChargeStep,
  getQrChargeDraftPayer,
  getQrChargePayerOptions,
  getQrChargeStepProgress,
  getRemainingSeconds,
  parseAmountToCents,
  QR_CHARGE_PASSENGER_COPY,
  QrChargeRefusal,
  QR_CHARGE_STEPS,
  validateQrChargeStep,
  type QrCharge,
  type QrChargeDraft,
  type QrChargeOpen,
  type QrChargePayer,
  type QrChargeStep
} from "./qrCharge";
import { RECEIPT_LANGUAGE, type ReceiptLanguage } from "../recibo/receiptLanguage";
import type { DetailData } from "../../types";

const POLL_INTERVAL_MS = 3000;
// Três consultas seguidas sem resposta (~9 s): o motorista precisa saber que o app não está conferindo.
const OFFLINE_AFTER_FAILURES = 3;
// Quem encerra o QR é o Stripe (expires_at). Passados 2 min do prazo sem o plugin responder, nada mais pode ser pago:
// a tela para de consultar e orienta; um pagamento feito antes aparece em Recebimento quando a conexão voltar.
const EXPIRY_GRACE_MS = 2 * 60 * 1000;
// Consulta pendurada (rede móvel) conta como falha, senão o polling trava sem aviso.
const POLL_TIMEOUT_MS = 10 * 1000;
const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const QR_QUIET_ZONE = 4;

// Avançar entra pela direita, Voltar pela esquerda; a saída é mais curta que a entrada.
const STEP_VARIANTS: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -24, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } })
};
const STEP_TRANSITION = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;

const STEP_TITLES: Record<QrChargeStep, string> = {
  valor: "Valor da cobrança",
  pagante: "Quem vai pagar",
  email: "E-mail para o recibo",
  idioma: "Idioma do passageiro",
  revisao: "Confira e gere o QR code"
};

// Nome do idioma nele mesmo, para o passageiro reconhecer; o motorista lê a tradução embaixo.
const LANGUAGE_CHOICES: { value: ReceiptLanguage; label: string; hint: string }[] = [
  { value: RECEIPT_LANGUAGE.portuguese, label: "Português", hint: "Português" },
  { value: RECEIPT_LANGUAGE.english, label: "English", hint: "Inglês" },
  { value: RECEIPT_LANGUAGE.spanish, label: "Español", hint: "Espanhol" }
];

const languageLabel = (idioma: ReceiptLanguage) => LANGUAGE_CHOICES.find((choice) => choice.value === idioma)?.label ?? idioma;

type QrChargeScreenProps = {
  detail: DetailData;
  // Saldo a cobrar por QR (valor a receber menos o que já entrou).
  maxCents: number;
  // Cobrança aberta devolvida pelo resumo: a tela já abre no QR dela.
  resume?: QrChargeOpen | null;
  onBack: () => void;
  // Uma vez, quando o Stripe confirma; a navegação fica com onContinue.
  onPaid: (charge: QrCharge) => void;
  onContinue: (charge: QrCharge) => void;
  createCharge: (valorCentavos: number, pagante: QrChargePayer, idioma: ReceiptLanguage) => Promise<QrCharge>;
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
// A contagem é orientação: quem decide que o QR venceu é o Stripe, via plugin, nunca o relógio do celular.
function Countdown({ expiraEm }: { expiraEm: string }) {
  const [now, setNow] = useState(() => Date.now());
  const seconds = getRemainingSeconds(expiraEm, now);
  const counting = seconds > 0;
  useEffect(() => {
    if (!counting) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [counting]);
  return counting ? (
    <>Expira em <span className="qr-charge-countdown">{formatCountdown(seconds)}</span>.</>
  ) : (
    <>Prazo encerrando; conferindo com o Stripe.</>
  );
}

function draftFromResume(resume: QrChargeOpen, optionNames: string[]): QrChargeDraft {
  const known = optionNames.includes(resume.pagante.nome);
  return {
    amountText: formatCurrencyInputOnBlur((resume.charge.valorCentavos / 100).toFixed(2)),
    payerChoice: known ? resume.pagante.nome : "",
    otherPayerName: known ? "" : resume.pagante.nome,
    email: resume.pagante.email,
    idioma: resume.idioma
  };
}

export function QrChargeScreen({ detail, maxCents, resume, onBack, onPaid, onContinue, createCharge, updateCharge }: QrChargeScreenProps) {
  const payerOptions = useMemo(() => getQrChargePayerOptions(detail), [detail]);
  const [draft, setDraft] = useState<QrChargeDraft>(() =>
    resume
      ? draftFromResume(resume, payerOptions.map((option) => option.nome))
      : {
          amountText: formatCurrencyInputOnBlur((maxCents / 100).toFixed(2)),
          payerChoice: payerOptions[0]?.nome ?? "",
          otherPayerName: "",
          email: "",
          idioma: payerOptions[0]?.idioma ?? RECEIPT_LANGUAGE.portuguese
        }
  );
  const [step, setStep] = useState<QrChargeStep>(resume ? "revisao" : "valor");
  // Editando a partir da revisão: confirmar o passo volta direto para ela.
  const [fromReview, setFromReview] = useState(false);
  const [stepError, setStepError] = useState("");
  const [charge, setCharge] = useState<QrCharge | null>(resume?.charge ?? null);
  // Pagante e idioma da cobrança em andamento (o rascunho pode mudar depois para gerar outro QR).
  const [chargePayer, setChargePayer] = useState<QrChargePayer>(resume?.pagante ?? { nome: "", email: "" });
  const [chargeIdioma, setChargeIdioma] = useState<ReceiptLanguage>(resume?.idioma ?? RECEIPT_LANGUAGE.portuguese);
  const [paidAt, setPaidAt] = useState<Date | null>(null);
  // Prazo do Stripe vencido há mais de EXPIRY_GRACE_MS sem o plugin responder.
  const [graceOver, setGraceOver] = useState(false);
  // Consultas seguidas sem resposta e a hora da última que respondeu: base do aviso de "sem conexão".
  const [failures, setFailures] = useState(0);
  const lastCheckedAt = useRef(Date.now());
  const [busy, setBusy] = useState<"" | "creating" | "cancelling">("");
  const [error, setError] = useState("");
  // Recusa do plugin durante a consulta (ex.: pagamento em processamento); separada de `error` para não apagar
  // a mensagem de gerar/cancelar a cada rodada.
  const [pollError, setPollError] = useState("");
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const reduceMotion = useReducedMotion();
  // Direção da última troca de passo (1 avança, -1 volta), para a animação.
  const stepIndex = QR_CHARGE_STEPS.indexOf(step);
  const lastStepIndexRef = useRef(stepIndex);
  const stepDirectionRef = useRef(1);
  if (stepIndex !== lastStepIndexRef.current) {
    stepDirectionRef.current = stepIndex > lastStepIndexRef.current ? 1 : -1;
    lastStepIndexRef.current = stepIndex;
  }
  const stepDirection = reduceMotion ? 0 : stepDirectionRef.current;
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const paidNotifiedRef = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const paid = charge?.status === "pago";
  const expired = charge?.status === "expirado" || (charge?.status === "aguardando" && graceOver);
  const open = charge?.status === "aguardando" && !graceOver;
  const openSessionId = open ? charge.sessionId : "";
  const openExpiraEm = open ? charge.expiraEm : "";
  const offline = open && failures >= OFFLINE_AFTER_FAILURES;
  const progress = getQrChargeStepProgress(step);
  const isOtherPayer = !draft.payerChoice;

  const applyUpdate = (next: QrCharge) => {
    setCharge(next);
    if (next.status === "pago" && !paidNotifiedRef.current) {
      paidNotifiedRef.current = true;
      setPaidAt(new Date());
      // O motorista pode estar olhando para o passageiro: a vibração avisa que caiu.
      navigator.vibrate?.([120, 80, 120]);
      onPaidRef.current(next);
    }
  };

  // Foco no campo (ou na opção escolhida) de cada passo; na revisão, no título.
  // Na troca de passo quem chama é o fim da animação de entrada, quando o passo novo já está na tela.
  const focusStep = () => {
    const target = fieldRef.current ?? focusTargetRef.current ?? headingRef.current;
    target?.focus({ preventScroll: false });
  };
  useEffect(() => {
    if (!charge) focusStep();
  }, [isOtherPayer, charge]);

  // Confirmação: o foco vai para o "Continuar", que é a única ação.
  useEffect(() => {
    if (paid) continueRef.current?.focus();
  }, [paid]);

  useEffect(() => {
    if (!openExpiraEm) return;
    const timer = window.setTimeout(() => setGraceOver(true), getRemainingSeconds(openExpiraEm) * 1000 + EXPIRY_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [openExpiraEm]);

  useEffect(() => {
    if (!openSessionId) return;
    // Uma consulta por vez: a próxima só é agendada quando a anterior volta.
    // Resposta que chega depois de cancelar ou sair da tela, ou de outra sessão, é descartada.
    // Continua até o plugin dizer pago, expirado ou cancelado: o relógio do celular não encerra a cobrança.
    let stopped = false;
    let running = false;
    let timer = 0;
    const poll = async () => {
      window.clearTimeout(timer);
      // Tela apagada ou app em segundo plano: para de consultar; o visibilitychange retoma na hora ao reabrir.
      if (stopped || running || document.hidden) return;
      running = true;
      const answered = () => {
        lastCheckedAt.current = Date.now();
        setFailures(0);
      };
      try {
        const next = await Promise.race([
          updateCharge(openSessionId, "consultar"),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), POLL_TIMEOUT_MS))
        ]);
        if (!stopped && next.sessionId === openSessionId) {
          applyUpdate(next);
          answered();
          setPollError("");
        }
      } catch (failure) {
        if (stopped) return;
        // Recusa do plugin (ex.: pagamento em processamento no banco) é resposta: vira mensagem para o motorista.
        // Falha de rede não interrompe a cobrança: a próxima rodada tenta de novo e o aviso conta as falhas.
        if (failure instanceof QrChargeRefusal) {
          answered();
          setPollError(failure.message);
        } else setFailures((count) => count + 1);
      }
      running = false;
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    const pollNow = () => void poll();
    document.addEventListener("visibilitychange", pollNow);
    window.addEventListener("online", pollNow);
    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", pollNow);
      window.removeEventListener("online", pollNow);
    };
    // applyUpdate só usa setters e refs.
  }, [openSessionId, updateCharge]);

  const updateDraft = (patch: Partial<QrChargeDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStepError("");
  };

  const goTo = (next: QrChargeStep, editing = false) => {
    setStepError("");
    setError("");
    setFromReview(editing);
    setStep(next);
  };

  // Valida o passo e avança; se veio da revisão, volta para ela.
  const advance = (current: QrChargeStep = step, nextDraft: QrChargeDraft = draft) => {
    const message = validateQrChargeStep(current, nextDraft, maxCents);
    if (message) {
      setStepError(message);
      (fieldRef.current ?? focusTargetRef.current)?.focus();
      return;
    }
    const index = QR_CHARGE_STEPS.indexOf(current);
    goTo(fromReview ? "revisao" : QR_CHARGE_STEPS[Math.min(index + 1, QR_CHARGE_STEPS.length - 1)]);
  };

  const back = () => {
    const index = QR_CHARGE_STEPS.indexOf(step);
    if (index <= 0) {
      onBack();
      return;
    }
    goTo(QR_CHARGE_STEPS[index - 1]);
  };

  const handleEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    advance();
  };

  const choosePayer = (nome: string) => {
    const option = payerOptions.find((item) => item.nome === nome);
    const next = { ...draft, payerChoice: nome, idioma: option?.idioma ?? draft.idioma };
    setDraft(next);
    setStepError("");
  };

  const chooseLanguage = (idioma: ReceiptLanguage) => {
    setDraft({ ...draft, idioma });
  };

  const skipEmail = () => {
    const next = { ...draft, email: "" };
    setDraft(next);
    advance("email", next);
  };

  const generate = async () => {
    const invalidStep = getFirstInvalidQrChargeStep(draft, maxCents);
    if (invalidStep) {
      goTo(invalidStep, true);
      setStepError(validateQrChargeStep(invalidStep, draft, maxCents));
      return;
    }
    const pagante = getQrChargeDraftPayer(draft);
    setBusy("creating");
    setError("");
    try {
      const created = await createCharge(parseAmountToCents(draft.amountText), pagante, draft.idioma);
      setChargePayer(pagante);
      setChargeIdioma(draft.idioma);
      applyUpdate(created);
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

  // Outro QR: volta à revisão com os dados preenchidos.
  const startOver = () => {
    setCharge(null);
    setGraceOver(false);
    setFailures(0);
    setError("");
    setPollError("");
    goTo("revisao");
  };

  const chargeLabel = charge ? formatQrChargeAmount(charge.valorCentavos) : "";
  const passengerCopy = QR_CHARGE_PASSENGER_COPY[chargeIdioma];
  const draftPayer = getQrChargeDraftPayer(draft);
  const disabled = Boolean(busy);

  const renderStep = () => {
    if (step === "valor") {
      return (
        <MoneyInputField
          ref={fieldRef}
          id="qr-charge-amount"
          aria-label={STEP_TITLES.valor}
          autoComplete="off"
          enterKeyHint="next"
          value={draft.amountText}
          disabled={disabled}
          error={stepError}
          hint={`Máximo ${formatQrChargeAmount(maxCents)}`}
          onChange={(event) => updateDraft({ amountText: event.target.value })}
        />
      );
    }
    if (step === "pagante") {
      return (
        <>
          {payerOptions.length ? (
            <div className="qr-charge-choices" role="group" aria-labelledby="qr-charge-step-title">
              {payerOptions.map((option) => {
                const selected = draft.payerChoice === option.nome;
                return (
                  <button
                    key={option.nome}
                    type="button"
                    className="qr-charge-choice"
                    aria-pressed={selected}
                    disabled={disabled}
                    ref={selected ? (element) => { focusTargetRef.current = element; } : undefined}
                    onClick={() => choosePayer(option.nome)}
                  >
                    <span className="qr-charge-choice-text">
                      <strong>{option.nome}</strong>
                      <span>{option.origem}</span>
                    </span>
                    <span className="qr-charge-choice-mark" aria-hidden="true">{selected ? <SystemIcon name="check" /> : null}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className="qr-charge-choice"
                aria-pressed={isOtherPayer}
                aria-expanded={isOtherPayer}
                disabled={disabled}
                onClick={() => choosePayer("")}
              >
                <span className="qr-charge-choice-text">
                  <strong>Outra pessoa</strong>
                  <span>Digitar o nome</span>
                </span>
                <span className="qr-charge-choice-mark" aria-hidden="true">{isOtherPayer ? <SystemIcon name="check" /> : null}</span>
              </button>
            </div>
          ) : null}
          {isOtherPayer ? (
            <TextInputField
              ref={fieldRef}
              label="Nome de quem vai pagar"
              required
              autoComplete="off"
              enterKeyHint="next"
              value={draft.otherPayerName}
              disabled={disabled}
              error={stepError}
              onChange={(event) => updateDraft({ otherPayerName: event.target.value })}
            />
          ) : stepError ? (
            <p className="field-error" role="alert">{stepError}</p>
          ) : null}
        </>
      );
    }
    if (step === "email") {
      return (
        <TextInputField
          ref={fieldRef}
          aria-label={STEP_TITLES.email}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          value={draft.email}
          disabled={disabled}
          error={stepError}
          hint="Opcional. O recibo vai para este e-mail."
          onChange={(event) => updateDraft({ email: event.target.value })}
        />
      );
    }
    if (step === "idioma") {
      return (
        <>
          <p className="qr-charge-step-hint">Idioma do QR code e do pagamento.</p>
          <div className="qr-charge-choices" role="group" aria-labelledby="qr-charge-step-title">
            {LANGUAGE_CHOICES.map((choice) => {
              const selected = draft.idioma === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  className="qr-charge-choice"
                  aria-pressed={selected}
                  disabled={disabled}
                  lang={choice.value}
                  ref={selected ? (element) => { focusTargetRef.current = element; } : undefined}
                  onClick={() => chooseLanguage(choice.value)}
                >
                  <span className="qr-charge-choice-text">
                    <strong>{choice.label}</strong>
                    {choice.hint !== choice.label ? <span lang="pt-BR">{choice.hint}</span> : null}
                  </span>
                  <span className="qr-charge-choice-mark" aria-hidden="true">{selected ? <SystemIcon name="check" /> : null}</span>
                </button>
              );
            })}
          </div>
        </>
      );
    }
    const rows: { step: QrChargeStep; label: string; value: string }[] = [
      { step: "valor", label: "Valor", value: formatQrChargeAmount(parseAmountToCents(draft.amountText)) },
      { step: "pagante", label: "Quem vai pagar", value: draftPayer.nome || "Não informado" },
      { step: "email", label: "E-mail para o recibo", value: draftPayer.email || "Sem e-mail" },
      { step: "idioma", label: "Idioma do passageiro", value: languageLabel(draft.idioma) }
    ];
    return (
      <ul className="qr-charge-review">
        {rows.map((row) => (
          <li key={row.step}>
            <button type="button" className="qr-charge-review-row" disabled={disabled} onClick={() => goTo(row.step, true)} aria-label={`${row.label}: ${row.value}. Alterar`}>
              <span className="qr-charge-review-text">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </span>
              <span className="qr-charge-review-edit" aria-hidden="true">Alterar</span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const renderActions = () => {
    if (!charge) {
      const primaryLabel = step === "valor" ? "Confirmar" : step === "revisao" ? "Gerar QR code" : "Continuar";
      return (
        <>
          <ActionButton className="finalize-secondary" label="Voltar" disabled={disabled} onClick={back} />
          {step === "email" ? <ActionButton className="finalize-secondary" label="Pular" disabled={disabled} onClick={skipEmail} /> : null}
          <ActionButton
            className="finalize-primary"
            variant="primary"
            idleLabel={primaryLabel}
            loadingLabel="Gerando"
            state={busy === "creating" ? "loading" : "idle"}
            onClick={step === "revisao" ? generate : () => advance()}
          />
        </>
      );
    }
    if (paid) {
      return <ActionButton buttonRef={continueRef} className="finalize-primary" variant="primary" label="Continuar" onClick={() => onContinue(charge)} />;
    }
    if (open) {
      return (
        <ActionButton
          className="finalize-secondary"
          label="Cancelar cobrança"
          loadingLabel="Cancelando"
          state={busy === "cancelling" ? "loading" : "idle"}
          onClick={cancel}
        />
      );
    }
    return (
      <>
        <ActionButton className="finalize-secondary" label="Voltar" onClick={onBack} />
        <ActionButton className="finalize-primary" variant="primary" label="Gerar outro QR code" onClick={startOver} />
      </>
    );
  };

  return (
    <AppShell screenLabel="TelaCobrancaQr">
      <FormMenu title="Cobrar por QR code" onBack={busy ? undefined : charge ? onBack : back} />
      <section className="main-panel maintenance-request-main">
        <article className="finalize-card maintenance-request-card qr-charge-card">
          <div className="finalize-title">Recebimento - {detail.id}</div>
          <div className="finalize-scroll">
            {!charge ? (
              <div className="finalize-form maintenance qr-charge-form" onKeyDown={handleEnter}>
                <div className="qr-charge-progress">
                  <p className="qr-charge-progress-label" aria-live="polite">
                    Passo {progress.label}
                  </p>
                  <ol className="qr-charge-progress-bar" aria-hidden="true">
                    {QR_CHARGE_STEPS.map((item, index) => (
                      <li key={item} className={index < progress.number ? "is-done" : ""} />
                    ))}
                  </ol>
                </div>
                <AnimatePresence mode="wait" initial={false} custom={stepDirection}>
                  <motion.div
                    key={step}
                    className="qr-charge-step"
                    custom={stepDirection}
                    variants={STEP_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={reduceMotion ? { duration: 0 } : STEP_TRANSITION}
                    onAnimationComplete={(definition) => { if (definition === "center") focusStep(); }}
                  >
                    <h2 id="qr-charge-step-title" className="qr-charge-step-title" ref={headingRef} tabIndex={-1}>
                      {STEP_TITLES[step]}
                    </h2>
                    {renderStep()}
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : paid ? (
              <div className="qr-charge-confirmed" role="status">
                <span className="qr-charge-confirmed-mark" aria-hidden="true">
                  <svg viewBox="0 0 52 52">
                    <path d="M15 27.5l7.5 7.5L38 18.5" />
                  </svg>
                </span>
                <h2>Pagamento confirmado</h2>
                <strong className="qr-charge-confirmed-amount">{chargeLabel}</strong>
                <dl className="qr-charge-confirmed-details">
                  {chargePayer.nome ? (
                    <div>
                      <dt>Pago por</dt>
                      <dd>{chargePayer.nome}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Horário</dt>
                    <dd>{formatQrChargeDateTime(paidAt ?? new Date())}</dd>
                  </div>
                  {chargePayer.email ? (
                    <div>
                      <dt>Recibo</dt>
                      <dd>Enviado para {chargePayer.email}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : (
              <div className="qr-charge-result">
                {open ? null : (
                  <div className="qr-charge-amount">
                    <span className="form-field-label">Valor da cobrança</span>
                    <strong>{chargeLabel}</strong>
                  </div>
                )}

                {open ? (
                  <>
                    <p className="qr-charge-waiting" role="status">
                      <span className="qr-charge-waiting-dot" aria-hidden="true" />
                      Aguardando pagamento.
                    </p>
                    <div className="qr-charge-passenger" lang={chargeIdioma}>
                      <strong>{passengerCopy.title}</strong>
                      <span className="qr-charge-passenger-amount" lang="pt-BR">{chargeLabel}</span>
                      <QrCodeSvg value={charge.url} />
                      <p>{passengerCopy.body}</p>
                      {chargePayer.email ? <p>{passengerCopy.receipt}</p> : null}
                    </div>
                    {charge.recusa ? (
                      <p className="qr-charge-alert is-danger" role="alert">
                        Pagamento recusado: {charge.recusa} Peça outro cartão; o mesmo QR code continua valendo.
                      </p>
                    ) : null}
                    {pollError ? <p className="qr-charge-alert is-danger" role="alert">{pollError}</p> : null}
                    {offline ? (
                      <p className="qr-charge-alert is-warning" role="alert">
                        Sem conexão: o app não consegue conferir o pagamento desde {TIME_FORMAT.format(lastCheckedAt.current)}. O QR code continua
                        valendo; ao voltar o sinal, a confirmação aparece aqui ou em Recebimento.
                      </p>
                    ) : null}
                    <p className="qr-charge-help">
                      O passageiro lê o QR code com a câmera do celular. <Countdown expiraEm={charge.expiraEm} />
                    </p>
                  </>
                ) : null}

                {expired ? (
                  <p className="qr-charge-alert is-warning" role="status">
                    O QR code expirou e não aceita mais pagamento. Gere outro para cobrar.
                    {charge.status === "aguardando" ? " Se o passageiro chegou a pagar antes do prazo, a confirmação aparece em Recebimento." : ""}
                  </p>
                ) : null}
                {charge.status === "cancelado" ? (
                  <p className="qr-charge-alert is-neutral" role="status">Cobrança cancelada. O QR code não aceita mais pagamento.</p>
                ) : null}
              </div>
            )}

            {error ? <p className="qr-charge-alert is-danger" role="alert">{error}</p> : null}
          </div>

          <ActionBar className={`finalize-actions qr-charge-actions${step === "email" && !charge ? " has-three" : ""}`}>{renderActions()}</ActionBar>
        </article>
      </section>
    </AppShell>
  );
}
