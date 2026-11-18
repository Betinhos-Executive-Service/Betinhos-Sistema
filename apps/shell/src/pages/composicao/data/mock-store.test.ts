import { expect, test, vi } from 'vitest'
import { deleteMockCompositions, generateMockOp, getMockRows, inspectMockCompositionsForOp, loadMockAudit, loadMockAuditDetails } from './mock-store'
import { applyCompositionCellInput, loadCompositions } from './dataverse'

test('gera uma OP local para todos os serviços selecionados e registra na auditoria', () => {
  const ids = getMockRows().slice(0, 2).map((row) => row.id)
  expect(inspectMockCompositionsForOp(ids).eligible).toEqual(ids)
  generateMockOp(ids)
  expect(inspectMockCompositionsForOp(ids).existing).toEqual(ids)
  for (const id of ids) {
    const event = loadMockAudit([id]).records.find((record) => record.operation === 2)
    expect(event).toBeDefined()
    expect(loadMockAuditDetails(event!.auditid)).toEqual([{ field: 'OP', before: 'Não gerada', after: 'Gerada (simulação) · 1 OP com 2 serviços' }])
  }
})

test('exclui somente a seleção e mantém o evento no histórico', () => {
  const [first, second] = getMockRows()
  expect(deleteMockCompositions([first.id]).succeeded).toEqual([first.id])
  expect(getMockRows().some((row) => row.id === first.id)).toBe(false)
  expect(getMockRows().some((row) => row.id === second.id)).toBe(true)
  expect(loadMockAudit([]).records.some((record) => record._objectid_value === first.id && record.operation === 3)).toBe(true)
})

test('preserva alterações locais ao atualizar a grade', async () => {
  vi.stubGlobal('window', { Xrm: undefined, parent: {} })
  const row = getMockRows()[2]
  await applyCompositionCellInput(row, 'new_ajuste', { kind: 'literal', value: '42.00' }, 'mock')
  expect((await loadCompositions()).records.find((item) => item.id === row.id)?.values.new_ajuste).toBe('42.00')
  expect(loadMockAudit([row.id]).records.some((record) => record.operation === 2)).toBe(true)
  vi.unstubAllGlobals()
})
