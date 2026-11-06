export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

export function formatCurrency(cents: number): string {
  return currencyFormatter.format(cents / 100)
}

export function parseCurrency(input: string): number | null {
  const clean = input.trim().replace(/R\$\s?/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(clean)) return null
  const normalized = clean.replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null
}

export function hasValidCurrencyPrecision(input: string): boolean {
  const clean = input.trim().replace(/R\$\s?/g, '')
  return /^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(clean)
}

export function splitEvenly(totalCents: number, payerIds: string[]): Map<string, number> {
  const result = new Map<string, number>()
  if (!payerIds.length) return result
  const base = Math.floor(totalCents / payerIds.length)
  const remainder = totalCents % payerIds.length
  payerIds.forEach((id, index) => result.set(id, base + (index < remainder ? 1 : 0)))
  return result
}
