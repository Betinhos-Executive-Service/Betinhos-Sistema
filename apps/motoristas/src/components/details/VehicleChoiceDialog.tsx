import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SearchableSelect } from "../common/SearchableSelect";
import {
  formatUsageDuration,
  selectableCandidates,
  type DriverVehicleChoice,
  type InfleetVehicleResolution
} from "../../lib/serviceVehicleInfleet";

export type VehicleOption = { id: string; label: string };

type VehicleChoiceDialogProps = {
  resolution: InfleetVehicleResolution;
  loadVehicles: () => Promise<VehicleOption[]>;
  onChoose: (choice: DriverVehicleChoice) => void;
  onCancel: () => void;
};

// Pergunta ao motorista qual carro usou quando a Infleet não chega a 85% em um só carro.
export function VehicleChoiceDialog({ resolution, loadVehicles, onChoose, onCancel }: VehicleChoiceDialogProps) {
  const candidates = useMemo(() => selectableCandidates(resolution), [resolution]);
  const [showOther, setShowOther] = useState(candidates.length === 0);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehiclesState, setVehiclesState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [otherId, setOtherId] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onCancel]);

  useEffect(() => {
    if (!showOther || vehiclesState !== "idle") return;
    let alive = true;
    setVehiclesState("loading");
    loadVehicles()
      .then((items) => {
        if (!alive) return;
        setVehicles(items);
        setVehiclesState("ready");
      })
      .catch(() => {
        if (alive) setVehiclesState("error");
      });
    return () => {
      alive = false;
    };
  }, [showOther, vehiclesState, loadVehicles]);

  const subtitle = candidates.length
    ? "A Infleet registrou mais de um carro com você neste serviço. Escolha o que você usou."
    : "A Infleet não registrou viagens suas neste serviço. Informe o carro que você usou.";

  const confirmOther = () => {
    const vehicle = vehicles.find((item) => item.id === otherId);
    if (vehicle) onChoose({ veiculoId: vehicle.id, placa: vehicle.label, origem: "outro" });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="contact-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="vehicle-choice-title" onClick={onCancel}>
      <div className="contact-choice-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="contact-choice-title" id="vehicle-choice-title">Qual carro você usou?</div>
        <div className="contact-choice-phone">{subtitle}</div>

        {!showOther && candidates.map((candidate) => (
          <button
            key={candidate.veiculoId}
            className="contact-choice-cancel vehicle-choice-option"
            type="button"
            onClick={() => onChoose({ veiculoId: candidate.veiculoId as string, placa: candidate.placa, origem: "candidato" })}
          >
            <span>{candidate.placa}</span>
            <span className="vehicle-choice-meta">{formatUsageDuration(candidate.segundos)} · {candidate.percentual}%</span>
          </button>
        ))}

        {!showOther && (
          <button className="contact-choice-cancel" type="button" onClick={() => setShowOther(true)}>
            Outro carro
          </button>
        )}

        {showOther && (
          <div className="vehicle-choice-other">
            {vehiclesState === "error" ? (
              <>
                <div className="contact-choice-phone" role="alert">Não foi possível carregar os carros.</div>
                <button className="contact-choice-cancel" type="button" onClick={() => setVehiclesState("idle")}>Tentar de novo</button>
              </>
            ) : (
              <SearchableSelect
                value={otherId}
                options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.label }))}
                placeholder={vehiclesState === "loading" ? "Carregando carros…" : "Selecione o carro"}
                disabled={vehiclesState !== "ready"}
                ariaLabel="Carro usado no serviço"
                searchPlaceholder="Buscar placa ou modelo"
                emptyLabel="Nenhum carro encontrado."
                onChange={setOtherId}
              />
            )}
            <div className="contact-choice-actions vehicle-choice-confirm">
              <button type="button" disabled={!otherId} onClick={confirmOther}>Confirmar carro</button>
            </div>
          </div>
        )}

        <button className="contact-choice-cancel" type="button" onClick={showOther && candidates.length ? () => setShowOther(false) : onCancel}>
          Voltar
        </button>
      </div>
    </div>,
    document.body
  );
}
