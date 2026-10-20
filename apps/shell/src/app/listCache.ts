/**
 * Cache em memória das listas, por escopo (o `host` da sessão ou o source da tela): voltar a uma lista mostra o que
 * já carregou na hora. Até `LIST_TTL` a cópia vale sem ir ao servidor; depois ela aparece e a tela revalida em
 * segundo plano (stale-while-revalidate). Gravar um registro marca a cópia como vencida e descarta as variantes.
 */

export const LIST_TTL = 90_000

export type CacheEntry<V> = { value: V; at: number }

export class ListCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>()
  constructor(private readonly now: () => number = Date.now) {}

  get<V>(key: string) {
    return this.entries.get(key) as CacheEntry<V> | undefined
  }

  /** Dentro do TTL desde a última carga completa. */
  isFresh(entry: CacheEntry<unknown>, ttl = LIST_TTL) {
    return entry.at > 0 && this.now() - entry.at < ttl
  }

  set<V>(key: string, value: V) {
    this.entries.set(key, { value, at: this.now() })
  }

  /** Aplica a mudança local e marca a cópia como vencida: a próxima abertura mostra e revalida. */
  update<V>(key: string, fn: (value: V) => V) {
    const entry = this.get<V>(key)
    if (entry) this.entries.set(key, { value: fn(entry.value), at: 0 })
  }

  /** Marca como vencidas as chaves que começam com `prefix`: continuam aparecendo, mas a próxima abertura revalida. */
  stale(prefix: string) {
    for (const [key, entry] of this.entries) if (key.startsWith(prefix)) this.entries.set(key, { ...entry, at: 0 })
  }

  /** Descarta as chaves que começam com `prefix` (as outras variantes da lista, ex.: outros períodos), menos `except`. */
  invalidate(prefix: string, except?: string) {
    for (const key of [...this.entries.keys()]) if (key.startsWith(prefix) && key !== except) this.entries.delete(key)
  }
}

const scopes = new WeakMap<object, ListCache>()

/** Cache do escopo; um `host` novo (outra sessão, cada teste) começa vazio. */
export function listCache(scope: object) {
  let cache = scopes.get(scope)
  if (!cache) {
    cache = new ListCache()
    scopes.set(scope, cache)
  }
  return cache
}

type Method = (...args: never[]) => Promise<unknown>

/**
 * Cópia da fonte em que as gravações (`methods`) marcam a lista como vencida no cache da própria cópia, venham de
 * onde vierem (a tela da lista ou a ficha aberta em outra tela): a próxima abertura mostra e revalida.
 */
export function staleOnWrite<S extends object>(source: S, prefix: string, methods: readonly (keyof S)[]): S {
  const wrapped = { ...source }
  const cache = listCache(wrapped)
  for (const name of methods) {
    const original = source[name] as unknown as Method
    ;(wrapped as Record<keyof S, unknown>)[name] = async (...args: never[]) => {
      try {
        return await original(...args)
      } finally {
        cache.stale(prefix)
      }
    }
  }
  return wrapped
}
