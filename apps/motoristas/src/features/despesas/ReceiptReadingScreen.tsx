import { useEffect, useState } from "react";
import { SystemIcon } from "../../components/icons/SystemIcon";
import { AppShell } from "../../components/layout/AppShell";
import { FormMenu } from "../../components/navigation/FormMenu";
import { quickReadProgress } from "./receiptQuickRead";

type ReceiptReadingScreenProps = {
  photoDataUrl: string;
  /** A leitura voltou e o rascunho está sendo preenchido. */
  filling: boolean;
  /** Sai da leitura e segue para o preenchimento manual. */
  onCancel: () => void;
};

const STEPS = ["Enviando foto", "Lendo valor e data", "Preenchendo despesa"] as const;

/** Tela dedicada da leitura rápida: miniatura do comprovante e passos, sem o formulário. */
export function ReceiptReadingScreen({ photoDataUrl, filling, onCancel }: ReceiptReadingScreenProps) {
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const { step, slow } = quickReadProgress(elapsed, filling);

  return (
    <AppShell screenLabel="TelaLeituraComprovante">
      <FormMenu title="Comprovante" onBack={onCancel} />
      <section className="main-panel receipt-reading-main">
        <article className="receipt-reading-card" aria-busy="true" aria-labelledby="receipt-reading-title">
          <div className="receipt-reading-thumb">
            {photoDataUrl ? <img src={photoDataUrl} alt="Comprovante enviado para leitura" /> : null}
          </div>
          <h2 id="receipt-reading-title" className="receipt-reading-title">Lendo o comprovante</h2>
          <ol className="receipt-reading-steps">
            {STEPS.map((label, index) => {
              const state = index < step ? "done" : index === step ? "active" : "pending";
              return (
                <li key={label} className={`receipt-reading-step is-${state}`} aria-current={state === "active" ? "step" : undefined}>
                  <span className="receipt-reading-step-icon" aria-hidden="true">
                    {state === "done" ? <SystemIcon name="check" /> : null}
                  </span>
                  <span className="receipt-reading-step-label">{label}</span>
                  <span className="receipt-reading-sr">{state === "done" ? " (concluído)" : state === "active" ? " (em andamento)" : ""}</span>
                </li>
              );
            })}
          </ol>
          <p className="receipt-reading-live" role="status" aria-live="polite">
            {slow ? "Está demorando mais que o normal, aguarde…" : `${STEPS[step]}…`}
          </p>
        </article>
      </section>
    </AppShell>
  );
}
