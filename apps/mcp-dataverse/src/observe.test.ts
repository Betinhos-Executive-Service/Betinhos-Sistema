import { describe, expect, it } from 'vitest'
import { runTool } from './observe'
import { text } from './format'

const tool = (isError = false) => ({ name: 't', handler: async () => text('segredo-xyz', isError) }) as never
const session = () => ({ calls: 3, lastStatus: 200 }) as never

describe('runTool', () => {
  it('loga uma linha sem dados e com e-mail', async () => {
    const logs: Record<string, unknown>[] = []
    await runTool(tool(), { ambiente: 'PROD', filtro: 'cpf 123' }, { session: session(), email: 'a@b.c', log: (e) => logs.push(e) })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ ferramenta: 't', ambiente: 'PROD', ok: true, usuario: 'a@b.c' })
    expect(JSON.stringify(logs[0])).not.toMatch(/cpf|segredo/)
  })

  it('bloqueia quando o limitador nega e não executa a ferramenta', async () => {
    const logs: Record<string, unknown>[] = []
    const r = await runTool(tool(), {}, { session: session(), email: 'a@b.c', limiter: { limit: async () => ({ success: false }) }, log: (e) => logs.push(e) })
    expect(r.isError).toBe(true)
    expect(logs[0]).toMatchObject({ http: 429, ok: false })
  })

  it('falha do limitador não derruba a chamada', async () => {
    const r = await runTool(tool(), {}, { session: session(), email: 'a@b.c', limiter: { limit: async () => { throw new Error('x') } }, log: () => {} })
    expect(r.isError).toBeFalsy()
  })
})
