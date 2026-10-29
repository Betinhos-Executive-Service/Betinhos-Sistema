import { CONFIG } from "./config";
import type { AppState, CloneDraft, Driver, Possession, Service, Swap, Vehicle, VehicleForm, VehiclePreview } from "./types";
import {
  combineDateTime,
  compareAsc,
  displayDriverName,
  formatDateTime,
  formatTime,
  normalizeText,
  now,
  parseDate,
  startOfDay,
  toDateInputValue,
  toHourValue,
  toMinuteValue
} from "./utils";

export function serviceById(state: AppState, serviceId: string): Service | null {
  return state.data.services.find((service) => service.id === serviceId) || null;
}

export function passengerLinksByService(state: AppState, serviceId: string) {
  return state.data.passengerLinks
    .filter((item) => item.serviceId === serviceId)
    .sort((left, right) => left.order - right.order);
}

function buildSearchBlob(service: Service): string {
  return normalizeText([
    service.readableId,
    service.paxView,
    service.clienteLabel,
    service.enderecoSaida,
    service.destino,
    service.motoristaLabel,
    service.obsOperacao,
    service.solicitanteLabel,
    service.trajeto,
    service.veiculoLabel,
    service.tipoVeiculoLabel,
    formatDateTime(service.dataSaida)
  ].join(" "));
}

function matchesDriverSearch(service: Service, query: string): boolean {
  const normalized = normalizeText(query);
  return !normalized || buildSearchBlob(service).includes(normalized);
}

function driverStartDate(state: AppState): Date {
  const fallback = startOfDay(now());
  const selected = parseDate(state.driver.startDate);
  return selected ? startOfDay(selected) : fallback;
}

export function driverServices(state: AppState): Service[] {
  const start = driverStartDate(state);
  return state.data.services
    .filter((service) => {
      const date = parseDate(service.dataSaida);
      return !!date && date >= start;
    })
    .filter((service) => matchesDriverSearch(service, state.driver.query))
    .sort((left, right) => compareAsc(left.dataSaida, right.dataSaida));
}

export function cloneServices(state: AppState): Service[] {
  return state.data.services
    .filter((service) => matchesDriverSearch(service, state.clone.query))
    .sort((left, right) => compareAsc(left.dataSaida, right.dataSaida));
}

export function createCloneDraft(service: Service): CloneDraft {
  return {
    date: toDateInputValue(service.dataSaida),
    dates: [],
    hour: toHourValue(service.dataSaida),
    minute: toMinuteValue(service.dataSaida),
    driverId: service.motoristaId || "",
    obsOperacao: service.obsOperacao || "",
    obsInterna: service.obsInterna || ""
  };
}

export function stripContactPhone(value: string): string {
  return String(value || "")
    .replace(/(?:\b(?:tel|telefone|cel|celular|whats|whatsapp|fone)\.?:?\s*)?(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s.]?\d{4}\b/gi, "")
    .replace(/\s*(?:[-–—|,;:])\s*$/g, "")
    .replace(/^\s*(?:[-–—|,;:])\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function servicePassengerText(service: Service, passengerLinks = [] as Array<{ passengerLabel: string }>): string {
  const names = passengerLinks.map((link) => stripContactPhone(link.passengerLabel)).filter(Boolean);
  return names.length ? names.join(", ") : stripContactPhone(service.paxView) || "—";
}

function currentPredictionDate(state: AppState): Date | null {
  return combineDateTime(
    state.vehicle.form.startDate,
    state.vehicle.form.startHour,
    state.vehicle.form.startMinute
  );
}

function vehicleEventSort(left: Swap, right: Swap): number {
  const startDiff = compareAsc(left.start, right.start);
  if (startDiff !== 0) return startDiff;
  const endDiff = compareAsc(left.end, right.end);
  return endDiff !== 0 ? endDiff : String(left.id).localeCompare(String(right.id), "pt-BR");
}

function isPlanningSwap(swap: Swap): boolean {
  return swap.statusValue === 202410000 || swap.statusValue === 100000001;
}

function isUnexpiredPlanningSwap(swap: Swap, reference = now()): boolean {
  if (!isPlanningSwap(swap)) return false;
  const end = parseDate(swap.end);
  return !!end && end >= reference;
}

function assignVehicle(driverToVehicle: Map<string, string>, vehicleToDriver: Map<string, string>, driverId: string | null, vehicleId: string | null): void {
  if (!driverId || !vehicleId) return;
  const previousVehicleId = driverToVehicle.get(driverId);
  if (previousVehicleId) vehicleToDriver.delete(previousVehicleId);
  const previousDriverId = vehicleToDriver.get(vehicleId);
  if (previousDriverId) driverToVehicle.delete(previousDriverId);
  driverToVehicle.set(driverId, vehicleId);
  vehicleToDriver.set(vehicleId, driverId);
}

function clearDriverVehicle(driverToVehicle: Map<string, string>, vehicleToDriver: Map<string, string>, driverId: string | null): void {
  if (!driverId) return;
  const vehicleId = driverToVehicle.get(driverId);
  driverToVehicle.delete(driverId);
  if (vehicleId) vehicleToDriver.delete(vehicleId);
}

function clearVehicleDriver(driverToVehicle: Map<string, string>, vehicleToDriver: Map<string, string>, vehicleId: string | null): void {
  if (!vehicleId) return;
  const driverId = vehicleToDriver.get(vehicleId);
  vehicleToDriver.delete(vehicleId);
  if (driverId) driverToVehicle.delete(driverId);
}

function applySwapEvent(
  driverToVehicle: Map<string, string>,
  vehicleToDriver: Map<string, string>,
  vehicleToLocation: Map<string, string>,
  swap: Swap
): void {
  if (swap.typeValue === SWAP_TYPE_RETURN) {
    clearDriverVehicle(driverToVehicle, vehicleToDriver, swap.driver1Id);
    clearVehicleDriver(driverToVehicle, vehicleToDriver, swap.vehicle1Id);
    if (swap.vehicle1Id) {
      if (swap.locationId) vehicleToLocation.set(swap.vehicle1Id, swap.locationId);
      else vehicleToLocation.delete(swap.vehicle1Id);
    }
    return;
  }

  if (swap.typeValue === SWAP_TYPE_PICKUP) {
    clearDriverVehicle(driverToVehicle, vehicleToDriver, swap.driver1Id);
    clearVehicleDriver(driverToVehicle, vehicleToDriver, swap.vehicle2Id);
    assignVehicle(driverToVehicle, vehicleToDriver, swap.driver1Id, swap.vehicle2Id);
    if (swap.vehicle2Id) vehicleToLocation.delete(swap.vehicle2Id);
    return;
  }

  if (swap.typeValue === SWAP_TYPE_SWAP || swap.typeValue === SWAP_TYPE_HANDOFF) {
    clearDriverVehicle(driverToVehicle, vehicleToDriver, swap.driver1Id);
    clearDriverVehicle(driverToVehicle, vehicleToDriver, swap.driver2Id);
    clearVehicleDriver(driverToVehicle, vehicleToDriver, swap.vehicle1Id);
    clearVehicleDriver(driverToVehicle, vehicleToDriver, swap.vehicle2Id);
    assignVehicle(driverToVehicle, vehicleToDriver, swap.driver1Id, swap.vehicle2Id);
    assignVehicle(driverToVehicle, vehicleToDriver, swap.driver2Id, swap.vehicle1Id);
  }
}

export const SWAP_TYPE_SWAP = 100000000;
export const SWAP_TYPE_RETURN = 100000001;
export const SWAP_TYPE_PICKUP = 100000002;
export const SWAP_TYPE_HANDOFF = 100000003;

export function swapTypeNeedsLocation(typeValue: number): boolean {
  return typeValue === SWAP_TYPE_RETURN || typeValue === SWAP_TYPE_PICKUP;
}

const SERVICE_STATUS_CANCELED = 202410002;

/** Modo Entre serviços vale só para Troca agendada entre dois motoristas. */
export function usesBetweenServices(form: VehicleForm): boolean {
  return form.windowMode === "between" && Number(form.typeValue) === SWAP_TYPE_SWAP && form.executionMode === "schedule";
}

/** Serviços do motorista no dia (Brasília), em ordem de saída, para escolher a posição da troca. */
export function driverDayServices(state: AppState, driverId: string, day: string): Service[] {
  if (!driverId || !day) return [];
  return state.data.services
    .filter((service) => service.motoristaId === driverId && service.statusValue !== SERVICE_STATUS_CANCELED)
    .filter((service) => toDateInputValue(service.dataSaida) === day)
    .sort((left, right) => compareAsc(left.dataSaida, right.dataSaida));
}

export function serviceAnchorLabel(service: Service): string {
  const route = service.trajeto ? ` · ${service.trajeto}` : "";
  return `${formatTime(service.dataSaida)} · ${service.readableId || "Serviço"}${route}`;
}

/** Frase que o motorista vê no app para a própria posição. */
export function anchorPhrase(after: Service | null, before: Service | null, partnerLabel: string): string {
  if (after && before) return `Troque depois da ${after.readableId} e antes da ${before.readableId}.`;
  if (after) return `Troque depois da ${after.readableId}.`;
  if (before) return `Troque antes da ${before.readableId}.`;
  return partnerLabel ? `Troque com ${partnerLabel} quando os dois estiverem livres.` : "Troque quando estiver livre.";
}

/**
 * Janela técnica do modo Entre serviços (mesma regra do plugin): menor saída entre os "depois de"
 * (ou 00:00 do dia) até a maior saída entre os "antes de" (ou 23:59:59). Serve só para conflito.
 */
export function betweenServicesWindow(state: AppState, nowValue: Date = now()): { start: Date | null; end: Date | null; error: string } {
  const form = state.vehicle.form;
  const day = form.startDate;
  const dayStart = combineDateTime(day, "00", "00");
  if (!dayStart) return { start: null, end: null, error: "Informe o dia da troca." };
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1000);
  const lookup = (id?: string) => (id ? serviceById(state, id) : null);
  const drivers = [
    { driverId: form.driver1Id, after: lookup(form.driver1AfterId), before: lookup(form.driver1BeforeId) },
    { driverId: form.driver2Id, after: lookup(form.driver2AfterId), before: lookup(form.driver2BeforeId) }
  ];
  for (const driver of drivers) {
    for (const anchor of [driver.after, driver.before]) {
      if (!anchor) continue;
      if (anchor.statusValue === SERVICE_STATUS_CANCELED) return { start: null, end: null, error: `${anchor.readableId} foi cancelado.` };
      if (anchor.motoristaId !== driver.driverId) return { start: null, end: null, error: `${anchor.readableId} não é deste motorista.` };
      if (toDateInputValue(anchor.dataSaida) !== day) return { start: null, end: null, error: `${anchor.readableId} não é do dia da troca.` };
    }
    const afterAt = driver.after ? parseDate(driver.after.dataSaida) : null;
    const beforeAt = driver.before ? parseDate(driver.before.dataSaida) : null;
    if (afterAt && beforeAt && afterAt >= beforeAt) return { start: null, end: null, error: "O serviço \"depois de\" deve sair antes do serviço \"antes de\"." };
    if (beforeAt && beforeAt <= nowValue) return { start: null, end: null, error: `${driver.before?.readableId} já saiu.` };
  }
  const afters = drivers.map((driver) => (driver.after ? parseDate(driver.after.dataSaida) : null)).filter((value): value is Date => !!value);
  const befores = drivers.map((driver) => (driver.before ? parseDate(driver.before.dataSaida) : null)).filter((value): value is Date => !!value);
  const latestAfter = afters.length ? Math.max(...afters.map((value) => value.getTime())) : null;
  const earliestBefore = befores.length ? Math.min(...befores.map((value) => value.getTime())) : null;
  if (latestAfter !== null && earliestBefore !== null && latestAfter >= earliestBefore) {
    return { start: null, end: null, error: "Posições incompatíveis: os motoristas não ficam livres ao mesmo tempo." };
  }
  const start = afters.length ? new Date(Math.min(...afters.map((value) => value.getTime()))) : dayStart;
  const end = befores.length ? new Date(Math.max(...befores.map((value) => value.getTime()))) : dayEnd;
  return { start, end, error: "" };
}

/** Alerta de exibição de uma troca Entre serviços já gravada (âncora cancelada, reatribuída, invertida ou atrasada). */
export function swapWindowAlert(state: AppState, swap: Swap, nowValue: Date = now()): string {
  if (swap.windowModeValue !== 100000001) return swap.windowAlert || "";
  const anchors = [
    { driverId: swap.driver1Id, after: swap.driver1AfterId, before: swap.driver1BeforeId },
    { driverId: swap.driver2Id, after: swap.driver2AfterId, before: swap.driver2BeforeId }
  ];
  for (const anchor of anchors) {
    const after = anchor.after ? serviceById(state, anchor.after) : null;
    const before = anchor.before ? serviceById(state, anchor.before) : null;
    for (const service of [after, before]) {
      if (!service) continue;
      if (service.statusValue === SERVICE_STATUS_CANCELED) return `${service.readableId} foi cancelado. Revise a posição da troca.`;
      if (service.motoristaId !== anchor.driverId) return `${service.readableId} mudou de motorista. Revise a posição da troca.`;
    }
    const afterAt = after ? parseDate(after.dataSaida) : null;
    const beforeAt = before ? parseDate(before.dataSaida) : null;
    if (afterAt && beforeAt && afterAt >= beforeAt) return "A ordem dos serviços mudou. Revise a posição da troca.";
    if (beforeAt && beforeAt <= nowValue && (swap.statusValue === 202410000 || swap.statusValue === 100000001)) return `Atrasada: ${before?.readableId} já saiu.`;
  }
  return swap.windowAlert || "";
}

function requestedWindow(state: AppState): { start: Date; end: Date } | null {
  if (usesBetweenServices(state.vehicle.form)) {
    const window = betweenServicesWindow(state);
    return window.start && window.end && window.end > window.start ? { start: window.start, end: window.end } : null;
  }
  const start = combineDateTime(state.vehicle.form.startDate, state.vehicle.form.startHour, state.vehicle.form.startMinute);
  const end = combineDateTime(state.vehicle.form.endDate, state.vehicle.form.endHour, state.vehicle.form.endMinute);
  return start && end && end > start ? { start, end } : null;
}

function driverOverlapsRequestedWindow(swaps: Swap[], driverId: string, window: { start: Date; end: Date } | null, editId = ""): boolean {
  if (!window) return false;
  return swaps.filter((swap) => swap.id !== editId && isUnexpiredPlanningSwap(swap)).some((swap) => {
    const start = parseDate(swap.start);
    const end = parseDate(swap.end);
    const touchesDriver = swap.driver1Id === driverId || swap.driver2Id === driverId;
    return !!(start && end) && touchesDriver && window.start < end && window.end > start;
  });
}

export function computeVehiclePlanning(state: AppState) {
  const predictionDate = currentPredictionDate(state) || now();
  const relevantSwaps = state.data.swaps
    .filter((swap) => swap.id !== state.vehicle.editId)
    .filter((swap) => isUnexpiredPlanningSwap(swap))
    .filter((swap) => {
      const start = parseDate(swap.start);
      return !!start && start <= predictionDate;
    })
    .slice()
    .sort(vehicleEventSort);

  const vehiclesById = Object.fromEntries(state.data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const driversById = Object.fromEntries(state.data.drivers.map((driver) => [driver.id, driver]));
  const driverToVehicle = new Map<string, string>();
  const vehicleToDriver = new Map<string, string>();
  const openByVehicle = new Map<string, Possession[]>();
  const openByDriver = new Map<string, Possession[]>();
  const historicalByVehicle = new Map<string, Possession[]>();
  const vehicleToLocation = new Map<string, string>();

  for (const possession of state.data.possessions) {
    if (possession.vehicleId) {
      const history = historicalByVehicle.get(possession.vehicleId) || [];
      history.push(possession);
      historicalByVehicle.set(possession.vehicleId, history);
      if (!possession.end) {
        const open = openByVehicle.get(possession.vehicleId) || [];
        open.push(possession);
        openByVehicle.set(possession.vehicleId, open);
      }
    }
    if (!possession.end && !possession.driverId && possession.vehicleId && possession.locationId) {
      vehicleToLocation.set(possession.vehicleId, possession.locationId);
    }
    if (!possession.end && possession.driverId) {
      const open = openByDriver.get(possession.driverId) || [];
      open.push(possession);
      openByDriver.set(possession.driverId, open);
      assignVehicle(driverToVehicle, vehicleToDriver, possession.driverId, possession.vehicleId);
    }
  }

  const repairableBaseVehicleIds = new Set<string>();
  const inconsistentVehicleIds = new Set<string>();
  for (const [vehicleId, history] of historicalByVehicle) {
    const open = openByVehicle.get(vehicleId) || [];
    if (open.length > 1 || history.some((item) => {
      const start = parseDate(item.start);
      const end = parseDate(item.end);
      return !!start && !!end && start > end;
    })) {
      inconsistentVehicleIds.add(vehicleId);
      continue;
    }
    if (open.length === 0 && history.length > 0 && history.every((item) => !!item.end)) {
      inconsistentVehicleIds.add(vehicleId);
    }
  }
  const inconsistentDriverIds = new Set(
    Array.from(openByDriver.entries()).filter(([, rows]) => rows.length > 1).map(([driverId]) => driverId)
  );

  for (const swap of relevantSwaps) applySwapEvent(driverToVehicle, vehicleToDriver, vehicleToLocation, swap);

  const driverPredictions = state.data.drivers.map((driver): Driver => {
    const vehicleId = driverToVehicle.get(driver.id) || null;
    return { ...driver, predictedVehicleId: vehicleId, predictedVehicle: vehicleId ? vehiclesById[vehicleId] || null : null };
  });

  const vehiclePredictions = state.data.vehicles.map((vehicle): Vehicle => {
    const driverId = vehicleToDriver.get(vehicle.id) || null;
    return {
      ...vehicle,
      predictedDriverId: driverId,
      predictedDriver: driverId ? driversById[driverId] || null : null,
      predictedLocationId: driverId ? null : vehicleToLocation.get(vehicle.id) || null
    };
  });

  const activeOverlaps = state.data.swaps.filter((swap) => {
    const start = parseDate(swap.start);
    const end = parseDate(swap.end);
    return !!(start && end) && start <= predictionDate && end > predictionDate;
  });
  const touchedKeys = new Set<string>();
  let inconsistent = false;
  for (const swap of activeOverlaps) {
    for (const key of [swap.driver1Id, swap.driver2Id, swap.vehicle1Id, swap.vehicle2Id]) {
      if (!key) continue;
      if (touchedKeys.has(key)) {
        inconsistent = true;
        break;
      }
      touchedKeys.add(key);
    }
  }

  const typeValue = Number(state.vehicle.form.typeValue || SWAP_TYPE_SWAP);
  const window = requestedWindow(state);
  const availableDriver1 = driverPredictions
    .filter((driver) => (typeValue === SWAP_TYPE_PICKUP ? !driver.predictedVehicleId : !!driver.predictedVehicleId))
    .filter((driver) => !driverOverlapsRequestedWindow(state.data.swaps, driver.id, window, state.vehicle.editId))
    .sort((left, right) => displayDriverName(left).localeCompare(displayDriverName(right), "pt-BR"));
  const availableDriver2 = driverPredictions
    .filter((driver) => driver.id !== state.vehicle.form.driver1Id)
    .filter((driver) => (typeValue === SWAP_TYPE_HANDOFF ? !driver.predictedVehicleId : typeValue === SWAP_TYPE_SWAP ? !!driver.predictedVehicleId : true))
    .filter((driver) => !driverOverlapsRequestedWindow(state.data.swaps, driver.id, window, state.vehicle.editId))
    .sort((left, right) => displayDriverName(left).localeCompare(displayDriverName(right), "pt-BR"));
  const selectedLocationId = state.vehicle.form.locationId || "";
  const baseVehicles = vehiclePredictions
    .filter((vehicle) => !vehicle.predictedDriverId && !inconsistentVehicleIds.has(vehicle.id))
    .filter((vehicle) => !selectedLocationId || !vehicle.predictedLocationId || vehicle.predictedLocationId === selectedLocationId)
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
  const locationsById = Object.fromEntries((state.data.locations || []).map((location) => [location.id, location]));

  return {
    predictionDate,
    relevantSwaps,
    driverPredictions,
    vehiclePredictions,
    availableDriver1,
    availableDriver2,
    baseVehicles,
    driver1: driverPredictions.find((driver) => driver.id === state.vehicle.form.driver1Id) || null,
    driver2: driverPredictions.find((driver) => driver.id === state.vehicle.form.driver2Id) || null,
    baseVehicle: vehiclePredictions.find((vehicle) => vehicle.id === state.vehicle.form.baseVehicleId) || null,
    location: locationsById[selectedLocationId] || null,
    locationsById,
    inconsistent,
    repairableBaseVehicleIds,
    inconsistentVehicleIds,
    inconsistentDriverIds
  };
}

function buildSwapSummary(preview: VehiclePreview): string {
  return [
    `${preview.typeLabel}: ${formatDateTime(preview.start)} até ${formatDateTime(preview.end)}`,
    `${preview.driver1Label || "Base"}${preview.driver2Label ? ` ${preview.typeValue === SWAP_TYPE_HANDOFF ? "→" : "↔"} ${preview.driver2Label}` : ""}`,
    `Veic1: ${preview.vehicle1Label || "—"}${preview.vehicle2Label ? ` | Veic2: ${preview.vehicle2Label}` : ""}`,
    ...(preview.locationLabel ? [`Local: ${preview.locationLabel}`] : [])
  ].join(" | ");
}

function overlappingSwapsForPreview(state: AppState, preview: VehiclePreview): Swap[] {
  return state.data.swaps.filter((swap) => {
    if (swap.id === state.vehicle.editId || !isUnexpiredPlanningSwap(swap)) return false;
    const swapStart = parseDate(swap.start);
    const swapEnd = parseDate(swap.end);
    if (!swapStart || !swapEnd) return false;
    const overlaps = preview.start < swapEnd && preview.end > swapStart;
    const touchesDriver =
      swap.driver1Id === preview.driver1Id ||
      swap.driver2Id === preview.driver1Id ||
      (!!preview.driver2Id && (swap.driver1Id === preview.driver2Id || swap.driver2Id === preview.driver2Id));
    const touchesVehicle =
      (!!preview.vehicle1Id && (swap.vehicle1Id === preview.vehicle1Id || swap.vehicle2Id === preview.vehicle1Id)) ||
      (!!preview.vehicle2Id && (swap.vehicle1Id === preview.vehicle2Id || swap.vehicle2Id === preview.vehicle2Id));
    return overlaps && (touchesDriver || touchesVehicle);
  });
}

export function buildVehiclePreview(state: AppState) {
  const planning = computeVehiclePlanning(state);
  const form = state.vehicle.form;
  const between = usesBetweenServices(form);
  const betweenWindow = between ? betweenServicesWindow(state) : null;
  const start = betweenWindow ? betweenWindow.start : combineDateTime(form.startDate, form.startHour, form.startMinute);
  const end = betweenWindow ? betweenWindow.end : combineDateTime(form.endDate, form.endHour, form.endMinute);
  const typeValue = Number(form.typeValue || 0);
  const executionMode = form.executionMode || "schedule";
  const actualAt = executionMode === "past"
    ? combineDateTime(form.actualDate, form.actualHour, form.actualMinute)
    : null;
  const typeLabel = CONFIG.choices.tipoTroca[typeValue] || "Troca";
  const errors: string[] = [];

  if (!typeValue) errors.push("Selecione o tipo de troca.");
  if (!form.driver1Id) errors.push("Selecione o motorista 1.");
  if ((typeValue === SWAP_TYPE_SWAP || typeValue === SWAP_TYPE_HANDOFF) && !form.driver2Id) errors.push("Selecione o motorista 2.");
  if (typeValue === SWAP_TYPE_PICKUP && !form.baseVehicleId) errors.push("Selecione o veículo da base.");
  if (swapTypeNeedsLocation(typeValue) && !form.locationId) errors.push("Selecione o local da base.");
  if (form.locationId && !planning.location) errors.push("O local selecionado não está mais ativo.");
  if (form.driver1Id && !planning.availableDriver1.some((driver) => driver.id === form.driver1Id)) {
    errors.push("O motorista 1 não está disponível para este tipo de troca.");
  }
  if (form.driver2Id && !planning.availableDriver2.some((driver) => driver.id === form.driver2Id)) {
    errors.push("O motorista 2 não está disponível para este tipo de troca.");
  }
  if (form.baseVehicleId && !planning.baseVehicles.some((vehicle) => vehicle.id === form.baseVehicleId)) {
    errors.push("O veículo selecionado não está livre na base.");
  }
  if (typeValue === SWAP_TYPE_PICKUP && form.baseVehicleId && actualAt && planning.repairableBaseVehicleIds.has(form.baseVehicleId)) {
    const latestEnd = state.data.possessions
      .filter((item) => item.vehicleId === form.baseVehicleId && !!item.end)
      .map((item) => parseDate(item.end as string))
      .filter((value): value is Date => !!value)
      .sort((left, right) => right.getTime() - left.getTime())[0];
    if (latestEnd && latestEnd > actualAt) {
      errors.push("O último encerramento do veículo é posterior ao horário efetivo informado.");
    }
  }
  if (betweenWindow?.error) errors.push(betweenWindow.error);
  else if (!start || !end) errors.push("Preencha início e fim da janela.");
  if (start && end && end <= start) errors.push("A data de fim deve ser posterior ao início.");
  if (executionMode === "past" && !actualAt) errors.push("Preencha a data e hora em que a troca realmente aconteceu.");
  if (actualAt && actualAt > now()) errors.push("O horário real da troca não pode estar no futuro.");

  const driver1 = planning.driver1;
  const driver2 = planning.driver2;
  const vehicle1 = typeValue === SWAP_TYPE_PICKUP ? null : driver1?.predictedVehicle || null;
  const vehicle2 =
    typeValue === SWAP_TYPE_SWAP
      ? driver2?.predictedVehicle || null
      : typeValue === SWAP_TYPE_PICKUP
        ? planning.baseVehicle
        : null;
  const location = swapTypeNeedsLocation(typeValue) ? planning.location : null;
  if (typeValue === SWAP_TYPE_SWAP && !vehicle1) errors.push("Motorista 1 precisa ter veículo previsto para uma troca.");
  if (typeValue === SWAP_TYPE_SWAP && driver2 && !vehicle2) errors.push("Motorista 2 não tem veículo. Use o tipo Repasse.");
  if (typeValue === SWAP_TYPE_HANDOFF && !vehicle1) errors.push("Motorista 1 precisa ter veículo previsto para repassar.");
  if (typeValue === SWAP_TYPE_HANDOFF && driver2?.predictedVehicleId) errors.push("Motorista 2 já tem veículo. Use o tipo Troca.");
  if (typeValue === SWAP_TYPE_RETURN && !vehicle1) errors.push("Motorista 1 precisa ter veículo previsto para devolver à base.");
  if (typeValue === SWAP_TYPE_PICKUP && !planning.baseVehicle) errors.push("Selecione um veículo livre na base.");

  const preview: VehiclePreview | null = start && end
    ? {
        start,
        end,
        typeValue,
        typeLabel,
        executionMode,
        programAutomatically: form.programAutomatically,
        actualAt,
        driver1Id: driver1?.id || "",
        driver1Label: displayDriverName(driver1),
        driver2Id: driver2?.id || "",
        driver2Label: displayDriverName(driver2),
        vehicle1Id: vehicle1?.id || "",
        vehicle1Label: vehicle1 ? `${vehicle1.model} • ${vehicle1.plate}` : "",
        vehicle2Id: vehicle2?.id || "",
        vehicle2Label: vehicle2 ? `${vehicle2.model} • ${vehicle2.plate}` : "",
        windowMode: between ? "between" : "fixed",
        driver1AfterId: between ? form.driver1AfterId || "" : "",
        driver1BeforeId: between ? form.driver1BeforeId || "" : "",
        driver2AfterId: between ? form.driver2AfterId || "" : "",
        driver2BeforeId: between ? form.driver2BeforeId || "" : "",
        location: (form.location || "").trim(),
        locationId: location?.id || "",
        locationLabel: location?.name || "",
        obs: form.obs || "",
        summary: ""
      }
    : null;

  if (preview) preview.summary = buildSwapSummary(preview);
  const overlaps = preview ? overlappingSwapsForPreview(state, preview) : [];
  if (preview && overlaps.some((swap) => parseDate(swap.start)?.getTime() === preview.start.getTime())) {
    errors.unshift("N\u00e3o \u00e9 poss\u00edvel agendar duas trocas com o mesmo hor\u00e1rio de in\u00edcio.");
  }
  return { planning, preview, overlaps, errors };
}
