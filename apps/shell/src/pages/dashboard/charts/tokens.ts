import { useSyncExternalStore } from 'react'

/** Cores dos gráficos lidas dos tokens do Design System; o valor reserva é o mesmo do design-tokens.css. */
const TOKENS = {
  action: ['--bt-color-action', '#2159d2'],
  brand: ['--bt-color-brand', '#001a3d'],
  success: ['--bt-color-success', '#147a4b'],
  warning: ['--bt-color-warning', '#856000'],
  secondary: ['--bt-color-text-secondary', '#5f6e85'],
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

const DARK = '(prefers-color-scheme: dark)'

function assinar(avisar: () => void) {
  const observador = new MutationObserver(avisar)
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK) : null
  media?.addEventListener('change', avisar)
  return () => { observador.disconnect(); media?.removeEventListener('change', avisar) }
}

const aparencia = () => `${document.documentElement.dataset.theme ?? ''}|${typeof window.matchMedia === 'function' && window.matchMedia(DARK).matches}`

/** Re-renderiza o gráfico quando o tema muda (escolha do usuário ou do sistema): `cor()` lê o token na hora de desenhar. */
export function useAparenciaDosGraficos() {
  return useSyncExternalStore(assinar, aparencia, () => '')
}
