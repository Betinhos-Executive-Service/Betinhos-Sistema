import { describe, expect, it, vi } from 'vitest'
import { initialCompositions } from './compositions'
import { CompositionSaveQueue } from './composition-save-queue'

const row = { ...initialCompositions[0], rowVersion: 'v1' }
const firstField = 'cr40f_valorhoramotorista' as const
const secondField = 'cr40f_valortempodeespera' as const

describe('fila de gravação por composição', () => {
  it('espera a primeira gravação e usa a versão atualizada na segunda célula', async () => {
    let finishFirst!: (value: { rowId: string; rowVersion: string; updatedValues: Record<string, string>; formulas: Record<string, null> }) => void
    const first = new Promise<Parameters<typeof finishFirst>[0]>((resolve) => { finishFirst = resolve })
    const save = vi.fn().mockImplementationOnce(() => first).mockImplementationOnce(async (current) => ({ rowId: current.id, rowVersion: 'v3', updatedValues: { [secondField]: '30.00' }, formulas: {} }))
    const queue = new CompositionSaveQueue(save)
    const a = queue.enqueue(row, firstField, { kind: 'literal', value: '20.00' }, 'dataverse')
    const b = queue.enqueue(row, secondField, { kind: 'literal', value: '30.00' }, 'dataverse')
    expect(save).toHaveBeenCalledTimes(1)
    finishFirst({ rowId: row.id, rowVersion: 'v2', updatedValues: { [firstField]: '20.00' }, formulas: { [firstField]: null } })
    await a
    const updated = await b
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toMatchObject({ rowVersion: 'v2', values: { [firstField]: '20.00' } })
    expect(updated).toMatchObject({ rowVersion: 'v3', values: { [firstField]: '20.00', [secondField]: '30.00' } })
  })

  it('usa a última versão também depois que a fila ficou vazia', async () => {
    const save = vi.fn(async (current) => ({ rowId: current.id, rowVersion: current.rowVersion === 'v1' ? 'v2' : 'v3', updatedValues: {}, formulas: {} }))
    const queue = new CompositionSaveQueue(save)
    await queue.enqueue(row, firstField, { kind: 'literal', value: '20.00' }, 'dataverse')
    await queue.enqueue(row, firstField, { kind: 'literal', value: '30.00' }, 'dataverse')
    expect(save.mock.calls[1][0].rowVersion).toBe('v2')
    queue.reset()
    await queue.enqueue(row, firstField, { kind: 'literal', value: '40.00' }, 'dataverse')
    expect(save.mock.calls[2][0].rowVersion).toBe('v1')
  })

  it('não envia a próxima gravação se a anterior falhou', async () => {
    let rejectFirst!: (error: Error) => void
    const first = new Promise<never>((_resolve, reject) => { rejectFirst = reject })
    const save = vi.fn().mockImplementationOnce(() => first)
    const queue = new CompositionSaveQueue(save)
    const a = queue.enqueue(row, firstField, { kind: 'literal', value: '20.00' }, 'dataverse')
    const b = queue.enqueue(row, secondField, { kind: 'literal', value: '30.00' }, 'dataverse')
    const checked = Promise.allSettled([a, b])
    rejectFirst(new Error('CONCURRENCY_CONFLICT'))
    expect((await checked).map((outcome) => outcome.status)).toEqual(['rejected', 'rejected'])
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('usa a versão relida após conflito na próxima tentativa', async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({ rowId: row.id, rowVersion: 'v2', updatedValues: {}, formulas: {} })
      .mockRejectedValueOnce(new Error('CONCURRENCY_CONFLICT'))
      .mockImplementationOnce(async (current) => ({ rowId: current.id, rowVersion: 'v10', updatedValues: {}, formulas: {} }))
    const queue = new CompositionSaveQueue(save)
    await queue.enqueue(row, firstField, { kind: 'literal', value: '20.00' }, 'dataverse')
    await expect(queue.enqueue(row, firstField, { kind: 'literal', value: '30.00' }, 'dataverse')).rejects.toThrow('CONCURRENCY_CONFLICT')
    queue.sync({ ...row, rowVersion: 'v9' })
    await queue.enqueue(row, firstField, { kind: 'literal', value: '30.00' }, 'dataverse')
    expect(save.mock.calls[2][0].rowVersion).toBe('v9')
  })
})
