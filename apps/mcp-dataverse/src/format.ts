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
 * (com `keepNull`, nulos ficam como null; usado em agregações) `campo@txt` no lugar do FormattedValue (só quando difere do valor) e `campo@tab` no lugar do lookuplogicalname.
 */
export function clean<T>(value: T, keepNull = false): T {
  if (Array.isArray(value)) return value.map((v) => clean(v, keepNull)) as T
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(src)) {
      if (DROPPED.has(k) || v === undefined) continue
      if (v === null) {
        // Agregações mantêm o grupo nulo explícito (senão a linha parece sem a coluna do grupo).
        if (keepNull && !k.includes('@')) out[k] = null
        continue
      }
      if (k.endsWith(FORMATTED)) {
        const base = k.slice(0, -FORMATTED.length)
        if (String(src[base]) !== String(v)) out[`${base}@txt`] = v
      } else if (k.endsWith(LOOKUP_TABLE)) {
        out[`${k.slice(0, -LOOKUP_TABLE.length)}@tab`] = v
      } else if (k.includes('@Microsoft.Dynamics.CRM.associatednavigationproperty')) {
        continue
      } else {
        out[k] = clean(v, keepNull)
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
    // Cortou por tamanho: a página seguinte pularia as linhas cortadas, então some o token de continuação.
    const { proximaPagina, ...rest } = payload as Record<string, unknown>
    const build = (n: number) =>
      JSON.stringify({
        ...rest,
        [listKey]: rows.slice(0, n),
        ...('maisRegistros' in payload || proximaPagina != null ? { maisRegistros: true } : {}),
        _truncado: true,
        _aviso: `resposta cortada: ${n} de ${total} linhas; reduza tamanhoPagina ou select, ou refine o filtro (limite ${max} caracteres). Não há página seguinte para as linhas cortadas.`,
      })
    // Cada linha é serializada uma vez (CPU do plano gratuito): estima o prefixo que cabe e confere com uma montagem real.
    const sizes = rows.map((r) => JSON.stringify(r).length + 1)
    const overhead = build(0).length + 16
    let n = 0
    let used = overhead
    while (n < total && used + sizes[n] <= max) used += sizes[n++]
    let out = build(n)
    while (out.length > max && n > 0) out = build(--n)
    if (out.length <= max) return out
  }
  // Sem lista para cortar: devolve JSON válido com um trecho do início.
  let keep = max - 300
  let out = ''
  do {
    out = JSON.stringify({
      _truncado: true,
      _aviso: `Resposta maior que ${max} caracteres; só o início vem em "parcial". Refine: select menor, filtro ou top.`,
      parcial: json.slice(0, Math.max(keep, 0)),
    })
    keep = Math.floor(keep * 0.85)
  } while (out.length > max && keep > 0)
  return out
}

export const ok = (payload: Record<string, unknown> | unknown[], opts: { keepNulls?: boolean } = {}): ToolResult =>
  text(limitJson(clean(payload, opts.keepNulls)))

/** Nunca devolva token: troca qualquer coisa com cara de JWT/Bearer. */
export function redact(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oculto]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]*)?/g, '[token oculto]')
}

/** `extra` = dica que ensina a corrigir a chamada (montada por `explainError` em tools.ts). */
export function errorResult(error: unknown, extra?: string, hintFirst = false): ToolResult {
  const tip = extra ? `\n${extra}` : ''
  if (error instanceof z.ZodError) {
    return text(`Entrada inválida: ${error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ')}${tip}`, true)
  }
  if (error instanceof DataverseError) return text(redact(extra && hintFirst ? `${extra}\n${error.toString()}` : error.toString() + tip), true)
  if (error instanceof EntraError) return text(redact(`${error.message} (HTTP ${error.status})`), true)
  return text(redact(`Erro: ${error instanceof Error ? error.message : String(error)}${tip}`), true)
}
