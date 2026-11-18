import { describe, expect, it } from 'vitest'
import { emptyFilters, type TableFilters } from '@betinhos/ui'
import { encodeFilters } from './filters'
import { readUrlState, writeUrlState, type UrlState } from './urlState'

const FILTERS: TableFilters = {
  quick: {
    cr40f_status: { type: 'condition', id: 'a', field: 'cr40f_status', op: 'in', values: [{ value: '202410001', label: 'Confirmado' }] },
    cr40f_trajeto: { type: 'condition', id: 'b', field: 'cr40f_trajeto', op: 'contains', value: 'Guarulhos ação' },
  },
  advanced: { type: 'group', id: 'raiz', logic: 'or', items: [{ type: 'condition', id: 'c', field: 'cr40f_receber', op: 'yes' }] },
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

  it('tabela=ds (tabela do Design System) vai e volta; outro valor é ignorado', () => {
    expect(readUrlState(new URLSearchParams('view=v&tabela=ds'))).toEqual({ view: 'v', tabela: 'ds' })
    expect(readUrlState(new URLSearchParams('tabela=outra'))).toEqual({})
    expect(writeUrlState({ view: 'v', tabela: 'ds' })).toBe('view=v&tabela=ds')
  })
  it('omite valores vazios', () => {
    expect(writeUrlState({})).toBe('')
    expect(writeUrlState({ view: '', q: '', sort: null, filters: emptyFilters() })).toBe('')
    expect(new URLSearchParams(writeUrlState({ view: 'a' })).has('f')).toBe(false)
  })

  it('valores inválidos são ignorados', () => {
    expect(readUrlState(new URLSearchParams('f=%%%nao-e-base64&sort=x&q='))).toEqual({})
    expect(readUrlState(new URLSearchParams('sort=cr40f_id:up'))).toEqual({})
    expect(readUrlState(new URLSearchParams(`f=${encodeFilters({})}`))).toEqual({})
    expect(readUrlState(new URLSearchParams('view=a&f=lixo'))).toEqual({ view: 'a' })
  })

  it('"Mostrar manutenções" mudado na tela vai como m=1 ou m=0', () => {
    expect(new URLSearchParams(writeUrlState({ view: 'a', manutencoes: false })).get('m')).toBe('0')
    expect(readUrlState(new URLSearchParams(writeUrlState({ view: 'a', manutencoes: true })))).toEqual({ view: 'a', manutencoes: true })
    expect(readUrlState(new URLSearchParams('m=0'))).toEqual({ manutencoes: false })
    expect(readUrlState(new URLSearchParams('m=talvez'))).toEqual({})
    expect(new URLSearchParams(writeUrlState({ view: 'a' })).has('m')).toBe(false)
  })

  it('link do formato antigo (um filtro por atributo) abre como filtro rápido', () => {
    const f = encodeFilters({ cr40f_trajeto: { kind: 'text', op: 'begins', value: 'GRU' } })
    expect(readUrlState(new URLSearchParams(`f=${f}`)).filters?.quick.cr40f_trajeto).toMatchObject({ op: 'begins', value: 'GRU' })
  })
})
