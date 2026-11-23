// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { lockedItems, LOCKED_REASON, nativeLockedItems, nativeValueRefs, withoutLocked } from './locked-labels'
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

  const GUID = '00000000-0000-4000-8000-000000000001'
  const GUID_SEM_NOME = '00000000-0000-4000-8000-000000000002'
  const statusField: CatalogField = { ...base, id: 'new_status', label: 'Status', attribute: 'new_status', type: 'Picklist' }
  const withNames = [...catalog, statusField]
  const nameOf = (field: CatalogField, value: string) => ({ 'new_status|1': 'Aprovada', [`cr40f_cliente|${GUID}`]: 'Cliente Exemplo' } as Record<string, string>)[`${field.id}|${value}`]

  it('(a) choice e lookup aparecem com o nome; GUID sem nome vira "registro selecionado"', () => {
    const xml = `<fetch><entity name="x"><filter type="and"><condition attribute="new_status" operator="eq" value="1" /><condition attribute="cr40f_cliente" operator="eq" value="{${GUID.toUpperCase()}}" /><condition attribute="cr40f_cliente" operator="ne" value="${GUID_SEM_NOME}" /></filter></entity></fetch>`
    const labels = nativeLockedItems(xml, withNames, nameOf).map((item) => item.label)
    expect(labels).toEqual(['Status igual a Aprovada', 'Cliente da OP igual a Cliente Exemplo', 'Cliente da OP diferente de registro selecionado'])
    expect(labels.join()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })

  it('(a) pede ao hook os nomes que faltam: campos de choice e lookup com seus valores', () => {
    const xml = `<fetch><entity name="x"><filter type="and"><condition attribute="new_status" operator="in"><value>1</value><value>2</value></condition><condition attribute="cr40f_cliente" operator="eq" value="{${GUID.toUpperCase()}}" /><condition attribute="cr40f_regiao" operator="eq" value="Sul" /></filter></entity></fetch>`
    expect(nativeValueRefs(xml, withNames).map(({ field, values }) => [field.id, values])).toEqual([['new_status', ['1', '2']], ['cr40f_cliente', [GUID]]])
  })

  it('(b) filtro de tabela relacionada usa o rótulo do catálogo; sem campo no catálogo, "Campo de tabela relacionada"', () => {
    const related: CatalogField = { id: 'client', label: 'Nome', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'String', available: true }
    const xml = '<fetch><entity name="x"><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_1" link-type="inner"><filter type="and"><condition attribute="cr40f_nomedocliente" operator="like" value="%Exemplo%" /><condition attribute="cr40f_outro" operator="eq" value="Sul" /></filter></link-entity></entity></fetch>'
    const labels = nativeLockedItems(xml, [...catalog, related]).map((item) => item.label)
    expect(labels).toHaveLength(2)
    expect(labels[0]).toMatch(/^(?!Campo de tabela relacionada).* contém .*Exemplo/)
    expect(labels[1]).toBe('Campo de tabela relacionada igual a Sul')
    expect(nativeLockedItems(xml, catalog).map((item) => item.label)).toEqual(['Campo de tabela relacionada contém "…Exemplo…"', 'Campo de tabela relacionada igual a Sul'])
  })

  it('(b) condição da raiz com entityname também é tabela relacionada', () => {
    const xml = '<fetch><entity name="x"><link-entity name="cr40f_reservadeveculos" from="a" to="b" alias="a_1" link-type="inner" /><filter type="and"><condition entityname="a_1" attribute="cr40f_desconhecido" operator="eq" value="Sul" /></filter></entity></fetch>'
    expect(nativeLockedItems(xml, catalog).map((item) => item.label)).toEqual(['Campo de tabela relacionada igual a Sul'])
  })

  it('(c) grupo com uma condição não escreve "todas estas:" nem "uma destas:"', () => {
    const xml = '<fetch><entity name="x"><filter type="and"><filter type="or"><condition attribute="cr40f_regiao" operator="eq" value="Sul" /></filter><filter type="and"><condition attribute="cr40f_valor" operator="gt" value="1" /></filter></filter></entity></fetch>'
    const labels = nativeLockedItems(xml, catalog).map((item) => item.label)
    expect(labels).toEqual(['Região igual a Sul', 'Valor maior que 1'])
  })
})
