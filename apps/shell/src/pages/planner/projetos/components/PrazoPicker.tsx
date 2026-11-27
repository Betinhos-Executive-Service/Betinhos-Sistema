// Seletor do prazo do projeto (variante B): abas Mês / Semana / Dia e o resultado com "Limpar".
import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  MESES, diaDaSemana, diasNoMes, faltaPrazo, hojeIso, isoDe, mesmoPrazo, prazoDia, prazoMes, prazoSemana, rotuloPrazo, semanasDoMes, situacaoPrazo,
  type Prazo, type PrazoTipo,
} from "../domain/prazo";

const ABAS: { tipo: PrazoTipo; label: string }[] = [{ tipo: "mes", label: "Mês" }, { tipo: "semana", label: "Semana" }, { tipo: "dia", label: "Dia" }];
const SEMANA = ["S", "T", "Q", "Q", "S", "S", "D"];
const NOME_DIA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

type Props = { value: Prazo | null; onChange: (p: Prazo | null) => void; disabled?: boolean; hoje?: string; concluido?: boolean };

export function PrazoPicker({ value, onChange, disabled, hoje = hojeIso(), concluido }: Props) {
  const base = (value?.fim ?? hoje).split("-").map(Number);
  const [aba, setAba] = useState<PrazoTipo>(value?.tipo ?? "mes");
  const [ano, setAno] = useState(base[0]);
  const [mes0, setMes0] = useState(base[1] - 1);

  const andar = (delta: number) => {
    if (aba === "mes") { setAno((a) => a + delta); return; }
    const total = ano * 12 + mes0 + delta;
    setAno(Math.floor(total / 12));
    setMes0(((total % 12) + 12) % 12);
  };
  const titulo = aba === "mes" ? String(ano) : `${MESES[mes0]} ${ano}`;
  const escolhido = (p: Prazo) => mesmoPrazo(value, p);
  const passou = (p: Prazo) => p.fim < hoje;

  return (
    <div className="pj-prazo">
      <div className="pj-prazo__abas" role="tablist" aria-label="Tipo do prazo">
        {ABAS.map((a) => (
          <button key={a.tipo} type="button" role="tab" aria-selected={aba === a.tipo} className={aba === a.tipo ? "is-ativa" : undefined}
            disabled={disabled} onClick={() => setAba(a.tipo)}>{a.label}</button>
        ))}
      </div>
      <div className="pj-prazo__painel" role="tabpanel" aria-label={ABAS.find((a) => a.tipo === aba)?.label}>
        <div className="pj-prazo__nav">
          <button type="button" className="pj-prazo__seta" disabled={disabled} onClick={() => andar(-1)} aria-label={aba === "mes" ? "Ano anterior" : "Mês anterior"}><ChevronLeft size={16} /></button>
          <strong aria-live="polite">{titulo}</strong>
          <button type="button" className="pj-prazo__seta" disabled={disabled} onClick={() => andar(1)} aria-label={aba === "mes" ? "Próximo ano" : "Próximo mês"}><ChevronRight size={16} /></button>
        </div>

        {aba === "mes" && (
          <div className="pj-prazo__meses">
            {MESES.map((m, i) => {
              const p = prazoMes(ano, i);
              return (
                <button key={m} type="button" disabled={disabled} aria-pressed={escolhido(p)} aria-label={`${m} de ${ano}`}
                  className={`${escolhido(p) ? "is-sel" : ""}${passou(p) ? " is-passado" : ""}`} onClick={() => onChange(p)}>{m}</button>
              );
            })}
          </div>
        )}

        {aba === "semana" && (
          <ul className="pj-prazo__semanas">
            {semanasDoMes(ano, mes0).map((s) => {
              const p = prazoSemana(ano, mes0, s.n);
              const sel = escolhido(p);
              return (
                <li key={s.n}>
                  <button type="button" disabled={disabled} aria-pressed={sel} className={`${sel ? "is-sel" : ""}${passou(p) ? " is-passado" : ""}`} onClick={() => onChange(p)}>
                    <b>Semana {s.n}</b><span>{s.ini === s.fim ? s.ini : `${s.ini}–${s.fim}`} {MESES[mes0]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {aba === "dia" && (
          <div className="pj-prazo__cal" role="group" aria-label={`Dias de ${MESES[mes0]} de ${ano}`}>
            {SEMANA.map((d, i) => <span key={i} className="pj-prazo__dsem" aria-hidden="true">{d}</span>)}
            {Array.from({ length: diaDaSemana(ano, mes0, 1) }, (_, i) => <span key={`v${i}`} aria-hidden="true" />)}
            {Array.from({ length: diasNoMes(ano, mes0) }, (_, i) => {
              const iso = isoDe(ano, mes0, i + 1);
              const p = prazoDia(iso);
              return (
                <button key={iso} type="button" disabled={disabled} aria-pressed={escolhido(p)} aria-label={`${NOME_DIA[diaDaSemana(ano, mes0, i + 1)]}, ${i + 1} de ${MESES[mes0]}`}
                  className={`${escolhido(p) ? "is-sel" : ""}${passou(p) ? " is-passado" : ""}${iso === hoje ? " is-hoje" : ""}`} onClick={() => onChange(p)}>{i + 1}</button>
              );
            })}
          </div>
        )}
      </div>

      <div className={`pj-prazo__res${value && !concluido ? ` is-${situacaoPrazo(value, hoje)}` : ""}`} aria-live="polite">
        {value
          ? <><span><b>{rotuloPrazo(value, hoje)}</b>{!concluido && <> · {faltaPrazo(value, hoje)}</>}</span>
            <button type="button" className="pj-prazo__limpar" disabled={disabled} onClick={() => onChange(null)}><X size={14} aria-hidden="true" /> Limpar</button></>
          : <span className="pj-muted">Sem prazo. Escolha um mês, uma semana ou um dia.</span>}
      </div>
    </div>
  );
}
