// Meu carro no Dataverse: frota ativa e carro atual do motorista.
import { type FleetVehicle } from "../../lib/serviceVehicleInfleet.ts";
import { buildCurrentVehiclePatch } from "./myVehicle.ts";
import { cleanGuid, cleanODataGuid, retrieveMultiple, updateOne, type DriverContext } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { ACTIVE_VEHICLE_FILTERS, VEHICLE_CATEGORY, bind } from "../../data/dataverse/registros.ts";

// Frota ativa (Próprio ou Aluguel) para o motorista escolher quando a Infleet não identifica o carro.
// Carro de terceiro fica de fora: pertence a outro motorista.
export function buildActiveFleetQuery() {
  return [
    "$select=cr40f_veiculosid,cr40f_placa,cr40f_modelo,cr40f_cor",
    `$filter=statecode eq 0 and ${ACTIVE_VEHICLE_FILTERS.join(" and ")} and (new_categoriadoveiculo eq ${VEHICLE_CATEGORY.proprio} or new_categoriadoveiculo eq ${VEHICLE_CATEGORY.aluguel})`,
    "$orderby=cr40f_modelo asc,cr40f_placa asc",
    "$top=300"
  ].join("&");
}

export async function loadActiveFleetRemote(): Promise<FleetVehicle[]> {
  const result = await retrieveMultiple(DATAVERSE.veiculos, buildActiveFleetQuery());
  return result.entities
    .map((record) => ({
      id: cleanODataGuid(record.cr40f_veiculosid),
      placa: String(record.cr40f_placa ?? "").trim(),
      modelo: String(record.cr40f_modelo ?? "").trim(),
      cor: String(record.cr40f_cor ?? "").trim()
    }))
    .filter((vehicle) => vehicle.id && vehicle.placa);
}

// Carros de categoria "Carro de terceiro" vinculados ao motorista; ele escolhe qual está usando.
export async function loadMyVehiclesRemote(driver: DriverContext): Promise<FleetVehicle[]> {
  const result = await retrieveMultiple(
    DATAVERSE.veiculos,
    [
      "$select=cr40f_veiculosid,cr40f_placa,cr40f_modelo,cr40f_cor",
      `$filter=statecode eq 0 and new_categoriadoveiculo eq 100000001 and _cr40f_motoristaatual_value eq ${cleanGuid(driver.id)}`,
      "$orderby=cr40f_modelo asc"
    ].join("&")
  );
  return result.entities
    .map((record) => ({
      id: cleanODataGuid(record.cr40f_veiculosid),
      placa: String(record.cr40f_placa ?? "").trim(),
      modelo: String(record.cr40f_modelo ?? "").trim(),
      cor: String(record.cr40f_cor ?? "").trim()
    }))
    .filter((vehicle) => vehicle.id && vehicle.placa);
}

export async function setMyCurrentVehicleRemote(driver: DriverContext, vehicleId: string) {
  await updateOne(DATAVERSE.funcionarios, driver.id, buildCurrentVehiclePatch(vehicleId, (id) => bind(DATAVERSE.veiculos, id)));
}
