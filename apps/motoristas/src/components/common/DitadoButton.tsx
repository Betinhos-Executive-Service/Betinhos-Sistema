import { useEffect, type ReactNode } from "react";
import { useDitado } from "../../lib/useDitado";

type DitadoButtonProps = {
  /** Recebe cada trecho final ditado para acrescentar ao texto do campo. */
  onFinal: (text: string) => void;
  /** Quando vira true (ex.: enviando), o ditado para. */
  stopWhen?: boolean;
  children: ReactNode;
};

/** Envolve um campo de texto e, quando o navegador suporta, mostra o botão de microfone. */
export function DitadoField({ onFinal, stopWhen = false, children }: DitadoButtonProps) {
  const { supported, listening, interim, error, toggle, stop } = useDitado(onFinal);
  useEffect(() => {
    if (stopWhen) stop();
  }, [stopWhen, stop]);
  if (!supported) return <>{children}</>;

  return (
    <div className="ditado-field">
      {children}
      <div className="ditado-bar">
      <button
        type="button"
        className={`ditado-button${listening ? " is-listening" : ""}`}
        aria-label={listening ? "Parar ditado" : "Ditar observação"}
        aria-pressed={listening}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6 8a6 6 0 0 0 12 0M12 17v4M8 21h8" /></svg>
      </button>
      <div className="ditado-status" role="status" aria-live="polite">
        {listening ? <span className="ditado-listening">Ouvindo…{interim ? ` ${interim}` : ""}</span> : null}
        {error ? <span className="ditado-error">{error}</span> : null}
      </div>
      </div>
    </div>
  );
}
