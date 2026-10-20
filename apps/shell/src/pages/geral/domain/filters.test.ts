// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { MOCK_ATTRIBUTES } from '../data/mock'
import { decodeFilters, encodeFilters, filterKindFor, type FilterSet } from './filters'
import type { AttributeInfo } from './types'

const attr = (name: string) => MOCK_ATTRIBUTES.get(name)!

describe('filterKindFor', () => {
  it('mapeia cada tipo de célula e libera texto somente leitura', () => {
    expect(['text', 'memo', 'choice', 'lookup', 'datetime', 'money', 'boolean'].map((k) => filterKindFor(k as never, undefined)))
      .toEqual(['text', 'text', 'choice', 'lookup', 'date', 'number', 'bool'])
    expect(filterKindFor('readonly', attr('cr40f_id'))).toBe('text')
    expect(filterKindFor('readonly', attr('createdon'))).toBeNull()
    expect(filterKindFor('readonly', undefined)).toBeNull()
  })
})

describe('encodeFilters / decodeFilters', () => {
  const set: FilterSet = {
    cr40f_trajeto: { kind: 'text', op: 'contains', value: 'Praça da Sé ??>' },
    cr40f_status: { kind: 'choice', op: 'in', values: [202410001] },
    cr40f_motorista: { kind: 'lookup', op: 'in', values: [{ id: 'g1', nome: 'João Ávila' }] },
    cr40f_dataehorriodesada: { kind: 'date', op: 'range', from: '2026-10-01', to: '2026-10-31' },
    cr40f_cotao: { kind: 'number', op: 'between', value: 1, to: 2 },
    cr40f_receber: { kind: 'bool', op: 'yes' },
  }
  it('ida e volta com acentos, sem caracteres inseguros para URL', () => {
    const text = encodeFilters(set)
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeFilters(text)).toEqual(set)
    expect(decodeFilters(encodeFilters({}))).toEqual({})
  })
  it('é tolerante com lixo, JSON de outro formato e entradas inválidas', () => {
    expect(decodeFilters('')).toEqual({})
    expect(decodeFilters('%%%')).toEqual({})
    expect(decodeFilters(btoa('não é json'))).toEqual({})
    expect(decodeFilters(btoa('[1,2]'))).toEqual({})
    const bad = encodeFilters({ a: { kind: 'text', op: 'zzz' } as never, b: { kind: 'bool', op: 'yes' }, c: null as never })
    expect(decodeFilters(bad)).toEqual({ b: { kind: 'bool', op: 'yes' } })
  })
})
