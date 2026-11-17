import type { DataverseSession } from './dataverse'
import { AMBIENTES, type Ambiente } from './env'
import { text, type ToolResult } from './format'
import type { ToolDef } from './tools'

export interface RunDeps {
  session: DataverseSession
  email: string
  /** Binding `ratelimits` (opcional: sem ele não há limite). */
  limiter?: RateLimit
  log?: (entry: Record<string, unknown>) => void
  now?: () => number
}

const defaultLog = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry))

/**
 * Executa uma ferramenta com limite por usuário e uma linha de log JSON por chamada.
 * O log leva só metadados (ferramenta, ambiente, tempo, status HTTP, sucesso, e-mail): nunca argumentos, filtros, dados ou tokens.
 */
export async function runTool(tool: ToolDef, args: unknown, deps: RunDeps): Promise<ToolResult> {
  const now = deps.now ?? Date.now
  const log = deps.log ?? defaultLog
  const start = now()
  const raw = (args as { ambiente?: unknown } | null)?.ambiente
  const ambiente: Ambiente = AMBIENTES.includes(raw as Ambiente) ? (raw as Ambiente) : 'DEV'
  const entry = (http: number, ok: boolean, extra: Record<string, unknown> = {}) =>
    log({ evento: 'tool', ferramenta: tool.name, ambiente, ms: now() - start, http, dv: deps.session.calls, ok, usuario: deps.email, ...extra })

  if (deps.limiter) {
    // Falha do próprio limitador não derruba a chamada.
    const outcome = await deps.limiter.limit({ key: deps.email }).catch(() => ({ success: true }))
    if (!outcome.success) {
      entry(429, false, { limitado: true })
      return text('Limite de chamadas por minuto atingido; aguarde alguns segundos e tente de novo.', true)
    }
  }
  deps.session.calls = 0
  deps.session.lastStatus = 0
  const result = await tool.handler(args)
  entry(deps.session.lastStatus, !result.isError)
  return result
}
