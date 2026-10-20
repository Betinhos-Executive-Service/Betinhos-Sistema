import { emptyFilters, storedFilters, type TableFilters } from '@betinhos/ui'

/** Filtros das listas (DS §10.9.2) na URL (`f=`): JSON em base64url, para o link compartilhado abrir igual. */

export const hasActiveFilters = (filters: TableFilters) => Object.keys(filters.quick).length > 0 || filters.advanced.items.length > 0

const toBase64Url = (text: string) => {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (text: string) => {
  const base64 = text.trim().replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/** Vazio quando não há filtro. */
export function encodeTableFilters(filters: TableFilters): string {
  return hasActiveFilters(filters) ? toBase64Url(JSON.stringify(storedFilters(filters))) : ''
}

/**
 * `{quick, advanced}` como veio (a tela confere contra os campos com `readFilters`); `null` quando o texto não é desse
 * formato, para quem tem formato antigo tentar o dele.
 */
export function decodeTableFilters(text: string): TableFilters | null {
  try {
    const json: unknown = JSON.parse(fromBase64Url(text))
    if (!json || typeof json !== 'object' || Array.isArray(json) || !('quick' in json || 'advanced' in json)) return null
    const raw = json as Partial<TableFilters>
    return {
      quick: raw.quick && typeof raw.quick === 'object' && !Array.isArray(raw.quick) ? raw.quick : {},
      advanced: raw.advanced && typeof raw.advanced === 'object' && raw.advanced.type === 'group' ? { ...raw.advanced, id: 'raiz' } : emptyFilters().advanced,
    }
  } catch {
    return null
  }
}
