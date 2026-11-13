// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFetchXml, buildLayoutXml, loadColumnCatalog, loadViews, parseLayoutXml, parseNativeFilters, saveView, type CatalogField, type ViewDefinition } from './views'

const catalog: CatalogField[] = [
  { id: 'client', label: 'Cliente', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', path: ['cr40f_reservadeveculos', 'cr40f_clientes1'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }, { from: 'cr40f_clientes1id', to: 'cr40f_cliente' }], type: 'String', available: true },
  { id: 'new_valortotal', label: 'Total', table: 'cr40f_composicaodeprecos', attribute: 'new_valortotal', path: [], type: 'Money', available: true },
  { id: 'modifiedon', label: 'Alterado em', table: 'cr40f_composicaodeprecos', attribute: 'modifiedon', path: [], type: 'DateTime', available: true },
  { id: 'new_programado', label: 'Foi programado?', table: 'cr40f_composicaodeprecos', attribute: 'new_programado', path: [], type: 'Boolean', available: true },
  { id: 'reserva@cr40f_servicorelacionadogeral.cr40f_tipo', label: 'Tipo', table: 'cr40f_reservadeveculos', attribute: 'cr40f_tipo', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'String', available: true, pickerEligible: true },
]

const definition: ViewDefinition = {
  columns: [{ id: 'client', width: 180, pinned: true }, { id: 'new_valortotal', width: 140, pinned: false }],
  filters: [{ id: 'client', operator: 'like', value: 'A&B' }],
  sort: [{ id: 'new_valortotal', descending: true }],
}

afterEach(() => vi.unstubAllGlobals())

it('converte filtros aninhados de uma view nativa em condições editáveis', () => {
  const xml = '<fetch><entity name="cr40f_composicaodeprecos"><filter type="and"><condition attribute="new_valortotal" operator="ge" value="100" /><filter type="or"><condition attribute="new_programado" operator="eq" value="1" /><condition attribute="new_valortotal" operator="lt" value="500" /></filter></filter></entity></fetch>'
  expect(parseNativeFilters(xml, catalog)).toEqual({ filters: [{ id: 'new_valortotal', operator: 'ge', value: '100' }], filterGroups: [{ id: 'native-0-0', operator: 'or', filters: [{ id: 'new_programado', operator: 'eq', value: 'true' }, { id: 'new_valortotal', operator: 'lt', value: '500' }] }], groupOperator: 'and' })
})

it('converte filtro de cliente em link interno da view TenarisConfab', () => {
  const clientCatalog: CatalogField[] = [
    { id: 'new_status', label: 'Status', table: 'cr40f_composicaodeprecos', attribute: 'new_status', path: [], type: 'Picklist', available: true },
    { id: 'reservation-client', label: 'Cliente', table: 'cr40f_reservadeveculos', attribute: 'cr40f_cliente', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'Lookup', available: true },
  ]
  const xml = '<fetch distinct="true"><entity name="cr40f_composicaodeprecos"><filter type="and"><condition attribute="new_status" operator="eq" value="100000000" /></filter><link-entity name="cr40f_reservadeveculos" alias="lookup" link-type="outer" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" /><link-entity name="cr40f_reservadeveculos" alias="aa" link-type="inner" from="new_composicaodepreco" to="cr40f_composicaodeprecosid"><filter type="and"><condition attribute="cr40f_cliente" operator="eq" value="{11111111-2222-4333-8444-555555555555}" /></filter></link-entity></entity></fetch>'
  expect(parseNativeFilters(xml, clientCatalog)?.filters).toEqual([
    { id: 'new_status', operator: 'eq', value: '100000000' },
    { id: 'reservation-client', operator: 'eq', value: '11111111-2222-4333-8444-555555555555', nativeAlias: 'aa' },
  ])
})

describe('views nativas', () => {
  it('filtra um campo adicionado de tabela ligada pelo lookup direto', () => {
    const relatedId = 'reserva@cr40f_servicorelacionadogeral.cr40f_tipo'
    const fetchXml = buildFetchXml({ ...definition, columns: [...definition.columns, { id: relatedId, width: 128, pinned: false }], filters: [{ id: relatedId, operator: 'eq', value: 'Executivo' }] }, catalog)
    expect(fetchXml).toContain('<condition attribute="cr40f_tipo" operator="eq" entityname="r1" value="Executivo" />')
    expect(fetchXml).toContain('<link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral"')
    expect(fetchXml).toContain('<attribute name="cr40f_reservadeveculosid" />')
  })
  it('gera FetchXML com relação em dois níveis, escape e ordenação no servidor', () => {
    const fetchXml = buildFetchXml(definition, catalog)
    expect(fetchXml).toContain('<link-entity name="cr40f_reservadeveculos"')
    expect(fetchXml).toContain('<link-entity name="cr40f_clientes1"')
    expect(fetchXml).toContain('value="%A&amp;B%"')
    expect(fetchXml).toContain('attribute="new_valortotal" descending="true"')
    expect(fetchXml).toContain('attribute="cr40f_composicaodeprecosid"')
  })

  it('combina condições rápidas no mesmo campo e forma padrões de texto no FetchXML', () => {
    const fetchXml = buildFetchXml({ ...definition, filters: [
      { id: 'client', operator: 'begins-with', value: 'Ana' },
      { id: 'client', operator: 'not-like', value: 'Teste' },
      { id: 'new_valortotal', operator: 'ge', value: '100.50' },
    ] }, catalog)
    expect(fetchXml).toContain('operator="begins-with" entityname="r2" value="Ana%"')
    expect(fetchXml).toContain('operator="not-like" entityname="r2" value="%Teste%"')
    expect(fetchXml).toContain('operator="ge" value="100.50"')
    expect(fetchXml).toContain('<filter type="and">')
  })

  it('gera seleção múltipla como condição IN no campo relacionado', () => {
    const fetchXml = buildFetchXml({ ...definition, filters: [{ id: 'client', operator: 'in', value: '', values: ['Ana & Cia', 'Bela'] }] }, catalog)
    expect(fetchXml).toContain('operator="in" entityname="r2"><value>Ana &amp; Cia</value><value>Bela</value></condition>')
  })

  it('compara datas por dia no FetchXML', () => {
    const dateCatalog: CatalogField[] = [...catalog, { id: 'date', label: 'Data', table: 'cr40f_composicaodeprecos', attribute: 'new_dataehorariodesaidacalculado', path: [], type: 'DateTime', available: true }]
    const fetchXml = buildFetchXml({ ...definition, filters: [
      { id: 'date', operator: 'eq', value: '2026-09-22' },
      { id: 'date', operator: 'ge', value: '2026-09-21' },
      { id: 'date', operator: 'le', value: '2026-09-23' },
    ] }, dateCatalog)
    expect(fetchXml).toContain('operator="on" value="2026-09-22"')
    expect(fetchXml).toContain('operator="on-or-after" value="2026-09-21"')
    expect(fetchXml).toContain('operator="on-or-before" value="2026-09-23"')
  })

  it('converte Sim/Não em valores booleanos aceitos pelo FetchXML', () => {
    const fetchXml = buildFetchXml({ ...definition, filters: [
      { id: 'new_programado', operator: 'eq', value: 'true' },
      { id: 'new_programado', operator: 'ne', value: 'false' },
    ] }, catalog)
    expect(fetchXml).toContain('attribute="new_programado" operator="eq" value="1"')
    expect(fetchXml).toContain('attribute="new_programado" operator="ne" value="0"')
  })

  it('gera grupos E/OU aninhados no filtro principal', () => {
    const fetchXml = buildFetchXml({ ...definition, filters: [], groupOperator: 'or', filterGroups: [
      { id: 'g1', operator: 'and', filters: [{ id: 'client', operator: 'like', value: 'Ana' }, { id: 'new_valortotal', operator: 'ge', value: '100' }] },
      { id: 'g2', operator: 'or', filters: [{ id: 'client', operator: 'eq', value: 'Beta' }, { id: 'client', operator: 'eq', value: 'Gama' }] },
    ] }, catalog)
    expect(fetchXml).toContain('<filter type="and"><filter type="or"><filter type="and">')
    expect(fetchXml).toContain('</filter><filter type="or"><condition attribute="cr40f_nomedocliente"')
  })

  it('guarda ordem e largura no layout nativo e rejeita XML inválido', () => {
    const layout = buildLayoutXml(definition, catalog, 10342)
    expect(layout).toContain('object="10342"')
    expect(parseLayoutXml(layout)).toEqual([{ id: 'r2.cr40f_nomedocliente', width: 180, pinned: false }, { id: 'new_valortotal', width: 140, pinned: false }])
    expect(parseLayoutXml('<grid><row><cell></grid>')).toEqual([])
  })

  it('lista views do sistema e pessoais mesmo com filtros ou layout que a grade não pode editar', async () => {
    const retrieveMultipleRecords = vi.fn(async (table: string) => ({ entities: table === 'savedquery' ? [
      { savedqueryid: 'v1', name: 'Totais', fetchxml: '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_valortotal" /></entity></fetch>', layoutxml: '<grid><row><cell name="new_valortotal" width="140" /></row></grid>' },
      { savedqueryid: 'v2', name: 'Arquivo', fetchxml: '<fetch><entity name="cr40f_composicaodeprecos" /></fetch>', layoutxml: '<grid><row><cell name="arquivo" width="140" /></row></grid>' },
    ] : table === 'userquery' ? [
      { userqueryid: 'v3', name: 'Minha view', fetchxml: '<fetch><entity name="cr40f_composicaodeprecos"><filter type="or"><condition attribute="new_valortotal" operator="gt" value="100" /></filter></entity></fetch>', layoutxml: '<grid><row><cell name="new_valortotal" width="140" /></row></grid>' },
    ] : [] }))
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })
    expect((await loadViews(catalog)).map(({ name, kind, nativeOnly }) => ({ name, kind, nativeOnly }))).toEqual([
      { name: 'Minha view', kind: 'personal', nativeOnly: true },
      { name: 'Totais', kind: 'public', nativeOnly: true },
      { name: 'Arquivo', kind: 'public', nativeOnly: true },
    ])
    expect((await loadViews(catalog)).find((view) => view.name === 'Arquivo')?.definition.columns.map((column) => column.id)).toEqual(['arquivo'])
    expect((await loadViews(catalog)).find((view) => view.name === 'Minha view')?.definition.filterGroups?.[0]).toMatchObject({ operator: 'or', filters: [{ id: 'new_valortotal', operator: 'gt', value: '100' }] })
  })

  it('carrega views mesmo sem acesso à tabela auxiliar de configuração', async () => {
    const retrieveMultipleRecords = vi.fn(async (table: string) => {
      if (table === 'new_configuracaovisualizacaocomposicao') throw new Error('Sem permissão')
      return { entities: table === 'savedquery' ? [{ savedqueryid: 'v1', name: 'Sistema', fetchxml: '<fetch><entity name="cr40f_composicaodeprecos" /></fetch>', layoutxml: '<grid><row><cell name="new_valortotal" width="140" /></row></grid>' }] : [] }
    })
    vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })
    expect((await loadViews(catalog)).map((view) => view.name)).toEqual(['Sistema'])
  })

  it('lê metadata até dois níveis e explica campos complexos indisponíveis', async () => {
    const metadata: Record<string, unknown> = {
      cr40f_composicaodeprecos: { IsCustomEntity: true, PrimaryIdAttribute: 'cr40f_composicaodeprecosid', Attributes: [{ LogicalName: 'new_arquivo', AttributeType: 'File', IsValidForRead: true, IsCustomAttribute: true }, { LogicalName: 'new_ajuste', AttributeType: 'Money', IsValidForRead: true, IsCustomAttribute: true }, { LogicalName: 'createdon', AttributeType: 'DateTime', IsValidForRead: true, IsCustomAttribute: false }, { LogicalName: 'modifiedon', AttributeType: 'DateTime', IsValidForRead: true, IsCustomAttribute: false }, { LogicalName: 'ownerid', AttributeType: 'Lookup', IsValidForRead: true, IsCustomAttribute: false }, { LogicalName: 'cr40f_composicaodeprecosid', AttributeType: 'Uniqueidentifier', IsValidForRead: true, IsCustomAttribute: true }], ManyToOneRelationships: [{ ReferencedEntity: 'cr40f_reservadeveculos', ReferencedAttribute: 'cr40f_reservadeveculosid', ReferencingAttribute: 'cr40f_servicorelacionadogeral' }, { ReferencedEntity: 'systemuser', ReferencedAttribute: 'systemuserid', ReferencingAttribute: 'ownerid' }] },
      cr40f_reservadeveculos: { IsCustomEntity: true, PrimaryIdAttribute: 'cr40f_reservadeveculosid', PrimaryNameAttribute: 'cr40f_trajeto', Attributes: [{ LogicalName: 'cr40f_trajeto', AttributeType: 'String', IsValidForRead: true, IsCustomAttribute: true }, { LogicalName: 'cr40f_tipo', AttributeType: 'String', IsValidForRead: true, IsCustomAttribute: true }], ManyToOneRelationships: [{ ReferencedEntity: 'cr40f_clientes1', ReferencedAttribute: 'cr40f_clientes1id', ReferencingAttribute: 'cr40f_cliente' }] },
      cr40f_clientes1: { IsCustomEntity: true, Attributes: [{ LogicalName: 'cr40f_nomedocliente', AttributeType: 'String', IsValidForRead: true, IsCustomAttribute: true }], ManyToOneRelationships: [] },
      systemuser: { IsCustomEntity: false, Attributes: [{ LogicalName: 'fullname', AttributeType: 'String', IsValidForRead: true, IsCustomAttribute: false }], ManyToOneRelationships: [] },
    }
    ;(metadata.cr40f_composicaodeprecos as { Attributes: unknown[] }).Attributes.push({ LogicalName: 'cr40f_servicorelacionadogeral', AttributeType: 'Lookup', IsValidForRead: true, IsCustomAttribute: true })
    vi.stubGlobal('window', { Xrm: { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm.dynamics.com' }) } } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => metadata[Object.keys(metadata).find((name) => url.includes(name))!] })))
    const fields = await loadColumnCatalog()
    expect(fields.find((field) => field.id === 'new_arquivo')).toMatchObject({ available: false, reason: 'Tipo File não aceito como coluna da view' })
    expect(fields.find((field) => field.id === 'client')?.path).toHaveLength(2)
    expect(fields.find((field) => field.id === 'route')?.path).toHaveLength(1)
    expect(fields.find((field) => field.id === 'route')?.primaryNameAttribute).toBe('cr40f_trajeto')
    expect(fields.find((field) => field.id === 'new_ajuste')?.pickerEligible).toBe(true)
    expect(fields.find((field) => field.id === 'createdon')?.pickerEligible).toBe(true)
    expect(fields.find((field) => field.id === 'modifiedon')?.pickerEligible).toBe(true)
    expect(fields.find((field) => field.id === 'ownerid')?.pickerEligible).toBe(false)
    expect(fields.find((field) => field.id === 'cr40f_composicaodeprecosid')?.pickerEligible).toBe(false)
    expect(fields.find((field) => field.table === 'systemuser')?.pickerEligible).toBe(false)
    expect(fields.find((field) => field.id === 'client')?.pickerEligible).toBe(false)
    expect(fields.find((field) => field.id === 'route')?.pickerEligible).toBe(true)
    expect(fields.find((field) => field.table === 'cr40f_reservadeveculos' && field.attribute === 'cr40f_tipo')?.pickerEligible).toBe(true)
    expect(fields.find((field) => field.table === 'cr40f_clientes1' && field.id !== 'client')?.pickerEligible).toBe(false)
  })

  it('reverte criação nativa quando a configuração da fixação falha', async () => {
    const createRecord = vi.fn(async () => ({ id: 'view-id' }))
    const retrieveMultipleRecords = vi.fn(async () => { throw new Error('Sem acesso à configuração') })
    const deleteRecord = vi.fn(async () => undefined)
    vi.stubGlobal('window', { Xrm: { WebApi: { createRecord, retrieveMultipleRecords, deleteRecord }, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm.dynamics.com' }) } } })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ObjectTypeCode: 10342 }) })))
    await expect(saveView('Nova', 'personal', definition, catalog)).rejects.toThrow('Sem acesso')
    expect(deleteRecord).toHaveBeenCalledWith('userquery', 'view-id')
  })
})

it('lê de volta os operadores que a ViewBar grava: not-in, atalhos de data e próximos N dias', () => {
  const xml = '<fetch><entity name="cr40f_composicaodeprecos"><filter type="and"><condition attribute="new_valortotal" operator="not-in"><value>1</value><value>2</value></condition><condition attribute="modifiedon" operator="this-week" /><condition attribute="modifiedon" operator="next-x-days" value="7" /></filter></entity></fetch>'
  expect(parseNativeFilters(xml, catalog)?.filters).toEqual([
    { id: 'new_valortotal', operator: 'not-in', value: '', values: ['1', '2'] },
    { id: 'modifiedon', operator: 'this-week', value: '' },
    { id: 'modifiedon', operator: 'next-x-days', value: '7' },
  ])
  // Atalho de data em campo que não é data não é aceito.
  expect(parseNativeFilters('<fetch><entity name="cr40f_composicaodeprecos"><filter><condition attribute="new_valortotal" operator="today" /></filter></entity></fetch>', catalog)).toBeNull()
})
