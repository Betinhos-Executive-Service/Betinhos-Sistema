import { describe, expect, it } from 'vitest'
import { formatAuditValue, lookupRef, lookupRefs, parseChanges, toAuditEvent, type FieldMeta } from './format'
import { auditPath, MAX_IDS } from './source'

const F = '@OData.Community.Display.V1.FormattedValue'
const status: FieldMeta = { label: 'Status', type: 'Status', options: new Map([[202410005, 'Programado'], [202410008, 'Concluído']]) }
const saida: FieldMeta = { label: 'Data e horário de saída', type: 'DateTime', noZone: false }
const names = new Map([['3363c66f-44f5-f011-8406-7ced8da8212d', 'ABC-1D23']])

describe('parseChanges', () => {
  it('lê o JSON do changedata', () => {
    expect(parseChanges('{"changedAttributes":[{"logicalName":"cr40f_email","oldValue":null,"newValue":"a@b.com"}]}'))
      .toEqual([{ logicalName: 'cr40f_email', oldValue: null, newValue: 'a@b.com' }])
  })
  it('devolve null para texto que não é JSON (compartilhamento) ou vazio', () => {
    expect(parseChanges('systemuser,1234')).toBeNull()
    expect(parseChanges('{quebrado')).toBeNull()
    expect(parseChanges(null)).toBeNull()
  })
})

it('reconhece lookup "tabela,guid"', () => {
  expect(lookupRef('cr40f_veiculos,3363C66F-44F5-F011-8406-7CED8DA8212D')).toEqual({ entity: 'cr40f_veiculos', id: '3363c66f-44f5-f011-8406-7ced8da8212d' })
  expect(lookupRef('Destino, centro')).toBeNull()
})

describe('formatAuditValue', () => {
  it('troca opção pelo rótulo e mantém o número se a opção sumiu', () => {
    expect(formatAuditValue('202410008', status, names)).toBe('Concluído')
    expect(formatAuditValue('999', status, names)).toBe('999')
  })
  it('converte a data UTC do changedata para São Paulo', () => {
    expect(formatAuditValue('10/27/2026 15:35:00', saida, names)).toBe('27/10/2026, 12:35')
  })
  it('data sem fuso e somente data não mudam de dia', () => {
    expect(formatAuditValue('10/27/2026 00:00:00', { label: 'Vencimento', type: 'DateTime', dateOnly: true, noZone: true }, names)).toBe('27/10/2026')
  })
  it('lookup vira nome; sem nome, avisa', () => {
    expect(formatAuditValue('cr40f_veiculos,3363c66f-44f5-f011-8406-7ced8da8212d', undefined, names)).toBe('ABC-1D23')
    expect(formatAuditValue('cr40f_veiculos,00000000-0000-0000-0000-000000000001', undefined, names)).toBe('Registro removido ou sem acesso')
  })
  it('moeda, número, sim/não e vazio', () => {
    expect(formatAuditValue('1250.5', { label: 'Valor', type: 'Money' }, names)).toMatch(/^R\$\s1\.250,50$/)
    expect(formatAuditValue('0.25', { label: 'Percentual', type: 'Decimal' }, names)).toBe('0,25')
    expect(formatAuditValue('True', { label: 'Ativo', type: 'Boolean' }, names)).toBe('Sim')
    expect(formatAuditValue(null, status, names)).toBeNull()
    expect(formatAuditValue('', status, names)).toBeNull()
  })
  it('múltipla escolha junta os rótulos', () => {
    expect(formatAuditValue('1,2', { label: 'Idiomas', type: 'Virtual', options: new Map([[1, 'Inglês'], [2, 'Espanhol']]) }, names)).toBe('Inglês, Espanhol')
  })
})

describe('toAuditEvent', () => {
  const fields = new Map<string, FieldMeta>([['cr40f_status', status], ['cr40f_veiculo', { label: 'Veículo', type: 'Lookup' }], ['cr40f_destino', { label: 'Destino', type: 'String' }]])
  const row = {
    auditid: 'a1', createdon: '2026-10-27T16:28:50Z', operation: 2, action: 2, [`action${F}`]: 'Atualizar',
    _userid_value: 'u1', [`_userid_value${F}`]: 'Marina Lopes', _objectid_value: '{ABC00000-0000-0000-0000-000000000001}', [`_objectid_value${F}`]: 'OS-1951',
    changedata: JSON.stringify({ changedAttributes: [
      { logicalName: 'cr40f_status', oldValue: '202410005', newValue: '202410008' },
      { logicalName: 'cr40f_veiculo', oldValue: null, newValue: 'cr40f_veiculos,3363c66f-44f5-f011-8406-7ced8da8212d' },
      { logicalName: 'cr40f_destino', oldValue: 'Centro', newValue: 'Centro' },
    ] }),
  }
  it('monta o evento com rótulos, valores legíveis e sem campo que não mudou', () => {
    expect(toAuditEvent(row, fields, names)).toEqual({
      id: 'a1', at: '2026-10-27T16:28:50Z', user: 'Marina Lopes', operation: 'update',
      record: { id: 'abc00000-0000-0000-0000-000000000001', name: 'OS-1951' },
      changes: [
        { field: 'cr40f_status', label: 'Status', before: 'Programado', after: 'Concluído' },
        { field: 'cr40f_veiculo', label: 'Veículo', before: null, after: 'ABC-1D23' },
      ],
    })
  })
  it('ação diferente de atualizar vira o nome da ação; criação e exclusão pela operação', () => {
    expect(toAuditEvent({ ...row, action: 13, [`action${F}`]: 'Atribuir' }, fields, names)).toMatchObject({ operation: 'update', action: 'Atribuir' })
    expect(toAuditEvent({ ...row, operation: 1 }, fields, names).operation).toBe('create')
    expect(toAuditEvent({ ...row, operation: 3, changedata: null }, fields, names)).toMatchObject({ operation: 'delete', changes: [] })
    expect(toAuditEvent({ ...row, operation: 4, [`action${F}`]: 'Compartilhar' }, fields, names)).toMatchObject({ operation: 'other', action: 'Compartilhar' })
  })
  it('troca entre dois lookups sem nome continua aparecendo', () => {
    const troca = { ...row, changedata: JSON.stringify({ changedAttributes: [{ logicalName: 'cr40f_veiculo', oldValue: 'cr40f_veiculos,00000000-0000-0000-0000-00000000000a', newValue: 'cr40f_veiculos,00000000-0000-0000-0000-00000000000b' }] }) }
    expect(toAuditEvent(troca, fields, names).changes).toEqual([{ field: 'cr40f_veiculo', label: 'Veículo', before: 'Registro removido ou sem acesso', after: 'Registro removido ou sem acesso' }])
  })
  it('lista os lookups citados sem repetir', () => {
    expect(lookupRefs([row, row])).toEqual([{ entity: 'cr40f_veiculos', id: '3363c66f-44f5-f011-8406-7ced8da8212d' }])
  })
})

describe('auditPath', () => {
  it('filtra pela tabela e, com ids, pelos registros', () => {
    expect(decodeURIComponent(auditPath({ entity: 'cr40f_despesaoperacional' }))).toContain("$filter=objecttypecode eq 'cr40f_despesaoperacional'&$orderby=createdon desc")
    expect(decodeURIComponent(auditPath({ entity: 'x', ids: ['{AAA00000-0000-0000-0000-000000000001}', 'aaa00000-0000-0000-0000-000000000002'] })))
      .toContain('and (_objectid_value eq aaa00000-0000-0000-0000-000000000001 or _objectid_value eq aaa00000-0000-0000-0000-000000000002)')
  })
  it(`corta em ${MAX_IDS} ids para caber na URL`, () => {
    const ids = Array.from({ length: MAX_IDS + 20 }, (_, i) => `aaa00000-0000-0000-0000-${String(i).padStart(12, '0')}`)
    expect(decodeURIComponent(auditPath({ entity: 'x', ids })).match(/_objectid_value eq/g)).toHaveLength(MAX_IDS)
  })
})
