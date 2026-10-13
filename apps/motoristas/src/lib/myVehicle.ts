// Carro atual do motorista terceiro, escolhido por ele no app (sem rastreador).
export const DRIVER_LINK_THIRD_PARTY = 1;
export const CURRENT_VEHICLE_ORIGIN_DRIVER = 100000001;

export function isThirdPartyDriver(funcionario: Record<string, unknown> | null | undefined) {
  return Number(funcionario?.cr40f_tipodevinculo) === DRIVER_LINK_THIRD_PARTY;
}

export function buildCurrentVehiclePatch(vehicleId: string, vehicleBind: (id: string) => string, now = new Date()) {
  return {
    "cr40f_VeiculoAtual@odata.bind": vehicleBind(vehicleId),
    new_veiculoatualdesde: now.toISOString(),
    new_origemveiculoatual: CURRENT_VEHICLE_ORIGIN_DRIVER
  };
}
