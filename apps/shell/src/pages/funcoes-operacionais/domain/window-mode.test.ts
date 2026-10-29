// Portado de tela-funcoes-operacionais/tests/window-mode.test.ts (modo Entre serviços).
import { describe, expect, test, vi } from "vitest";
import { anchorPhrase, betweenServicesWindow, buildVehiclePreview, driverDayServices, swapWindowAlert } from "./logic";
import type { AppState, Service, Swap, VehicleForm } from "./types";

// 06/10/2026 em Brasília (UTC-3); o ambiente de teste roda com TZ=America/Sao_Paulo ou equivalente.
const brt = (hour: number, minute = 0) => new Date(`2026-10-06T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);

function service(id: string, driver: string, at: Date, extra: Partial<Service> = {}): Service {
  return {
    id, readableId: id.toUpperCase(), dataSaida: at.toISOString(), previsaoRetorno: null, statusValue: 202410004, statusLabel: "Solicitado",
    statusFaturamentoValue: null, statusFaturamentoLabel: "", tipoServicoValue: null, tipoServicoLabel: "", tipoVeiculoValue: null, tipoVeiculoLabel: "",
    clienteId: null, clienteLabel: "", solicitanteId: null, solicitanteLabel: "", motoristaId: driver, motoristaLabel: driver, veiculoId: null, veiculoLabel: "",
    destino: "", enderecoSaida: "", obsOperacao: "", obsInterna: "", paxView: "", trajeto: "SJC / GRU", perfilPassageiro: "", email: "",
    receberValue: null, formaPagamentoValue: null, formaPagamentoLabel: "", cotacao: 0, cr: "", categoriaItemValue: 100000000, ...extra
  };
}

function form(overrides: Partial<VehicleForm> = {}): VehicleForm {
  return {
    typeValue: "100000000", executionMode: "schedule", programAutomatically: true, actualDate: "2026-10-06", actualHour: "09", actualMinute: "00",
    startDate: "2026-10-06", startHour: "09", startMinute: "00", endDate: "2026-10-06", endHour: "09", endMinute: "30",
    driver1Id: "drv-1", driver2Id: "drv-2", baseVehicleId: "", windowMode: "between",
    driver1AfterId: "", driver1BeforeId: "", driver2AfterId: "", driver2BeforeId: "", location: "", locationId: "", obs: "", ...overrides
  };
}

function state(formOverrides: Partial<VehicleForm> = {}, services: Service[] = defaultServices()): AppState {
  return {
    view: "vehicle", loading: false, loadingMessage: "", mode: "mock", orgUrl: "", validationNote: "", transitionKind: "local",
    driver: { query: "", startDate: "2026-10-06" }, clone: { query: "", selectedServiceId: "", highlightedServiceId: "", draft: null },
    vehicle: { form: form(formOverrides), preview: null, forceOverlap: false },
    data: { drivers: [], vehicles: [], services, passengerLinks: [], swaps: [], possessions: [] },
    toasts: []
  } as unknown as AppState;
}

function defaultServices(): Service[] {
  return [
    service("a1", "drv-1", brt(8)),
    service("a2", "drv-1", brt(14)),
    service("b1", "drv-2", brt(9)),
    service("b0", "drv-2", new Date(brt(9).getTime() - 86400000)),
    service("x1", "drv-1", brt(11), { statusValue: 202410002 })
  ];
}

const morning = brt(6);

describe("modo Entre serviços", () => {
  test("lista só serviços ativos do motorista no dia, em ordem de saída", () => {
    expect(driverDayServices(state(), "drv-1", "2026-10-06").map((item) => item.id)).toEqual(["a1", "a2"]);
  });

  test("janela técnica usa menor depois-de e maior antes-de", () => {
    const window = betweenServicesWindow(state({ driver1AfterId: "a1", driver1BeforeId: "a2", driver2AfterId: "b1" }), morning);
    expect(window.error).toBe("");
    expect(window.start?.toISOString()).toBe(brt(8).toISOString());
    expect(window.end?.toISOString()).toBe(brt(14).toISOString());
  });

  test("sem âncoras cobre o dia inteiro", () => {
    const window = betweenServicesWindow(state(), morning);
    expect(window.start?.getTime()).toBe(new Date(2026, 9, 6, 0, 0).getTime());
    expect(window.end?.getTime()).toBe(new Date(2026, 9, 6, 23, 59, 59).getTime());
  });

  test("rejeita ordem invertida, âncora de outro motorista e posições incompatíveis", () => {
    expect(betweenServicesWindow(state({ driver1AfterId: "a2", driver1BeforeId: "a1" }), morning).error).toContain("depois de");
    expect(betweenServicesWindow(state({ driver1AfterId: "b1" }), morning).error).toContain("não é deste motorista");
    expect(betweenServicesWindow(state({ driver1AfterId: "a2", driver2BeforeId: "b1" }), morning).error).toContain("incompatíveis");
  });

  test("rejeita antes-de que já saiu", () => {
    expect(betweenServicesWindow(state({ driver1BeforeId: "a1" }), brt(10)).error).toContain("já saiu");
  });

  test("preview leva modo, âncoras e local; outros tipos ficam em horário marcado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(morning);
    const between = buildVehiclePreview(state({ driver1AfterId: "a1", driver1BeforeId: "a2", location: " Base " }));
    expect(between.preview?.windowMode).toBe("between");
    expect(between.preview?.driver1BeforeId).toBe("a2");
    expect(between.preview?.location).toBe("Base");
    const returnToBase = buildVehiclePreview(state({ typeValue: "100000001", driver1AfterId: "a1" }));
    expect(returnToBase.preview?.windowMode).toBe("fixed");
    expect(returnToBase.preview?.driver1AfterId).toBe("");
    vi.useRealTimers();
  });

  test("frase do motorista", () => {
    const [a1, a2] = defaultServices();
    expect(anchorPhrase(a1, a2, "Bruno")).toBe("Troque depois da A1 e antes da A2.");
    expect(anchorPhrase(null, null, "Bruno")).toBe("Troque com Bruno quando os dois estiverem livres.");
  });

  test("alerta de exibição para âncora cancelada e troca atrasada", () => {
    const swap = { windowModeValue: 100000001, statusValue: 202410000, driver1Id: "drv-1", driver2Id: "drv-2", driver1AfterId: null, driver1BeforeId: "a2", driver2AfterId: null, driver2BeforeId: null } as Swap;
    expect(swapWindowAlert(state(), swap, brt(15))).toContain("Atrasada");
    const canceled = state({}, [service("a2", "drv-1", brt(14), { statusValue: 202410002 })]);
    expect(swapWindowAlert(canceled, swap, morning)).toContain("cancelado");
    expect(swapWindowAlert(state(), swap, morning)).toBe("");
  });
});

