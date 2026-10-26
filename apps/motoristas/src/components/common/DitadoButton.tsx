import { useEffect, useState, type ReactNode } from "react";
import { formatDitadoTimer, useDitado } from "../../lib/useDitado";
import { SystemIcon } from "../icons/SystemIcon";

type DitadoButtonProps = {
  /** Recebe cada trecho final ditado para acrescentar ao texto do campo. */
  onFinal: (text: string) => void;
  /** Quando vira true (ex.: enviando), o ditado para. */
  stopWhen?: boolean;
  className?: string;
  children: ReactNode;
};

function useListeningTimer(listening: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!listening) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(timer);
  }, [listening]);
  return formatDitadoTimer(elapsed);
}

/**
 * Envolve um campo de texto e, quando o navegador suporta, põe o microfone (56 px) no canto inferior
 * direito do campo. O provisório aparece dentro do campo em cinza; o erro fica numa linha abaixo.
 */
export function DitadoField({ onFinal, stopWhen = false, className = "", children }: DitadoButtonProps) {
  const { supported, listening, interim, error, toggle, stop } = useDitado(onFinal);
  const timer = useListeningTimer(listening);
  useEffect(() => {
    if (stopWhen) stop();
  }, [stopWhen, stop]);
  if (!supported) return <>{children}</>;

  return (
    <div className={`ditado-field${listening ? " is-listening" : ""} ${className}`.trim()}>
      <div className="ditado-box">
        {children}
        <div className="ditado-overlay">
          {interim ? <span className="ditado-interim" aria-hidden="true">{interim}</span> : null}
          <div className="ditado-control">
            <span className="ditado-label" role="status" aria-live="polite">
              {listening ? (
                <>
                  Ouvindo… toque para parar <span className="ditado-timer">{timer}</span>
                </>
              ) : (
                "Toque para falar"
              )}
            </span>
            <button
              type="button"
              className={`ditado-button${listening ? " is-listening" : ""}`}
              aria-label={listening ? "Parar ditado" : "Falar a observação"}
              aria-pressed={listening}
              onClick={toggle}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6 8a6 6 0 0 0 12 0M12 17v4M8 21h8" /></svg>
            </button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="ditado-error" role="alert">
          <SystemIcon name="warning" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
