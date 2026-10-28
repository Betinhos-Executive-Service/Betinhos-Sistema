// Links de contato do passageiro (Ligar e WhatsApp), os mesmos que o telefone da seção já usava.
export function normalizePhoneDigits(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** tel: e WhatsApp do passageiro; `whatsappUrl` (com a mensagem pronta) tem prioridade. Sem telefone, null. */
export function passengerContactLinks(phone: string | undefined, whatsappUrl?: string) {
  const digits = normalizePhoneDigits(phone ?? "");
  if (!digits) return null;
  return { tel: `tel:${digits}`, whatsapp: whatsappUrl || `https://wa.me/${digits}` };
}

export type FlagCode = "BR" | "US" | "ES" | "FR" | "IT" | "DE" | "JP" | "CN";

const LANGUAGE_FLAG_PREFIXES: Array<[string, FlagCode]> = [
  ["portug", "BR"], ["ingl", "US"], ["english", "US"], ["espanh", "ES"], ["spanish", "ES"],
  ["franc", "FR"], ["french", "FR"], ["italian", "IT"], ["alema", "DE"], ["german", "DE"],
  ["japon", "JP"], ["japanese", "JP"], ["chin", "CN"]
];

/** Bandeira pelo rótulo do idioma (cr40f_idioma); outros idiomas ou vazio → null. */
export function languageFlagCode(language: string | undefined): FlagCode | null {
  const label = (language ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!label) return null;
  return LANGUAGE_FLAG_PREFIXES.find(([prefix]) => label.startsWith(prefix))?.[1] ?? null;
}
