import type { KV } from './columns'
import { PAGE_SIZE } from './types'

/** Quantidades de linhas por página oferecidas no rodapé; a primeira é a padrão. */
export const PAGE_SIZES = [50, 100, 200] as const
export const PAGE_SIZE_KEY = 'betinhos.geral.pagina.v1'

export const isPageSize = (value: unknown): value is (typeof PAGE_SIZES)[number] => PAGE_SIZES.some((size) => size === value)

/** Lê a quantidade salva; valor ausente, corrompido ou fora de 50/100/200 volta ao padrão. */
export function loadPageSize(kv: KV): number {
  try {
    const parsed: unknown = JSON.parse(kv.getItem(PAGE_SIZE_KEY) ?? 'null')
    return isPageSize(parsed) ? parsed : PAGE_SIZE
  } catch { return PAGE_SIZE }
}

export function savePageSize(kv: KV, size: number) {
  try { kv.setItem(PAGE_SIZE_KEY, JSON.stringify(size)) } catch { /* sem armazenamento: vale só nesta sessão */ }
}
