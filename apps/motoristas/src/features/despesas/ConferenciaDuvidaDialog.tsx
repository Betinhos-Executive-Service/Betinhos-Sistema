import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DitadoField } from "../../shared/ui/DitadoButton";
import { TextAreaField } from "../../shared/ui/FormFields";
import { appendDitado } from "../../shared/useDitado";
import { JUSTIFICATIVA_MINIMA } from "./conferenciaEnvio";

/**
 * Popup "Dúvida" da conferência no envio: mostra a pergunta e pede a explicação (texto ou ditado).
 * "Enviar com a explicação" exige o mínimo de caracteres; "Voltar e ajustar", o Esc e o toque fora voltam ao formulário.
 */
export function ConferenciaDuvidaDialog({ pergunta, onResponder, onVoltar }: { pergunta: string; onResponder: (justificativa: string) => void; onVoltar: () => void }) {
  const [texto, setTexto] = useState("");
  const [tentou, setTentou] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const faltam = Math.max(0, JUSTIFICATIVA_MINIMA - texto.trim().length);

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
    if (!faltam) onResponder(texto.trim());
  };

  return createPortal(
    <div className="duvida-overlay" role="dialog" aria-modal="true" aria-labelledby="duvida-titulo" aria-describedby="duvida-pergunta" onClick={onVoltar}>
      <div className="duvida-dialog" ref={caixaRef} onClick={(event) => event.stopPropagation()}>
        <header className="duvida-topo">
          <span className="duvida-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9.5" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.3-2.4 3.8" /><path d="M12 17.2h.01" /></svg>
          </span>
          <div>
            <h2 id="duvida-titulo">Só uma conferência rápida</h2>
            <p>Conta pra gente o que aconteceu. Assim o financeiro aprova sem precisar te chamar.</p>
          </div>
        </header>

        <div className="duvida-corpo">
          <p className="duvida-pergunta" id="duvida-pergunta">{pergunta}</p>
          <DitadoField onFinal={(fala) => setTexto((atual) => appendDitado(atual, fala))}>
            <TextAreaField
              fieldClassName="duvida-campo"
              label="Sua explicação"
              placeholder="Ex.: almoço do passageiro, pago a pedido do cliente."
              rows={3}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
            />
          </DitadoField>
          <p className={`duvida-dica${tentou && faltam ? " is-erro" : ""}`} role={tentou && faltam ? "alert" : undefined}>
            {faltam ? `Escreva ou fale umas ${JUSTIFICATIVA_MINIMA} letras, pelo menos (faltam ${faltam}).` : "Obrigado! Já pode enviar."}
          </p>
        </div>

        <div className="duvida-acoes">
          <button type="button" className="duvida-enviar" onClick={responder}>Enviar com a explicação</button>
          <button type="button" className="duvida-voltar" onClick={onVoltar}>Voltar e ajustar o gasto</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
