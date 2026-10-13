import type { KV } from './columns'

export type ViewMode = 'tabela' | 'cards'
export const VIEW_MODE_KEY = 'betinhos.geral.modo.v1'

/** Modo de exibição no desktop; ausente, inválido ou storage indisponível volta para a tabela. */
export function loadViewMode(kv: KV): ViewMode {
  try {
    const raw = kv.getItem(VIEW_MODE_KEY)
    return raw === 'cards' ? 'cards' : 'tabela'
  } catch { return 'tabela' }
}

export function saveViewMode(kv: KV, mode: ViewMode) {
  try { kv.setItem(VIEW_MODE_KEY, mode) } catch { /* sem storage: a escolha vale só nesta sessão */ }
}
