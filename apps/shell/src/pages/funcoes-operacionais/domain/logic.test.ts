/* eslint-disable @typescript-eslint/no-explicit-any */
// Portado de tela-funcoes-operacionais/tests/logic.test.ts (regras de previsão de posse, prévia e validação).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  computeVehiclePlanning,
  buildVehiclePreview,
  createCloneDraft,
  driverServices,
  passengerLinksByService,
  servicePassengerText,
  stripContactPhone
} from "./logic";
import type { AppState, Driver, Possession, Service, Swap, Vehicle } from "./types";
import { defaultVehicleWindow, toDateInputValue, toHourValue, toMinuteValue } from "./utils";

// Os horários dos casos são de Brasília (UTC-3); os campos do formulário são locais. Converte para o fuso de quem roda.
function brtFields(prefix: "start" | "end" | "actual", date: string, hour: string, minute: string) {
  const at = new Date(`${date}T${hour}:${minute}:00-03:00`);
  return { [`${prefix}Date`]: toDateInputValue(at), [`${prefix}Hour`]: toHourValue(at), [`${prefix}Minute`]: toMinuteValue(at) } as Record<string, string>;
}

// O original dependia do relógio real (trocas de 26 a 30/06/2026 "ativas"); aqui o dia fica fixo.
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-06-26T03:00:00.000Z")); });
afterEach(() => { vi.useRealTimers(); });

test("default da janela usa o próximo intervalo de cinco minutos e dez minutos de duração", () => {
  expect(defaultVehicleWindow(new Date("2026-08-18T14:07:30"))).toEqual({
    startDate: "2026-08-18",
    startHour: "14",
    startMinute: "10",
    endDate: "2026-08-18",
    endHour: "14",
    endMinute: "20"
  });
});

function service(overrides: Partial<Service>): Service {
  return {
    id: "srv-base",
    readableId: "100",
    dataSaida: "2026-06-26T08:30:00.000Z",
    previsaoRetorno: null,
    statusValue: 202410001,
    statusLabel: "Confirmado",
    statusFaturamentoValue: 202410005,
    statusFaturamentoLabel: "Pendente",
    tipoServicoValue: 202410001,
    tipoServicoLabel: "São Paulo",
    tipoVeiculoValue: 202410001,
    tipoVeiculoLabel: "Executivo",
    clienteId: "cli-1",
    clienteLabel: "Cliente A",
    solicitanteId: "sol-1",
    solicitanteLabel: "Solicitante A",
    motoristaId: "drv-1",
    motoristaLabel: "Diego Nunes",
    veiculoId: "veh-1",
    veiculoLabel: "Corolla - BET1A23",
    destino: "Destino",
    enderecoSaida: "Origem",
    obsOperacao: "Obs operação",
    obsInterna: "Obs interna",
    paxView: "Maria 11 99999-8888",
    trajeto: "Corporativo",
    perfilPassageiro: "",
    email: "",
    receberValue: true,
    formaPagamentoValue: 202410001,
    formaPagamentoLabel: "",
    cotacao: 0,
    cr: "",
    categoriaItemValue: 100000000,
    ...overrides
  };
}

// Formato antigo (AppState inteiro do WebResource): as regras só leem driver/clone/vehicle/data.
function baseState(overrides: Record<string, any> = {}): AppState {
  const drivers: Driver[] = [
    { id: "drv-1", name: "Diego Nunes", nickname: "Diego", microsoftEmail: "diego@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" },
    { id: "drv-2", name: "Helena Rocha", nickname: "Helena", microsoftEmail: "helena@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" }
  ];
  const vehicles: Vehicle[] = [
    { id: "veh-1", model: "Corolla", color: "Preto", plate: "BET1A23", label: "Corolla - BET1A23" },
    { id: "veh-2", model: "Fusion", color: "Preto", plate: "BET9F34", label: "Fusion - BET9F34" }
  ];
  return ({
    view: "driver",
    loading: false,
    loadingMessage: "",
    mode: "mock",
    orgUrl: "",
    validationNote: "",
    transitionKind: "local",
    driver: { query: "", startDate: "2026-06-26" },
    clone: { query: "", selectedServiceId: "", highlightedServiceId: "", draft: null },
    vehicle: {
      form: {
        typeValue: "100000000",
        executionMode: "schedule",
        programAutomatically: true,
        ...brtFields("actual", "2026-06-26", "09", "00"),
        ...brtFields("start", "2026-06-26", "09", "00"),
        ...brtFields("end", "2026-06-26", "09", "30"),
        driver1Id: "drv-1",
        driver2Id: "drv-2",
        baseVehicleId: "",
        locationId: "loc-1",
        obs: "Troca operacional"
      },
      preview: null,
      forceOverlap: false
    },
    data: {
      drivers,
      vehicles,
      services: [
        service({ id: "srv-1", readableId: "11482", dataSaida: "2026-06-26T08:30:00.000Z", motoristaLabel: "Diego Nunes" }),
        service({ id: "srv-2", readableId: "11483", dataSaida: "2026-06-27T09:45:00.000Z", motoristaId: "drv-2", motoristaLabel: "Helena Rocha", clienteLabel: "Tenaris" }),
        service({ id: "srv-3", readableId: "11484", dataSaida: "2026-06-30T09:45:00.000Z", motoristaLabel: "Fora da janela" })
      ],
      passengerLinks: [
        { id: "spl-1", serviceId: "srv-1", passengerId: "pax-1", passengerLabel: "Maria Souza 11 99999-8888", order: 2, address: "Origem" },
        { id: "spl-2", serviceId: "srv-1", passengerId: "pax-2", passengerLabel: "João Lima", order: 1, address: "Origem" }
      ],
      swaps: [],
      possessions: [
        { id: "pos-1", start: "2026-06-01T00:00:00.000Z", end: null, driverId: "drv-1", driverLabel: "Diego Nunes", vehicleId: "veh-1", vehicleLabel: "BET1A23" },
        { id: "pos-2", start: "2026-06-01T00:00:00.000Z", end: null, driverId: "drv-2", driverLabel: "Helena Rocha", vehicleId: "veh-2", vehicleLabel: "BET9F34" }
      ].map((item) => ({ locationId: null, locationLabel: "", ...item })),
      locations: [
        { id: "loc-1", name: "Escritório", address: "Rua do Escritório, 100", mapUrl: "" },
        { id: "loc-2", name: "Casa do Betinho", address: "Rua da Casa, 200", mapUrl: "" }
      ]
    },
    toasts: [],
    ...overrides
  }) as unknown as AppState;
}

function swap(overrides: Partial<Swap>): Swap {
  return {
    id: "swp-base",
    start: "2026-06-30T12:00:00.000Z",
    end: "2026-06-30T12:30:00.000Z",
    typeValue: 100000001,
    typeLabel: "Devolução a base",
    statusValue: 202410000,
    statusLabel: "Programada",
    obs: "",
    driver1Id: "drv-1",
    driver1Label: "Diego Nunes",
    driver2Id: null,
    driver2Label: "",
    vehicle1Id: "veh-1",
    vehicle1Label: "BET1A23",
    vehicle2Id: null,
    vehicle2Label: "",
    locationId: null,
    locationLabel: "",
    ...overrides
  };
}

describe("operational logic", () => {
  test("driverServices keeps only the driver window, filters text, and sorts by date", () => {
    vi.setSystemTime(new Date("2026-06-26T03:00:00.000Z"));
    const state = baseState({ driver: { query: "tenaris", startDate: "2026-06-26" } });

    const result = driverServices(state);

    expect(result.map((item) => item.id)).toEqual(["srv-2"]);
  });

  test("passenger details come from relationship rows and phone numbers are removed", () => {
    const state = baseState();
    const links = passengerLinksByService(state, "srv-1");

    expect(links.map((item) => item.passengerLabel)).toEqual(["João Lima", "Maria Souza 11 99999-8888"]);
    expect(stripContactPhone("Solicitante A - 11 98888-7777")).toBe("Solicitante A");
    expect(servicePassengerText(state.data.services[0], links)).toBe("João Lima, Maria Souza");
  });

  test("clone draft and vehicle swap preview preserve current business rules", () => {
    vi.setSystemTime(new Date("2026-06-26T03:00:00.000Z"));
    const state = baseState();

    expect(createCloneDraft(state.data.services[0])).toMatchObject({
      date: "2026-06-26",
      hour: toHourValue("2026-06-26T08:30:00.000Z"),
      minute: "30",
      driverId: "drv-1"
    });
    expect(createCloneDraft(state.data.services[0])).not.toHaveProperty("vehicleId");

    const result = buildVehiclePreview(state);

    expect(result.errors).toEqual([]);
    expect(result.preview).toMatchObject({
      typeValue: 100000000,
      driver1Id: "drv-1",
      driver2Id: "drv-2",
      vehicle1Id: "veh-1",
      vehicle2Id: "veh-2",
      obs: "Troca operacional"
    });
  });

  test("editing a swap ignores its own driver and vehicle window", () => {
    vi.setSystemTime(new Date("2026-06-26T03:00:00.000Z"));
    const state = baseState();
    state.vehicle.editId = "swp-edit";
    state.data.swaps = [swap({
      id: "swp-edit",
      start: "2026-06-26T12:00:00.000Z",
      end: "2026-06-26T12:30:00.000Z",
      typeValue: 100000000,
      driver2Id: "drv-2",
      vehicle2Id: "veh-2"
    })];

    const planning = computeVehiclePlanning(state);

    expect(planning.availableDriver1.map((driver) => driver.id)).toContain("drv-1");
    expect(planning.availableDriver2.map((driver) => driver.id)).toContain("drv-2");
    expect(buildVehiclePreview(state).errors).toEqual([]);
  });

  test("scheduled return updates the predicted possession at its start", () => {
    const state = baseState({
      vehicle: {
        form: {
          typeValue: "100000002",
          executionMode: "schedule",
          programAutomatically: true,
          ...brtFields("actual", "2026-07-02", "09", "00"),
          ...brtFields("start", "2026-07-02", "09", "00"),
          ...brtFields("end", "2026-07-02", "09", "30"),
          driver1Id: "drv-1",
          driver2Id: "",
          baseVehicleId: "veh-1",
          locationId: "loc-1",
          obs: "Retirada operacional"
        },
        preview: null,
        forceOverlap: false
      },
      data: {
        ...baseState().data,
        swaps: [swap({ id: "swp-return" })]
      }
    });

    const planning = computeVehiclePlanning(state);

    expect(planning.driver1?.predictedVehicleId).toBeNull();
    expect(planning.availableDriver1.map((driver) => driver.id)).toContain("drv-1");
    expect(planning.baseVehicles.map((vehicle) => vehicle.id)).toContain("veh-1");
    const previewResult = buildVehiclePreview(state);
    expect(previewResult.errors).toEqual([]);
  });

  test("scheduled return releases driver for a later base pickup but not during the return window", () => {
    const returnSwap = swap({
      id: "swp-return-window",
      start: "2026-07-02T17:00:00.000Z",
      end: "2026-07-02T19:00:00.000Z"
    });
    const base = baseState({
      data: { ...baseState().data, swaps: [returnSwap] }
    });

    const overlapping = baseState({
      ...base,
      vehicle: {
        ...base.vehicle,
        form: {
          ...base.vehicle.form,
          typeValue: "100000002",
          ...brtFields("start", "2026-07-02", "14", "05"),
          ...brtFields("end", "2026-07-02", "14", "35"),
          driver1Id: "drv-1",
          baseVehicleId: "veh-1"
        }
      }
    });
    expect(computeVehiclePlanning(overlapping).availableDriver1.map((driver) => driver.id)).not.toContain("drv-1");

    const afterReturn = baseState({
      ...base,
      vehicle: {
        ...base.vehicle,
        form: {
          ...base.vehicle.form,
          typeValue: "100000002",
          ...brtFields("start", "2026-07-02", "16", "05"),
          ...brtFields("end", "2026-07-02", "16", "35"),
          driver1Id: "drv-1",
          baseVehicleId: "veh-1"
        }
      }
    });
    const planning = computeVehiclePlanning(afterReturn);
    expect(planning.driver1?.predictedVehicleId).toBeNull();
    expect(planning.availableDriver1.map((driver) => driver.id)).toContain("drv-1");
    expect(planning.baseVehicles.map((vehicle) => vehicle.id)).toContain("veh-1");
    const previewResult = buildVehiclePreview(afterReturn);
    expect(previewResult.errors).toEqual([]);
    expect(previewResult.preview).toMatchObject({ driver1Id: "drv-1", vehicle2Id: "veh-1" });
  });

  test("first base pickup is scheduled explicitly without automatic finalization", () => {
    const base = baseState();
    const state = baseState({
      vehicle: {
        form: {
          typeValue: "100000002",
          executionMode: "schedule",
          programAutomatically: true,
          ...brtFields("actual", "2026-07-02", "09", "00"),
          ...brtFields("start", "2026-07-02", "09", "00"),
          ...brtFields("end", "2026-07-02", "09", "30"),
          driver1Id: "drv-1",
          driver2Id: "",
          baseVehicleId: "veh-1",
          locationId: "loc-1",
          obs: "Inicialização operacional"
        },
        preview: null,
        forceOverlap: false
      },
      data: {
        ...base.data,
        swaps: [],
        possessions: base.data.possessions.filter((possession: Possession) => possession.driverId !== "drv-1" && possession.vehicleId !== "veh-1")
      }
    });

    const result = buildVehiclePreview(state);

    expect(result.errors).toEqual([]);
    expect(result.preview).toMatchObject({
      typeValue: 100000002,
      executionMode: "schedule",
      actualAt: null,
      driver1Id: "drv-1",
      vehicle2Id: "veh-1"
    });
  });

  test("vehicle overlap warnings do not block and ignore unrelated drivers or cars", () => {
    const sameDriver = baseState({
      data: {
        ...baseState().data,
        swaps: [
          swap({ id: "swp-overlap-driver", start: "2026-06-26T12:10:00.000Z", end: "2026-06-26T12:20:00.000Z", driver1Id: "drv-1", vehicle1Id: "veh-1" }),
          swap({ id: "swp-overlap-driver-2", start: "2026-06-26T12:15:00.000Z", end: "2026-06-26T12:25:00.000Z", driver1Id: "drv-1", vehicle1Id: "veh-1" })
        ]
      }
    });

    const sameDriverResult = buildVehiclePreview(sameDriver);

    expect(sameDriverResult.errors).toEqual(["O motorista 1 não está disponível para este tipo de troca."]);
    expect(sameDriverResult.overlaps.map((item) => item.id)).toEqual(["swp-overlap-driver", "swp-overlap-driver-2"]);

    const unrelated = baseState({
      data: {
        ...baseState().data,
        drivers: [
          ...baseState().data.drivers,
          { id: "drv-3", name: "Carlos Silva", nickname: "Carlos", microsoftEmail: "carlos@betinhos.com.br", employmentTypeValue: 0, employmentTypeLabel: "Colaborador" }
        ],
        vehicles: [
          ...baseState().data.vehicles,
          { id: "veh-3", model: "Spin", color: "Prata", plate: "BET3C45", label: "Spin - BET3C45" }
        ],
        swaps: [swap({ id: "swp-unrelated", start: "2026-06-26T12:10:00.000Z", end: "2026-06-26T12:20:00.000Z", driver1Id: "drv-3", driver2Id: null, vehicle1Id: "veh-3", vehicle2Id: null })]
      }
    });

    const unrelatedResult = buildVehiclePreview(unrelated);

    expect(unrelatedResult.errors).toEqual([]);
    expect(unrelatedResult.overlaps).toEqual([]);
  });

  test("same-start overlap is an explicit validation error", () => {
    const state = baseState({
      data: {
        ...baseState().data,
        swaps: [swap({ id: "swp-same-start", start: "2026-06-26T12:00:00.000Z", end: "2026-06-26T12:30:00.000Z" })]
      }
    });

    const result = buildVehiclePreview(state);

    expect(result.errors[0]).toBe("N\u00e3o \u00e9 poss\u00edvel agendar duas trocas com o mesmo hor\u00e1rio de in\u00edcio.");
  });

  test("third party or driver without Microsoft email is not finalized automatically", () => {
    const base = baseState();
    const state = baseState({
      vehicle: {
        form: {
          typeValue: "100000002",
          executionMode: "schedule",
          programAutomatically: true,
          ...brtFields("actual", "2026-07-02", "09", "00"),
          ...brtFields("start", "2026-07-02", "09", "00"),
          ...brtFields("end", "2026-07-02", "09", "30"),
          driver1Id: "drv-1",
          driver2Id: "",
          baseVehicleId: "veh-1",
          locationId: "loc-1",
          obs: "Fornecedor com carro"
        },
        preview: null,
        forceOverlap: false
      },
      data: {
        ...base.data,
        drivers: base.data.drivers.map((driver) => driver.id === "drv-1" ? {
          ...driver,
          microsoftEmail: "",
          employmentTypeValue: 1,
          employmentTypeLabel: "Terceiro"
        } : driver),
        swaps: [swap({ id: "swp-history", statusValue: 202410002 })],
        possessions: base.data.possessions.filter((possession: Possession) => possession.driverId !== "drv-1" && possession.vehicleId !== "veh-1")
      }
    });

    const result = buildVehiclePreview(state);

    expect(result.errors).toEqual([]);
    expect(result.preview).toMatchObject({
      executionMode: "schedule",
      actualAt: null,
      driver1Id: "drv-1",
      vehicle2Id: "veh-1"
    });
  });

  test("canceled and concluded swaps do not affect vehicle prediction", () => {
    const state = baseState({
      vehicle: {
        ...baseState().vehicle,
        form: {
          ...baseState().vehicle.form,
          typeValue: "100000002",
          startDate: "2026-07-02",
          driver1Id: "drv-1",
          baseVehicleId: "veh-1"
        }
      },
      data: {
        ...baseState().data,
        swaps: [
          swap({ id: "swp-return", statusValue: 202410000 }),
          swap({ id: "swp-canceled-pickup", start: "2026-07-01T12:00:00.000Z", typeValue: 100000002, statusValue: 202410002, vehicle1Id: null, vehicle2Id: "veh-1" }),
          swap({ id: "swp-concluded-pickup", start: "2026-07-01T13:00:00.000Z", typeValue: 100000002, statusValue: 202410001, vehicle1Id: null, vehicle2Id: "veh-1" })
        ]
      }
    });

    const planning = computeVehiclePlanning(state);

    expect(planning.driver1?.predictedVehicleId).toBeNull();
    expect(planning.availableDriver1.map((driver) => driver.id)).toContain("drv-1");
  });

  test("handoff allows destination driver without a vehicle", () => {
    const base = baseState();
    const state = baseState({
      vehicle: { ...base.vehicle, form: { ...base.vehicle.form, typeValue: "100000003" } },
      data: {
        ...base.data,
        possessions: base.data.possessions.filter((possession) => possession.driverId !== "drv-2")
      }
    });

    const planning = computeVehiclePlanning(state);
    const result = buildVehiclePreview(state);

    expect(planning.availableDriver2.map((driver) => driver.id)).toContain("drv-2");
    expect(result.errors).toEqual([]);
    expect(result.preview).toMatchObject({
      driver1Id: "drv-1",
      driver2Id: "drv-2",
      vehicle1Id: "veh-1",
      vehicle2Id: ""
    });
  });

  test("swap requires both drivers with vehicles and points to handoff otherwise", () => {
    const base = baseState();
    const state = baseState({
      data: { ...base.data, possessions: base.data.possessions.filter((possession) => possession.driverId !== "drv-2") }
    });

    expect(computeVehiclePlanning(state).availableDriver2.map((driver) => driver.id)).not.toContain("drv-2");
    expect(buildVehiclePreview(state).errors.join(" ")).toContain("Repasse");
  });

  test("handoff rejects destination driver that already has a vehicle", () => {
    const base = baseState();
    const state = baseState({ vehicle: { ...base.vehicle, form: { ...base.vehicle.form, typeValue: "100000003" } } });

    expect(computeVehiclePlanning(state).availableDriver2.map((driver) => driver.id)).not.toContain("drv-2");
    expect(buildVehiclePreview(state).errors.join(" ")).toContain("Troca");
  });

  test("return to base requires a location and carries it to the preview", () => {
    const base = baseState();
    const withoutLocation = baseState({
      vehicle: { ...base.vehicle, form: { ...base.vehicle.form, typeValue: "100000001", driver2Id: "", locationId: "" } }
    });
    expect(buildVehiclePreview(withoutLocation).errors).toContain("Selecione o local da base.");

    const withLocation = baseState({
      vehicle: { ...base.vehicle, form: { ...base.vehicle.form, typeValue: "100000001", driver2Id: "", locationId: "loc-2" } }
    });
    const result = buildVehiclePreview(withLocation);
    expect(result.errors).toEqual([]);
    expect(result.preview).toMatchObject({ vehicle1Id: "veh-1", locationId: "loc-2", locationLabel: "Casa do Betinho" });
    expect(result.preview?.summary).toContain("Local: Casa do Betinho");
  });

  test("pickup lists only base vehicles parked at the selected location or without location", () => {
    const base = baseState();
    const state = baseState({
      vehicle: { ...base.vehicle, form: { ...base.vehicle.form, typeValue: "100000002", driver1Id: "drv-3", driver2Id: "", locationId: "loc-1" } },
      data: {
        ...base.data,
        drivers: [...base.data.drivers, { id: "drv-3", name: "Betinho", nickname: "Betinho" }],
        vehicles: [
          ...base.data.vehicles,
          { id: "veh-3", model: "Audi A6", color: "Preto", plate: "LOC2B45", label: "Audi A6 • LOC2B45", ownershipValue: 100000001, armored: true },
          { id: "veh-4", model: "Compass", color: "Cinza", plate: "BET7D89", label: "Compass • BET7D89" },
          { id: "veh-5", model: "Spin", color: "Prata", plate: "BET4C56", label: "Spin • BET4C56" }
        ],
        possessions: [
          ...base.data.possessions,
          { id: "pos-3", start: "2026-06-01T00:00:00.000Z", end: null, driverId: null, driverLabel: "Base", vehicleId: "veh-3", vehicleLabel: "LOC2B45", locationId: "loc-1", locationLabel: "Escritório" },
          { id: "pos-4", start: "2026-06-01T00:00:00.000Z", end: null, driverId: null, driverLabel: "Base", vehicleId: "veh-4", vehicleLabel: "BET7D89", locationId: "loc-2", locationLabel: "Casa do Betinho" },
          { id: "pos-5", start: "2026-06-01T00:00:00.000Z", end: null, driverId: null, driverLabel: "Base", vehicleId: "veh-5", vehicleLabel: "BET4C56", locationId: null, locationLabel: "" }
        ]
      }
    });

    const planning = computeVehiclePlanning(state);
    expect(planning.baseVehicles.map((vehicle) => vehicle.id)).toEqual(["veh-3", "veh-5"]);
    expect(planning.availableDriver1.map((driver) => driver.id)).toContain("drv-3");
  });

  test("scheduled return moves the vehicle to the swap location for later pickups", () => {
    const base = baseState();
    const state = baseState({
      vehicle: {
        ...base.vehicle,
        form: { ...base.vehicle.form, typeValue: "100000002", driver1Id: "", driver2Id: "", locationId: "loc-2", startDate: "2026-06-27", endDate: "2026-06-27" }
      },
      data: {
        ...base.data,
        swaps: [swap({ id: "swp-return", start: "2026-06-26T12:00:00.000Z", end: "2026-06-26T12:30:00.000Z", typeValue: 100000001, driver2Id: null, vehicle1Id: "veh-1", vehicle2Id: null, locationId: "loc-2" })]
      }
    });

    const planning = computeVehiclePlanning(state);
    expect(planning.vehiclePredictions.find((vehicle) => vehicle.id === "veh-1")?.predictedLocationId).toBe("loc-2");
    expect(planning.baseVehicles.map((vehicle) => vehicle.id)).toContain("veh-1");
  });
});
