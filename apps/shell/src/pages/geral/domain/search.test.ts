// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCountFetch, buildFetch } from './fetch'
import { escapeLike, normalizeTerm, searchConditions } from './search'

const FIELDS = ['cr40f_id', 'cr40f_veiculo', 'cr40f_trajeto', 'cr40f_cliente']
const VIEW = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /></entity></fetch>'
const base = { page: 1, pageSize: 100, cookie: null, sort: null }
const conditionsOf = (xml: string) => Array.from(new DOMParser().parseFromString(xml, 'text/xml').querySelectorAll('entity > filter[type="or"] > condition'))
  .map((c) => [c.getAttribute('attribute'), c.getAttribute('operator'), c.getAttribute('value')])

describe('searchConditions', () => {
  it('texto: contém só em trajeto e cliente, prefixo no ID e nos demais', () => {
    expect(searchConditions('Unique', FIELDS)).toEqual([
      { attribute: 'cr40f_id', value: 'Unique%' },
      { attribute: 'cr40f_veiculo', value: 'Unique%' },
      { attribute: 'cr40f_trajeto', value: '%Unique%' },
      { attribute: 'cr40f_cliente', value: '%Unique%' },
    ])
  })

  it('código de serviço busca só por prefixo, sem varrer trajeto e cliente', () => {
    expect(searchConditions('os-1234', FIELDS)).toEqual([
      { attribute: 'cr40f_id', value: 'os-1234%' },
      { attribute: 'cr40f_veiculo', value: 'os-1234%' },
    ])
    // Sem campo de prefixo na localização rápida, o código ainda é procurado no texto livre.
    expect(searchConditions('OS-12', ['cr40f_trajeto'])).toEqual([{ attribute: 'cr40f_trajeto', value: '%OS-12%' }])
  })

  it('número puro também acha o serviço pelo código (OS-número%)', () => {
    expect(searchConditions('1234', FIELDS)).toContainEqual({ attribute: 'cr40f_id', value: 'OS-1234%' })
    expect(searchConditions('1234', FIELDS)).toContainEqual({ attribute: 'cr40f_id', value: '1234%' })
    expect(searchConditions('1234', ['cr40f_trajeto'])).toEqual([{ attribute: 'cr40f_trajeto', value: '%1234%' }])
  })

  it('termo de 1 caractere só usa prefixo, inclusive em trajeto e cliente', () => {
    expect(searchConditions(' g ', FIELDS).map((c) => c.value)).toEqual(['g%', 'g%', 'g%', 'g%'])
  })

  it('curingas digitados viram literais; aspas e acentos passam intactos', () => {
    expect(escapeLike('50%_[a]')).toBe('50[%][_][[]a]')
    expect(searchConditions('100%', ['cr40f_trajeto'])).toEqual([{ attribute: 'cr40f_trajeto', value: '%100[%]%' }])
    expect(searchConditions("d'água", ['cr40f_trajeto', 'cr40f_id'])).toEqual([
      { attribute: 'cr40f_trajeto', value: "%d'água%" },
      { attribute: 'cr40f_id', value: "d'água%" },
    ])
  })

  it('hífen/apóstrofo no começo saem (curinga inicial no Dataverse); vazio não busca', () => {
    expect(normalizeTerm("  -'Fasano ")).toBe('Fasano')
    expect(searchConditions('--', FIELDS)).toEqual([])
    expect(searchConditions('   ', FIELDS)).toEqual([])
    expect(searchConditions('Fasano', [])).toEqual([])
  })
})

describe('busca no FetchXML', () => {
  it('buildFetch e buildCountFetch levam as mesmas condições, com aspas e acentos escapados pelo XML', () => {
    const page = buildFetch(VIEW, { ...base, query: `Hotel "Fasano" & d'água`, quickFind: FIELDS })
    const count = buildCountFetch(VIEW, { query: `Hotel "Fasano" & d'água`, quickFind: FIELDS })
    expect(conditionsOf(page)).toEqual([
      ['cr40f_id', 'like', `Hotel "Fasano" & d'água%`],
      ['cr40f_veiculo', 'like', `Hotel "Fasano" & d'água%`],
      ['cr40f_trajeto', 'like', `%Hotel "Fasano" & d'água%`],
      ['cr40f_cliente', 'like', `%Hotel "Fasano" & d'água%`],
    ])
    expect(conditionsOf(count)).toEqual(conditionsOf(page))
    expect(page).toContain('&amp;')
  })

  it('código de serviço não gera nenhum like com curinga inicial', () => {
    const values = conditionsOf(buildFetch(VIEW, { ...base, query: 'OS-19', quickFind: FIELDS })).map((c) => c[2])
    expect(values.length).toBeGreaterThan(0)
    expect(values.every((v) => !v?.startsWith('%'))).toBe(true)
  })
})
