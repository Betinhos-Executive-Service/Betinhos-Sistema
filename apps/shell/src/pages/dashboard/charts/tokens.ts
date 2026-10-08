/** Cores dos gráficos lidas dos tokens do Design System; o valor reserva é o mesmo do design-tokens.css. */
const TOKENS = {
  action: ['--bt-color-action', '#2159d2'],
  actionSoft: ['--bt-color-action-soft', '#edf3ff'],
  brand: ['--bt-color-brand', '#001a3d'],
  success: ['--bt-color-success', '#147a4b'],
  successSoft: ['--bt-color-success-soft', '#eaf8f1'],
  warning: ['--bt-color-warning', '#856000'],
  warningSoft: ['--bt-color-warning-soft', '#fff7df'],
  secondary: ['--bt-color-text-secondary', '#64748b'],
  border: ['--bt-color-border', '#e2e8f0'],
  surface: ['--bt-color-surface', '#ffffff'],
  surfaceSoft: ['--bt-color-surface-soft', '#f7f9fc'],
} as const
export type CorToken = keyof typeof TOKENS

export function cor(token: CorToken) {
  const [variavel, reserva] = TOKENS[token]
  if (typeof document === 'undefined') return reserva
  return getComputedStyle(document.documentElement).getPropertyValue(variavel).trim() || reserva
}
