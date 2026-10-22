// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCountFetch, buildFetch } from './fetch'
import { buildSearch, escapeLike, searchConditions, searchKind, type SearchField } from './search'

const FIELDS = ['cr40f_id', 'cr40f_veiculo', 'cr40f_trajeto', 'cr40f_cliente']
const VIEW = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /></entity></fetch>'
const base = { page: 1, pageSize: 100, cookie: null, sort: null }
const like = (attribute: string, value: string) => ({ attribute, operator: 'like', value })
const conditionsOf = (xml: string) => Array.from(new DOMParser().parseFromString(xml, 'text/xml').querySelectorAll('entity > filter[type="or"] > condition'))
  .map((c) => [c.getAttribute('attribute'), c.getAttribute('operator'), c.getAttribute('value') ?? Array.from(c.querySelectorAll('value')).map((v) => v.textContent)])

const STATUS = [{ value: 100000000, label: 'Concluído' }, { value: 100000001, label: 'Cancelado' }, { value: 100000002, label: 'Pré-reserva' }]
const MIXED: SearchField[] = [
  { attribute: 'cr40f_id', kind: 'text' },
  { attribute: 'cr40f_status', kind: 'choice', options: STATUS },
  { attribute: 'cr40f_motorista', kind: 'lookup', targets: ['cr40f_funcionarios'] },
  { attribute: 'ownerid', kind: 'lookup', targets: ['systemuser', 'team'] },
]
const IDS: Record<string, string[]> = { cr40f_funcionarios: ['f1', 'f2'], systemuser: ['u1'], team: ['t1', 'u1'] }
const ids = (target: string) => IDS[target] ?? []

describe('searchConditions', () => {
  it('busca abrangente: o termo em qualquer parte de todos os campos', () => {
    expect(searchConditions('Lima', FIELDS)).toEqual(FIELDS.map((attribute) => like(attribute, '%Lima%')))
    expect(searchConditions('1013', ['cr40f_id'])).toEqual([like('cr40f_id', '%1013%')])
    expect(searchConditions(' g ', ['cr40f_trajeto'])).toEqual([like('cr40f_trajeto', '%g%')])
  })

  it('curingas digitados viram literais; aspas, hífen e acentos passam intactos', () => {
    expect(escapeLike('50%_[a]')).toBe('50[%][_][[]a]')
    expect(searchConditions('100%', ['cr40f_trajeto'])).toEqual([like('cr40f_trajeto', '%100[%]%')])
    expect(searchConditions("-d'água", ['cr40f_trajeto'])).toEqual([like('cr40f_trajeto', "%-d'água%")])
  })

  it('termo vazio ou sem campos não busca', () => {
    expect(searchConditions('   ', FIELDS)).toEqual([])
    expect(searchConditions('Fasano', [])).toEqual([])
  })
})

describe('searchKind', () => {
  it('like só em texto; choice, booleano e estado por rótulo; lookup por nome; o resto fica fora', () => {
    expect(['String', 'Memo'].map(searchKind)).toEqual(['text', 'text'])
    expect(['Picklist', 'Boolean', 'State', 'Status'].map(searchKind)).toEqual(['choice', 'choice', 'choice', 'choice'])
    expect(['Lookup', 'Customer', 'Owner'].map(searchKind)).toEqual(['lookup', 'lookup', 'lookup'])
    expect(['DateTime', 'Integer', 'Money', 'Uniqueidentifier', undefined].map(searchKind)).toEqual([null, null, null, null, null])
  })
})

describe('buildSearch', () => {
  it('texto com like; choice com os valores cujo rótulo contém o termo, sem acento nem caixa; lookup com os IDs dos alvos', () => {
    expect(buildSearch('lima', MIXED, ids)).toEqual([
      like('cr40f_id', '%lima%'),
      { attribute: 'cr40f_motorista', operator: 'in', values: ['f1', 'f2'] },
      { attribute: 'ownerid', operator: 'in', values: ['u1', 't1'] },
    ])
    expect(buildSearch('CONCLUIDO', MIXED, () => [])).toEqual([
      like('cr40f_id', '%CONCLUIDO%'),
      { attribute: 'cr40f_status', operator: 'in', values: ['100000000'] },
    ])
    expect(buildSearch('re', MIXED, () => []).find((c) => c.attribute === 'cr40f_status')).toEqual({ attribute: 'cr40f_status', operator: 'in', values: ['100000002'] })
  })

  it('choice sem rótulo que case e lookup sem registro ficam de fora; termo vazio não busca', () => {
    expect(buildSearch('xyz', MIXED, () => [])).toEqual([like('cr40f_id', '%xyz%')])
    expect(buildSearch('  ', MIXED, ids)).toEqual([])
  })
})

describe('busca no FetchXML', () => {
  it('buildFetch e buildCountFetch levam as mesmas condições, com aspas e acentos escapados pelo XML', () => {
    const query = `Hotel "Fasano" & d'água`
    const search = searchConditions(query, FIELDS)
    const page = buildFetch(VIEW, { ...base, search })
    const count = buildCountFetch(VIEW, { search })
    expect(conditionsOf(page)).toEqual(FIELDS.map((attribute) => [attribute, 'like', `%${query}%`]))
    expect(conditionsOf(count)).toEqual(conditionsOf(page))
    expect(page).toContain('&amp;')
  })

  it('`in` vira <value> por item, sem atributo value', () => {
    const page = buildFetch(VIEW, { ...base, search: buildSearch('lima', MIXED, ids) })
    expect(conditionsOf(page)).toEqual([
      ['cr40f_id', 'like', '%lima%'],
      ['cr40f_motorista', 'in', ['f1', 'f2']],
      ['ownerid', 'in', ['u1', 't1']],
    ])
  })
})
