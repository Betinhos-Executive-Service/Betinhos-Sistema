// Banco em memória do modo mock (pnpm dev / testes): mesma semente do WebResource (5 motoristas, 6 veículos, 2 locais,
// serviços de exemplo, 1 troca Confirmada e 6 posses) e as mesmas mutações (duplicar, agendar com ajuste de posse e
// Geral 13000+n, reverter com troca inversa).
import { CONFIG } from "../domain/config";
import {
  applyDriverDisplayLabels, normalizeDriver, normalizeLocation, normalizePassengerLink, normalizePossession, normalizeService, normalizeSwap,
  normalizeVehicle, type RawRecord,
} from "../domain/normalizers";
import {
  SWAP_STATUS_CANCELED, SWAP_STATUS_CONCLUDED, SWAP_STATUS_CONFIRMED, SWAP_STATUS_PROGRAMMED, WINDOW_MODE_BETWEEN, WINDOW_MODE_FIXED, cleanId,
} from "../domain/payloads";
import type { BaseLocation, Driver, PassengerLink, Possession, Service, Swap, Vehicle, VehiclePreview } from "../domain/types";
import { addDays, displayDriverName, startOfDay, uid } from "../domain/utils";
import type { Source } from "./source";

/** Troca semeada (GUID, para abrir por `?troca=` como no Dataverse). */
export const MOCK_SWAP_ID = "5a0c1d2e-0000-4000-8000-000000000001";

/** Ids de troca do mock também são GUID: a rota só aceita GUID em `troca=`. */
const guid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : uid("swp"));

export interface MockStore {
  drivers: Driver[];
  vehicles: Vehicle[];
  services: Service[];
  passengerLinks: PassengerLink[];
  swaps: Swap[];
  possessions: Possession[];
  locations: BaseLocation[];
}

function serviceAt(offsetDays: number, hour: number, minute: number): string {
  const date = addDays(startOfDay(new Date()), offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function createDrivers(): Driver[] {
  return [
    { id: "drv-001", name: "Bruno Costa", nickname: "Bruno", microsoftEmail: "bruno@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" },
    { id: "drv-002", name: "Carla Freitas", nickname: "Carla", microsoftEmail: "carla@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" },
    { id: "drv-003", name: "Diego Nunes", nickname: "Diego", microsoftEmail: "diego@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" },
    { id: "drv-004", name: "Fernando Prado", nickname: "Fernando", microsoftEmail: "fernando@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" },
    { id: "drv-005", name: "Helena Rocha", nickname: "Helena", microsoftEmail: "helena@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" }
  ];
}

function createVehicles(): Vehicle[] {
  return [
    { id: "veh-001", model: "Corolla", color: "Preto", plate: "BET1A23", label: "Corolla • BET1A23" },
    { id: "veh-002", model: "Spin", color: "Prata", plate: "BET4C56", label: "Spin • BET4C56" },
    { id: "veh-003", model: "Compass", color: "Cinza", plate: "BET7D89", label: "Compass • BET7D89" },
    { id: "veh-004", model: "Van", color: "Branco", plate: "BET3E12", label: "Van • BET3E12" },
    { id: "veh-005", model: "Fusion Blindado", color: "Preto", plate: "BET9F34", label: "Fusion Blindado • BET9F34", armored: true },
    { id: "veh-006", model: "Audi A6", color: "Preto", plate: "LOC2B45", label: "Audi A6 • LOC2B45", ownershipValue: 100000001, ownershipLabel: "Alugado", armored: true, rentalSupplier: "Locadora Blindados SP", rentalEnd: serviceAt(20, 18, 0) }
  ];
}

function createLocations(): BaseLocation[] {
  return [
    { id: "loc-001", name: "Escritório", address: "Estacionamento do escritório Betinhos", mapUrl: "" },
    { id: "loc-002", name: "Casa do Betinho", address: "Garagem da casa do Betinho", mapUrl: "" }
  ];
}

function serviceBase(overrides: Partial<Service>): Service {
  return {
    id: "",
    readableId: "",
    dataSaida: "",
    previsaoRetorno: null,
    statusValue: 202410001,
    statusLabel: "Confirmado",
    statusFaturamentoValue: 202410005,
    statusFaturamentoLabel: "Pendente",
    tipoServicoValue: 202410001,
    tipoServicoLabel: "São Paulo",
    tipoVeiculoValue: 202410001,
    tipoVeiculoLabel: "Executivo",
    clienteId: null,
    clienteLabel: "",
    solicitanteId: null,
    solicitanteLabel: "",
    motoristaId: null,
    motoristaLabel: "",
    veiculoId: null,
    veiculoLabel: "",
    destino: "",
    enderecoSaida: "",
    obsOperacao: "",
    obsInterna: "",
    paxView: "",
    trajeto: "",
    perfilPassageiro: "",
    email: "",
    receberValue: true,
    formaPagamentoValue: 202410001,
    formaPagamentoLabel: "Pedido de compra",
    cotacao: 0,
    cr: "",
    categoriaItemValue: 100000000,
    ...overrides
  };
}

function createServices(drivers: Driver[], vehicles: Vehicle[]): Service[] {
  return [
    serviceBase({
      id: "srv-001",
      readableId: "11482",
      dataSaida: serviceAt(0, 8, 30),
      previsaoRetorno: serviceAt(0, 11, 0),
      clienteId: "cli-001",
      clienteLabel: "Embraer Diretoria Técnica",
      solicitanteId: "sol-001",
      solicitanteLabel: "Ana Lopes",
      motoristaId: drivers[2].id,
      motoristaLabel: drivers[2].name,
      veiculoId: vehicles[0].id,
      veiculoLabel: vehicles[0].label,
      destino: "Aeroporto Internacional de Guarulhos - Terminal 3, embarque internacional",
      enderecoSaida: "Rua Funchal, 418 - Vila Olímpia, São Paulo - SP, portaria corporativa B2",
      paxView: "Mariana Gomes + 2 pax",
      trajeto: "Corporativo",
      obsOperacao: "Executivo VIP. Confirmar acesso pela garagem e manter placa informada na portaria.",
      obsInterna: "Bagagem grande e notebook de demonstração.",
      perfilPassageiro: "Executivo",
      email: "mariana@empresa.com",
      cotacao: 420,
      cr: "CR-7780",
      tipoServicoValue: 202410000
    }),
    serviceBase({
      id: "srv-002",
      readableId: "11483",
      dataSaida: serviceAt(0, 9, 45),
      previsaoRetorno: serviceAt(0, 12, 10),
      clienteId: "cli-002",
      clienteLabel: "Tenaris Confidencial",
      solicitanteId: "sol-002",
      solicitanteLabel: "Bianca Alves",
      motoristaId: drivers[4].id,
      motoristaLabel: drivers[4].name,
      veiculoId: vehicles[1].id,
      veiculoLabel: vehicles[1].label,
      destino: "Alameda Rio Negro, 585 - Alphaville Industrial, Barueri - SP, Torre Jacarandá",
      enderecoSaida: "Hotel Unique - Avenida Brigadeiro Luís Antônio, 4700, Jardim Paulista, São Paulo - SP",
      paxView: "Leonardo Sá + Aline Yamamoto",
      trajeto: "Reunião",
      obsOperacao: "Coletar bagagem no concierge. Passageiro prefere confirmação por WhatsApp.",
      obsInterna: "Sem motorista atribuído para testar alerta.",
      tipoVeiculoValue: 202410005,
      cotacao: 280,
      cr: "CR-7781"
    }),
    serviceBase({
      id: "srv-003",
      readableId: "11484",
      dataSaida: serviceAt(0, 16, 5),
      previsaoRetorno: serviceAt(0, 19, 30),
      clienteId: "cli-006",
      clienteLabel: "Hospital Sírio-Libanês Conselho",
      solicitanteId: "sol-006",
      solicitanteLabel: "Fernanda Martins",
      motoristaId: drivers[4].id,
      motoristaLabel: drivers[4].name,
      veiculoId: null,
      veiculoLabel: "",
      destino: "Residencial Cidade Jardim - Avenida Magalhães de Castro, 12000, Torre Ipê, São Paulo - SP",
      enderecoSaida: "Hospital Sírio-Libanês - Rua Dona Adma Jafet, 91, Bela Vista, São Paulo - SP",
      paxView: "Sofia Albuquerque",
      trajeto: "Retorno residencial",
      obsOperacao: "Passageira com agenda médica. Evitar solavancos e confirmar elevador privativo.",
      obsInterna: "Veículo ainda não confirmado.",
      cotacao: 390,
      cr: "CR-7785"
    }),
    serviceBase({
      id: "srv-004",
      readableId: "11485",
      dataSaida: serviceAt(1, 7, 15),
      previsaoRetorno: serviceAt(1, 10, 20),
      clienteLabel: "BTG Pactual Roadshow",
      solicitanteLabel: "Cláudia Sampaio",
      motoristaId: drivers[0].id,
      motoristaLabel: drivers[0].name,
      veiculoId: vehicles[2].id,
      veiculoLabel: vehicles[2].label,
      destino: "Hotel Royal Palm Plaza - Avenida Royal Palm Plaza, 277, Campinas - SP",
      enderecoSaida: "Avenida Brigadeiro Faria Lima, 3477 - Itaim Bibi, São Paulo - SP",
      paxView: "Patrícia Serra + 3 pax",
      trajeto: "Roadshow",
      obsOperacao: "Roteiro com parada rápida em Jundiaí.",
      obsInterna: "Cliente sensível a atraso. Monitorar trânsito.",
      tipoServicoValue: 202410008,
      tipoVeiculoValue: 202410002,
      cotacao: 610,
      cr: "CR-7782"
    }),
    serviceBase({
      id: "srv-005",
      readableId: "11486",
      dataSaida: serviceAt(2, 14, 30),
      previsaoRetorno: serviceAt(2, 17, 0),
      clienteLabel: "Siemens Comitê Executivo",
      solicitanteLabel: "Eduarda Prado",
      motoristaId: drivers[1].id,
      motoristaLabel: drivers[1].name,
      veiculoId: vehicles[4].id,
      veiculoLabel: vehicles[4].label,
      destino: "Aeroporto de Congonhas - embarque remoto",
      enderecoSaida: "Rua Gomes de Carvalho, 1510 - Vila Olímpia, São Paulo - SP",
      paxView: "Thiago Diniz + Renata Vasconcelos",
      trajeto: "Executivo",
      obsOperacao: "Atender lounge. Manter discrição.",
      obsInterna: "Prioridade alta.",
      tipoServicoValue: 202410007,
      tipoVeiculoValue: 202410002,
      cotacao: 510,
      cr: "CR-7784"
    })
  ];
}

function createPassengerLinks(services: Service[]): PassengerLink[] {
  const names = [
    ["Mariana Gomes", "Leonardo Sá", "Ricardo Menon"],
    ["Leonardo Sá", "Aline Yamamoto"],
    ["Sofia Albuquerque"],
    ["Patrícia Serra", "Eduardo Miranda", "Camila Pires"],
    ["Thiago Diniz", "Renata Vasconcelos"]
  ];
  return names.flatMap((passengers, serviceIndex) =>
    passengers.map((passengerLabel, passengerOrder) => ({
      id: `spl-${serviceIndex + 1}-${passengerOrder + 1}`,
      serviceId: services[serviceIndex].id,
      passengerId: `pax-${serviceIndex + 1}-${passengerOrder + 1}`,
      passengerLabel,
      order: passengerOrder + 1,
      address: services[serviceIndex].enderecoSaida
    }))
  );
}

function createPossessions(drivers: Driver[], vehicles: Vehicle[]): Possession[] {
  const start = addDays(startOfDay(new Date()), -30).toISOString();
  return [
    { id: "pos-001", start, end: null, driverId: drivers[0].id, driverLabel: drivers[0].name, vehicleId: vehicles[0].id, vehicleLabel: vehicles[0].plate },
    { id: "pos-002", start, end: null, driverId: drivers[1].id, driverLabel: drivers[1].name, vehicleId: vehicles[4].id, vehicleLabel: vehicles[4].plate },
    { id: "pos-003", start, end: null, driverId: drivers[2].id, driverLabel: drivers[2].name, vehicleId: vehicles[2].id, vehicleLabel: vehicles[2].plate },
    { id: "pos-004", start, end: null, driverId: drivers[3].id, driverLabel: drivers[3].name, vehicleId: vehicles[3].id, vehicleLabel: vehicles[3].plate },
    { id: "pos-005", start, end: null, driverId: drivers[4].id, driverLabel: drivers[4].name, vehicleId: vehicles[1].id, vehicleLabel: vehicles[1].plate, locationId: null, locationLabel: "" },
    { id: "pos-006", start, end: null, driverId: null, driverLabel: "Base", vehicleId: vehicles[5].id, vehicleLabel: vehicles[5].plate, locationId: "loc-001", locationLabel: "Escritório" }
  ].map((item) => ({ locationId: null, locationLabel: "", ...item }));
}

function createSwaps(drivers: Driver[], vehicles: Vehicle[]): Swap[] {
  return [
    {
      id: MOCK_SWAP_ID,
      start: serviceAt(0, 13, 0),
      end: serviceAt(0, 13, 40),
      typeValue: 100000000,
      typeLabel: "Troca",
      statusValue: 100000001,
      statusLabel: "Confirmada",
      obs: "Rodízio rápido no meio da operação",
      driver1Id: drivers[0].id,
      driver1Label: drivers[0].name,
      driver2Id: drivers[1].id,
      driver2Label: drivers[1].name,
      vehicle1Id: vehicles[0].id,
      vehicle1Label: vehicles[0].plate,
      vehicle2Id: vehicles[4].id,
      vehicle2Label: vehicles[4].plate,
      locationId: null,
      locationLabel: ""
    }
  ];
}

export function buildSeedDb(): MockStore {
  const drivers = createDrivers();
  const vehicles = createVehicles();
  const services = createServices(drivers, vehicles);
  return {
    drivers,
    vehicles,
    services,
    passengerLinks: createPassengerLinks(services),
    swaps: createSwaps(drivers, vehicles),
    possessions: createPossessions(drivers, vehicles),
    locations: createLocations()
  };
}

export function applyMockPossessionTransition(store: { possessions: Possession[] }, preview: VehiclePreview, effectiveAt: string) {
  const open = store.possessions.filter((possession) => !possession.end);
  const exact = (driverId: string | null, vehicleId: string, label: string) => {
    const matches = open.filter((possession) => (possession.driverId || null) === driverId && possession.vehicleId === vehicleId);
    if (matches.length !== 1) throw new Error(`${label}: era esperada exatamente uma posse aberta.`);
    return matches[0];
  };
  const assertDriverFree = (driverId: string, label: string) => {
    if (open.some((possession) => possession.driverId === driverId)) throw new Error(`${label} já possui veículo.`);
  };
  const close = (id: string) => {
    store.possessions = store.possessions.map((possession) => possession.id === id ? { ...possession, end: effectiveAt } : possession);
  };
  const create = (driverId: string | null, driverLabel: string, vehicleId: string, vehicleLabel: string, locationId: string | null = null, locationLabel = "") => {
    store.possessions.push({ id: uid("pos"), start: effectiveAt, end: null, driverId, driverLabel, vehicleId, vehicleLabel, locationId, locationLabel });
  };

  if (preview.typeValue === 100000002) {
    assertDriverFree(preview.driver1Id, "Motorista da retirada");
    close(exact(null, preview.vehicle2Id, "Veículo da base").id);
    create(preview.driver1Id, preview.driver1Label, preview.vehicle2Id, preview.vehicle2Label);
    return;
  }
  if (preview.typeValue === 100000001) {
    close(exact(preview.driver1Id, preview.vehicle1Id, "Motorista da devolução").id);
    create(null, "Base", preview.vehicle1Id, preview.vehicle1Label, preview.locationId || null, preview.locationLabel);
    return;
  }

  const first = exact(preview.driver1Id, preview.vehicle1Id, "Motorista 1");
  if (!preview.vehicle2Id) {
    assertDriverFree(preview.driver2Id, "Motorista 2");
    close(first.id);
    create(preview.driver2Id, preview.driver2Label, preview.vehicle1Id, preview.vehicle1Label);
    return;
  }
  const second = exact(preview.driver2Id, preview.vehicle2Id, "Motorista 2");
  close(first.id);
  close(second.id);
  create(preview.driver1Id, preview.driver1Label, preview.vehicle2Id, preview.vehicle2Label);
  create(preview.driver2Id, preview.driver2Label, preview.vehicle1Id, preview.vehicle1Label);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const raw = <T,>(item: T) => item as unknown as RawRecord;

/** Fonte mock: cada instância tem o seu banco (a página cria uma por host). `delay` simula a rede. */
export function createMockSource(store: MockStore = buildSeedDb(), delay = 0): Source {
  const tick = () => (delay ? wait(delay) : Promise.resolve());
  const findSwap = (id: string) => {
    const swap = store.swaps.find((item) => item.id === id);
    if (!swap) throw new Error("Troca não encontrada.");
    return swap;
  };

  return {
    mock: true,
    async load() {
      await tick();
      const drivers = store.drivers.map((item) => normalizeDriver(raw(item)));
      const services = store.services.map((item) => normalizeService(raw(item)));
      return {
        drivers,
        vehicles: store.vehicles.map((item) => normalizeVehicle(raw(item))),
        services: applyDriverDisplayLabels(services, drivers),
        passengerLinks: store.passengerLinks.map((item) => normalizePassengerLink(raw(item))),
        swaps: store.swaps.map((item) => normalizeSwap(raw(item))),
        possessions: store.possessions.map((item) => normalizePossession(raw(item))),
        locations: store.locations.map((item) => normalizeLocation(raw(item)))
      };
    },
    async changeDriver(serviceId, driverId) {
      await tick();
      const driver = driverId ? store.drivers.find((item) => item.id === driverId) || null : null;
      store.services = store.services.map((service) => service.id === serviceId ? { ...service, motoristaId: driver?.id || null, motoristaLabel: displayDriverName(driver) } : service);
    },
    async cloneService(input) {
      await tick();
      const original = store.services.find((service) => service.id === input.originalId);
      if (!original) throw new Error("Serviço original não encontrado no mock.");
      const driver = store.drivers.find((item) => item.id === input.driverId) || null;
      const newServiceId = uid("srv");
      store.services.unshift({
        ...original,
        id: newServiceId,
        readableId: String(12000 + store.services.length),
        dataSaida: input.dataSaida.toISOString(),
        motoristaId: driver?.id || null,
        motoristaLabel: displayDriverName(driver),
        veiculoId: null,
        veiculoLabel: "",
        obsOperacao: input.obsOperacao,
        obsInterna: input.obsInterna,
        statusValue: 202410001
      });
      store.passengerLinks.push(...store.passengerLinks.filter((item) => item.serviceId === original.id).map((item) => ({ ...item, id: uid("spl"), serviceId: newServiceId })));
      return newServiceId;
    },
    async createLocation(input) {
      await tick();
      const name = input.name.trim();
      if (!name) throw new Error("Informe o nome do local.");
      const location: BaseLocation = { id: uid("loc"), name, address: input.address.trim(), mapUrl: input.mapUrl.trim() };
      store.locations = [...store.locations, location];
      return location;
    },
    async scheduleSwap(input) {
      await tick();
      const scheduledStatus = input.programAutomatically ? SWAP_STATUS_PROGRAMMED : SWAP_STATUS_CONFIRMED;
      const swapId = guid();
      // A posse muda antes de gravar: se a transição falhar, nada fica pela metade.
      if (input.effectiveAt) applyMockPossessionTransition(store, input.preview, input.effectiveAt.toISOString());
      store.swaps.push({
        id: swapId,
        start: input.start.toISOString(),
        end: input.end.toISOString(),
        typeValue: input.typeValue,
        typeLabel: CONFIG.choices.tipoTroca[input.typeValue] || "Troca",
        statusValue: input.effectiveAt ? SWAP_STATUS_CONCLUDED : scheduledStatus,
        statusLabel: input.effectiveAt ? "Concluída" : input.programAutomatically ? "Programada" : "Confirmada",
        obs: input.obs,
        driver1Id: input.preview.driver1Id,
        driver1Label: input.preview.driver1Label,
        driver2Id: input.preview.driver2Id || null,
        driver2Label: input.preview.driver2Label,
        vehicle1Id: input.preview.vehicle1Id || null,
        vehicle1Label: input.preview.vehicle1Label,
        vehicle2Id: input.preview.vehicle2Id || null,
        vehicle2Label: input.preview.vehicle2Label,
        windowModeValue: input.preview.windowMode === "between" ? WINDOW_MODE_BETWEEN : WINDOW_MODE_FIXED,
        location: input.preview.location || "",
        windowAlert: "",
        driver1AfterId: input.preview.driver1AfterId || null,
        driver1BeforeId: input.preview.driver1BeforeId || null,
        driver2AfterId: input.preview.driver2AfterId || null,
        driver2BeforeId: input.preview.driver2BeforeId || null,
        locationId: input.preview.locationId || null,
        locationLabel: input.preview.locationLabel
      });
      const pickup = input.preview.typeValue === 100000002;
      store.services.unshift({
        id: uid("srv"),
        readableId: String(13000 + store.services.length),
        dataSaida: input.start.toISOString(),
        previsaoRetorno: input.end.toISOString(),
        statusValue: input.effectiveAt ? 202410008 : 202410005,
        statusLabel: input.effectiveAt ? "Concluído" : "Programado",
        statusFaturamentoValue: 202410011,
        statusFaturamentoLabel: "Não Faturável",
        tipoServicoValue: 202410009,
        tipoServicoLabel: "Dentro de São Paulo",
        tipoVeiculoValue: null,
        tipoVeiculoLabel: "",
        clienteId: null,
        clienteLabel: "",
        solicitanteId: null,
        solicitanteLabel: "",
        motoristaId: input.preview.driver1Id || null,
        motoristaLabel: input.preview.driver1Label,
        veiculoId: (pickup ? input.preview.vehicle2Id : input.preview.vehicle1Id) || null,
        veiculoLabel: pickup ? input.preview.vehicle2Label : input.preview.vehicle1Label,
        destino: input.obs,
        enderecoSaida: input.obs,
        obsOperacao: input.obs,
        obsInterna: input.summary,
        paxView: input.summary,
        trajeto: input.obs,
        perfilPassageiro: "",
        email: "",
        receberValue: false,
        formaPagamentoValue: null,
        formaPagamentoLabel: "",
        cotacao: 0,
        cr: "",
        categoriaItemValue: 100000002
      });
      return swapId;
    },
    async loadSwap(id) {
      await tick();
      return normalizeSwap(raw(findSwap(id)));
    },
    async updateSwap(input) {
      await tick();
      const current = findSwap(input.id);
      Object.assign(current, { start: input.start.toISOString(), end: input.end.toISOString(), obs: input.obs });
      if (input.windowMode) {
        const between = input.windowMode === "between";
        Object.assign(current, {
          windowModeValue: between ? WINDOW_MODE_BETWEEN : WINDOW_MODE_FIXED,
          location: input.location || "",
          driver1AfterId: between ? input.driver1AfterId || null : null,
          driver1BeforeId: between ? input.driver1BeforeId || null : null,
          driver2AfterId: between ? input.driver2AfterId || null : null,
          driver2BeforeId: between ? input.driver2BeforeId || null : null
        });
      }
    },
    async cancelSwap(id) {
      await tick();
      const swap = findSwap(cleanId(id));
      swap.statusValue = SWAP_STATUS_CANCELED;
      swap.statusLabel = CONFIG.choices.statusTroca[SWAP_STATUS_CANCELED] || "Atualizada";
    },
    async revertSwap(id, reason = "Reversão operacional da troca.", effectiveAt) {
      await tick();
      const swap = findSwap(cleanId(id));
      const at = (effectiveAt ?? new Date()).toISOString();
      // Troca inversa concluída: na Troca inverte V1 e V2; no Repasse inverte M1 e M2.
      const isSwap = swap.typeValue === 100000000;
      const compensation: Swap = {
        ...swap,
        id: guid(),
        start: at,
        end: at,
        statusValue: SWAP_STATUS_CONCLUDED,
        statusLabel: CONFIG.choices.statusTroca[SWAP_STATUS_CONCLUDED] || "Concluída",
        obs: reason,
        vehicle1Id: isSwap ? swap.vehicle2Id : swap.vehicle1Id,
        vehicle1Label: isSwap ? swap.vehicle2Label : swap.vehicle1Label,
        vehicle2Id: isSwap ? swap.vehicle1Id : swap.vehicle2Id,
        vehicle2Label: isSwap ? swap.vehicle1Label : swap.vehicle2Label,
        ...(swap.typeValue === 100000003 ? { driver1Id: swap.driver2Id, driver1Label: swap.driver2Label, driver2Id: swap.driver1Id, driver2Label: swap.driver1Label } : {})
      };
      const preview: VehiclePreview = {
        start: new Date(at), end: new Date(at), typeValue: compensation.typeValue || 100000000,
        typeLabel: compensation.typeLabel, executionMode: "past", programAutomatically: false, actualAt: new Date(at),
        driver1Id: compensation.driver1Id || "", driver1Label: compensation.driver1Label,
        driver2Id: compensation.driver2Id || "", driver2Label: compensation.driver2Label,
        vehicle1Id: compensation.vehicle1Id || "", vehicle1Label: compensation.vehicle1Label,
        vehicle2Id: compensation.vehicle2Id || "", vehicle2Label: compensation.vehicle2Label,
        locationId: compensation.locationId || "", locationLabel: compensation.locationLabel || "",
        obs: reason, summary: reason
      };
      applyMockPossessionTransition(store, preview, at);
      store.swaps.push(compensation);
    }
  };
}
