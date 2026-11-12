import type { CatalogField } from './views'

/**
 * Cache do catálogo de campos (metadata do Dataverse) no navegador, compartilhado entre abas e sessões:
 * sem ele, cada aba nova relia a metadata das tabelas relacionadas antes de mostrar a grade.
 * O catálogo é usado imediatamente e a metadata é revalidada em segundo plano;
 * só muda a tela quando o schema realmente mudou. Não guarda dados de registros.
 */
const CACHE_VERSION = 1
const MAX_AGE_MS = 12 * 60 * 60 * 1000

type CachedCatalog = { version: number; savedAt: number; fields: CatalogField[] }

export function catalogCacheKey(clientUrl: string) {
  return `tela-composicao-preco:catalog:v${CACHE_VERSION}:${clientUrl.replace(/\/+$/, '').toLocaleLowerCase('en-US')}`
}

function storage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

export function readCachedCatalog(key: string, now = Date.now()): CatalogField[] | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedCatalog>
    if (parsed.version !== CACHE_VERSION || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.fields)) return null
    if (now - parsed.savedAt > MAX_AGE_MS || !parsed.fields.length) return null
    if (!parsed.fields.every((field) => field && typeof field === 'object' && typeof field.id === 'string' && typeof field.attribute === 'string' && Array.isArray(field.path))) return null
    return parsed.fields
  } catch {
    return null
  }
}

export function writeCachedCatalog(key: string, fields: CatalogField[], now = Date.now()) {
  const store = storage()
  if (!store) return
  try { store.setItem(key, JSON.stringify({ version: CACHE_VERSION, savedAt: now, fields } satisfies CachedCatalog)) }
  catch { /* Cota cheia ou armazenamento bloqueado: a tela segue sem cache. */ }
}

export function sameCatalog(left: CatalogField[], right: CatalogField[]) {
  return left.length === right.length && JSON.stringify(left) === JSON.stringify(right)
}
