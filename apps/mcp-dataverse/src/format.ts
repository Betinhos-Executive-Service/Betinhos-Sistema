import { DataverseError } from './dataverse'
import { EntraError } from './entra'

/** Teto de texto devolvido ao modelo (~60 KB). */
export const MAX_CHARS = 60_000
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export const text = (value: string, isError = false): ToolResult => ({
  content: [{ type: 'text', text: value }],
  ...(isError ? { isError: true } : {}),
})

/** Remove ruído de OData que só gasta tokens. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === '@odata.context' || k === '@odata.etag') continue
      out[k] = clean(v)
    }
    return out as T
  }
  return value
}

/**
 * JSON compacto limitado a `max` caracteres. Se houver lista (`value`/`itens`), corta linhas do fim até caber e
 * avisa; senão corta o texto. `_truncado` e `_aviso` sinalizam o corte.
 */
export function limitJson(payload: Record<string, unknown> | unknown[], max = MAX_CHARS): string {
  let json = JSON.stringify(payload)
  if (json.length <= max) return json
  const listKey = Array.isArray(payload) ? null : ['value', 'itens', 'colunas'].find((k) => Array.isArray(payload[k]))
  if (listKey && !Array.isArray(payload)) {
    const rows = [...(payload[listKey] as unknown[])]
    const total = rows.length
    // Busca binária pelo maior prefixo que cabe.
    let lo = 0
    let hi = total
    const build = (n: number) =>
      JSON.stringify({
        ...payload,
        [listKey]: rows.slice(0, n),
        _truncado: true,
        _aviso: `Resposta cortada em ${n} de ${total} itens por tamanho (limite ${max} caracteres). Use $select, filtros ou a página seguinte.`,
      })
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (build(mid).length <= max) lo = mid
      else hi = mid - 1
    }
    return build(lo)
  }
  json = json.slice(0, max)
  return `${json}\n[TRUNCADO: resposta cortada em ${max} caracteres. Refine a consulta.]`
}

export const ok = (payload: Record<string, unknown> | unknown[]): ToolResult => text(limitJson(clean(payload)))

/** Nunca devolva token: troca qualquer coisa com cara de JWT/Bearer. */
export function redact(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oculto]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]*)?/g, '[token oculto]')
}

export function errorResult(error: unknown): ToolResult {
  if (error instanceof DataverseError) return text(redact(error.toString()), true)
  if (error instanceof EntraError) return text(redact(`${error.message} (HTTP ${error.status})`), true)
  return text(redact(`Erro: ${error instanceof Error ? error.message : String(error)}`), true)
}
