/** Cache chave/valor com validade. Em produção fica no SQLite do Durable Object (sobrevive à hibernação). */
export interface CacheStore {
  get(key: string): string | undefined
  set(key: string, value: string, ttlMs: number): void
  /** Apaga as chaves que começam com o prefixo. */
  deletePrefix(prefix: string): void
}

/** Só em memória: testes e fallback quando não há Durable Object. */
export class MemoryStore implements CacheStore {
  private rows = new Map<string, { value: string; exp: number }>()
  constructor(private now: () => number = Date.now) {}
  get(key: string) {
    const row = this.rows.get(key)
    if (!row) return undefined
    if (row.exp <= this.now()) {
      this.rows.delete(key)
      return undefined
    }
    return row.value
  }
  set(key: string, value: string, ttlMs: number) {
    this.rows.set(key, { value, exp: this.now() + ttlMs })
  }
  deletePrefix(prefix: string) {
    for (const key of this.rows.keys()) if (key.startsWith(prefix)) this.rows.delete(key)
  }
}

/** Escapa `%`, `_` e `\` para usar o prefixo num LIKE ... ESCAPE '\'. */
const likePrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, '\\$&')}%`

/** Tabela `mcp_cache` no SQLite do Durable Object (`ctx.storage.sql`). */
export class SqlStore implements CacheStore {
  constructor(
    private sql: SqlStorage,
    private now: () => number = Date.now,
  ) {
    sql.exec('CREATE TABLE IF NOT EXISTS mcp_cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL)')
    sql.exec('DELETE FROM mcp_cache WHERE exp <= ?', this.now())
  }
  get(key: string) {
    const row = this.sql.exec<{ v: string; exp: number }>('SELECT v, exp FROM mcp_cache WHERE k = ?', key).toArray()[0]
    return row && row.exp > this.now() ? row.v : undefined
  }
  set(key: string, value: string, ttlMs: number) {
    this.sql.exec('INSERT OR REPLACE INTO mcp_cache (k, v, exp) VALUES (?, ?, ?)', key, value, this.now() + ttlMs)
  }
  deletePrefix(prefix: string) {
    this.sql.exec("DELETE FROM mcp_cache WHERE k LIKE ? ESCAPE '\\'", likePrefix(prefix))
  }
}
