// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFilters, type FilterField, type TableFilters } from '@betinhos/ui'
import { columnIdOf, columnsFromConfig, configOf, columnDefsOf, extraColumnKey, filterFieldsOf, fromTableFilters, sortFromConfig, toTableFilters, type TableFilterState } from './table-view'
import { allViewFilters, buildFetchXml, type CatalogField, type ViewDefinition } from './views'

const base = { table: 'cr40f_composicaodeprecos', path: [] as string[], available: true, pickerEligible: true }
const catalog: CatalogField[] = [
  { ...base, id: 'cr40f_nome', label: 'Nome', attribute: 'cr40f_nome', type: 'String' },
  { ...base, id: 'cr40f_valor', label: 'Valor', attribute: 'cr40f_valor', type: 'Money' },
  { ...base, id: 'cr40f_data', label: 'Data saída', attribute: 'cr40f_data', type: 'DateTime' },
  { ...base, id: 'cr40f_status', label: 'Status', attribute: 'cr40f_status', type: 'Picklist' },
  { ...base, id: 'cr40f_pago', label: 'Pago', attribute: 'cr40f_pago', type: 'Boolean' },
  { ...base, id: 'cr40f_cliente', label: 'Cliente da OP', attribute: 'cr40f_cliente', type: 'Lookup' },
  { id: 'cr40f_reserva@cr40f_geral.cr40f_trajeto', label: 'Trajeto', table: 'cr40f_reserva', tableLabel: 'Reserva', attribute: 'cr40f_trajeto', path: ['cr40f_reserva'], relationships: [{ from: 'cr40f_reservaid', to: 'cr40f_geral' }], type: 'String', available: true, pickerEligible: true },
]
const byId = new Map(catalog.map((field) => [field.id, field]))
const keyOf = (id: string) => id
const fieldsFor = (definition: ViewDefinition, options = new Map()) => filterFieldsOf(catalog, definition.columns.map((column) => column.id), allViewFilters(definition).map((filter) => filter.id), keyOf, options)
const definitionWith = (patch: Partial<ViewDefinition>): ViewDefinition => ({ columns: [{ id: 'cr40f_nome', width: 160, pinned: true }, { id: 'cr40f_valor', width: 128, pinned: false }], filters: [], sort: [], ...patch })

function stateOf(definition: ViewDefinition) {
  const fields = fieldsFor(definition)
  const map = new Map(fields.map((field) => [field.key, field]))
  const state = toTableFilters(definition, (id) => map.get(id), (_id, value) => value)
  return { fields, map, state }
}
/** O que a `ViewBar` faz com os filtros antes de devolver: `readFilters` contra os campos (descarta o que não reconhece). */
const roundTrip = (definition: ViewDefinition, edit: (filters: TableFilters) => TableFilters = (filters) => filters) => {
  const { fields, map, state } = stateOf(definition)
  const next = edit(readFilters(JSON.parse(JSON.stringify(state.filters)), fields))
  return { state, patch: fromTableFilters(next, state, (key) => map.get(key)) }
}

describe('filtros: definição ↔ DS', () => {
  it('grupos OU ligados por OU viram a raiz OU e voltam iguais', () => {
    const definition = definitionWith({
      groupOperator: 'or',
      filterGroups: [
        { id: 'g1', operator: 'and', filters: [{ id: 'cr40f_nome', operator: 'like', value: 'Aurora' }, { id: 'cr40f_valor', operator: 'gt', value: '100' }] },
        { id: 'g2', operator: 'or', filters: [{ id: 'cr40f_status', operator: 'in', value: '', values: ['1', '2'] }, { id: 'cr40f_data', operator: 'today', value: '' }] },
      ],
    })
    const { state, patch } = roundTrip(definition)
    expect(state.filters.advanced.logic).toBe('or')
    expect(state.filters.advanced.items.map((item) => item.type === 'group' && item.logic)).toEqual(['and', 'or'])
    expect(patch).toEqual({ filters: [], filterGroups: definition.filterGroups, groupOperator: 'or' })
  })

  it('condição solta de coluna vira filtro por coluna; a de fora da grade vai para o avançado', () => {
    const definition = definitionWith({ filters: [{ id: 'cr40f_nome', operator: 'begins-with', value: 'Au' }, { id: 'cr40f_pago', operator: 'eq', value: 'true' }] })
    const { state, patch } = roundTrip(definition)
    expect(Object.keys(state.filters.quick)).toEqual(['cr40f_nome'])
    expect(state.filters.advanced.items).toEqual([expect.objectContaining({ field: 'cr40f_pago', op: 'yes' })])
    expect(patch).toEqual({ filters: definition.filters, filterGroups: [], groupOperator: undefined })
  })

  it('operador sem equivalente no DS fica só leitura e volta intacto, na posição original', () => {
    const definition = definitionWith({ filters: [
      { id: 'cr40f_nome', operator: 'not-begins-with', value: 'Teste' },
      { id: 'cr40f_valor', operator: 'ge', value: '10' },
      { id: 'cr40f_nome', operator: 'not-ends-with', value: 'Ltda' },
    ] })
    const { state, patch } = roundTrip(definition, (filters) => ({ ...filters, quick: {} }))
    expect(state.locked.filters.map((filter) => filter.operator)).toEqual(['not-begins-with', 'not-ends-with'])
    // O usuário tirou o filtro editável; os só leitura continuam.
    expect(patch).toEqual({ filters: [definition.filters[0], definition.filters[2]], filterGroups: [], groupOperator: undefined })
  })

  it('grupo com condição sem equivalente fica inteiro só leitura e os outros seguem editáveis', () => {
    const locked = { id: 'g1', operator: 'or' as const, filters: [{ id: 'cr40f_nome', operator: 'not-ends-with' as const, value: 'x' }, { id: 'cr40f_valor', operator: 'eq' as const, value: '1' }] }
    const editable = { id: 'g2', operator: 'or' as const, filters: [{ id: 'cr40f_valor', operator: 'lt' as const, value: '5' }] }
    const { state, patch } = roundTrip(definitionWith({ groupOperator: 'and', filterGroups: [locked, editable] }))
    expect(state.locked.groups).toEqual([locked])
    expect(patch).toEqual({ filters: [], filterGroups: [locked, editable], groupOperator: 'and' })
  })

  it('E com grupos OU de várias condições não cabe nos dois níveis: os grupos ficam só leitura', () => {
    const groups = [
      { id: 'g1', operator: 'and' as const, filters: [{ id: 'cr40f_nome', operator: 'like' as const, value: 'a' }, { id: 'cr40f_valor', operator: 'gt' as const, value: '1' }] },
      { id: 'g2', operator: 'and' as const, filters: [{ id: 'cr40f_nome', operator: 'like' as const, value: 'b' }, { id: 'cr40f_valor', operator: 'lt' as const, value: '9' }] },
    ]
    const definition = definitionWith({ filters: [{ id: 'cr40f_pago', operator: 'eq', value: 'false' }], groupOperator: 'or', filterGroups: groups })
    const { state, patch } = roundTrip(definition)
    expect(state.locked.orGroups).toEqual(groups)
    expect(patch).toEqual({ filters: definition.filters, filterGroups: groups, groupOperator: 'or' })
    // Criar grupos E junto com esses grupos OU não cabe: avisa em vez de perder.
    const conflict = roundTrip(definition, (filters) => ({ ...filters, advanced: { ...filters.advanced, items: [...filters.advanced.items, { type: 'group', id: 'novo', logic: 'and', items: [{ type: 'condition', id: 'c1', field: 'cr40f_valor', op: 'eq', value: 3 }] }] } }))
    expect(conflict.patch).toHaveProperty('error')
  })

  it('condições novas do painel viram operadores do FetchXML (datas, intervalo, não é nenhum de)', () => {
    const { patch } = roundTrip(definitionWith({}), (filters) => ({ ...filters, advanced: { ...filters.advanced, items: [
      { type: 'condition', id: 'a', field: 'cr40f_data', op: 'after', value: '2026-11-10' },
      { type: 'condition', id: 'b', field: 'cr40f_data', op: 'between', value: '2026-11-01', to: '2026-11-30' },
      { type: 'condition', id: 'c', field: 'cr40f_data', op: 'next-7' },
      { type: 'condition', id: 'd', field: 'cr40f_valor', op: 'between', value: 10, to: 20 },
      { type: 'condition', id: 'e', field: 'cr40f_status', op: 'not-in', values: [{ value: '3', label: 'Cancelado' }] },
      { type: 'condition', id: 'f', field: 'cr40f_nome', op: 'contains' },
    ] } }))
    expect('filters' in patch && patch.filters).toEqual([
      { id: 'cr40f_data', operator: 'ge', value: '2026-11-11' },
      { id: 'cr40f_data', operator: 'between', value: '', values: ['2026-11-01', '2026-11-30'] },
      { id: 'cr40f_data', operator: 'next-x-days', value: '7' },
      { id: 'cr40f_valor', operator: 'between', value: '', values: ['10', '20'] },
      { id: 'cr40f_status', operator: 'not-in', value: '', values: ['3'] },
    ])
    const fetchXml = buildFetchXml({ ...definitionWith({}), ...(patch as ViewDefinition) }, catalog)
    expect(fetchXml).toContain('<condition attribute="cr40f_data" operator="on-or-after" value="2026-11-11" />')
    expect(fetchXml).toContain('<filter type="and"><condition attribute="cr40f_data" operator="on-or-after" value="2026-11-01" /><condition attribute="cr40f_data" operator="on-or-before" value="2026-11-30" /></filter>')
    expect(fetchXml).toContain('<condition attribute="cr40f_data" operator="next-x-days" value="7" />')
    expect(fetchXml).toContain('<condition attribute="cr40f_valor" operator="between"><value>10</value><value>20</value></condition>')
    expect(fetchXml).toContain('<condition attribute="cr40f_status" operator="not-in"><value>3</value></condition>')
  })

  it('"até" e "a partir de" de views antigas abrem como antes/depois e voltam sem mudar o FetchXML', () => {
    const definition = definitionWith({ filters: [{ id: 'cr40f_data', operator: 'le', value: '2026-11-15' }, { id: 'cr40f_data', operator: 'ge', value: '2026-11-01' }] })
    const { state, patch } = roundTrip(definition)
    expect(state.filters.advanced.items).toEqual([expect.objectContaining({ op: 'before', value: '2026-11-16' }), expect.objectContaining({ op: 'after', value: '2026-10-31' })])
    expect('filters' in patch && patch.filters).toEqual(definition.filters)
  })

  it('data com hora (view nativa) abre pelo dia e "depois de" de gt mantém o filtro original se não mudar', () => {
    const definition = definitionWith({ filters: [{ id: 'cr40f_data', operator: 'gt', value: '2026-11-01T00:00:00' }] })
    const { state, patch } = roundTrip(definition)
    expect(state.filters.advanced.items[0]).toEqual(expect.objectContaining({ op: 'after', value: '2026-11-01' }))
    expect('filters' in patch && patch.filters).toEqual(definition.filters)
  })

  it('filtro de view nativa (entityname do link) é preservado ao editar outro', () => {
    const native = { id: 'cr40f_reserva@cr40f_geral.cr40f_trajeto', operator: 'like' as const, value: 'GRU', nativeAlias: 'aa' }
    const definition = definitionWith({ filters: [native] })
    const { state, patch } = roundTrip(definition, (filters) => ({ ...filters, advanced: { ...filters.advanced, items: [...filters.advanced.items, { type: 'condition', id: 'n', field: 'cr40f_valor', op: 'gt', value: 5 }] } }))
    expect(state.filters.advanced.items[0]).toEqual(expect.objectContaining({ field: native.id, op: 'contains' }))
    expect('filters' in patch && patch.filters).toEqual([native, { id: 'cr40f_valor', operator: 'gt', value: '5' }])
  })
})

describe('colunas: definição ↔ DS', () => {
  it('colunas fora das definições usam a chave x: do catálogo e voltam ao id', () => {
    const route = 'cr40f_reserva@cr40f_geral.cr40f_trajeto'
    const key = extraColumnKey(route, byId)
    expect(key).toBe(`x:${encodeURIComponent('cr40f_reserva@cr40f_geral')}/${encodeURIComponent(route)}`)
    expect(columnIdOf(key)).toBe(route)
  })

  it('largura, fixação e ordem vão e voltam; oculta sai da definição; ordenação preserva as outras chaves', () => {
    const definition = definitionWith({ sort: [{ id: 'cr40f_valor', descending: true }, { id: 'modifiedon', descending: true }] })
    const defs = columnDefsOf(definition.columns, [{ id: 'cr40f_data', width: 138, pinned: false }], byId)
    const empty: TableFilterState['filters'] = { quick: {}, advanced: { type: 'group', id: 'raiz', logic: 'and', items: [] } }
    const config = configOf(definition, defs, byId, keyOf, empty)
    expect(config.columns).toEqual([
      { key: 'cr40f_nome', visible: true, width: 160, pinned: true },
      { key: 'cr40f_valor', visible: true, width: 128 },
      { key: 'cr40f_data', visible: false },
    ])
    expect(config.sort).toEqual({ key: 'cr40f_valor', dir: 'desc' })
    const next = { ...config, columns: [config.columns[0], { ...config.columns[2], visible: true }, { ...config.columns[1], visible: false }] }
    expect(columnsFromConfig(next, definition.columns)).toEqual([{ id: 'cr40f_nome', width: 160, pinned: true }, { id: 'cr40f_data', width: 128, pinned: false }])
    expect(sortFromConfig({ key: 'cr40f_nome', dir: 'asc' }, definition.sort)).toEqual([{ id: 'cr40f_nome', descending: false }, { id: 'modifiedon', descending: true }])
    expect(sortFromConfig(null, definition.sort)).toEqual([{ id: 'modifiedon', descending: true }])
  })
})

it('campos de filtro: escolha sem opções lidas vira busca; fora da grade só no avançado', () => {
  const fields = fieldsFor(definitionWith({}), new Map([['cr40f_status', [{ value: '1', label: 'Aberta' }]]]))
  const field = (key: string) => fields.find((item) => item.key === key) as FilterField
  expect(field('cr40f_status')).toEqual(expect.objectContaining({ kind: 'choice', options: [{ value: '1', label: 'Aberta' }], advancedOnly: true }))
  expect(fieldsFor(definitionWith({})).find((item) => item.key === 'cr40f_status')?.kind).toBe('lookup')
  expect(field('cr40f_valor')).toEqual(expect.objectContaining({ kind: 'number', money: true }))
  expect(field('cr40f_valor').advancedOnly).toBeUndefined()
  expect(field('cr40f_reserva@cr40f_geral.cr40f_trajeto').relation).toBe('Reserva')
})
