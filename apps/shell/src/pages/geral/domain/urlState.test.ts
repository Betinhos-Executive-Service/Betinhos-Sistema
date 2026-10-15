import { describe, expect, it } from 'vitest'
import { encodeFilters, type FilterSet } from './filters'
import { readUrlState, writeUrlState, type UrlState } from './urlState'

const FILTERS: FilterSet = {
  cr40f_status: { kind: 'choice', op: 'in', values: [202410001] },
  cr40f_trajeto: { kind: 'text', op: 'contains', value: 'Guarulhos ação' },
}

describe('urlState', () => {
  it('ida e volta com visão, busca, ordem e filtros', () => {
    const state: UrlState = { view: 'mock-hoje', q: 'OS 10 & mais', sort: { attribute: 'cr40f_id', alias: null, descending: true }, filters: FILTERS }
    expect(readUrlState(new URLSearchParams(writeUrlState(state)))).toEqual(state)
  })

  it('ordem de coluna ligada usa alias.atributo', () => {
    const state: UrlState = { sort: { attribute: 'fullname', alias: 'm', descending: false } }
    const text = writeUrlState(state)
    expect(new URLSearchParams(text).get('sort')).toBe('m.fullname:asc')
    expect(readUrlState(new URLSearchParams(text))).toEqual(state)
  })

  it('omite valores vazios e filtros incompletos', () => {
    expect(writeUrlState({})).toBe('')
    expect(writeUrlState({ view: '', q: '', sort: null, filters: {} })).toBe('')
    expect(writeUrlState({ filters: { cr40f_trajeto: { kind: 'text', op: 'contains', value: '  ' } } })).toBe('')
    expect(new URLSearchParams(writeUrlState({ view: 'a' })).has('f')).toBe(false)
  })

  it('valores inválidos são ignorados', () => {
    expect(readUrlState(new URLSearchParams('f=%%%nao-e-base64&sort=x&q='))).toEqual({})
    expect(readUrlState(new URLSearchParams('sort=cr40f_id:up'))).toEqual({})
    expect(readUrlState(new URLSearchParams(`f=${encodeFilters({})}`))).toEqual({})
    expect(readUrlState(new URLSearchParams('view=a&f=lixo'))).toEqual({ view: 'a' })
  })
})
