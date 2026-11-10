import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { ConferenciaCartao } from "./gastosCartao";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { ActionButton } from "../../shared/ui/ActionButton";

type Props = {
  conferencia: ConferenciaCartao;
  estabelecimento: string;
  photoUrl: string;
  /** Fecha e deixa o motorista seguir (X, Esc, toque fora, arrastar, "Continuar"). */
  onClose: () => void;
  onRetake: () => void;
  /** Fecha e leva o foco para a descrição. */
  onExplain: () => void;
};

const CAMPOS = [["valor", "Valor"], ["data", "Data"]] as const;
const DISTANCIA_PARA_FECHAR = 80;

const tituloDivergencia = (divergentes: number, valorDiverge: boolean) =>
  divergentes > 1 ? "O recibo não bate com o cartão" : valorDiverge ? "O valor não bate com o cartão" : "A data não bate com o cartão";

// Resultado da leitura do recibo contra a cobrança do cartão, em folha de baixo; não bloqueia o envio.
export function LeituraCartaoSheet({ conferencia, estabelecimento, photoUrl, onClose, onRetake, onExplain }: Props) {
  const titleId = useId();
  const titleRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const campos = CAMPOS.flatMap(([key, rotulo]) => {
    const campo = conferencia[key];
    return campo ? [{ rotulo, ...campo }] : [];
  });
  const divergentes = campos.filter((campo) => !campo.confere);
  const confere = divergentes.length === 0;

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      // aria-modal: o foco não sai da folha.
      const focaveis = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex='-1']"));
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!primeiro || !ultimo) return;
      const atual = document.activeElement;
      if (event.shiftKey && (atual === primeiro || !sheetRef.current.contains(atual))) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && (atual === ultimo || !sheetRef.current.contains(atual))) {
        event.preventDefault();
        primeiro.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const atual = document.activeElement;
      if (!atual || atual === document.body || sheetRef.current?.contains(atual)) anterior?.focus();
    };
  }, []);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current !== null) setDragY(Math.max(0, event.clientY - dragStartRef.current));
  };
  const endDrag = () => {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    if (dragY > DISTANCIA_PARA_FECHAR) onClose(); else setDragY(0);
  };

  return (
    <div className="leitura-cartao-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className="leitura-cartao-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="leitura-cartao-handle" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><span /></div>
        <button className="leitura-cartao-close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        <div className={`leitura-cartao-icon ${confere ? "is-ok" : "is-aviso"}`} aria-hidden="true">
          {confere ? <SystemIcon name="check" /> : "!"}
        </div>
        <div ref={titleRef} id={titleId} tabIndex={-1} className="leitura-cartao-title">
          {confere ? "Recibo confere com o cartão" : tituloDivergencia(divergentes.length, conferencia.valor?.confere === false)}
        </div>
        {confere ? null : <p className="leitura-cartao-sub">A IA leu o recibo e comparou com a cobrança.</p>}

        {divergentes.map((campo) => (
          <div key={campo.rotulo} className="leitura-cartao-par">
            <div className="leitura-cartao-bloco is-recibo"><span>Recibo · {campo.rotulo}</span><strong>{campo.recibo}</strong></div>
            <div className="leitura-cartao-bloco"><span>Cartão · {campo.rotulo}</span><strong>{campo.cartao}</strong></div>
          </div>
        ))}
        <ul className="leitura-cartao-confere">
          {campos.filter((campo) => campo.confere).map((campo) => (
            <li key={campo.rotulo}>{confere ? `✓ ${campo.rotulo}: ${campo.cartao}` : `✓ ${campo.rotulo} confere: ${campo.cartao}`}</li>
          ))}
        </ul>

        {confere || !photoUrl ? null : (
          <div className="leitura-cartao-foto">
            <img src={photoUrl} alt="" />
            <span>Foto enviada{estabelecimento ? ` · ${estabelecimento}` : ""}</span>
          </div>
        )}

        <div className="leitura-cartao-acoes">
          {confere ? (
            <ActionButton variant="primary" label="Continuar" onClick={onClose} />
          ) : (
            <>
              <ActionButton variant="primary" label="Trocar foto" onClick={onRetake} />
              <ActionButton label="Manter e explicar na descrição" onClick={onExplain} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
