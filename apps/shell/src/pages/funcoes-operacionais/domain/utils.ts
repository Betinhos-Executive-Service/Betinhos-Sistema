export function now(): Date {
  return new Date();
}

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}-${Date.now().toString(16)}`;
}

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function formattedValue(raw: Record<string, unknown> | null | undefined, fieldName: string): string {
  return raw ? String(raw[`${fieldName}@OData.Community.Display.V1.FormattedValue`] || "") : "";
}

export function displayDriverName(driver: { name?: string; nickname?: string } | null | undefined): string {
  return String(driver?.nickname || driver?.name || "").trim();
}

export function chunk<T>(list: T[], size: number): T[][] {
  const safeSize = Math.max(1, Number(size) || 1);
  const output: T[][] = [];
  for (let index = 0; index < list.length; index += safeSize) {
    output.push(list.slice(index, index + safeSize));
  }
  return output;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
}

export function compareAsc(left: Date | string, right: Date | string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function combineDateTime(dateValue: string, hourValue: string, minuteValue: string): Date | null {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(Number(hourValue || 0), Number(minuteValue || 0), 0, 0);
  return date;
}

export function twoDigits(value: number | string): string {
  return String(Number(value || 0)).padStart(2, "0");
}

export function defaultVehicleWindow(nowValue = new Date()) {
  const start = new Date(nowValue);
  const roundedMinutes = Math.ceil((start.getMinutes() + start.getSeconds() / 60) / 5) * 5;
  start.setMinutes(roundedMinutes, 0, 0);
  const end = new Date(start.getTime() + 10 * 60 * 1000);
  return {
    startDate: toDateInputValue(start),
    startHour: toHourValue(start),
    startMinute: toMinuteValue(start),
    endDate: toDateInputValue(end),
    endHour: toHourValue(end),
    endMinute: toMinuteValue(end)
  };
}

export function toDateInputValue(date: unknown): string {
  const value = parseDate(date);
  if (!value) return "";
  return `${value.getFullYear()}-${twoDigits(value.getMonth() + 1)}-${twoDigits(value.getDate())}`;
}

export function toHourValue(date: unknown): string {
  const value = parseDate(date);
  return value ? twoDigits(value.getHours()) : "00";
}

export function toMinuteValue(date: unknown): string {
  const value = parseDate(date);
  return value ? twoDigits(value.getMinutes()) : "00";
}

export function toODataDate(date: unknown): string {
  const value = parseDate(date);
  return value ? value.toISOString() : "";
}

export function isPast(date: unknown): boolean {
  const value = parseDate(date);
  return value ? value.getTime() < Date.now() : false;
}

export function formatDate(date: unknown): string {
  const value = parseDate(date);
  return value
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value)
    : "—";
}

export function formatTime(date: unknown): string {
  const value = parseDate(date);
  return value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(value) : "—";
}

export function formatDateTime(date: unknown): string {
  const value = parseDate(date);
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(value)
    : "—";
}
