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
  const retrieveRecord = vi.fn(async () => ({ cr40f_valorhoramotorista: 45.45, new_subtotal: 100, new_valortotal: 120 }))
  vi.stubGlobal('window', { Xrm: { WebApi: { online, retrieveRecord } } })

  const row = { ...initialCompositions[0], rowVersion: '123' }
  const result = await applyCompositionCellInput(row, 'cr40f_valorhoramotorista', { kind: 'literal', value: '45.45' }, 'dataverse')

  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    TargetField: 'cr40f_valorhoramotorista', LiteralValue: '45.45', ExpectedRowVersion: '123',
  }))
  expect(result).toMatchObject({ rowVersion: '124', updatedValues: { cr40f_valorhoramotorista: '45.45', new_subtotal: '100.00', new_valortotal: '120.00' } })
})

it('recusa o "salvo" quando o Dataverse não manteve o valor enviado', async () => {
  const online = {
    execute: async () => ({ ok: true, json: async () => ({ NewRowVersion: '2', UpdatedCellsJson: '{"new_ajuste":"50.00"}', FormulaStateJson: '{}' }) }),
  }
  const retrieveRecord = vi.fn(async () => ({ new_ajuste: 0, new_subtotal: 100, new_valortotal: 100 }))
  vi.stubGlobal('window', { Xrm: { WebApi: { online, retrieveRecord } } })

  const row = { ...initialCompositions[0], rowVersion: '1' }
  await expect(applyCompositionCellInput(row, 'new_ajuste', { kind: 'literal', value: '50' }, 'dataverse'))
    .rejects.toThrow('O Dataverse não manteve Ajuste: ficou 0.00 em vez de 50.00')
})

it('não dá o check quando a releitura falha', async () => {
  const online = {
    execute: async () => ({ ok: true, json: async () => ({ NewRowVersion: '3', UpdatedCellsJson: '{"new_ajuste":"50.00"}', FormulaStateJson: '{}' }) }),
  }
  const retrieveRecord = vi.fn(async () => { throw new Error('rede') })
  vi.stubGlobal('window', { Xrm: { WebApi: { online, retrieveRecord } } })

  const row = { ...initialCompositions[0], rowVersion: '2' }
  await expect(applyCompositionCellInput(row, 'new_ajuste', { kind: 'literal', value: '50' }, 'dataverse'))
    .rejects.toThrow('Não foi possível confirmar Ajuste no Dataverse')
})
