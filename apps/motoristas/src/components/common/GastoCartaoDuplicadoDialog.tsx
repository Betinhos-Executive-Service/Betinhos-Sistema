import { useEffect, useId, useRef } from "react";
import { formatDiaMes, type GastoCartao } from "../../lib/gastosCartao";
import { SystemIcon } from "../icons/SystemIcon";
import { ActionButton } from "./ActionButton";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  gasto: GastoCartao;
  onComplete: () => void;
  onLaunchAnyway: () => void;
  onClose: () => void;
};

// Aviso de possível duplicidade: Esc ou toque fora só fecha, sem enviar nada.
export function GastoCartaoDuplicadoDialog({ gasto, onComplete, onLaunchAnyway, onClose }: Props) {
  const titleId = useId();
  const completeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    completeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div className="maintenance-delete-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className="maintenance-delete-dialog gasto-cartao-duplicado" onClick={(event) => event.stopPropagation()}>
        <button className="gasto-cartao-duplicado-close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        <div className="maintenance-delete-icon" aria-hidden="true"><SystemIcon name="warning" /></div>
        <div id={titleId} className="maintenance-delete-title">Este gasto já veio do cartão</div>
        <p>
          {`${gasto.estabelecimento || "Gasto do cartão"} · ${BRL.format(gasto.valor)} · ${formatDiaMes(gasto.dataGasto)} está esperando você completar. Complete o existente para não duplicar.`}
        </p>
        <div className="maintenance-delete-actions">
          <ActionButton className="maintenance-delete-cancel" label="Lançar mesmo assim" onClick={onLaunchAnyway} />
          <ActionButton buttonRef={completeRef} className="maintenance-delete-confirm" variant="primary" label="Completar este" onClick={onComplete} />
        </div>
      </div>
    </div>
  );
}
