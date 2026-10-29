// Conversão dos registros crus da Web API (com anotações FormattedValue) para o modelo da tela.
// Aceita também o formato já normalizado (mock), como no WebResource.
import { CONFIG } from "./config";
import type { BaseLocation, Driver, PassengerLink, Possession, RawRecord, Service, Swap, Vehicle } from "./types";
import { displayDriverName, formattedValue } from "./utils";

export type { RawRecord } from "./types";

export function valueString(value: unknown): string {
  return value == null ? "" : String(value);
}

export function valueNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function valueBoolean(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "sim"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  return null;
}

export function normalizeEmail(value: unknown): string {
  return valueString(value).trim().toLowerCase();
}

export function normalizeDriver(item: RawRecord): Driver {
  const fields = CONFIG.fields.funcionario;
  const employmentTypeValue = valueNumber(item[fields.tipoVinculo] ?? item.employmentTypeValue);
  const microsoftEmail = valueString(item[fields.emailMicrosoft] || item.microsoftEmail);
  const hasActiveSystemUserRaw = item.hasActiveSystemUser;
  return {
    id: valueString(item[fields.id] || item.id),
    name: valueString(item[fields.nome] || item.name),
    nickname: valueString(item[fields.apelido] || item.nickname),
    microsoftEmail,
    hasActiveSystemUser: typeof hasActiveSystemUserRaw === "boolean" ? hasActiveSystemUserRaw : null,
    employmentTypeValue,
    employmentTypeLabel: formattedValue(item, fields.tipoVinculo) || (employmentTypeValue === 1 ? "Terceiro" : employmentTypeValue === 0 ? "Colaborador" : "")
  };
}

export function normalizeVehicle(item: RawRecord): Vehicle {
  const fields = CONFIG.fields.veiculo;
  const model = valueString(item[fields.modelo] || item.model);
  const plate = valueString(item[fields.placa] || item.plate);
  const ownershipValue = valueNumber(item[fields.propriedade] ?? item.ownershipValue);
  return {
    id: valueString(item[fields.id] || item.id),
    model,
    color: valueString(item[fields.cor] || item.color),
    plate,
    label: valueString(item.label || `${model || "Veículo"} • ${plate || "—"}`),
    ownershipValue,
    ownershipLabel: formattedValue(item, fields.propriedade) || CONFIG.choices.propriedadeVeiculo[ownershipValue || 0] || valueString(item.ownershipLabel),
    armored: valueBoolean(item[fields.blindado] ?? item.armored) === true,
    rentalSupplier: valueString(item[fields.fornecedorLocacao] || item.rentalSupplier),
    rentalEnd: valueString(item[fields.fimLocacao] || item.rentalEnd) || null
  };
}

export function normalizeLocation(item: RawRecord): BaseLocation {
  const fields = CONFIG.fields.localBase;
  return {
    id: valueString(item[fields.id] || item.id),
    name: valueString(item[fields.nome] || item.name),
    address: valueString(item[fields.endereco] || item.address),
    mapUrl: valueString(item[fields.linkMapa] || item.mapUrl)
  };
}

export function normalizeService(item: RawRecord): Service {
  const fields = CONFIG.fields.reserva;
  const statusValue = Number(item[fields.statusOperacao] ?? item.statusValue ?? 0) || null;
  const statusFaturamentoValue = Number(item[fields.statusFaturamento] ?? item.statusFaturamentoValue ?? 0) || null;
  const tipoServicoValue = Number(item[fields.tipoServico] ?? item.tipoServicoValue ?? 0) || null;
  const tipoVeiculoValue = Number(item[fields.tipoVeiculo] ?? item.tipoVeiculoValue ?? 0) || null;
  const formaPagamentoValue = Number(item[fields.formaPagamento] ?? item.formaPagamentoValue ?? 0) || null;
  const receberValue = valueBoolean(item[fields.receber] ?? item.receberValue);
  return {
    id: valueString(item[fields.id] || item.id),
    readableId: valueString(item[fields.readableId] || item.readableId),
    dataSaida: valueString(item[fields.dataSaida] || item.dataSaida),
    previsaoRetorno: valueString(item[fields.previsaoRetorno] || item.previsaoRetorno) || null,
    statusValue,
    statusLabel: formattedValue(item, fields.statusOperacao) || CONFIG.choices.statusOperacao[statusValue || 0] || valueString(item.statusLabel),
    statusFaturamentoValue,
    statusFaturamentoLabel: formattedValue(item, fields.statusFaturamento) || CONFIG.choices.statusFaturamento[statusFaturamentoValue || 0] || valueString(item.statusFaturamentoLabel),
    tipoServicoValue,
    tipoServicoLabel: formattedValue(item, fields.tipoServico) || CONFIG.choices.tipoServico[tipoServicoValue || 0] || valueString(item.tipoServicoLabel),
    tipoVeiculoValue,
    tipoVeiculoLabel: formattedValue(item, fields.tipoVeiculo) || CONFIG.choices.tipoVeiculo[tipoVeiculoValue || 0] || valueString(item.tipoVeiculoLabel),
    clienteId: valueString(item[fields.lookupCliente] || item.clienteId) || null,
    clienteLabel: formattedValue(item, fields.lookupCliente) || valueString(item.clienteLabel),
    solicitanteId: valueString(item[fields.lookupSolicitante] || item.solicitanteId) || null,
    solicitanteLabel: formattedValue(item, fields.lookupSolicitante) || valueString(item.solicitanteLabel),
    motoristaId: valueString(item[fields.lookupMotorista] || item.motoristaId) || null,
    motoristaLabel: formattedValue(item, fields.lookupMotorista) || valueString(item.motoristaLabel),
    veiculoId: valueString(item[fields.lookupVeiculo] || item.veiculoId) || null,
    veiculoLabel: formattedValue(item, fields.lookupVeiculo) || valueString(item.veiculoLabel),
    destino: valueString(item[fields.destino] || item.destino),
    enderecoSaida: valueString(item[fields.enderecoSaida] || item.enderecoSaida),
    obsOperacao: valueString(item[fields.obsOperacao] || item.obsOperacao),
    obsInterna: valueString(item[fields.obsInterna] || item.obsInterna),
    paxView: valueString(item[fields.paxView] || item.paxView),
    trajeto: valueString(item[fields.trajeto] || item.trajeto),
    perfilPassageiro: valueString(item[fields.perfilPassageiro] || item.perfilPassageiro),
    email: valueString(item[fields.email] || item.email),
    receberValue,
    formaPagamentoValue,
    formaPagamentoLabel: formattedValue(item, fields.formaPagamento) || CONFIG.choices.formaPagamento[formaPagamentoValue || 0] || valueString(item.formaPagamentoLabel),
    cotacao: Number(item[fields.cotacao] ?? item.cotacao ?? 0),
    cr: valueString(item[fields.cr] || item.cr),
    categoriaItemValue: Number(item[fields.categoriaItem] ?? item.categoriaItemValue ?? 0) || null
  };
}

export function applyDriverDisplayLabels<T extends { motoristaId?: string | null; motoristaLabel?: string }>(items: T[], drivers: Driver[]): T[] {
  const labelsByDriverId = new Map(drivers.map((driver) => [driver.id, displayDriverName(driver)]));
  return items.map((item) => {
    const label = item.motoristaId ? labelsByDriverId.get(item.motoristaId) : "";
    return label ? { ...item, motoristaLabel: label } : item;
  });
}

export function normalizePassengerLink(item: RawRecord): PassengerLink {
  const fields = CONFIG.fields.servicoPassageiro;
  return {
    id: valueString(item[fields.id] || item.id),
    serviceId: valueString(item[fields.lookupGeral] || item.serviceId),
    passengerId: valueString(item[fields.lookupPassageiro] || item.passengerId),
    passengerLabel: formattedValue(item, fields.lookupPassageiro) || valueString(item.passengerLabel),
    order: Number(item[fields.ordem] ?? item.order ?? 0),
    address: valueString(item[fields.endereco] || item.address)
  };
}

export function normalizeSwap(item: RawRecord): Swap {
  const fields = CONFIG.fields.trocaCarro;
  const typeValue = Number(item[fields.tipo] ?? item.typeValue ?? 0) || null;
  const statusValue = Number(item[fields.status] ?? item.statusValue ?? 0) || null;
  return {
    id: valueString(item[fields.id] || item.id),
    rowVersion: valueString(item["@odata.etag"] || item.rowVersion).replace(/^W\/\"|\"$/g, ""),
    start: valueString(item[fields.inicioJanela] || item.start),
    end: valueString(item[fields.fimJanela] || item.end),
    typeValue,
    typeLabel: formattedValue(item, fields.tipo) || CONFIG.choices.tipoTroca[typeValue || 0] || valueString(item.typeLabel),
    statusValue,
    statusLabel: formattedValue(item, fields.status) || CONFIG.choices.statusTroca[statusValue || 0] || valueString(item.statusLabel),
    obs: valueString(item[fields.observacao] || item.obs),
    driver1Id: valueString(item[fields.lookupMotorista1] || item.driver1Id) || null,
    driver1Label: formattedValue(item, fields.lookupMotorista1) || valueString(item.driver1Label),
    driver2Id: valueString(item[fields.lookupMotorista2] || item.driver2Id) || null,
    driver2Label: formattedValue(item, fields.lookupMotorista2) || valueString(item.driver2Label),
    vehicle1Id: valueString(item[fields.lookupVeiculo1] || item.vehicle1Id) || null,
    vehicle1Label: formattedValue(item, fields.lookupVeiculo1) || valueString(item.vehicle1Label),
    vehicle2Id: valueString(item[fields.lookupVeiculo2] || item.vehicle2Id) || null,
    vehicle2Label: formattedValue(item, fields.lookupVeiculo2) || valueString(item.vehicle2Label),
    windowModeValue: Number(item[fields.modoJanela] ?? item.windowModeValue ?? 0) || null,
    location: valueString(item[fields.local] || item.location),
    windowAlert: valueString(item[fields.alertaJanela] || item.windowAlert),
    driver1AfterId: valueString(item[fields.lookupM1DepoisDe] || item.driver1AfterId) || null,
    driver1BeforeId: valueString(item[fields.lookupM1AntesDe] || item.driver1BeforeId) || null,
    driver2AfterId: valueString(item[fields.lookupM2DepoisDe] || item.driver2AfterId) || null,
    driver2BeforeId: valueString(item[fields.lookupM2AntesDe] || item.driver2BeforeId) || null,
    locationId: valueString(item[fields.lookupLocalBase] || item.locationId) || null,
    locationLabel: formattedValue(item, fields.lookupLocalBase) || valueString(item.locationLabel)
  };
}

export function normalizePossession(item: RawRecord): Possession {
  const fields = CONFIG.fields.posseVeiculo;
  return {
    id: valueString(item[fields.id] || item.id),
    start: valueString(item[fields.inicio] || item.start),
    end: valueString(item[fields.fim] || item.end) || null,
    driverId: valueString(item[fields.lookupMotorista] || item.driverId) || null,
    driverLabel: formattedValue(item, fields.lookupMotorista) || valueString(item.driverLabel),
    vehicleId: valueString(item[fields.lookupVeiculo] || item.vehicleId) || null,
    vehicleLabel: formattedValue(item, fields.lookupVeiculo) || valueString(item.vehicleLabel),
    locationId: valueString(item[fields.lookupLocalBase] || item.locationId) || null,
    locationLabel: formattedValue(item, fields.lookupLocalBase) || valueString(item.locationLabel)
  };
}
