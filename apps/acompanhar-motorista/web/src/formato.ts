import type { IdiomaId } from "./i18n";
import { LISTA_IDIOMAS } from "./i18n";

// Formatos que dependem do idioma da página (horário sempre em Brasília).
export const decimal = (id: IdiomaId, s: string) => (id === "en" ? s : s.replace(".", ","));
export const km = (id: IdiomaId, x: number) => (x < 1 ? Math.round(x * 1000) + " m" : decimal(id, x.toFixed(1)) + " km");
// Dia/mês (dd/mm) no idioma da página, em Brasília; en usa en-GB para manter dia antes do mês.
export const diaMes = (id: IdiomaId, d: number | string | Date) =>
  new Date(d).toLocaleDateString(id === "en" ? "en-GB" : id === "es" ? "es-ES" : "pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
export function hora(id: IdiomaId, d: number | string | Date) {
  const local = LISTA_IDIOMAS.find((l) => l.id === id)!.local;
  return new Date(d).toLocaleTimeString(local, { timeZone: "America/Sao_Paulo", hour: id === "en" ? "numeric" : "2-digit", minute: "2-digit" });
}
