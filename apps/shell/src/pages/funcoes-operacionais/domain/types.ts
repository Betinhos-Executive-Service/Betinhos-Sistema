export type ViewName = "driver" | "clone" | "vehicle";
export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Driver {
  id: string;
  name: string;
  nickname: string;
  microsoftEmail?: string;
  hasActiveSystemUser?: boolean | null;
  employmentTypeValue?: number | null;
  employmentTypeLabel?: string;
  predictedVehicleId?: string | null;
  predictedVehicle?: Vehicle | null;
}

export interface Vehicle {
  id: string;
  model: string;
  color: string;
  plate: string;
  label: string;
  ownershipValue?: number | null;
  ownershipLabel?: string;
  armored?: boolean;
  rentalSupplier?: string;
  rentalEnd?: string | null;
  predictedDriverId?: string | null;
  predictedDriver?: Driver | null;
  predictedLocationId?: string | null;
}

export interface BaseLocation {
  id: string;
  name: string;
  address: string;
  mapUrl: string;
}

export interface Service {
  id: string;
  readableId: string;
  dataSaida: string;
  previsaoRetorno: string | null;
  statusValue: number | null;
  statusLabel: string;
  statusFaturamentoValue: number | null;
  statusFaturamentoLabel: string;
  tipoServicoValue: number | null;
  tipoServicoLabel: string;
  tipoVeiculoValue: number | null;
  tipoVeiculoLabel: string;
  clienteId: string | null;
  clienteLabel: string;
  solicitanteId: string | null;
  solicitanteLabel: string;
  motoristaId: string | null;
  motoristaLabel: string;
  veiculoId: string | null;
  veiculoLabel: string;
  destino: string;
  enderecoSaida: string;
  obsOperacao: string;
  obsInterna: string;
  paxView: string;
  trajeto: string;
  perfilPassageiro: string;
  email: string;
  receberValue: boolean | null;
  formaPagamentoValue: number | null;
  formaPagamentoLabel: string;
  cotacao: number | null;
  cr: string;
  categoriaItemValue: number | null;
}

export interface PassengerLink {
  id: string;
  serviceId: string;
  passengerId: string;
  passengerLabel: string;
  order: number;
  address: string;
}

export interface Swap {
  id: string;
  rowVersion?: string;
  start: string;
  end: string;
  typeValue: number | null;
  typeLabel: string;
  statusValue: number | null;
  statusLabel: string;
  obs: string;
  driver1Id: string | null;
  driver1Label: string;
  driver2Id: string | null;
  driver2Label: string;
  vehicle1Id: string | null;
  vehicle1Label: string;
  vehicle2Id: string | null;
  vehicle2Label: string;
  windowModeValue?: number | null;
  location?: string;
  windowAlert?: string;
  driver1AfterId?: string | null;
  driver1BeforeId?: string | null;
  driver2AfterId?: string | null;
  driver2BeforeId?: string | null;
  locationId: string | null;
  locationLabel: string;
}

export type VehicleWindowMode = "fixed" | "between";

export interface Possession {
  id: string;
  start: string;
  end: string | null;
  driverId: string | null;
  driverLabel: string;
  vehicleId: string | null;
  vehicleLabel: string;
  locationId: string | null;
  locationLabel: string;
}

export interface CloneDraft {
  date: string;
  /** Datas (yyyy-mm-dd) escolhidas para os novos pedidos. */
  dates: string[];
  hour: string;
  minute: string;
  driverId: string;
  obsOperacao: string;
  obsInterna: string;
}

export interface VehicleForm {
  typeValue: string;
  executionMode: "schedule" | "now" | "past";
  programAutomatically: boolean;
  actualDate: string;
  actualHour: string;
  actualMinute: string;
  startDate: string;
  startHour: string;
  startMinute: string;
  endDate: string;
  endHour: string;
  endMinute: string;
  driver1Id: string;
  driver2Id: string;
  baseVehicleId: string;
  windowMode?: VehicleWindowMode;
  driver1AfterId?: string;
  driver1BeforeId?: string;
  driver2AfterId?: string;
  driver2BeforeId?: string;
  location?: string;
  locationId: string;
  obs: string;
}

export interface VehiclePreview {
  start: Date;
  end: Date;
  typeValue: number;
  typeLabel: string;
  executionMode: "schedule" | "now" | "past";
  programAutomatically: boolean;
  actualAt: Date | null;
  driver1Id: string;
  driver1Label: string;
  driver2Id: string;
  driver2Label: string;
  vehicle1Id: string;
  vehicle1Label: string;
  vehicle2Id: string;
  vehicle2Label: string;
  windowMode?: VehicleWindowMode;
  driver1AfterId?: string;
  driver1BeforeId?: string;
  driver2AfterId?: string;
  driver2BeforeId?: string;
  location?: string;
  locationId: string;
  locationLabel: string;
  obs: string;
  summary: string;
}

/**
 * Estado que as regras puras leem: filtros das listas, formulário da troca de carro e os dados carregados.
 * (No WebResource era o `AppState` inteiro; aqui só o que a lógica usa.)
 */
export interface AppState {
  driver: { query: string; startDate: string };
  clone: { query: string };
  vehicle: { form: VehicleForm; editId?: string };
  data: DashboardData;
}

export interface DashboardData {
  drivers: Driver[];
  vehicles: Vehicle[];
  services: Service[];
  passengerLinks: PassengerLink[];
  swaps: Swap[];
  possessions: Possession[];
  locations: BaseLocation[];
}

export type RawRecord = Record<string, unknown>;

export interface CloneServiceInput {
  originalId: string;
  original: Service;
  dataSaida: Date;
  driverId: string;
  obsOperacao: string;
  obsInterna: string;
  passengerLinks: PassengerLink[];
}

export type ScheduleSwapInput = {
  preview: VehiclePreview;
  start: Date;
  end: Date;
  typeValue: number;
  obs: string;
  summary: string;
  programAutomatically: boolean;
  effectiveAt: Date | null;
};

export type SwapWindowInput = {
  windowMode?: VehicleWindowMode;
  driver1AfterId?: string;
  driver1BeforeId?: string;
  driver2AfterId?: string;
  driver2BeforeId?: string;
  location?: string;
};

export type SwapUpdateInput = SwapWindowInput & {
  id: string;
  rowVersion: string;
  start: Date;
  end: Date;
  obs: string;
};

export type LocationInput = { name: string; address: string; mapUrl: string };
