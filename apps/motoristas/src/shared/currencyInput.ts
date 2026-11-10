// Mantém só dígitos e um separador decimal (o último digitado), com até 2 casas.
// "1.250" (ponto + 3 dígitos) é milhar no padrão pt-BR e vira "1250".
export function sanitizeCurrencyInput(value: string) {
  const cleaned = value.replace(/[^\d.,]/g, "");
  const separatorMatches = [...cleaned.matchAll(/[.,]/g)];
  if (!separatorMatches.length) return cleaned;

  const lastSeparatorIndex = separatorMatches[separatorMatches.length - 1]?.index ?? -1;
  const separator = cleaned[lastSeparatorIndex];
  const integerPart = cleaned.slice(0, lastSeparatorIndex).replace(/[.,]/g, "");
  const rawFraction = cleaned.slice(lastSeparatorIndex + 1);

  if (separator === "." && /^\d{3}$/.test(rawFraction)) return `${integerPart}${rawFraction}`;

  const fractionPart = rawFraction.slice(0, 2);
  if (!fractionPart && cleaned.endsWith(separator)) return `${integerPart}${separator}`;
  return fractionPart ? `${integerPart}${separator}${fractionPart}` : integerPart;
}

// Ao sair do campo: "12,5" -> "12,50"; vazio continua vazio.
export function formatCurrencyInputOnBlur(value: string) {
  const sanitized = sanitizeCurrencyInput(value);
  if (!sanitized) return "";
  const amount = Number(sanitized.replace(",", "."));
  if (!Number.isFinite(amount)) return sanitized;
  return amount.toFixed(2).replace(".", ",");
}
