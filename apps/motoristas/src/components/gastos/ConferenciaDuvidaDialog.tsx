import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DitadoField } from "../common/DitadoButton";
import { TextAreaField } from "../common/FormFields";
import { appendDitado } from "../../lib/useDitado";
import { JUSTIFICATIVA_MINIMA } from "../../lib/conferenciaEnvio";

/**
 * Popup "Dúvida" da conferência no envio: mostra a pergunta da IA e pede a justificativa (texto ou ditado).
 * "Responder e enviar" exige o mínimo de caracteres; "Voltar e corrigir", o X, o Esc e o toque fora voltam ao formulário.
 */
export function ConferenciaDuvidaDialog({ pergunta, onResponder, onVoltar }: { pergunta: string; onResponder: (justificativa: string) => void; onVoltar: () => void }) {
  const [texto, setTexto] = useState("");
  const [tentou, setTentou] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const valido = texto.trim().length >= JUSTIFICATIVA_MINIMA;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") onVoltar(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    caixaRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", esc);
      anterior?.focus?.({ preventScroll: true });
    };
  }, [onVoltar]);

  const responder = () => {
    setTentou(true);
    if (valido) onResponder(texto.trim());
  };

  return createPortal(
    <div className="contact-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="duvida-titulo" aria-describedby="duvida-pergunta" onClick={onVoltar}>
      <div className="contact-choice-dialog duvida-dialog" ref={caixaRef} onClick={(event) => event.stopPropagation()}>
        <div className="duvida-topo">
          <span className="duvida-icone" aria-hidden="true">?</span>
          <div className="contact-choice-title" id="duvida-titulo">Dúvida sobre este gasto</div>
        </div>
        <p className="duvida-pergunta" id="duvida-pergunta">{pergunta}</p>
        <DitadoField onFinal={(fala) => setTexto((atual) => appendDitado(atual, fala))}>
          <TextAreaField fieldClassName="finalize-input-block shadow" label="Sua explicação" placeholder="Explique o que aconteceu" rows={4} value={texto} onChange={(event) => setTexto(event.target.value)} />
        </DitadoField>
        {tentou && !valido ? <p className="duvida-erro" role="alert">Escreva ou fale um pouco mais (pelo menos {JUSTIFICATIVA_MINIMA} letras).</p> : null}
        <div className="duvida-acoes">
          <button type="button" className="contact-choice-cancel" onClick={onVoltar}>Voltar e corrigir</button>
          <button type="button" className="duvida-enviar" onClick={responder}>Responder e enviar</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
