/** Cores dos gráficos lidas dos tokens do Design System; o valor reserva é o mesmo do design-tokens.css. */
const TOKENS = {
  action: ['--bt-color-action', '#2159d2'],
  brand: ['--bt-color-brand', '#001a3d'],
  secondary: ['--bt-color-text-secondary', '#64748b'],
  border: ['--bt-color-border', '#e2e8f0'],
} as const
export type CorToken = keyof typeof TOKENS

export function cor(token: CorToken) {
  const [variavel, reserva] = TOKENS[token]
  if (typeof document === 'undefined') return reserva
  return getComputedStyle(document.documentElement).getPropertyValue(variavel).trim() || reserva
}
