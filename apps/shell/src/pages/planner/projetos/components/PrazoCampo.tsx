// Prazo no detalhe: botão com o rótulo; o seletor abre num painel ancorado e fecha ao escolher, ao clicar fora ou com Esc.
import { useEffect, useId, useRef, useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { faltaPrazo, hojeIso, rotuloPrazo, situacaoPrazo, type Prazo } from "../domain/prazo";
import { PrazoPicker } from "./PrazoPicker";

type Props = { value: Prazo | null; onChange: (p: Prazo | null) => void; disabled?: boolean; concluido?: boolean };

export function PrazoCampo({ value, onChange, disabled, concluido }: Props) {
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelId = useId();
  const hoje = hojeIso();
  const situacao = value && !concluido ? situacaoPrazo(value, hoje) : "ok";

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (event: PointerEvent) => { if (!boxRef.current?.contains(event.target as Node)) setAberto(false); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  const fechar = () => { setAberto(false); botaoRef.current?.focus(); };

  return (
    <div className="pj-prazo-campo" ref={boxRef}
      onKeyDown={(event) => { if (aberto && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); fechar(); } }}
      // Tab para fora fecha o seletor: senão o Esc seguinte fecharia o drawer com o painel aberto.
      onBlur={(event) => { if (aberto && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setAberto(false); }}>
      <button ref={botaoRef} type="button" className={`pj-prop-btn${value ? ` is-${situacao}` : " is-vazio"}`} disabled={disabled}
        aria-expanded={aberto} aria-controls={aberto ? painelId : undefined} onClick={() => setAberto((a) => !a)}>
        <CalendarClock size={15} aria-hidden="true" />
        {value
          ? <span><b>{rotuloPrazo(value, hoje)}</b>{!concluido && <> · {faltaPrazo(value, hoje)}</>}</span>
          : <span>Definir prazo</span>}
        <ChevronDown size={14} aria-hidden="true" className="pj-prop-btn__seta" />
      </button>
      {aberto && (
        <div id={painelId} className="pj-prazo-pop" role="group" aria-label="Escolher prazo">
          <PrazoPicker value={value} disabled={disabled} concluido={concluido} onChange={(p) => { onChange(p); fechar(); }} />
        </div>
      )}
    </div>
  );
}
