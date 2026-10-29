import type { ExpenseReferenceData } from "../features/despesas/expenses.types";
import type { LoadingOverlayState } from "../components/common/LoadingOverlay";
import type { MaintenanceRequestDraft } from "../features/manutencao/MaintenanceRequestScreen";
import { useEffect } from "react";
import {
  getDriverContext,
  getDriverCurrentVehicleId,
  loadExpenseReferenceDataRemote,
  loadReceiptClienteOptionsRemote,
  loadMaintenanceRequestVehiclesRemote,
  prefetchExpenseReferenceDataRemote,
  type DriverContext,
  type MaintenanceRequestVehicleOption
} from "../lib/dataverse";
import { reportAppError } from "../lib/appErrorLogger";
import type { ToastTone } from "../components/common/LocalToast";
import type { DetailData, Screen } from "../types";
import { LOCAL_RECEIPT_CLIENT_MOCKS } from "../features/recibo/clientesMock";

type Options = {
  driverContext: DriverContext | null;
  expenseReferenceData: ExpenseReferenceData;
  isLocalhostRuntime: boolean;
  remoteMode: boolean;
  screen: Screen;
  selectedDetail: DetailData | null;
  setDataLoadingState: (loading: LoadingOverlayState | null) => void;
  setDriverContext: React.Dispatch<React.SetStateAction<DriverContext | null>>;
  setExpenseReferenceData: React.Dispatch<React.SetStateAction<ExpenseReferenceData>>;
  setExpenseReferenceError: React.Dispatch<React.SetStateAction<string>>;
  setExpenseReferenceLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setMaintenanceCurrentVehicleId: React.Dispatch<React.SetStateAction<string>>;
  setMaintenanceRequestDraft: React.Dispatch<React.SetStateAction<MaintenanceRequestDraft>>;
  setMaintenanceVehicles: React.Dispatch<React.SetStateAction<MaintenanceRequestVehicleOption[]>>;
  setMaintenanceVehiclesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setReceiptClienteOptions: React.Dispatch<React.SetStateAction<string[]>>;
  setToast: (message: string, tone?: ToastTone) => void;
};

// Dados de apoio dos formulários: referências de despesa, veículos (gastos, colisão, manutenção) e clientes do recibo, carregados ao abrir a tela.
export function useDadosFormularios({ driverContext, expenseReferenceData, isLocalhostRuntime, remoteMode, screen, selectedDetail, setDataLoadingState, setDriverContext, setExpenseReferenceData, setExpenseReferenceError, setExpenseReferenceLoading, setMaintenanceCurrentVehicleId, setMaintenanceRequestDraft, setMaintenanceVehicles, setMaintenanceVehiclesLoading, setReceiptClienteOptions, setToast }: Options) {
  useEffect(() => {
    if (!remoteMode || !driverContext) return;
    prefetchExpenseReferenceDataRemote();
  }, [driverContext, remoteMode]);

  useEffect(() => {
    if ((screen !== "solicitarManutencao" && screen !== "gastos" && screen !== "colisoes") || !remoteMode) return;
    let alive = true;
    setMaintenanceVehiclesLoading(true);
    getDriverContext()
      .then(async (driver) => {
        const vehicles = await loadMaintenanceRequestVehiclesRemote(driver, {
          onlyOwnCategory: screen === "solicitarManutencao",
          activeOnly: screen === "colisoes"
        });
        if (!alive) return;
        setDriverContext(driver);
        const currentVehicleId = getDriverCurrentVehicleId(driver);
        const availableCurrentVehicleId = vehicles.some((vehicle) => vehicle.id === currentVehicleId) ? currentVehicleId : "";
        setMaintenanceCurrentVehicleId(availableCurrentVehicleId);
        setMaintenanceRequestDraft((current) => (
          current.veiculoId && !vehicles.some((vehicle) => vehicle.id === current.veiculoId)
            ? { ...current, veiculoId: "" }
            : current
        ));
        setMaintenanceVehicles(vehicles);
      })
      .catch((error) => {
        if (!alive) return;
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "loadMaintenanceRequestVehiclesRemote",
          phase: "maintenance-request",
          screen
        });
        setToast(error instanceof Error ? error.message : "Falha ao carregar veículos.");
      })
      .finally(() => {
        if (alive) setMaintenanceVehiclesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [screen, remoteMode]);

  useEffect(() => {
    const shouldLoadExpenseReference = screen === "gastos" || (screen === "finalizar" && selectedDetail?.type === "MANUTENCAO");
    if (!shouldLoadExpenseReference || !remoteMode) return;
    let alive = true;
    const hasReferenceData =
      expenseReferenceData.categories.length > 0 &&
      expenseReferenceData.paymentMethods.length > 0 &&
      expenseReferenceData.cities.length > 0;
    setExpenseReferenceLoading(!hasReferenceData);
    setExpenseReferenceError("");
    loadExpenseReferenceDataRemote()
      .then((referenceData) => {
        if (!alive) return;
        setExpenseReferenceData(referenceData);
        setExpenseReferenceError("");
      })
      .catch((error) => {
        if (!alive) return;
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "loadExpenseReferenceDataRemote",
          phase: screen === "finalizar" ? "maintenance-finalize" : "expense-form",
          screen
        });
        const message = error instanceof Error ? error.message : "Falha ao carregar categorias de despesas.";
        setExpenseReferenceError(message);
        setToast(message);
      })
      .finally(() => {
        if (alive) setExpenseReferenceLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [screen, remoteMode, selectedDetail?.type]);

  useEffect(() => {
    if (screen !== "reciboPersonalizado") {
      setReceiptClienteOptions([]);
      return;
    }

    if (!remoteMode) {
      setReceiptClienteOptions(isLocalhostRuntime ? LOCAL_RECEIPT_CLIENT_MOCKS : []);
      return;
    }

    let alive = true;
    loadReceiptClienteOptionsRemote()
      .then((clientes) => {
        if (!alive) return;
        setReceiptClienteOptions(clientes.length ? clientes : (isLocalhostRuntime ? LOCAL_RECEIPT_CLIENT_MOCKS : []));
      })
      .catch((error) => {
        if (!alive) return;
        setDataLoadingState(null);
        reportAppError(error, {
          severity: "error",
          source: "app",
          action: "loadReceiptClienteOptionsRemote",
          phase: "receipt-form",
          screen
        });
        setReceiptClienteOptions(isLocalhostRuntime ? LOCAL_RECEIPT_CLIENT_MOCKS : []);
      });

    return () => {
      alive = false;
    };
  }, [isLocalhostRuntime, remoteMode, screen]);

}
