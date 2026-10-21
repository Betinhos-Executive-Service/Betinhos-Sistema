// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCountFetch, buildFetch, defaultSort, linkEntities, quickFindAttributes } from './fetch'
import { searchConditions } from './search'

const AGENDA = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" count="25" page="3" paging-cookie="x" returntotalrecordcount="false">
<entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /><attribute name="cr40f_status" /><attribute name="cr40f_dataehorriodesada" />
<order attribute="cr40f_dataehorriodesada" descending="false" />
<filter type="and"><condition attribute="cr40f_dataehorriodesada" operator="next-x-years" value="3" /></filter>
<link-entity name="cr40f_composicaodeprecos" from="cr40f_composicaodeprecosid" to="new_composicaodepreco" link-type="outer" alias="a_2b63"><attribute name="new_valortotal" /></link-entity>
</entity></fetch>`

const QUICK = `<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" />
<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>
<filter type="or" isquickfindfields="1"><condition attribute="new_visualizacaodomotorista" operator="on" value="{3}" /><condition attribute="cr40f_veiculo" operator="like" value="{0}" /><condition attribute="cr40f_trajeto" operator="like" value="{0}" /><condition attribute="cr40f_id" operator="like" value="{0}" /></filter>
</entity></fetch>`

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml')
const base = { page: 1, pageSize: 50, cookie: null, sort: null, search: [] }

describe('buildFetch', () => {
  it('garante statecode entre os atributos da raiz', () => {
    const doc = parse(buildFetch(AGENDA, base))
    expect(doc.querySelectorAll('entity > attribute[name="statecode"]').length).toBe(1)
    expect(parse(buildFetch(buildFetch(AGENDA, base), base)).querySelectorAll('entity > attribute[name="statecode"]').length).toBe(1)
  })

  it('troca paginação, não pede total (contagem à parte) e preserva filtro, ordem e link-entity', () => {
    const doc = parse(buildFetch(AGENDA, base))
    const fetch = doc.documentElement
    expect(fetch.getAttribute('count')).toBe('50')
    expect(fetch.getAttribute('page')).toBe('1')
    expect(fetch.getAttribute('paging-cookie')).toBeNull()
    expect(fetch.hasAttribute('returntotalrecordcount')).toBe(false)
    expect(doc.querySelectorAll('entity > filter > condition').length).toBe(1)
    expect(doc.querySelector('entity > order')?.getAttribute('attribute')).toBe('cr40f_dataehorriodesada')
    expect(doc.querySelector('link-entity')?.getAttribute('alias')).toBe('a_2b63')
  })

  it('página 2 leva o cookie e o número', () => {
    const fetch = parse(buildFetch(AGENDA, { ...base, page: 2, cookie: '<cookie page="1"><cr40f_id last="OS-1" /></cookie>' })).documentElement
    expect(fetch.getAttribute('page')).toBe('2')
    expect(fetch.getAttribute('paging-cookie')).toBe('<cookie page="1"><cr40f_id last="OS-1" /></cookie>')
  })

  it('ordenação da coluna substitui a ordem da visão', () => {
    const doc = parse(buildFetch(AGENDA, { ...base, sort: { attribute: 'cr40f_status', alias: null, descending: true } }))
    const orders = doc.querySelectorAll('entity > order')
    expect(orders.length).toBe(1)
    expect(orders[0].getAttribute('attribute')).toBe('cr40f_status')
    expect(orders[0].getAttribute('descending')).toBe('true')
  })

  it('ordenação por coluna de link entra dentro do link-entity', () => {
    const doc = parse(buildFetch(AGENDA, { ...base, sort: { attribute: 'new_valortotal', alias: 'a_2b63', descending: false } }))
    expect(doc.querySelectorAll('entity > order').length).toBe(0)
    expect(doc.querySelector('link-entity > order')?.getAttribute('attribute')).toBe('new_valortotal')
  })

  it('busca vira filtro OR com like em qualquer parte de cada campo', () => {
    const doc = parse(buildFetch(AGENDA, { ...base, search: searchConditions("OS-19 d'água", ['cr40f_id', 'cr40f_trajeto']) }))
    const filters = doc.querySelectorAll('entity > filter')
    expect(filters.length).toBe(2)
    const or = filters[1]
    expect(or.getAttribute('type')).toBe('or')
    const conditions = Array.from(or.querySelectorAll('condition'))
    expect(conditions.map((c) => c.getAttribute('attribute'))).toEqual(['cr40f_id', 'cr40f_trajeto'])
    expect(conditions[0].getAttribute('operator')).toBe('like')
    expect(conditions[0].getAttribute('value')).toBe("%OS-19 d'água%")
    expect(conditions[1].getAttribute('value')).toBe("%OS-19 d'água%")
  })

  it('busca vazia ou sem campos não acrescenta filtro', () => {
    expect(parse(buildFetch(AGENDA, { ...base, search: searchConditions('   ', ['cr40f_id']) })).querySelectorAll('entity > filter').length).toBe(1)
    expect(parse(buildFetch(AGENDA, { ...base, search: searchConditions('x', []) })).querySelectorAll('entity > filter').length).toBe(1)
  })

  it('FetchXML inválido lança erro legível', () => {
    expect(() => buildFetch('<fetch><entity>', base)).toThrow('FetchXML da visão inválido.')
  })
})

describe('buildCountFetch', () => {
  const count = (query = '', quickFind: string[] = []) => parse(buildCountFetch(AGENDA, { search: searchConditions(query, quickFind) }))

  it('vira agregação de contagem: sem paginação, ordem e atributos da visão', () => {
    const doc = count()
    const fetch = doc.documentElement
    expect(fetch.getAttribute('aggregate')).toBe('true')
    for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount', 'distinct']) expect(fetch.hasAttribute(name)).toBe(false)
    expect(doc.querySelectorAll('order').length).toBe(0)
    const attributes = doc.querySelectorAll('entity > attribute')
    expect(attributes.length).toBe(1)
    expect(attributes[0].getAttribute('name')).toBe('cr40f_reservadeveculosid')
    expect(attributes[0].getAttribute('alias')).toBe('total')
    expect(attributes[0].getAttribute('aggregate')).toBe('count')
    expect(doc.querySelector('entity')?.firstElementChild).toBe(attributes[0])
    expect(doc.querySelectorAll('attribute').length).toBe(1)
  })

  it('preserva filtro e link-entity (sem atributos)', () => {
    const doc = count()
    expect(doc.querySelectorAll('entity > filter > condition').length).toBe(1)
    const link = doc.querySelector('link-entity')
    expect(link?.getAttribute('alias')).toBe('a_2b63')
    expect(link?.querySelectorAll('attribute').length).toBe(0)
  })

  it('injeta a busca igual ao buildFetch', () => {
    const doc = count("OS-19 d'água", ['cr40f_id', 'cr40f_trajeto'])
    const filters = doc.querySelectorAll('entity > filter')
    expect(filters.length).toBe(2)
    expect(Array.from(filters[1].querySelectorAll('condition')).map((c) => c.getAttribute('value'))).toEqual(["%OS-19 d'água%", "%OS-19 d'água%"])
    expect(count('   ', ['cr40f_id']).querySelectorAll('entity > filter').length).toBe(1)
  })

  it('remove order de link-entity e FetchXML inválido lança erro legível', () => {
    const withLinkOrder = AGENDA.replace('<attribute name="new_valortotal" />', '<attribute name="new_valortotal" /><order attribute="new_valortotal" />')
    expect(parse(buildCountFetch(withLinkOrder, { search: searchConditions('', []) })).querySelectorAll('order').length).toBe(0)
    expect(() => buildCountFetch('<fetch><entity>', { search: searchConditions('', []) })).toThrow('FetchXML da visão inválido.')
  })
})

describe('leitura da visão', () => {
  it('lista link-entities com alias e tabela', () => {
    expect(linkEntities(AGENDA)).toEqual([{ alias: 'a_2b63', name: 'cr40f_composicaodeprecos' }])
    expect(linkEntities(QUICK)).toEqual([])
  })
  it('campos de localização rápida são os com value {0}', () => {
    expect(quickFindAttributes(QUICK)).toEqual(['cr40f_veiculo', 'cr40f_trajeto', 'cr40f_id'])
  })
  it('ordem padrão é o primeiro order da raiz', () => {
    expect(defaultSort(AGENDA)).toEqual({ attribute: 'cr40f_dataehorriodesada', alias: null, descending: false })
    expect(defaultSort(QUICK)).toBeNull()
  })
})
