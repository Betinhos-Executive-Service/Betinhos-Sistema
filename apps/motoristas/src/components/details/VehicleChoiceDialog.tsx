import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  describeVehicle,
  selectableCandidates,
  type DriverVehicleChoice,
  type InfleetVehicleResolution
} from "../../lib/serviceVehicleInfleet";

type VehicleChoiceDialogProps = {
  resolution: InfleetVehicleResolution;
  onChoose: (choice: DriverVehicleChoice) => void;
  onCancel: () => void;
};

// Tempo para o motorista ver a seleção confirmada antes de o diálogo fechar.
const SELECTION_FEEDBACK_MS = 180;

// Pergunta qual carro o motorista usou, só entre os carros registrados na janela do serviço.
export function VehicleChoiceDialog({ resolution, onChoose, onCancel }: VehicleChoiceDialogProps) {
  const candidates = useMemo(() => selectableCandidates(resolution), [resolution]);
  const [selectedId, setSelectedId] = useState("");
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    firstOptionRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [onCancel]);

  useEffect(() => {
    if (!selectedId) return;
    const candidate = candidates.find((item) => item.veiculoId === selectedId);
    const timer = window.setTimeout(() => {
      if (candidate?.veiculoId) onChoose({ veiculoId: candidate.veiculoId, placa: candidate.placa });
    }, SELECTION_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [selectedId, candidates, onChoose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="contact-choice-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-choice-title"
      onClick={selectedId ? undefined : onCancel}
    >
      <div className="contact-choice-dialog vehicle-choice-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="contact-choice-title" id="vehicle-choice-title">Qual carro você usou?</div>

        <ul className="vehicle-choice-list" aria-labelledby="vehicle-choice-title">
          {candidates.map((candidate, index) => {
            const selected = candidate.veiculoId === selectedId;
            return (
              <li key={candidate.veiculoId} style={{ "--vehicle-choice-index": index } as CSSProperties}>
                <button
                  ref={index === 0 ? firstOptionRef : undefined}
                  className="vehicle-choice-option"
                  type="button"
                  aria-pressed={selected}
                  disabled={Boolean(selectedId) && !selected}
                  data-selected={selected || undefined}
                  onClick={() => setSelectedId(candidate.veiculoId as string)}
                >
                  <span className="vehicle-choice-name">{describeVehicle(candidate)}</span>
                  <span className="vehicle-choice-plate">{candidate.placa}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <button className="contact-choice-cancel" type="button" disabled={Boolean(selectedId)} onClick={onCancel}>
          Voltar
        </button>
      </div>
    </div>,
    document.body
  );
}
