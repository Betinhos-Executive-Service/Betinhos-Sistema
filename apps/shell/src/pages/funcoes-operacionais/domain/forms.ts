// Regras dos formulários (troca de carro, duplicação) e rótulos da tela, sem React: cascata ao mudar campos,
// validação por campo, preenchimento da edição, resumo e calendário. Mensagens idênticas às do WebResource.
import { CONFIG } from "./config";
import {
  betweenServicesWindow, buildVehiclePreview, computeVehiclePlanning, swapTypeNeedsLocation, usesBetweenServices,
  SWAP_TYPE_HANDOFF, SWAP_TYPE_PICKUP, SWAP_TYPE_RETURN, SWAP_TYPE_SWAP
} from "./logic";
import type { AppState, BaseLocation, CloneDraft, Swap, Vehicle, VehicleForm } from "./types";
import { combineDateTime, defaultVehicleWindow, displayDriverName, formatDate, isPast, parseDate, toDateInputValue, toHourValue, toMinuteValue, twoDigits } from "./utils";

export const PAGE_SIZE = 16;
export const SWAP_STATUS_READ_ONLY = [202410001, 202410002];

/** Formulário novo: Troca, Agendar, programar automático, entre serviços, próximo múltiplo de 5 min + 10 min. */
export function emptyVehicleForm(now: Date = new Date()): VehicleForm {
  return {
    typeValue: "100000000",
    executionMode: "schedule",
    programAutomatically: true,
    actualDate: toDateInputValue(now),
    actualHour: twoDigits(now.getHours()),
    actualMinute: twoDigits(now.getMinutes()),
    ...defaultVehicleWindow(now),
    driver1Id: "",
    driver2Id: "",
    baseVehicleId: "",
    windowMode: "between",
    driver1AfterId: "",
    driver1BeforeId: "",
    driver2AfterId: "",
    driver2BeforeId: "",
    location: "",
    locationId: "",
    obs: ""
  };
}

/** Formulário de edição a partir da troca gravada. */
export function vehicleFormFromSwap(swap: Swap, now: Date = new Date()): VehicleForm {
  return {
    ...emptyVehicleForm(now),
    typeValue: String(swap.typeValue || 100000000),
    startDate: toDateInputValue(swap.start),
    startHour: toHourValue(swap.start),
    startMinute: toMinuteValue(swap.start),
    endDate: toDateInputValue(swap.end),
    endHour: toHourValue(swap.end),
    endMinute: toMinuteValue(swap.end),
    driver1Id: swap.driver1Id || "",
    driver2Id: swap.driver2Id || "",
    baseVehicleId: Number(swap.typeValue) === SWAP_TYPE_PICKUP ? swap.vehicle2Id || "" : "",
    locationId: swap.locationId || "",
    obs: swap.obs || "",
    programAutomatically: swap.statusValue === 202410000,
    windowMode: swap.windowModeValue === 100000001 ? "between" : "fixed",
    driver1AfterId: swap.driver1AfterId || "",
    driver1BeforeId: swap.driver1BeforeId || "",
    driver2AfterId: swap.driver2AfterId || "",
    driver2BeforeId: swap.driver2BeforeId || "",
    location: swap.location || ""
  };
}

const withForm = (state: AppState, form: VehicleForm): AppState => ({ ...state, vehicle: { ...state.vehicle, form } });

/** Remove em laço motorista 1, motorista 2 ou veículo da base que deixaram de estar disponíveis. */
export function normalizeVehicleSelections(state: AppState): VehicleForm {
  let form = state.vehicle.form;
  for (;;) {
    const planning = computeVehiclePlanning(withForm(state, form));
    if (form.driver1Id && !planning.availableDriver1.some((driver) => driver.id === form.driver1Id)) { form = { ...form, driver1Id: "" }; continue; }
    if (form.driver2Id && !planning.availableDriver2.some((driver) => driver.id === form.driver2Id)) { form = { ...form, driver2Id: "" }; continue; }
    if (form.baseVehicleId && !planning.baseVehicles.some((vehicle) => vehicle.id === form.baseVehicleId)) { form = { ...form, baseVehicleId: "" }; continue; }
    return form;
  }
}

/**
 * Cascata ao alterar um campo da troca. `sameStartConflict` avisa quando a nova data/hora de início coincide com o
 * início de outra troca ativa sobreposta (a tela mostra "Não permitido").
 */
export function applyVehicleFieldChange(state: AppState, key: keyof VehicleForm, value: string): { form: VehicleForm; sameStartConflict: boolean } {
  let form = { ...state.vehicle.form, [key]: value } as VehicleForm;
  if (key === "typeValue") {
    form.driver2Id = "";
    form.baseVehicleId = "";
    if (!swapTypeNeedsLocation(Number(value))) form.locationId = "";
  }
  if (key === "baseVehicleId" && value && !form.locationId) {
    const locationId = computeVehiclePlanning(withForm(state, form)).baseVehicle?.predictedLocationId;
    if (locationId) form.locationId = locationId;
  }
  if (key === "typeValue" || key === "startDate" || key === "driver1Id") {
    form.driver1AfterId = "";
    form.driver1BeforeId = "";
  }
  if (key === "typeValue" || key === "startDate" || key === "driver2Id" || key === "driver1Id") {
    form.driver2AfterId = "";
    form.driver2BeforeId = "";
  }
  if (key === "driver1Id" && form.driver2Id === value) form.driver2Id = "";
  let sameStartConflict = false;
  if (key === "startDate" || key === "startHour" || key === "startMinute") {
    const result = buildVehiclePreview(withForm(state, form));
    const previewStart = result.preview?.start;
    sameStartConflict = !!previewStart && result.overlaps.some((swap) => parseDate(swap.start)?.getTime() === previewStart.getTime());
  }
  form = normalizeVehicleSelections(withForm(state, form));
  return { form, sameStartConflict };
}

/** Separa o valor de `datetime-local` em data, hora e minuto. */
export function splitDateTime(value: string) {
  const [date = "", time = ""] = value.split("T");
  const [hour = "", minute = ""] = time.split(":");
  return { date, hour, minute };
}

export type FieldErrors = Record<string, string>;

/** Validação por campo do formulário de troca (ordem dos campos = ordem do foco). */
export function validateVehicleForm(state: AppState, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  const form = state.vehicle.form;
  const typeValue = Number(form.typeValue || 0);
  const planning = computeVehiclePlanning(state);
  const start = combineDateTime(form.startDate, form.startHour, form.startMinute);
  const end = combineDateTime(form.endDate, form.endHour, form.endMinute);
  const actualAt = form.executionMode === "past" ? combineDateTime(form.actualDate, form.actualHour, form.actualMinute) : null;

  if (!typeValue) errors.vehicleType = "Selecione o tipo de troca.";
  if (!form.driver1Id) errors.vehicleDriver1 = swapTypeNeedsLocation(typeValue) ? "Selecione o responsável." : "Selecione o motorista 1.";
  if ((typeValue === SWAP_TYPE_SWAP || typeValue === SWAP_TYPE_HANDOFF) && !form.driver2Id) errors.vehicleDriver2 = "Selecione o motorista 2.";
  if (swapTypeNeedsLocation(typeValue) && !form.locationId) errors.vehicleLocation = "Selecione o local da base.";
  if (typeValue === SWAP_TYPE_PICKUP && !form.baseVehicleId) errors.vehicleBase = "Selecione o veículo da base.";
  if (form.driver1Id && !planning.availableDriver1.some((driver) => driver.id === form.driver1Id)) errors.vehicleDriver1 ||= "O motorista 1 não está disponível para este tipo de troca.";
  if (form.driver2Id && !planning.availableDriver2.some((driver) => driver.id === form.driver2Id)) errors.vehicleDriver2 ||= "O motorista 2 não está disponível para este tipo de troca.";
  if (form.baseVehicleId && !planning.baseVehicles.some((vehicle) => vehicle.id === form.baseVehicleId)) errors.vehicleBase ||= "O veículo da base não está mais disponível.";
  if (usesBetweenServices(form)) {
    const window = betweenServicesWindow(state);
    if (!form.startDate) errors.vehicleWindowDay = "Informe o dia da troca.";
    else if (window.error) errors.vehicleDriver1After = window.error;
  } else {
    if (!start) errors.vehicleStartDateTime = "Preencha início e fim da janela.";
    if (!end) errors.vehicleEndDateTime = "Preencha início e fim da janela.";
    if (start && end && end <= start) errors.vehicleEndDateTime = "A data de fim deve ser posterior ao início.";
  }
  if (form.executionMode === "past" && !actualAt) errors.vehicleActualDateTime = "Preencha quando a troca aconteceu.";
  if (actualAt && actualAt > now) errors.vehicleActualDateTime = "O horário real não pode estar no futuro.";
  if (typeValue === SWAP_TYPE_SWAP && !planning.driver1?.predictedVehicle) errors.vehicleDriver1 ||= "Motorista 1 precisa ter veículo previsto para uma troca.";
  if (typeValue === SWAP_TYPE_SWAP && planning.driver2 && !planning.driver2.predictedVehicle) errors.vehicleDriver2 ||= "Motorista 2 não tem veículo. Use o tipo Repasse.";
  if (typeValue === SWAP_TYPE_HANDOFF && !planning.driver1?.predictedVehicle) errors.vehicleDriver1 ||= "Motorista 1 precisa ter veículo previsto para repassar.";
  if (typeValue === SWAP_TYPE_RETURN && !planning.driver1?.predictedVehicle) errors.vehicleDriver1 ||= "Responsável precisa ter veículo previsto para devolver à base.";
  if (typeValue === SWAP_TYPE_PICKUP && !planning.baseVehicle) errors.vehicleBase ||= "Selecione um veículo livre na base.";
  return errors;
}

/** Validação da duplicação: horário, pelo menos uma data e nenhuma data/hora no passado. */
export function validateCloneDraft(draft: CloneDraft | null): { errors: FieldErrors; departures: Date[] } {
  const errors: FieldErrors = {};
  const departures = (draft?.dates || []).map((date) => combineDateTime(date, draft?.hour || "", draft?.minute || ""));
  if (!draft?.hour || !draft?.minute) errors.cloneTime = "Informe o horário de saída.";
  if (!departures.length) {
    errors.cloneDates = "Escolha pelo menos uma data.";
  } else {
    const past = departures.find((date) => !date || isPast(date));
    if (past !== undefined) errors.cloneDates = `${past ? formatDate(past).slice(0, 5) : "Uma data"} às ${draft?.hour}:${draft?.minute} já passou.`;
  }
  return { errors, departures: departures.filter((date): date is Date => !!date) };
}

export function toggleCloneDate(draft: CloneDraft, date: string): CloneDraft {
  return { ...draft, dates: draft.dates.includes(date) ? draft.dates.filter((item) => item !== date) : [...draft.dates, date].sort() };
}

export function cloneDatesHint(dates: string[]): string {
  return dates.length
    ? `${dates.length} ${dates.length === 1 ? "data" : "datas"}: ${dates.map((date) => formatDate(date + "T12:00:00").slice(0, 5)).join(", ")}`
    : "Toque nos dias para escolher uma ou mais datas. O ponto marca a data do pedido original.";
}

export function vehicleSubtitle(vehicle: Vehicle, locationsById: Record<string, BaseLocation>): string {
  const location = vehicle.predictedLocationId ? locationsById[vehicle.predictedLocationId] : null;
  return [
    vehicle.ownershipValue === 100000001 ? `Alugado${vehicle.rentalSupplier ? ` · ${vehicle.rentalSupplier}` : ""}` : "",
    vehicle.armored ? "Blindado" : "",
    location ? location.name : "Local não informado"
  ].filter(Boolean).join(" · ");
}

export function vehicleHint(vehicle: Vehicle | null | undefined): string {
  if (!vehicle) return "Sem veículo previsto";
  const tags = [vehicle.ownershipValue === 100000001 ? "Alugado" : "", vehicle.armored ? "Blindado" : ""].filter(Boolean);
  return `${vehicle.model} • ${vehicle.plate}${tags.length ? ` · ${tags.join(" · ")}` : ""}`;
}

/** Linhas do painel Resumo (valor vazio vira "A definir" na tela). */
export function vehicleSummaryRows(state: AppState): { label: string; value: string }[] {
  const form = state.vehicle.form;
  const planning = computeVehiclePlanning(state);
  const typeValue = Number(form.typeValue || 0);
  const driverName = (id: string) => displayDriverName(state.data.drivers.find((item) => item.id === id));
  const rows = [{ label: "Tipo", value: (CONFIG.choices.tipoTroca as Record<string, string>)[String(form.typeValue)] || "" }];
  const twoDrivers = typeValue === SWAP_TYPE_SWAP || typeValue === SWAP_TYPE_HANDOFF;
  rows.push({ label: twoDrivers ? "Motorista 1" : "Responsável", value: driverName(form.driver1Id) });
  if (twoDrivers) rows.push({ label: "Motorista 2", value: driverName(form.driver2Id) });
  if (swapTypeNeedsLocation(typeValue)) rows.push({ label: "Local da base", value: planning.location?.name || "" });
  if (typeValue === SWAP_TYPE_PICKUP) rows.push({ label: "Veículo da base", value: planning.baseVehicle ? `${planning.baseVehicle.model} • ${planning.baseVehicle.plate}` : "" });
  const day = form.startDate ? form.startDate.split("-").reverse().join("/") : "";
  const when = usesBetweenServices(form)
    ? (day ? `${day} · entre serviços` : "")
    : (day ? `${day} ${form.startHour}:${form.startMinute} → ${form.endHour}:${form.endMinute}` : "");
  rows.push({ label: "Quando", value: when });
  rows.push({ label: "Registro", value: form.executionMode === "schedule" ? "Agendar" : form.executionMode === "now" ? "Foi agora" : "Foi antes" });
  return rows;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Domingo da semana da data. */
export function weekStart(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function startsNewDay(list: { dataSaida: string }[], index: number) {
  return index === 0 || toDateInputValue(list[index].dataSaida) !== toDateInputValue(list[index - 1].dataSaida);
}

/** "Hoje · dd/mm", "Amanhã · dd/mm" ou "<Dia da semana> · dd/mm". */
export function dayLabel(value: unknown, now: Date = new Date()) {
  const date = parseDate(value);
  if (!date) return "Sem data";
  const key = toDateInputValue(date);
  if (key === toDateInputValue(now)) return `Hoje · ${formatDate(date).slice(0, 5)}`;
  if (key === toDateInputValue(addDays(now, 1))) return `Amanhã · ${formatDate(date).slice(0, 5)}`;
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${formatDate(date).slice(0, 5)}`;
}

/** 35 dias a partir de `start` e o título do mês ("outubro 2026" ou "outubro – novembro 2026"). */
export function calendarDays(start: Date) {
  const days = Array.from({ length: 35 }, (_, index) => addDays(start, index));
  const first = days[0];
  const last = days[days.length - 1];
  const month = (date: Date) => new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(date);
  const title = first.getMonth() === last.getMonth() ? `${month(first)} ${first.getFullYear()}` : `${month(first)} – ${month(last)} ${last.getFullYear()}`;
  return { days, title };
}
