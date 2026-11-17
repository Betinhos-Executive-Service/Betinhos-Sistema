import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker-provider.js'
import pkg from '../package.json'
import { DataverseSession } from './dataverse'
import type { AppEnv, Props } from './env'
import { runTool } from './observe'
import { SqlStore } from './store'
import { buildTools } from './tools'

export const SERVER_NAME = 'mcp-dataverse'
export const SERVER_VERSION: string = pkg.version

/** Servidor MCP (um Durable Object por sessão); as chamadas ao Dataverse usam o refresh token da pessoa. */
export class DataverseMcp extends McpAgent<AppEnv, unknown, Props> {
  // Validador explícito: o padrão do SDK (ajv) é aliasado para stub no wrangler.jsonc para reduzir o pacote.
  server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() })

  async init() {
    const props = this.props
    if (!props?.refreshToken) throw new Error('Sessão sem credenciais; faça login de novo no conector.')
    // Tokens e metadata ficam no SQLite do Durable Object e sobrevivem à hibernação.
    const session = new DataverseSession(this.env, props.refreshToken, Date.now, { store: new SqlStore(this.ctx.storage.sql) })
    for (const tool of buildTools({ session, identity: { email: props.email, name: props.name } })) {
      this.server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.schema, annotations: tool.annotations },
        async (args: unknown) => runTool(tool, args, { session, email: props.email, limiter: this.env.RL_USER }) as any,
      )
    }
  }
}
