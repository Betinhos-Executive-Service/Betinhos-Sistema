import { describe, expect, it } from 'vitest'
import type { FilterCondition } from '@betinhos/ui'
import { filterKind, isFilterable, toCondition, toFilterField, toViewFilters } from './column-filter'

const c = (op: FilterCondition['op'], extra: Partial<FilterCondition> = {}): FilterCondition => ({ type: 'condition', id: 'x', field: 'col', op, ...extra })

describe('filtro da coluna do DS → filtros da view', () => {
  it('mapeia o tipo do Dataverse para o tipo do filtro', () => {
    expect(['String', 'Lookup', 'Picklist', 'Money', 'DateTime', 'Boolean'].map(filterKind)).toEqual(['text', 'lookup', 'lookup', 'number', 'date', 'bool'])
    expect(['Customer', 'Owner', 'Uniqueidentifier', 'Status'].map(isFilterable)).toEqual([false, false, false, true])
  })

  it('texto, vazio e sim/não', () => {
    expect(toViewFilters('col', 'text', c('contains', { value: 'Ten' }))).toEqual([{ id: 'col', operator: 'like', value: 'Ten' }])
    expect(toViewFilters('col', 'text', c('empty'))).toEqual([{ id: 'col', operator: 'null', value: '' }])
    expect(toViewFilters('col', 'bool', c('no'))).toEqual([{ id: 'col', operator: 'eq', value: 'false' }])
  })

  it('lookup: "é um de" vira in e "não é nenhum de" vira not-in (o mesmo formato da ViewBar)', () => {
    const values = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
    expect(toViewFilters('col', 'lookup', c('in', { values }))).toEqual([{ id: 'col', operator: 'in', value: '', values: ['a', 'b'] }])
    expect(toViewFilters('col', 'lookup', c('not-in', { values }))).toEqual([{ id: 'col', operator: 'not-in', value: '', values: ['a', 'b'] }])
  })

  it('"entre" vira between e atalhos de data ficam relativos (valem no dia em que a view é aberta)', () => {
    expect(toViewFilters('col', 'number', c('between', { value: 10, to: 20 }))).toEqual([{ id: 'col', operator: 'between', value: '', values: ['10', '20'] }])
    expect(toViewFilters('col', 'date', c('this-month'))).toEqual([{ id: 'col', operator: 'this-month', value: '' }])
    expect(toViewFilters('col', 'date', c('next-7'))).toEqual([{ id: 'col', operator: 'next-x-days', value: '7' }])
    expect(toViewFilters('col', 'date', c('after', { value: '2026-11-30' }))).toEqual([{ id: 'col', operator: 'ge', value: '2026-12-01' }])
  })
})

describe('filtros da view → condição do painel', () => {
  it('reabre o que o painel gravou', () => {
    const cases: Array<[string, FilterCondition]> = [
      ['String', c('begins', { value: 'Ten' })],
      ['Money', c('between', { value: 10, to: 20 })],
      ['DateTime', c('after', { value: '2026-11-30' })],
      ['DateTime', c('before', { value: '2026-11-30' })],
      ['Lookup', c('not-in', { values: [{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }] })],
      ['Boolean', c('yes')],
    ]
    for (const [type, condition] of cases) {
      const field = toFilterField('col', 'Coluna', type)
      const { type: _type, id: _id, ...expected } = condition
      expect(toCondition(field, toViewFilters('col', field.kind, condition))).toMatchObject(expected)
    }
  })

  it('lookup igual a um valor abre como "é um de", com o rótulo resolvido', () => {
    const field = toFilterField('col', 'Cliente', 'Lookup')
    expect(toCondition(field, [{ id: 'col', operator: 'eq', value: 'a' }], () => 'Tenaris')).toMatchObject({ op: 'in', values: [{ value: 'a', label: 'Tenaris' }] })
  })

  it('lê o formato antigo do menu: ge + le como "entre" e vários ne como "não é nenhum de"', () => {
    expect(toCondition(toFilterField('col', 'Valor', 'Money'), [{ id: 'col', operator: 'ge', value: '10' }, { id: 'col', operator: 'le', value: '20' }])).toMatchObject({ op: 'between', value: 10, to: 20 })
    expect(toCondition(toFilterField('col', 'Cliente', 'Lookup'), [{ id: 'col', operator: 'ne', value: 'a' }, { id: 'col', operator: 'ne', value: 'b' }])).toMatchObject({ op: 'not-in', values: [{ value: 'a' }, { value: 'b' }] })
  })

  it('combinação que não cabe numa condição abre vazia', () => {
    const field = toFilterField('col', 'Cliente', 'String')
    expect(toCondition(field, [{ id: 'col', operator: 'like', value: 'a' }, { id: 'col', operator: 'like', value: 'b' }])).toBeUndefined()
    expect(toCondition(field, [{ id: 'col', operator: 'not-begins-with', value: 'a' }])).toBeUndefined()
  })
})
