// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { buildCompositionQuery, buildCountQuery, buildNativeCompositionQuery, dedupeLinks, expandLinkAliases, fetchPageSize, nextFetchXmlPage, resolveCompositionQuery, withBaseAttributes, withFetchPageSize, withRowLinks, withoutRowLinks } from './composition-query'
import { buildLayoutXml, type CatalogField, type ViewDefinition } from './views'

const catalog: CatalogField[] = [
  { id: 'client', label: 'Cliente', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', path: ['cr40f_reservadeveculos', 'cr40f_clientes1'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }, { from: 'cr40f_clientes1id', to: 'cr40f_cliente' }], type: 'String', available: true },
  { id: 'route', label: 'Rota', table: 'cr40f_reservadeveculos', attribute: 'cr40f_trajeto', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'String', available: true },
  { id: 'new_valorlocacao', label: 'Locação', table: 'cr40f_composicaodeprecos', attribute: 'new_valorlocacao', path: [], type: 'Money', available: true },
]
const RESERVA = 'cr40f_reservadeveculos'
const rel = (...to: string[]) => to.map((item) => ({ from: `${item}id`, to: item }))
const field = (table: string, attribute: string, type: string, via: string[], id = `${table}.${attribute}.${via.join('/')}`): CatalogField => ({ id: via.length ? id : attribute, label: attribute, table, attribute, path: via.length === 2 ? [RESERVA, table] : via.length ? [table] : [], relationships: rel(...via), type, available: true })
const reserva = ['cr40f_servicorelacionadogeral']
const richCatalog: CatalogField[] = [
  ...catalog,
  field('cr40f_composicaodeprecos', 'cr40f_id', 'String', []), field('cr40f_composicaodeprecos', 'new_status', 'Picklist', []),
  field('cr40f_composicaodeprecos', 'new_valortotal', 'Money', []), field('cr40f_composicaodeprecos', 'new_subtotal', 'Money', []),
  field('cr40f_terceirofavorecido', 'cr40f_name', 'String', ['cr40f_terceirofavorecido']), field('cr40f_pagamentoaterceiro', 'cr40f_name', 'String', ['cr40f_pagamentoaterceiro']),
  ...['cr40f_id', 'cr40f_idnovo', 'cr40f_cr', 'cr40f_passageirosetelefonedecontato'].map((attribute) => field(RESERVA, attribute, attribute === 'cr40f_passageirosetelefonedecontato' ? 'Memo' : 'String', reserva)),
  field(RESERVA, 'cr40f_idtenaris', 'Integer', reserva),
  field('cr40f_bancodedados', 'cr40f_nomedopassageiro', 'String', [...reserva, 'cr40f_solicitante']), field('cr40f_veiculos', 'cr40f_placa', 'String', [...reserva, 'cr40f_veiculo']),
].map((item) => item.attribute === 'cr40f_id' && item.table === RESERVA ? { ...item, id: 'reserva-os' } : item)
const definition: ViewDefinition = { columns: [{ id: 'new_valorlocacao', width: 128, pinned: false }], filters: [{ id: 'new_valorlocacao', operator: 'ge', value: '100' }], sort: [] }

describe('consulta de composições no servidor', () => {
  it('mantém filtros originais ao adicionar filtros e busca a uma view nativa', () => {
    const nativeXml = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_composicaodeprecosid"/><filter type="or"><condition attribute="statecode" operator="eq" value="0"/><condition attribute="new_valorlocacao" operator="gt" value="500"/></filter><link-entity name="cr40f_reservadeveiculos" from="cr40f_reservadeveiculosid" to="cr40f_servicorelacionadogeral" alias="r1"><attribute name="cr40f_trajeto"/></link-entity></entity></fetch>'
    const xml = buildNativeCompositionQuery(nativeXml, definition, catalog, 'Ana')
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    expect(document.querySelector('parsererror')).toBeNull()
    const filters = [...document.querySelectorAll('fetch > entity > filter > filter')]
    expect(filters).toHaveLength(3)
    expect(filters[0].getAttribute('type')).toBe('or')
    expect([...document.querySelectorAll('condition[attribute="new_valorlocacao"]')].map((item) => item.getAttribute('value'))).toEqual(['500', '100'])
    expect([...document.querySelectorAll('link-entity[alias]')].map((item) => item.getAttribute('alias'))).toEqual(['r1', 'ui_r1', 'r2'])
    expect([...document.querySelectorAll('condition[entityname]')].map((item) => item.getAttribute('entityname'))).toEqual(['r2', 'ui_r1'])
  })

  it('substitui filtros originais quando a view nativa é editada', () => {
    const nativeXml = '<fetch><entity name="cr40f_composicaodeprecos"><filter type="and"><condition attribute="new_valorlocacao" operator="gt" value="500" /></filter></entity></fetch>'
    const xml = buildNativeCompositionQuery(nativeXml, definition, catalog, '', true)
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    expect([...document.querySelectorAll('condition[attribute="new_valorlocacao"]')].map((item) => item.getAttribute('value'))).toEqual(['100'])
  })

  it('edita filtro de cliente em link interno sem manter o valor antigo', () => {
    const clientField: CatalogField = { id: 'reservation-client', label: 'Cliente', table: 'cr40f_reservadeveculos', attribute: 'cr40f_cliente', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveiculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'Lookup', available: true }
    const nativeXml = '<fetch><entity name="cr40f_composicaodeprecos"><link-entity name="cr40f_reservadeveculos" alias="aa" link-type="inner" from="new_composicaodepreco" to="cr40f_composicaodeprecosid"><filter type="and"><condition attribute="cr40f_cliente" operator="eq" value="{antigo}" /></filter></link-entity></entity></fetch>'
    const xml = buildNativeCompositionQuery(nativeXml, { ...definition, filters: [{ id: clientField.id, operator: 'eq', value: '{novo}', nativeAlias: 'aa' }] }, [...catalog, clientField], '', true)
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    expect(document.querySelector('link-entity[alias="aa"]')?.querySelector('filter')).toBeNull()
    expect([...document.querySelectorAll('condition[attribute="cr40f_cliente"]')].map((item) => [item.getAttribute('entityname'), item.getAttribute('value')])).toEqual([['aa', '{novo}']])
  })

  it('inclui a busca por palavras e o filtro da view na mesma consulta', () => {
    const xml = buildCompositionQuery(definition, catalog, 'Ana & Cia', true)
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    expect(document.querySelector('parsererror')).toBeNull()
    expect([...document.querySelectorAll('condition')].map((item) => item.getAttribute('attribute'))).toEqual(expect.arrayContaining(['new_valorlocacao', 'statecode', 'cr40f_nomedocliente', 'cr40f_trajeto']))
    // "&" tem 1 caractere e fica fora: só "Ana" e "Cia", cada uma em um filtro or.
    expect([...document.querySelectorAll('condition[operator="like"]')].map((item) => item.getAttribute('value'))).toEqual(['%Ana%', '%Ana%', '%Cia%', '%Cia%'])
  })

  it('exige cada palavra em algum campo: um filtro or por palavra, ligados por and, com os campos das tabelas ligadas', () => {
    const xml = buildCompositionQuery(definition, richCatalog, 'embraer guarulhos', false)
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    expect(document.querySelector('parsererror')).toBeNull()
    const ands = [...document.querySelectorAll('fetch > entity > filter')].filter((filter) => filter.querySelector(':scope > filter[type="or"]'))
    expect(ands).toHaveLength(1)
    expect(ands[0].getAttribute('type')).toBe('and')
    const ors = [...ands[0].querySelectorAll(':scope > filter')]
    expect(ors.map((item) => item.getAttribute('type'))).toEqual(['or', 'or'])
    for (const [index, token] of ['embraer', 'guarulhos'].entries()) {
      const likes = [...ors[index].querySelectorAll('condition[operator="like"]')]
      expect(likes.every((item) => item.getAttribute('value') === `%${token}%`)).toBe(true)
      expect(likes.filter((item) => !item.hasAttribute('entityname')).map((item) => item.getAttribute('attribute'))).toEqual(['cr40f_id'])
      expect(likes.map((item) => item.getAttribute('attribute'))).toEqual(expect.arrayContaining(['cr40f_nomedocliente', 'cr40f_nomedopassageiro', 'cr40f_placa', 'cr40f_name', 'cr40f_idnovo', 'cr40f_passageirosetelefonedecontato']))
      // Todo alias usado na busca existe como link-entity outer.
      for (const alias of likes.map((item) => item.getAttribute('entityname')).filter(Boolean)) expect(document.querySelector(`link-entity[alias="${alias}"]`)?.getAttribute('link-type')).toBe('outer')
    }
    expect(document.querySelector('condition[attribute="cr40f_idtenaris"]')).toBeNull()
  })

  it('número vira igualdade em dinheiro e inteiro; valor total (calculado) só com vírgula ou ponto; palavra comum não', () => {
    const numeric = new DOMParser().parseFromString(buildCompositionQuery(definition, richCatalog, '12345 1.234,50', false), 'application/xml')
    const equals = [...numeric.querySelectorAll('condition[operator="eq"]')].map((item) => [item.getAttribute('attribute'), item.getAttribute('value')])
    expect(equals).toEqual(expect.arrayContaining([['cr40f_idtenaris', '12345'], ['new_valortotal', '1234.50']]))
    expect(equals).not.toContainEqual(['new_valortotal', '12345'])
    const text = new DOMParser().parseFromString(buildCompositionQuery(definition, richCatalog, 'embraer', false), 'application/xml')
    expect(text.querySelector('condition[operator="eq"][attribute="new_valortotal"]')).toBeNull()
  })

  it('escapa aspas, %, _ e [ e continua XML válido', () => {
    const xml = buildCompositionQuery(definition, richCatalog, "d'agua 50% a_b [x]", false)
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    expect(document.querySelector('parsererror')).toBeNull()
    const values = new Set([...document.querySelectorAll('condition[operator="like"]')].map((item) => item.getAttribute('value')))
    expect(values).toEqual(new Set(["%d'agua%", '%50[%]%', '%a[_]b%', '%[[]x]%']))
  })

  it('busca vazia ou só com palavras de 1 caractere não adiciona filtro', () => {
    for (const search of ['', '   ', 'a b']) {
      const document = new DOMParser().parseFromString(buildCompositionQuery(definition, richCatalog, search, false), 'application/xml')
      expect(document.querySelector('filter[type="or"]')).toBeNull()
    }
  })

  it('aplica a mesma busca sobre a view nativa, editável ou não', () => {
    const nativeXml = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_composicaodeprecosid"/><filter type="and"><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>'
    for (const editable of [true, false]) {
      const document = new DOMParser().parseFromString(buildNativeCompositionQuery(nativeXml, definition, richCatalog, 'embraer guarulhos', editable), 'application/xml')
      expect(document.querySelector('parsererror')).toBeNull()
      expect(document.querySelectorAll('filter[type="or"]')).toHaveLength(2)
      for (const condition of document.querySelectorAll('condition[entityname]')) expect(document.querySelector(`link-entity[alias="${condition.getAttribute('entityname')}"]`)).not.toBeNull()
      expect(!!document.querySelector('condition[attribute="statecode"]')).toBe(!editable)
    }
  })

  it('compara a palavra com os rótulos das escolhas já lidas, sem acento', async () => {
    const { searchFilterOptions } = await import('./filter-options')
    const status = richCatalog.find((field) => field.attribute === 'new_status')!
    ;(globalThis as { Xrm?: unknown }).Xrm = undefined
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ OptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: 'Pendente' } } }, { Value: 2, Label: { UserLocalizedLabel: { Label: 'Concluído' } } }] } }) })))
    vi.spyOn(await import('./xrm'), 'getXrmHost').mockReturnValue({ WebApi: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://x' }) } } as never)
    await searchFilterOptions(status, '')
    const document = new DOMParser().parseFromString(buildCompositionQuery(definition, richCatalog, 'concluido', false), 'application/xml')
    const choice = document.querySelector('condition[attribute="new_status"]')!
    expect(choice.getAttribute('operator')).toBe('in')
    expect([...choice.querySelectorAll('value')].map((item) => item.textContent)).toEqual(['2'])
    vi.unstubAllGlobals()
  })


  describe('vínculos que a própria tela acumulou', () => {
    const RES = 'cr40f_reservadeveculos'
    const link = (alias: string, inner = '') => `<link-entity name="${RES}" from="${RES}id" to="cr40f_servicorelacionadogeral" alias="${alias}" link-type="outer">${inner}</link-entity>`
    const stale = ['r1', 'r2', 'ui_r1', 'ui_r2', 'ui_ui_r1', 'ui_ui_r2'].map((alias) => link(alias)).join('')
    const gridDefinition: ViewDefinition = { columns: [{ id: 'route', width: 160, pinned: false }], filters: [], sort: [] }
    const aliasesOf = (xml: string) => [...new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('link-entity')].map((item) => item.getAttribute('alias'))

    it('(e) r1, r2, ui_r1, ui_r2, ui_ui_r1, ui_ui_r2 sem filtro ficam em um vínculo por caminho (reserva e, dentro dela, cliente)', () => {
      const nativeXml = `<fetch><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_composicaodeprecosid"/>${stale}</entity></fetch>`
      expect(aliasesOf(buildNativeCompositionQuery(nativeXml, gridDefinition, catalog, '', false))).toEqual(['r1', 'r2'])
    })

    it('(e) o vínculo citado por condição não sai, nem o que tem filtro ou é da visão original', () => {
      const nativeXml = `<fetch><entity name="cr40f_composicaodeprecos"><filter type="and"><condition entityname="ui_r1" attribute="cr40f_cliente" operator="eq" value="00000000-0000-4000-8000-000000000001" /></filter>${stale}<link-entity name="cr40f_veiculos" from="cr40f_veiculosid" to="cr40f_veiculo" alias="a_veiculo" link-type="inner"><filter><condition attribute="cr40f_placa" operator="eq" value="AAA0A00" /></filter></link-entity></entity></fetch>`
      const result = aliasesOf(buildNativeCompositionQuery(nativeXml, gridDefinition, catalog, '', false))
      expect(result).toContain('ui_r1')
      expect(result).toContain('a_veiculo')
      // Sobram o citado e os dois da grade (reserva e cliente); os outros quatro acumulados saem.
      expect(result.filter((alias) => /^(ui_)*r\d+$/.test(String(alias))).sort()).toEqual(['r1', 'r2', 'ui_r1'])
    })

    it('(f) a layout aponta para aliases que existem no FetchXML gravado', () => {
      const nativeXml = `<fetch><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_composicaodeprecosid"/>${stale}</entity></fetch>`
      const fetchXml = buildNativeCompositionQuery(nativeXml, gridDefinition, catalog, '', false)
      const layout = new DOMParser().parseFromString(buildLayoutXml(gridDefinition, catalog, 10342, fetchXml), 'application/xml')
      const existing = aliasesOf(fetchXml)
      const cells = [...layout.querySelectorAll('cell')].map((cell) => String(cell.getAttribute('name')))
      expect(cells).toHaveLength(1)
      expect(existing).toContain(cells[0].split('.')[0])
      expect(cells[0]).toMatch(/\.cr40f_trajeto$/)
    })

    it('(g) visão nativa normal (aliases a_xxx, vínculos internos com filtro) fica com a mesma consulta', () => {
      const nativeXml = `<fetch><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_composicaodeprecosid"/><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter><link-entity name="${RES}" from="${RES}id" to="cr40f_servicorelacionadogeral" alias="a_reserva" link-type="inner"><filter><condition attribute="cr40f_trajeto" operator="like" value="%Norte%" /></filter></link-entity><link-entity name="cr40f_veiculos" from="cr40f_veiculosid" to="cr40f_veiculo" alias="a_veiculo" link-type="outer"><attribute name="cr40f_placa"/></link-entity></entity></fetch>`
      const semGrade: ViewDefinition = { columns: [{ id: 'new_valorlocacao', width: 128, pinned: false }], filters: [], sort: [] }
      const result = new DOMParser().parseFromString(buildNativeCompositionQuery(nativeXml, semGrade, catalog, '', false), 'application/xml')
      const original = new DOMParser().parseFromString(nativeXml, 'application/xml')
      // Os vínculos da visão original seguem intactos; a grade só acrescenta os seus (r1 reserva, r2 cliente), como antes.
      expect(aliasesOf(buildNativeCompositionQuery(nativeXml, semGrade, catalog, '', false))).toEqual(['a_reserva', 'a_veiculo', 'r1', 'r2'])
      for (const alias of ['a_reserva', 'a_veiculo']) expect(new XMLSerializer().serializeToString(result.querySelector(`link-entity[alias="${alias}"]`)!)).toBe(new XMLSerializer().serializeToString(original.querySelector(`link-entity[alias="${alias}"]`)!))
      expect(new XMLSerializer().serializeToString(result.querySelector('entity > filter')!)).toBe(new XMLSerializer().serializeToString(original.querySelector('entity > filter')!))
    })
  })
})

describe('buildCountQuery', () => {
  it('troca colunas e ordenação por uma contagem distinta mantendo filtros e vínculos', () => {
    const xml = '<fetch count="100" page="2" distinct="true"><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><order attribute="modifiedon" descending="true"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="svc"><attribute name="cr40f_trajeto"/></link-entity></entity></fetch>'
    const document = new DOMParser().parseFromString(buildCountQuery(xml)!, 'application/xml')
    const fetch = document.querySelector('fetch')!
    expect(fetch.getAttribute('aggregate')).toBe('true')
    expect(fetch.hasAttribute('count')).toBe(false)
    expect(fetch.hasAttribute('page')).toBe(false)
    expect(document.querySelectorAll('order')).toHaveLength(0)
    expect([...document.querySelectorAll('attribute')].map((node) => node.getAttribute('aggregate'))).toEqual(['countcolumn'])
    expect(document.querySelector('attribute')!.getAttribute('name')).toBe('cr40f_composicaodeprecosid')
    expect(document.querySelector('condition[attribute="statecode"]')).toBeTruthy()
    expect(document.querySelector('link-entity[alias="svc"]')).toBeTruthy()
  })

  it('não tenta contar views já agregadas', () => {
    expect(buildCountQuery('<fetch aggregate="true"><entity name="cr40f_composicaodeprecos"/></fetch>')).toBeNull()
  })
})

describe('resolveCompositionQuery', () => {
  const definition = { columns: [], sort: [], filters: [] } as unknown as ViewDefinition

  it('usa a view salva sem alterações quando não há busca', () => {
    const view = { id: 'v1', kind: 'public', name: 'Ativas', definition, managed: true, nativeOnly: true, sourceFetchXml: '<fetch/>' } as const
    expect(resolveCompositionQuery(view, definition, [], '')).toEqual({ view, error: null })
  })

  it('acrescenta vínculos com aliases da grade às colunas relacionadas de uma view nativa sem alterações', () => {
    const native = { columns: [{ id: 'route', width: 128, pinned: false }], filters: [], sort: [] } as ViewDefinition
    const sourceFetchXml = '<fetch><entity name="cr40f_composicaodeprecos"><link-entity name="cr40f_reservadeveculos" alias="a_67d5" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" link-type="inner"><attribute name="cr40f_trajeto"/><filter><condition attribute="new_categoriadoitem" operator="eq" value="1"/></filter></link-entity></entity></fetch>'
    const view = { id: 'v1', kind: 'public', name: 'Todos os CPs', definition: native, managed: false, nativeOnly: true, sourceFetchXml } as const
    const result = resolveCompositionQuery(view, native, catalog, '')
    const document = new DOMParser().parseFromString((result.view as { fetchXml: string }).fetchXml, 'application/xml')
    expect([...document.querySelectorAll('link-entity[alias]')].map((item) => item.getAttribute('alias'))).toEqual(['a_67d5', 'r1', 'r2'])
    expect(document.querySelector('link-entity[alias="a_67d5"] condition[attribute="new_categoriadoitem"]')).not.toBeNull()
    expect(document.querySelector('link-entity[alias="r1"] filter')).toBeNull()
  })

  it('troca a ordem da view nativa pela escolhida na grade, inclusive em coluna da Reserva', () => {
    const sourceFetchXml = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_id"/><order attribute="createdon" descending="true"/><link-entity name="cr40f_reservadeveculos" alias="a_67d5" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" link-type="inner"><attribute name="cr40f_trajeto"/><order attribute="cr40f_trajeto"/></link-entity></entity></fetch>'
    const original = { columns: [{ id: 'route', width: 128, pinned: false }], filters: [], sort: [] } as ViewDefinition
    const view = { id: 'v1', kind: 'public', name: 'Todos os CPs', definition: original, managed: false, nativeOnly: true, sourceFetchXml } as const
    const sorted = { ...original, sort: [{ id: 'route', descending: true }] }
    const document = new DOMParser().parseFromString((resolveCompositionQuery(view, sorted, catalog, '').view as { fetchXml: string }).fetchXml, 'application/xml')
    const orders = [...document.querySelectorAll('order')].map((order) => [order.getAttribute('attribute'), order.getAttribute('descending'), order.getAttribute('entityname')])
    expect(orders).toEqual([['cr40f_trajeto', 'true', 'r1'], ['cr40f_composicaodeprecosid', null, null]])
    expect(document.querySelector('link-entity[alias="r1"]')).not.toBeNull()
  })

  it('mantém a ordem da view nativa quando a grade não escolheu outra', () => {
    const sourceFetchXml = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_id"/><order attribute="createdon" descending="true"/></entity></fetch>'
    const fetchXml = buildNativeCompositionQuery(sourceFetchXml, { columns: [], filters: [], sort: [] } as ViewDefinition, catalog, 'Aurora')
    const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
    expect([...document.querySelectorAll('order')].map((order) => order.getAttribute('attribute'))).toEqual(['createdon'])
  })

  it('devolve erro legível quando o FetchXML nativo é inválido', () => {
    const view = { id: 'v1', kind: 'public', name: 'Quebrada', definition, managed: true, nativeOnly: true, sourceFetchXml: '<fetch>' } as const
    const result = resolveCompositionQuery(view, definition, [], 'Aurora')
    expect(result.view).toBeUndefined()
    expect(result.error).toBeTruthy()
  })
})

describe('paginação FetchXML por paging cookie', () => {
  it('define o tamanho de página sem alterar views com top', () => {
    const paged = new DOMParser().parseFromString(withFetchPageSize('<fetch><entity name="cr40f_composicaodeprecos"/></fetch>', 100), 'application/xml')
    expect(paged.querySelector('fetch')!.getAttribute('count')).toBe('100')
    expect(withFetchPageSize('<fetch top="50"><entity name="cr40f_composicaodeprecos"/></fetch>', 100)).toBe('<fetch top="50"><entity name="cr40f_composicaodeprecos"/></fetch>')
  })

  it('monta a próxima página com page e paging-cookie decodificados', () => {
    const inner = '<cookie page="1"><cr40f_composicaodeprecosid last="{A}" first="{B}" /></cookie>'
    const cookie = `<cookie pagenumber="2" pagingcookie="${encodeURIComponent(encodeURIComponent(inner))}" istracking="False" />`
    const next = nextFetchXmlPage('<fetch count="100"><entity name="cr40f_composicaodeprecos"/></fetch>', cookie)!
    const fetch = new DOMParser().parseFromString(next, 'application/xml').querySelector('fetch')!
    expect(fetch.getAttribute('page')).toBe('2')
    expect(fetch.getAttribute('paging-cookie')).toBe(inner)
    expect(fetch.getAttribute('count')).toBe('100')
  })

  it('segue só pelo número da página quando o Dataverse devolve pagingcookie vazio', () => {
    const next = nextFetchXmlPage('<fetch count="100" page="1" paging-cookie="antigo"><entity name="cr40f_composicaodeprecos"/></fetch>', '<cookie pagenumber="2" pagingcookie="" istracking="False" />')!
    const fetch = new DOMParser().parseFromString(next, 'application/xml').querySelector('fetch')!
    expect(fetch.getAttribute('page')).toBe('2')
    expect(fetch.hasAttribute('paging-cookie')).toBe(false)
    expect(fetch.getAttribute('count')).toBe('100')
  })

  it('sem cookie avança pelo número da página do próprio FetchXML', () => {
    const page = (xml: string | null) => new DOMParser().parseFromString(xml!, 'application/xml').querySelector('fetch')!.getAttribute('page')
    expect(page(nextFetchXmlPage('<fetch count="100"><entity name="x"/></fetch>'))).toBe('2')
    expect(page(nextFetchXmlPage('<fetch count="100" page="2"><entity name="x"/></fetch>', '<cookie pagenumber="1"/>'))).toBe('3')
    expect(nextFetchXmlPage('<fetch')).toBeNull()
  })

  it('avança a página quando o Dataverse devolve sempre pagenumber 2 vazio (distinct com ordem na link-entity, view Todos os CPs do PROD)', () => {
    const cookie = '<cookie pagenumber="2" pagingcookie="" istracking="False" />'
    let xml = '<fetch count="100" distinct="true"><entity name="cr40f_composicaodeprecos"><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_67d5"><order attribute="cr40f_dataehorriodesada" descending="true"/></link-entity></entity></fetch>'
    const pages: (string | null)[] = []
    for (let index = 0; index < 3; index++) {
      xml = nextFetchXmlPage(xml, cookie)!
      const fetch = new DOMParser().parseFromString(xml, 'application/xml').querySelector('fetch')!
      expect(fetch.hasAttribute('paging-cookie')).toBe(false)
      pages.push(fetch.getAttribute('page'))
    }
    expect(pages).toEqual(['2', '3', '4'])
  })

  it('ignora cookie que não é da próxima página', () => {
    const inner = '<cookie page="1"><cr40f_composicaodeprecosid last="{A}" first="{B}" /></cookie>'
    const stale = `<cookie pagenumber="2" pagingcookie="${encodeURIComponent(encodeURIComponent(inner))}" istracking="False" />`
    const fetch = new DOMParser().parseFromString(nextFetchXmlPage('<fetch count="100" page="3" paging-cookie="x"><entity name="x"/></fetch>', stale)!, 'application/xml').querySelector('fetch')!
    expect(fetch.getAttribute('page')).toBe('4')
    expect(fetch.hasAttribute('paging-cookie')).toBe(false)
  })

  it('acrescenta ordem estável só quando o FetchXML não tem nenhuma', () => {
    const ordered = (xml: string) => [...new DOMParser().parseFromString(withFetchPageSize(xml, 100), 'application/xml').querySelectorAll('order')].map((order) => order.getAttribute('attribute'))
    expect(ordered('<fetch><entity name="cr40f_composicaodeprecos"><link-entity name="r" from="a" to="b"/></entity></fetch>')).toEqual(['cr40f_composicaodeprecosid'])
    expect(ordered('<fetch><entity name="cr40f_composicaodeprecos"><order attribute="createdon"/></entity></fetch>')).toEqual(['createdon'])
  })

  it('lê o count próprio do FetchXML como tamanho de página', () => {
    expect(fetchPageSize('<fetch count="50"><entity name="x"/></fetch>', 100)).toBe(50)
    expect(fetchPageSize('<fetch><entity name="x"/></fetch>', 100)).toBe(100)
    expect(fetchPageSize('<fetch count="abc"><entity name="x"/></fetch>', 100)).toBe(100)
  })
})

describe('atributos base no FetchXML da grade', () => {
  const base = ['cr40f_composicaodeprecosid', 'new_status', 'versionnumber']

  it('acrescenta só os atributos que faltam, antes dos filtros e vínculos', () => {
    const result = withBaseAttributes('<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter><link-entity name="x" from="a" to="b"/></entity></fetch>', base)!
    const entity = new DOMParser().parseFromString(result, 'application/xml').querySelector('fetch > entity')!
    expect([...entity.children].map((node) => node.tagName)).toEqual(['attribute', 'attribute', 'attribute', 'filter', 'link-entity'])
    expect([...entity.querySelectorAll(':scope > attribute')].map((node) => node.getAttribute('name'))).toEqual(['new_status', 'cr40f_composicaodeprecosid', 'versionnumber'])
  })

  it('mantém consultas com all-attributes e recusa agregadas ou inválidas', () => {
    const all = '<fetch top="1"><entity name="cr40f_composicaodeprecos"><all-attributes/></entity></fetch>'
    expect(withBaseAttributes(all, base)).toBe(all)
    expect(withBaseAttributes('<fetch aggregate="true"><entity name="x"><attribute name="x" aggregate="count" alias="t"/></entity></fetch>', base)).toBeNull()
    expect(withBaseAttributes('<fetch><entity', base)).toBeNull()
  })
})

describe('vínculos da linha (reserva e cliente)', () => {
  const base = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/></entity></fetch>'

  it('acrescenta reserva e cliente como link-entity sem duplicar', () => {
    const once = withRowLinks(base)
    expect(once).toContain('<link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" link-type="outer" alias="cmp_res">')
    expect(once).toContain('<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" link-type="outer" alias="cmp_cli">')
    expect(withRowLinks(once)).toBe(once)
  })

  it('pede os mesmos atributos que a leitura em lote pedia', () => {
    const document = new DOMParser().parseFromString(withRowLinks(base), 'application/xml')
    const names = (alias: string) => [...document.querySelectorAll(`link-entity[alias="${alias}"] > attribute`)].map((item) => item.getAttribute('name'))
    expect(names('cmp_res')).toEqual(['cr40f_trajeto', 'cr40f_endereodesada', 'cr40f_destino', 'cr40f_dataehorriodesada', 'cr40f_cliente', 'cr40f_status', 'cr40f_tipodoservico', 'cr40f_tipodeveiculo', 'cr40f_passageiro1', 'cr40f_passageiro2', 'cr40f_passageiro3', 'cr40f_passageiro4'])
    expect(names('cmp_cli')).toEqual(['cr40f_nomedocliente', 'cr40f_registro', 'cr40f_endereco'])
  })

  it('não mexe em consulta agregada e sabe tirar os vínculos', () => {
    const aggregate = '<fetch aggregate="true"><entity name="cr40f_composicaodeprecos"/></fetch>'
    expect(withRowLinks(aggregate)).toBe(aggregate)
    expect(withoutRowLinks(withRowLinks(base))).not.toContain('cmp_')
    expect(withoutRowLinks(base)).toBe(base)
  })

  it('a contagem ignora os vínculos', () => {
    expect(buildCountQuery(withRowLinks(base))).toBe(buildCountQuery(base))
  })
})

describe('withLinkKeys', () => {
  const source = '<fetch><entity name="cr40f_composicaodeprecos"><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_1"><attribute name="cr40f_trajeto"/></link-entity></entity></fetch>'
  it('acrescenta a chave do vínculo uma única vez', async () => {
    const { withLinkKeys } = await import('./composition-query')
    const once = withLinkKeys(source)
    expect(once).toContain('<attribute name="cr40f_reservadeveculosid"')
    expect(withLinkKeys(once)).toBe(once)
  })
  it('não mexe em agregação nem em all-attributes', async () => {
    const { withLinkKeys } = await import('./composition-query')
    const aggregate = source.replace('<fetch>', '<fetch aggregate="true">')
    expect(withLinkKeys(aggregate)).toBe(aggregate)
    const all = source.replace('<attribute name="cr40f_trajeto"/>', '<all-attributes/>')
    expect(withLinkKeys(all)).toBe(all)
  })
})

describe('dedupeLinks', () => {
  it('funde a reserva e o cliente repetidos da view nativa, da grade e da linha abaixo do limite de 15 link-entity', () => {
    const native = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><filter><condition attribute="cr40f_trajeto" operator="like" value="%GRU%" entityname="a_67d5"/></filter><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_67d5" link-type="outer"><attribute name="cr40f_trajeto"/></link-entity></entity></fetch>'
    const definition: ViewDefinition = { columns: [{ id: 'client', width: 128, pinned: false }, { id: 'route', width: 128, pinned: false }], filters: [], sort: [] }
    const full = withRowLinks(buildNativeCompositionQuery(native, definition, catalog, ''))
    const before = new DOMParser().parseFromString(full, 'application/xml').querySelectorAll('link-entity').length
    const { fetchXml, aliases } = dedupeLinks(full)
    const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
    expect(before).toBe(5)
    expect([...document.querySelectorAll('link-entity')].map((link) => link.getAttribute('alias'))).toEqual(['a_67d5', 'r2'])
    expect(aliases).toEqual([['r1', 'a_67d5'], ['cmp_res', 'a_67d5'], ['cmp_cli', 'r2']])
    expect(document.querySelector('condition')?.getAttribute('entityname')).toBe('a_67d5')
    expect([...document.querySelectorAll('link-entity[alias="a_67d5"] > attribute')].filter((item) => item.getAttribute('name') === 'cr40f_trajeto')).toHaveLength(1)
    const row = expandLinkAliases({ 'a_67d5.cr40f_trajeto': 'GRU', 'r2.cr40f_nomedocliente': 'J&J', 'r2.cr40f_nomedocliente@OData.Community.Display.V1.FormattedValue': 'J&J' }, aliases)
    expect(row).toMatchObject({ 'r1.cr40f_trajeto': 'GRU', 'cmp_res.cr40f_trajeto': 'GRU', 'cmp_cli.cr40f_nomedocliente': 'J&J', 'cmp_cli.cr40f_nomedocliente@OData.Community.Display.V1.FormattedValue': 'J&J' })
  })

  it('não funde vínculo inner ou com filtro próprio', () => {
    const xml = '<fetch><entity name="x"><link-entity name="r" from="a" to="b" alias="k" link-type="outer"><filter><condition attribute="s" operator="eq" value="1"/></filter></link-entity><link-entity name="r" from="a" to="b" alias="i" link-type="inner"/><link-entity name="r" from="a" to="b" alias="o" link-type="outer"/></entity></fetch>'
    const { aliases } = dedupeLinks(xml)
    expect(aliases).toEqual([['o', 'i']])
  })
})
