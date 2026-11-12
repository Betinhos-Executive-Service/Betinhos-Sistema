// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { initialCompositions } from './compositions'
import { applyCompositionCellInput } from './dataverse'

afterEach(() => vi.unstubAllGlobals())

it('executa a Custom API mantendo o contexto de Xrm.WebApi.online', async () => {
  const send = vi.fn(async (_request: unknown) => ({
    ok: true,
    json: async () => ({ NewRowVersion: '124', UpdatedCellsJson: '{"cr40f_valorhoramotorista":"45.45"}', FormulaStateJson: '{}' }),
  }))
  const online = {
    _execute: send,
    execute(request: unknown) { return this._execute(request) },
  }
  vi.stubGlobal('window', { Xrm: { WebApi: { online } } })

  const row = { ...initialCompositions[0], rowVersion: '123' }
  const result = await applyCompositionCellInput(row, 'cr40f_valorhoramotorista', { kind: 'literal', value: '45.45' }, 'dataverse')

  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    TargetField: 'cr40f_valorhoramotorista', LiteralValue: '45.45', ExpectedRowVersion: '123',
  }))
  expect(result).toMatchObject({ rowVersion: '124', updatedValues: { cr40f_valorhoramotorista: '45.45' } })
})
