// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { emptyFilters, type TableFilters } from '@betinhos/ui'
import { MOCK_ATTRIBUTES } from '../data/mock'
import { encodeFilters } from './filters'
import { decodeTableFilters, encodeTableFilters, fromLegacy, geralFilterFields, hasActiveFilters, injectTableFilters } from './tableFilters'

const VIEW = `<fetch version="1.0" mapping="logical"><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" />
<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>`
const fields = geralFilterFields(MOCK_ATTRIBUTES, ['cr40f_trajeto', 'cr40f_status'])

describe('geralFilterFields', () => {
  it('lista os campos filtráveis da raiz, colunas da visão primeiro, com opções e moeda', () => {
    expect(fields.slice(0, 2).map((f) => f.key)).toEqual(['cr40f_trajeto', 'cr40f_status'])
    expect(fields.find((f) => f.key === 'createdon')).toBeUndefined()
    expect(fields.find((f) => f.key === 'cr40f_status')?.options?.[0]).toEqual({ value: expect.any(String), label: expect.any(String) })
    expect(fields.find((f) => f.key === 'cr40f_cotao')).toMatchObject({ kind: 'number', money: true })
    expect(fields.find((f) => f.key === 'cr40f_cliente')?.kind).toBe('lookup')
    expect(geralFilterFields(null)).toEqual([])
  })
})

describe('formato antigo', () => {
  it('converte cada tipo para condição rápida', () => {
    const legacy = fromLegacy({
      cr40f_trajeto: { kind: 'text', op: 'contains', value: 'Galeão' },
      cr40f_status: { kind: 'choice', op: 'in', values: [Number(fields.find((f) => f.key === 'cr40f_status')!.options![0].value)] },
      cr40f_cliente: { kind: 'lookup', op: 'in', values: [{ id: 'c1', nome: 'Alfa' }] },
      cr40f_dataehorriodesada: { kind: 'date', op: 'range', from: '2026-10-01' },
      cr40f_cotao: { kind: 'number', op: 'between', value: 10, to: 20 },
      cr40f_receber: { kind: 'bool', op: 'yes' },
    }, MOCK_ATTRIBUTES)
    expect(legacy.quick.cr40f_trajeto).toMatchObject({ op: 'contains', value: 'Galeão' })
    expect(legacy.quick.cr40f_status.values?.[0].label).toBe(fields.find((f) => f.key === 'cr40f_status')!.options![0].label)
    expect(legacy.quick.cr40f_cliente).toMatchObject({ op: 'in', values: [{ value: 'c1', label: 'Alfa' }] })
    expect(legacy.quick.cr40f_dataehorriodesada).toMatchObject({ op: 'after', value: '2026-09-30' })
    expect(legacy.quick.cr40f_cotao).toMatchObject({ op: 'between', value: 10, to: 20 })
    expect(legacy.quick.cr40f_receber).toMatchObject({ op: 'yes' })
  })

  it('link antigo na URL continua abrindo com os mesmos filtros', () => {
    const old = encodeFilters({ cr40f_trajeto: { kind: 'text', op: 'eq', value: 'Galeão' } })
    expect(decodeTableFilters(old).quick.cr40f_trajeto).toMatchObject({ op: 'eq', value: 'Galeão' })
  })
})

describe('URL no formato novo', () => {
  it('vai e volta com rápidos e avançado; vazio não gera texto', () => {
    const filters: TableFilters = {
      quick: { cr40f_trajeto: { type: 'condition', id: 'q', field: 'cr40f_trajeto', op: 'contains', value: 'ã' } },
      advanced: { type: 'group', id: 'raiz', logic: 'or', items: [{ type: 'condition', id: 'a', field: 'cr40f_receber', op: 'no' }] },
    }
    expect(decodeTableFilters(encodeTableFilters(filters))).toEqual(filters)
    expect(encodeTableFilters(emptyFilters())).toBe('')
    expect(hasActiveFilters(decodeTableFilters('lixo!'))).toBe(false)
  })
})

describe('injectTableFilters', () => {
  it('acrescenta o <filter> como último filho da entidade e ignora campo desconhecido', () => {
    const filters: TableFilters = {
      ...emptyFilters(),
      quick: {
        cr40f_trajeto: { type: 'condition', id: 'q', field: 'cr40f_trajeto', op: 'begins', value: 'GRU' },
        sumiu: { type: 'condition', id: 'x', field: 'sumiu', op: 'empty' },
      },
    }
    const doc = new DOMParser().parseFromString(injectTableFilters(VIEW, filters, fields), 'text/xml')
    const last = doc.querySelector('entity')!.lastElementChild!
    expect(last.outerHTML).toBe('<filter type="and"><condition attribute="cr40f_trajeto" operator="like" value="GRU%"/></filter>')
    expect(injectTableFilters(VIEW, emptyFilters(), fields)).toBe(VIEW)
  })
})
