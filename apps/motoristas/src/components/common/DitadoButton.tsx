import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatDitadoTimer, useDitado } from "../../lib/useDitado";
import { Mic, MicOff } from "lucide-react";
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

/** Altura máxima do campo antes de virar rolagem (px). */
const ALTURA_MAXIMA_CAMPO = 260;

/** O campo cresce com o texto até ALTURA_MAXIMA_CAMPO; acima disso, rola. Roda a cada render (texto mudou). */
function useCampoQueCresce(boxRef: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const campo = boxRef.current?.querySelector("textarea");
    if (!campo) return;
    campo.style.height = "auto";
    const altura = campo.scrollHeight + (campo.offsetHeight - campo.clientHeight);
    campo.style.height = `${Math.min(altura, ALTURA_MAXIMA_CAMPO)}px`;
    campo.style.overflowY = altura > ALTURA_MAXIMA_CAMPO ? "auto" : "hidden";
  });
}

/**
 * Envolve um campo de texto e, quando o navegador suporta, põe o microfone (56 px) numa linha logo abaixo do campo,
 * nunca por cima do texto. O campo cresce com o texto e depois rola. O provisório aparece na linha do microfone.
 */
export function DitadoField({ onFinal, stopWhen = false, className = "", children }: DitadoButtonProps) {
  const { supported, listening, interim, error, toggle, stop } = useDitado(onFinal);
  const timer = useListeningTimer(listening);
  const boxRef = useRef<HTMLDivElement>(null);
  useCampoQueCresce(boxRef);
  useEffect(() => {
    if (stopWhen) stop();
  }, [stopWhen, stop]);
  if (!supported) return <div className="ditado-box" ref={boxRef}>{children}</div>;

  return (
    <div className={`ditado-field${listening ? " is-listening" : ""} ${className}`.trim()}>
      <div className="ditado-box" ref={boxRef}>
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
              {listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
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
