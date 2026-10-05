/** Só dígitos com DDI 55; null quando não parece telefone brasileiro. */
export function phoneDigits(raw: string): string | null {
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length === 12 || digits.length === 13 ? digits : null
}

export function telHref(raw: string) {
  const digits = phoneDigits(raw)
  return digits ? `tel:+${digits}` : null
}

export function whatsappHref(raw: string) {
  const digits = phoneDigits(raw)
  return digits ? `https://wa.me/${digits}` : null
}
