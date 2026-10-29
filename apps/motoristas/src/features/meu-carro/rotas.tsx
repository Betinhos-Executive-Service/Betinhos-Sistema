import {
  getDriverContext,
  getDriverCurrentVehicleId,
  loadMyVehiclesRemote,
  setMyCurrentVehicleRemote,
  type DriverContext
} from "../../lib/dataverse";
import { MyVehicleScreen } from "./MyVehicleScreen";
import { MOCK_FLEET } from "../../lib/serviceVehicleInfleetMock";
import type { Screen } from "../../types";
import type { ReactNode } from "react";

type Props = {
  driverContext: DriverContext | null;
  remoteMode: boolean;
  setDriverContext: React.Dispatch<React.SetStateAction<DriverContext | null>>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

// Tela do meu carro.
export function rotasMeuCarro(screen: Screen, {
  driverContext,
  remoteMode,
  setDriverContext,
  setScreen
}: Props): ReactNode | null {
  if (screen === "meuCarro") {
    return (
      <MyVehicleScreen
        onBack={() => setScreen("inicio")}
        currentVehicleId={getDriverCurrentVehicleId(driverContext)}
        loadVehicles={async () => (remoteMode ? loadMyVehiclesRemote(driverContext ?? await getDriverContext()) : MOCK_FLEET.slice(0, 2))}
        saveVehicle={async (id) => {
          const driver = driverContext ?? await getDriverContext();
          if (remoteMode) await setMyCurrentVehicleRemote(driver, id);
          setDriverContext({ ...driver, funcionario: { ...(driver.funcionario ?? {}), _cr40f_veiculoatual_value: id } });
        }}
      />
    );
  }
  return null;
}
