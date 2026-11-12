// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCompositionQuery, buildCountQuery, buildNativeCompositionQuery, fetchPageSize, hasBaseAttributes, nextFetchXmlPage, resolveCompositionQuery, withBaseAttributes, withFetchPageSize, withRowLinks, withoutRowLinks } from './composition-query'
import type { CatalogField, ViewDefinition } from './views'

const catalog: CatalogField[] = [
  { id: 'client', label: 'Cliente', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', path: ['cr40f_reservadeveculos', 'cr40f_clientes1'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }, { from: 'cr40f_clientes1id', to: 'cr40f_cliente' }], type: 'String', available: true },
  { id: 'route', label: 'Rota', table: 'cr40f_reservadeveculos', attribute: 'cr40f_trajeto', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'String', available: true },
  { id: 'new_valorlocacao', label: 'Locação', table: 'cr40f_composicaodeprecos', attribute: 'new_valorlocacao', path: [], type: 'Money', available: true },
]
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

  it('inclui busca por cliente ou rota e o filtro da view na mesma consulta', () => {
    const xml = buildCompositionQuery(definition, catalog, 'Ana & Cia', true)
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    expect(document.querySelector('parsererror')).toBeNull()
    expect([...document.querySelectorAll('condition')].map((item) => item.getAttribute('attribute'))).toEqual(expect.arrayContaining(['new_valorlocacao', 'statecode', 'cr40f_nomedocliente', 'cr40f_trajeto']))
    expect([...document.querySelectorAll('condition[operator="like"]')].map((item) => item.getAttribute('value'))).toEqual(['%Ana & Cia%', '%Ana & Cia%'])
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
    expect(hasBaseAttributes(result, base)).toBe(true)
  })

  it('mantém consultas com all-attributes e recusa agregadas ou inválidas', () => {
    const all = '<fetch top="1"><entity name="cr40f_composicaodeprecos"><all-attributes/></entity></fetch>'
    expect(withBaseAttributes(all, base)).toBe(all)
    expect(hasBaseAttributes(all, base)).toBe(true)
    expect(withBaseAttributes('<fetch aggregate="true"><entity name="x"><attribute name="x" aggregate="count" alias="t"/></entity></fetch>', base)).toBeNull()
    expect(withBaseAttributes('<fetch><entity', base)).toBeNull()
    expect(hasBaseAttributes('<fetch><entity name="x"><attribute name="new_status"/></entity></fetch>', base)).toBe(false)
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
    expect(names('cmp_res')).toEqual(['cr40f_trajeto', 'cr40f_dataehorriodesada', 'cr40f_cliente', 'cr40f_status', 'cr40f_tipodoservico', 'cr40f_tipodeveiculo', 'cr40f_passageiro1', 'cr40f_passageiro2', 'cr40f_passageiro3', 'cr40f_passageiro4'])
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
