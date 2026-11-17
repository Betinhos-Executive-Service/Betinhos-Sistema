import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import pkg from '../package.json'
import { DataverseSession } from './dataverse'
import type { AppEnv, Props } from './env'
import { buildTools } from './tools'

export const SERVER_NAME = 'mcp-dataverse'
export const SERVER_VERSION: string = pkg.version

/** Servidor MCP (um Durable Object por sessão); as chamadas ao Dataverse usam o refresh token da pessoa. */
export class DataverseMcp extends McpAgent<AppEnv, unknown, Props> {
  server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })

  async init() {
    const props = this.props
    if (!props?.refreshToken) throw new Error('Sessão sem credenciais; faça login de novo no conector.')
    const session = new DataverseSession(this.env, props.refreshToken)
    for (const tool of buildTools({ session, identity: { email: props.email, name: props.name } })) {
      this.server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.schema, annotations: tool.annotations },
        async (args: unknown) => tool.handler(args) as any,
      )
    }
  }
}
