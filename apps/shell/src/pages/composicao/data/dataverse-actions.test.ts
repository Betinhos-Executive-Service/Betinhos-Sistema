import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteCompositions, getOpFlowUrl, inspectCompositionsForOp, triggerOpFlow } from './dataverse'

afterEach(() => vi.unstubAllGlobals())

describe('comandos Dataverse', () => {
  it('deduplica serviços e só envia para OP os que não têm OP e puderam ser lidos', async () => {
    const retrieveRecord = vi.fn(async (entity: string, id: string) => {
      if (entity === 'cr40f_composicaodeprecos') {
        if (id === 'c4') throw new Error('sem permissão')
        return { _cr40f_servicorelacionadogeral_value: id === 'c3' ? 's2' : 's1' }
      }
      if (id === 's2') throw new Error('falha de leitura')
      return { _cr40f_financeiro_value: null }
    })
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveRecord } } })
    const result = await inspectCompositionsForOp(['c1', 'c2', 'c3', 'c4'])
    expect(result.eligible).toEqual(['s1'])
    expect(result.readErrors).toHaveLength(2)
    expect(retrieveRecord).toHaveBeenCalledTimes(6)
  })

  it('consulta o valor configurado antes do padrão e envia o payload real do Flow', async () => {
    const retrieveMultipleRecords = vi.fn(async () => ({ entities: [{ value: 'https://flow.example/run' }] }))
    const fetch = vi.fn(async () => ({ status: 202 }))
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })
    vi.stubGlobal('fetch', fetch)
    expect(await getOpFlowUrl()).toBe('https://flow.example/run')
    await triggerOpFlow('https://flow.example/run', ['s1', 's2'])
    expect(fetch).toHaveBeenCalledWith('https://flow.example/run', expect.objectContaining({ body: '{"guids":"s1,s2"}' }))
  })

  it('separa serviço que já possui OP e composição sem vínculo', async () => {
    const retrieveRecord = vi.fn(async (entity: string, id: string) => entity === 'cr40f_composicaodeprecos'
      ? { _cr40f_servicorelacionadogeral_value: id === 'c1' ? 's1' : null }
      : { _cr40f_financeiro_value: 'op1', cr40f_id: 'OS-101' })
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveRecord } } })
    expect(await inspectCompositionsForOp(['c1', 'c2'])).toEqual({ eligible: [], existing: ['OS-101'], withoutService: ['c2'], readErrors: [] })
  })

  it('mantém falhas de exclusão identificadas sem apagar outros registros', async () => {
    const deleteRecord = vi.fn(async (_entity: string, id: string) => { if (id === 'c2') throw new Error('bloqueado') })
    const onProgress = vi.fn()
    vi.stubGlobal('window', { Xrm: { WebApi: { deleteRecord } } })
    expect(await deleteCompositions(['c1', 'c2'], onProgress)).toEqual({ succeeded: ['c1'], failed: [{ id: 'c2', message: 'bloqueado' }] })
    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]])
  })
})
