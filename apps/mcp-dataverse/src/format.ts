import { z } from 'zod'
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

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname'
const DROPPED = new Set(['@odata.context', '@odata.etag'])

/**
 * Compacta o que sai do Dataverse para gastar menos tokens: sem `@odata.context`/`@odata.etag`, sem campos nulos,
 * `campo@txt` no lugar do FormattedValue (só quando difere do valor) e `campo@tab` no lugar do lookuplogicalname.
 */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(src)) {
      if (DROPPED.has(k) || v === null || v === undefined) continue
      if (k.endsWith(FORMATTED)) {
        const base = k.slice(0, -FORMATTED.length)
        if (String(src[base]) !== String(v)) out[`${base}@txt`] = v
      } else if (k.endsWith(LOOKUP_TABLE)) {
        out[`${k.slice(0, -LOOKUP_TABLE.length)}@tab`] = v
      } else if (k.includes('@Microsoft.Dynamics.CRM.associatednavigationproperty')) {
        continue
      } else {
        out[k] = clean(v)
      }
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
  const json = JSON.stringify(payload)
  if (json.length <= max) return json
  const listKey = Array.isArray(payload) ? null : ['value', 'itens', 'colunas'].find((k) => Array.isArray(payload[k]))
  if (listKey && !Array.isArray(payload)) {
    const rows = payload[listKey] as unknown[]
    const total = rows.length
    const build = (n: number) =>
      JSON.stringify({
        ...payload,
        [listKey]: rows.slice(0, n),
        _truncado: true,
        _aviso: `Resposta cortada em ${n} de ${total} itens por tamanho (limite ${max} caracteres). Use $select, filtros ou a página seguinte.`,
      })
    // Cada linha é serializada uma vez (CPU do plano gratuito): estima o prefixo que cabe e confere com uma montagem real.
    const sizes = rows.map((r) => JSON.stringify(r).length + 1)
    const overhead = build(0).length + 16
    let n = 0
    let used = overhead
    while (n < total && used + sizes[n] <= max) used += sizes[n++]
    let out = build(n)
    while (out.length > max && n > 0) out = build(--n)
    return out
  }
  return `${json.slice(0, max)}\n[TRUNCADO: resposta cortada em ${max} caracteres. Refine a consulta.]`
}

export const ok = (payload: Record<string, unknown> | unknown[]): ToolResult => text(limitJson(clean(payload)))

/** Nunca devolva token: troca qualquer coisa com cara de JWT/Bearer. */
export function redact(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oculto]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]*)?/g, '[token oculto]')
}

export function errorResult(error: unknown): ToolResult {
  if (error instanceof z.ZodError) {
    return text(`Entrada inválida: ${error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ')}`, true)
  }
  if (error instanceof DataverseError) return text(redact(error.toString()), true)
  if (error instanceof EntraError) return text(redact(`${error.message} (HTTP ${error.status})`), true)
  return text(redact(`Erro: ${error instanceof Error ? error.message : String(error)}`), true)
}
