// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCountFetch, buildFetch } from './fetch'
import { escapeLike, searchConditions } from './search'

const FIELDS = ['cr40f_id', 'cr40f_veiculo', 'cr40f_trajeto', 'cr40f_cliente']
const VIEW = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /></entity></fetch>'
const base = { page: 1, pageSize: 100, cookie: null, sort: null }
const conditionsOf = (xml: string) => Array.from(new DOMParser().parseFromString(xml, 'text/xml').querySelectorAll('entity > filter[type="or"] > condition'))
  .map((c) => [c.getAttribute('attribute'), c.getAttribute('operator'), c.getAttribute('value')])

describe('searchConditions', () => {
  it('busca abrangente: o termo em qualquer parte de todos os campos', () => {
    expect(searchConditions('Lima', FIELDS)).toEqual(FIELDS.map((attribute) => ({ attribute, value: '%Lima%' })))
    expect(searchConditions('1013', ['cr40f_id'])).toEqual([{ attribute: 'cr40f_id', value: '%1013%' }])
    expect(searchConditions(' g ', ['cr40f_trajeto'])).toEqual([{ attribute: 'cr40f_trajeto', value: '%g%' }])
  })

  it('curingas digitados viram literais; aspas, hífen e acentos passam intactos', () => {
    expect(escapeLike('50%_[a]')).toBe('50[%][_][[]a]')
    expect(searchConditions('100%', ['cr40f_trajeto'])).toEqual([{ attribute: 'cr40f_trajeto', value: '%100[%]%' }])
    expect(searchConditions("-d'água", ['cr40f_trajeto'])).toEqual([{ attribute: 'cr40f_trajeto', value: "%-d'água%" }])
  })

  it('termo vazio ou sem campos não busca', () => {
    expect(searchConditions('   ', FIELDS)).toEqual([])
    expect(searchConditions('Fasano', [])).toEqual([])
  })
})

describe('busca no FetchXML', () => {
  it('buildFetch e buildCountFetch levam as mesmas condições, com aspas e acentos escapados pelo XML', () => {
    const query = `Hotel "Fasano" & d'água`
    const page = buildFetch(VIEW, { ...base, query, quickFind: FIELDS })
    const count = buildCountFetch(VIEW, { query, quickFind: FIELDS })
    expect(conditionsOf(page)).toEqual(FIELDS.map((attribute) => [attribute, 'like', `%${query}%`]))
    expect(conditionsOf(count)).toEqual(conditionsOf(page))
    expect(page).toContain('&amp;')
  })
})
