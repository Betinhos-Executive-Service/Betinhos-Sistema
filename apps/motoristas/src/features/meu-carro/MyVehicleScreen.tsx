import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { LocalToast, type ToastState } from "../../components/common/LocalToast";
import { AppShell } from "../../components/layout/AppShell";
import { FormMenu } from "../../components/navigation/FormMenu";
import { describeVehicle, type FleetVehicle } from "../../lib/serviceVehicleInfleet";

type MyVehicleScreenProps = {
  onBack: () => void;
  currentVehicleId: string;
  loadVehicles: () => Promise<FleetVehicle[]>;
  saveVehicle: (vehicleId: string) => Promise<void>;
};

export function MyVehicleScreen({ onBack, currentVehicleId, loadVehicles, saveVehicle }: MyVehicleScreenProps) {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedId, setSelectedId] = useState(currentVehicleId);
  // O App recria os carregadores a cada render; guardar o mais recente evita recarregar a lista ao salvar.
  const loadRef = useRef(loadVehicles);
  loadRef.current = loadVehicles;

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setVehicles(await loadRef.current());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choose = async (vehicleId: string) => {
    if (savingId || vehicleId === selectedId) return;
    setSavingId(vehicleId);
    try {
      await saveVehicle(vehicleId);
      setSelectedId(vehicleId);
      setToast({ id: Date.now(), message: "Carro atualizado.", tone: "success" });
    } catch {
      setToast({ id: Date.now(), message: "Não foi possível atualizar o carro. Tente novamente.", tone: "error" });
    } finally {
      setSavingId("");
    }
  };

  return (
    <AppShell screenLabel="TelaMeuCarro">
      <FormMenu title="Meu carro" onBack={savingId ? undefined : onBack} />
      <section className="main-panel ideas-main">
        <article className="finalize-card ideas-card">
          <div className="finalize-scroll">
            <div className="finalize-form ideas-form" aria-busy={loading}>
              <p className="ideas-intro">Toque no carro que você está usando agora.</p>

              {loadError ? (
                <div className="ideas-feedback ideas-feedback--error" role="alert">
                  <span>Não foi possível carregar os carros.</span>
                  <button type="button" onClick={() => void refresh()}>Tentar de novo</button>
                </div>
              ) : loading ? (
                <div className="ideas-skeleton" role="status" aria-label="Carregando carros">
                  <span />
                  <span />
                </div>
              ) : vehicles.length ? (
                <ul className="vehicle-choice-list">
                  {vehicles.map((vehicle, index) => {
                    const selected = vehicle.id === selectedId;
                    return (
                      <li key={vehicle.id} style={{ "--vehicle-choice-index": Math.min(index, 6) } as CSSProperties}>
                        <button
                          className="vehicle-choice-option"
                          type="button"
                          aria-pressed={selected}
                          disabled={Boolean(savingId)}
                          data-selected={selected || undefined}
                          onClick={() => void choose(vehicle.id)}
                        >
                          <span className="vehicle-choice-name">{describeVehicle(vehicle)}</span>
                          <span className="vehicle-choice-plate">{vehicle.placa}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="ideas-empty">
                  <strong>Nenhum carro cadastrado para você. Fale com a operação.</strong>
                </div>
              )}
            </div>
          </div>
        </article>
      </section>
      <LocalToast toast={toast} onDismiss={() => setToast(null)} />
    </AppShell>
  );
}
