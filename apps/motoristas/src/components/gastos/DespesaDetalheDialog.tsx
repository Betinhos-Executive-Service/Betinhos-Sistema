import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatDiaMes } from "../../lib/gastosCartao";
import { ANEXO_SEM_COMPROVANTE, STATUS_DESPESA, ehPendente, formatBRL, type DespesaRelatorio } from "../../lib/gastosRelatorio";

export const STATUS_BADGE: Record<number, { rotulo: string; tom: string }> = {
  [STATUS_DESPESA.enviado]: { rotulo: "Enviado", tom: "neutro" },
  [STATUS_DESPESA.validado]: { rotulo: "Validado", tom: "sucesso" },
  [STATUS_DESPESA.precisaCorrigir]: { rotulo: "Precisa corrigir", tom: "atencao" },
  [STATUS_DESPESA.recusado]: { rotulo: "Recusado", tom: "erro" }
};

const LITROS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** Detalhe de leitura de uma despesa do relatório. Fecha no X, no Esc e tocando fora. */
export function DespesaDetalheDialog({ despesa, onClose }: { despesa: DespesaRelatorio; onClose: () => void }) {
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    fecharRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", esc);
      anterior?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const badge = STATUS_BADGE[despesa.status];
  const semComprovante = despesa.statusAnexo != null && ANEXO_SEM_COMPROVANTE.includes(despesa.statusAnexo);
  const linhas: [string, string][] = [
    ["Data", formatDiaMes(despesa.data)],
    ["Estabelecimento", despesa.estabelecimento || "Não informado"],
    ...(despesa.litros ? [["Litros", `${LITROS.format(despesa.litros)} L · ${formatBRL(despesa.valor / despesa.litros)}/L`] as [string, string]] : []),
    ...(despesa.km ? [["KM informado", String(despesa.km)] as [string, string]] : []),
    ["Comprovante", semComprovante ? "Sem comprovante" : "Enviado"]
  ];
  const pendente = ehPendente(despesa);

  return createPortal(
    <div className="contact-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="gr-detalhe-titulo" onClick={onClose}>
      <div className="contact-choice-dialog gr-detalhe" onClick={(event) => event.stopPropagation()}>
        <div className="gr-detalhe-topo">
          <div className="contact-choice-title" id="gr-detalhe-titulo">{despesa.categoria}</div>
          {badge ? <span className="termo-badge" data-tone={badge.tom}>{badge.rotulo}</span> : null}
        </div>
        <strong className="gr-detalhe-valor">{formatBRL(despesa.valor)}</strong>
        <dl className="gr-detalhe-campos">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>
          ))}
        </dl>
        {pendente ? (
          <p className="gr-detalhe-aviso">
            {despesa.status === STATUS_DESPESA.recusado ? "Este gasto foi recusado." : "O financeiro pediu correção neste gasto."} Fale com o financeiro para resolver.
          </p>
        ) : null}
        <button ref={fecharRef} type="button" className="contact-choice-cancel" onClick={onClose}>Fechar</button>
      </div>
    </div>,
    document.body
  );
}
