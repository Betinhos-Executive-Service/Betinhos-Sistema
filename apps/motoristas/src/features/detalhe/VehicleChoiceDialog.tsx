import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  describeVehicle,
  needsFleetChoice,
  NOT_APPLICABLE_VEHICLE_CHOICE,
  selectableCandidates,
  type DriverVehicleChoice,
  type FleetVehicle,
  type InfleetVehicleResolution
} from "../../lib/serviceVehicleInfleet";

type VehicleChoiceDialogProps = {
  resolution: InfleetVehicleResolution;
  loadFleet: () => Promise<FleetVehicle[]>;
  // Frota ativa completa, oferecida em "Nenhuma das opções" quando a lista mostrada é restrita.
  loadAllVehicles?: () => Promise<FleetVehicle[]>;
  onChoose: (choice: DriverVehicleChoice) => void;
  onCancel: () => void;
};

type VehicleOption = { id: string; placa: string; modelo: string; cor: string };

// Tempo para o motorista ver a seleção confirmada antes de o diálogo fechar.
const SELECTION_FEEDBACK_MS = 180;

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

// Pergunta qual carro o motorista usou: entre os carros da janela do serviço ou, se a Infleet
// não identificou nenhum carro cadastrado, entre todos os carros ativos.
export function VehicleChoiceDialog({ resolution, loadFleet, loadAllVehicles, onChoose, onCancel }: VehicleChoiceDialogProps) {
  // candidatos: carros vistos pela Infleet; lista: carros oferecidos pelo chamador; todos: frota ativa completa.
  const [mode, setMode] = useState<"candidatos" | "lista" | "todos">(() => (needsFleetChoice(resolution) ? "lista" : "candidatos"));
  const fleetMode = mode !== "candidatos";
  const candidates = useMemo<VehicleOption[]>(
    () => selectableCandidates(resolution).map((item) => ({ id: item.veiculoId as string, placa: item.placa, modelo: item.modelo, cor: item.cor })),
    [resolution]
  );
  const [fleet, setFleet] = useState<VehicleOption[]>([]);
  const [fleetState, setFleetState] = useState<"idle" | "loading" | "error" | "ready">(fleetMode ? "loading" : "ready");
  const [fleetAttempt, setFleetAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const firstFocusRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [onCancel]);

  useEffect(() => {
    if (!fleetMode) return;
    const loader = mode === "todos" && loadAllVehicles ? loadAllVehicles : loadFleet;
    let alive = true;
    setFleetState("loading");
    loader()
      .then((items) => {
        if (!alive) return;
        setFleet(items.map((item) => ({ id: item.id, placa: item.placa, modelo: item.modelo, cor: item.cor })));
        setFleetState("ready");
      })
      .catch(() => {
        if (alive) setFleetState("error");
      });
    return () => {
      alive = false;
    };
  }, [fleetMode, mode, loadFleet, loadAllVehicles, fleetAttempt]);

  const canChooseOther = Boolean(loadAllVehicles) && (mode === "candidatos" || (mode === "lista" && loadAllVehicles !== loadFleet));

  useEffect(() => {
    if (fleetState === "ready") firstFocusRef.current?.focus({ preventScroll: true });
  }, [fleetState]);

  const options = fleetMode ? fleet : candidates;
  const visible = useMemo(() => {
    const term = normalizeSearch(query);
    if (!term) return options;
    return options.filter((item) => normalizeSearch(`${item.placa} ${item.modelo} ${item.cor}`).includes(term));
  }, [options, query]);

  useEffect(() => {
    if (!selectedId) return;
    const option = options.find((item) => item.id === selectedId);
    const timer = window.setTimeout(() => {
      if (option) onChoose({ veiculoId: option.id, placa: option.placa, origem: fleetMode ? "frota" : "candidato" });
    }, SELECTION_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [selectedId, options, fleetMode, onChoose]);

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
        {mode === "lista" ? (
          <div className="contact-choice-phone vehicle-choice-hint">A Infleet não identificou o carro deste serviço.</div>
        ) : null}
        {mode === "todos" ? (
          <div className="contact-choice-phone vehicle-choice-hint">Escolha na frota o carro que você usou.</div>
        ) : null}

        {fleetMode && fleetState === "ready" ? (
          // Sem foco automático: o teclado do celular cobriria os botões do fim do diálogo.
          <input
            className="vehicle-choice-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Buscar placa, modelo ou cor"
            aria-label="Buscar carro"
            value={query}
            disabled={Boolean(selectedId)}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}

        {fleetState === "loading" ? (
          <div className="contact-choice-phone vehicle-choice-status" role="status" aria-busy="true">Carregando carros…</div>
        ) : null}

        {fleetState === "error" ? (
          <>
            <div className="contact-choice-phone vehicle-choice-status" role="alert">Não foi possível carregar os carros.</div>
            <button className="contact-choice-cancel" type="button" onClick={() => setFleetAttempt((value) => value + 1)}>
              Tentar de novo
            </button>
          </>
        ) : null}

        {fleetState === "ready" ? (
          visible.length ? (
            <ul className={`vehicle-choice-list${fleetMode ? " is-fleet" : ""}`} aria-labelledby="vehicle-choice-title">
              {visible.map((option, index) => {
                const selected = option.id === selectedId;
                return (
                  <li key={option.id} style={{ "--vehicle-choice-index": Math.min(index, 6) } as CSSProperties}>
                    <button
                      ref={!fleetMode && index === 0 ? (node) => { firstFocusRef.current = node; } : undefined}
                      className="vehicle-choice-option"
                      type="button"
                      aria-pressed={selected}
                      disabled={Boolean(selectedId) && !selected}
                      data-selected={selected || undefined}
                      onClick={() => setSelectedId(option.id)}
                    >
                      <span className="vehicle-choice-name">{describeVehicle(option)}</span>
                      <span className="vehicle-choice-plate">{option.placa}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="contact-choice-phone vehicle-choice-status">Nenhum carro encontrado para “{query}”.</div>
          )
        ) : null}

        {canChooseOther && fleetState !== "loading" ? (
          <button
            className="contact-choice-cancel"
            type="button"
            disabled={Boolean(selectedId)}
            onClick={() => {
              setQuery("");
              setMode("todos");
            }}
          >
            Nenhuma das opções
          </button>
        ) : null}

        {fleetState !== "loading" ? (
          <button
            className="contact-choice-cancel"
            type="button"
            disabled={Boolean(selectedId)}
            onClick={() => onChoose(NOT_APPLICABLE_VEHICLE_CHOICE)}
          >
            Não se aplica
          </button>
        ) : null}

        <button className="contact-choice-cancel" type="button" disabled={Boolean(selectedId)} onClick={onCancel}>
          Voltar
        </button>
      </div>
    </div>,
    document.body
  );
}
