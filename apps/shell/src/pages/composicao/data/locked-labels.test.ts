// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { lockedItems, LOCKED_REASON, nativeLockedItems, withoutLocked } from './locked-labels'
import { fromTableFilters, toTableFilters, type LockedFilters } from './table-view'
import type { CatalogField, ViewDefinition } from './views'

const base = { table: 'cr40f_composicaodeprecos', path: [] as string[], available: true, pickerEligible: true }
const catalog: CatalogField[] = [
  { ...base, id: 'cr40f_regiao', label: 'Região', attribute: 'cr40f_regiao', type: 'String' },
  { ...base, id: 'cr40f_cliente', label: 'Cliente da OP', attribute: 'cr40f_cliente', type: 'Lookup' },
  { ...base, id: 'cr40f_valor', label: 'Valor', attribute: 'cr40f_valor', type: 'Money' },
]
const byId = new Map(catalog.map((field) => [field.id, field]))
const names: Record<string, string> = { 'cr40f_cliente|guid-1': 'Tenaris' }
const label = (id: string, value: string) => names[`${id}|${value}`] ?? value

describe('lockedItems', () => {
  it('rótulo com o nome de exibição do catálogo e o valor com nome, nunca o nome lógico', () => {
    const locked: LockedFilters = { filters: [{ id: 'cr40f_regiao', operator: 'not-begins-with', value: 'Sul' }, { id: 'cr40f_cliente', operator: 'ne', value: 'guid-1' }], groups: [], orGroups: [] }
    const items = lockedItems(locked, byId, label)
    expect(items).toEqual([
      { id: 'f:0', label: 'Região não começa com Sul', reason: LOCKED_REASON },
      { id: 'f:1', label: 'Cliente da OP diferente de Tenaris', reason: LOCKED_REASON },
    ])
    expect(items.map((item) => item.label).join()).not.toMatch(/cr40f_/)
  })
  it('grupo vira um item "uma destas: …"; grupos ligados por OU viram um item só', () => {
    const group = { id: 'g', operator: 'or' as const, filters: [{ id: 'cr40f_regiao', operator: 'not-like' as const, value: 'Sul' }, { id: 'cr40f_valor', operator: 'gt' as const, value: '10' }] }
    expect(lockedItems({ filters: [], groups: [group], orGroups: [] }, byId, label)).toEqual([{ id: 'g:0', label: 'uma destas: Região não contém Sul; Valor maior que 10', reason: LOCKED_REASON }])
    expect(lockedItems({ filters: [], groups: [], orGroups: [group, { ...group, operator: 'and' }] }, byId, label).map((item) => item.label))
      .toEqual(['uma destas: (Região não contém Sul ou Valor maior que 10); (Região não contém Sul e Valor maior que 10)'])
  })
})

describe('removeLockedFilter (withoutLocked + fromTableFilters)', () => {
  it('remover f:0 de dois filtros travados deixa só o outro na definição', () => {
    const definition: ViewDefinition = { columns: [{ id: 'cr40f_valor', width: 128, pinned: false }], sort: [], filters: [
      { id: 'cr40f_regiao', operator: 'not-begins-with', value: 'Sul' },
      { id: 'cr40f_regiao', operator: 'not-ends-with', value: 'Norte' },
    ] }
    const state = toTableFilters(definition, () => undefined, label)
    expect(state.locked.filters).toHaveLength(2)
    const patch = fromTableFilters(state.filters, { ...state, locked: withoutLocked(state.locked, 'f:0') }, () => undefined)
    expect(patch).toMatchObject({ filters: [{ operator: 'not-ends-with', value: 'Norte' }] })
  })
  it('id desconhecido não mexe', () => {
    const locked: LockedFilters = { filters: [], groups: [], orGroups: [] }
    expect(withoutLocked(locked, 'n:0')).toBe(locked)
  })
})

describe('nativeLockedItems', () => {
  it('lê as condições do FetchXML com o nome do catálogo, sem ×', () => {
    const xml = '<fetch><entity name="x"><filter type="and"><condition attribute="cr40f_regiao" operator="eq" value="Sul" /><filter type="or"><condition attribute="cr40f_valor" operator="gt" value="1" /><condition attribute="cr40f_valor" operator="null" /></filter></filter></entity></fetch>'
    expect(nativeLockedItems(xml, catalog)).toEqual([
      { id: 'n:0', label: 'Região igual a Sul', reason: LOCKED_REASON, removable: false },
      { id: 'n:1', label: 'uma destas: Valor maior que 1; Valor está vazio', reason: LOCKED_REASON, removable: false },
    ])
    expect(nativeLockedItems(null, catalog)).toEqual([])
  })
})
