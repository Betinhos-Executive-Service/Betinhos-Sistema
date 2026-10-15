// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { MOCK_ATTRIBUTES } from '../data/mock'
import { decodeFilters, describeFilter, encodeFilters, filterKindFor, injectFilters, isEmptyFilter, type FilterSet } from './filters'
import type { AttributeInfo } from './types'

const VIEW = `<fetch version="1.0" mapping="logical"><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" />
<order attribute="cr40f_dataehorriodesada" descending="false" />
<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>
<link-entity name="cr40f_composicaodeprecos" from="cr40f_composicaodeprecosid" to="new_composicaodepreco" alias="a_1"><attribute name="new_valortotal" /></link-entity>
</entity></fetch>`

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml')
const inject = (filters: FilterSet) => parse(injectFilters(VIEW, filters, MOCK_ATTRIBUTES))
const conditions = (filters: FilterSet) => Array.from(inject(filters).querySelectorAll('entity > filter:last-of-type > condition'))
const ops = (filters: FilterSet) => conditions(filters).map((c) => [c.getAttribute('attribute'), c.getAttribute('operator'), c.getAttribute('value')])
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

describe('isEmptyFilter', () => {
  it('exige valor onde a operação precisa dele', () => {
    expect(isEmptyFilter({ kind: 'text', op: 'contains', value: '  ' })).toBe(true)
    expect(isEmptyFilter({ kind: 'text', op: 'empty' })).toBe(false)
    expect(isEmptyFilter({ kind: 'choice', op: 'in', values: [] })).toBe(true)
    expect(isEmptyFilter({ kind: 'lookup', op: 'empty' })).toBe(false)
    expect(isEmptyFilter({ kind: 'date', op: 'range' })).toBe(true)
    expect(isEmptyFilter({ kind: 'date', op: 'range', to: '2026-10-08' })).toBe(false)
    expect(isEmptyFilter({ kind: 'date', op: 'today' })).toBe(false)
    expect(isEmptyFilter({ kind: 'number', op: 'ge' })).toBe(true)
    expect(isEmptyFilter({ kind: 'number', op: 'ge', value: 0 })).toBe(false)
    expect(isEmptyFilter({ kind: 'number', op: 'between', value: 1 })).toBe(true)
    expect(isEmptyFilter({ kind: 'bool', op: 'no' })).toBe(false)
  })
})

describe('injectFilters', () => {
  it('anexa um filter and como último filho da entidade e preserva o resto', () => {
    const doc = inject({ cr40f_id: { kind: 'text', op: 'contains', value: 'OS-1' } })
    const entity = doc.querySelector('entity')!
    const last = entity.lastElementChild!
    expect(last.tagName).toBe('filter')
    expect(last.getAttribute('type')).toBe('and')
    expect(entity.querySelectorAll(':scope > filter').length).toBe(2)
    expect(entity.querySelector('order')).not.toBeNull()
    expect(entity.querySelector('link-entity')).not.toBeNull()
  })
  it('sem filtros efetivos devolve o FetchXML da visão sem novo filter', () => {
    const doc = inject({ cr40f_id: { kind: 'text', op: 'contains', value: '' }, naoexiste: { kind: 'bool', op: 'yes' } })
    expect(doc.querySelectorAll('entity > filter').length).toBe(1)
  })
  it('texto: like, not-like, eq, begins, null e not-null com escape de curingas', () => {
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'contains', value: 'GRU' } })).toEqual([['cr40f_trajeto', 'like', '%GRU%']])
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'not-contains', value: 'GRU' } })).toEqual([['cr40f_trajeto', 'not-like', '%GRU%']])
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'begins', value: 'GRU' } })).toEqual([['cr40f_trajeto', 'like', 'GRU%']])
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'eq', value: '100%' } })).toEqual([['cr40f_trajeto', 'eq', '100%']])
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'empty' } })).toEqual([['cr40f_trajeto', 'null', null]])
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'not-empty' } })).toEqual([['cr40f_trajeto', 'not-null', null]])
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'contains', value: '50%_[a]' } })).toEqual([['cr40f_trajeto', 'like', '%50[%][_][[]a]%']])
  })
  it('choice e lookup: in com filhos value; empty vira null', () => {
    const doc = inject({
      cr40f_status: { kind: 'choice', op: 'in', values: [202410001, 202410005] },
      cr40f_motorista: { kind: 'lookup', op: 'in', values: [{ id: 'bbbbbbbb-0001-4000-8000-000000000001', nome: 'Carlos Lima' }] },
      cr40f_cliente: { kind: 'lookup', op: 'empty' },
    })
    const found = (name: string) => doc.querySelector(`entity > filter:last-of-type > condition[attribute="${name}"]`)!
    expect(found('cr40f_status').getAttribute('operator')).toBe('in')
    expect(Array.from(found('cr40f_status').children).map((c) => c.textContent)).toEqual(['202410001', '202410005'])
    expect(Array.from(found('cr40f_motorista').children).map((c) => c.textContent)).toEqual(['bbbbbbbb-0001-4000-8000-000000000001'])
    expect(found('cr40f_cliente').getAttribute('operator')).toBe('null')
  })
  it('data: operadores relativos, range e empty', () => {
    const dateOp = (f: FilterSet[string]) => ops({ cr40f_dataehorriodesada: f })
    for (const op of ['today', 'tomorrow', 'yesterday', 'this-week', 'this-month'] as const) {
      expect(dateOp({ kind: 'date', op })).toEqual([['cr40f_dataehorriodesada', op, null]])
    }
    expect(dateOp({ kind: 'date', op: 'next-7' })).toEqual([['cr40f_dataehorriodesada', 'next-x-days', '7']])
    expect(dateOp({ kind: 'date', op: 'last-7' })).toEqual([['cr40f_dataehorriodesada', 'last-x-days', '7']])
    expect(dateOp({ kind: 'date', op: 'range', from: '2026-10-01', to: '2026-10-31' })).toEqual([
      ['cr40f_dataehorriodesada', 'on-or-after', '2026-10-01'], ['cr40f_dataehorriodesada', 'on-or-before', '2026-10-31'],
    ])
    expect(dateOp({ kind: 'date', op: 'range', to: '2026-10-31' })).toEqual([['cr40f_dataehorriodesada', 'on-or-before', '2026-10-31']])
    expect(dateOp({ kind: 'date', op: 'empty' })).toEqual([['cr40f_dataehorriodesada', 'null', null]])
  })
  it('número e booleano', () => {
    expect(ops({ cr40f_cotao: { kind: 'number', op: 'ge', value: 500 } })).toEqual([['cr40f_cotao', 'ge', '500']])
    expect(ops({ cr40f_cotao: { kind: 'number', op: 'le', value: 800.5 } })).toEqual([['cr40f_cotao', 'le', '800.5']])
    expect(ops({ cr40f_cotao: { kind: 'number', op: 'eq', value: 0 } })).toEqual([['cr40f_cotao', 'eq', '0']])
    expect(ops({ cr40f_cotao: { kind: 'number', op: 'between', value: 500, to: 900 } })).toEqual([['cr40f_cotao', 'ge', '500'], ['cr40f_cotao', 'le', '900']])
    expect(ops({ cr40f_cotao: { kind: 'number', op: 'empty' } })).toEqual([['cr40f_cotao', 'null', null]])
    expect(ops({ cr40f_receber: { kind: 'bool', op: 'yes' } })).toEqual([['cr40f_receber', 'eq', '1']])
    expect(ops({ cr40f_receber: { kind: 'bool', op: 'no' } })).toEqual([['cr40f_receber', 'eq', '0']])
  })
  it('vários filtros ficam no mesmo filter and', () => {
    expect(ops({ cr40f_trajeto: { kind: 'text', op: 'contains', value: 'GRU' }, cr40f_receber: { kind: 'bool', op: 'yes' } }).length).toBe(2)
  })
})

describe('describeFilter', () => {
  it('descreve em pt-BR com rótulos da metadata', () => {
    expect(describeFilter('cr40f_status', { kind: 'choice', op: 'in', values: [202410001, 202410005] }, attr('cr40f_status'))).toBe('Status de Operação: Confirmado, Programado')
    expect(describeFilter('cr40f_status', { kind: 'choice', op: 'empty' }, attr('cr40f_status'))).toBe('Status de Operação: vazio')
    expect(describeFilter('cr40f_dataehorriodesada', { kind: 'date', op: 'today' }, attr('cr40f_dataehorriodesada'))).toBe('Data e horário de saída: hoje')
    expect(describeFilter('cr40f_dataehorriodesada', { kind: 'date', op: 'range', from: '2026-10-01', to: '2026-10-31' }, undefined)).toBe('cr40f_dataehorriodesada: de 01/10/2026 a 31/10/2026')
    expect(describeFilter('cr40f_dataehorriodesada', { kind: 'date', op: 'range', from: '2026-10-01' }, attr('cr40f_dataehorriodesada'))).toContain('a partir de 01/10/2026')
    expect(describeFilter('cr40f_dataehorriodesada', { kind: 'date', op: 'next-7' }, attr('cr40f_dataehorriodesada'))).toContain('próximos 7 dias')
    expect(describeFilter('cr40f_cotao', { kind: 'number', op: 'ge', value: 500 }, attr('cr40f_cotao'))).toBe('Cotação: ≥ R$ 500,00')
    expect(describeFilter('cr40f_cotao', { kind: 'number', op: 'between', value: 500, to: 900 }, attr('cr40f_cotao'))).toBe('Cotação: entre R$ 500,00 e R$ 900,00')
    expect(describeFilter('cr40f_trajeto', { kind: 'text', op: 'contains', value: 'GRU' }, attr('cr40f_trajeto'))).toBe('Trajeto: contém GRU')
    expect(describeFilter('cr40f_trajeto', { kind: 'text', op: 'not-empty' }, attr('cr40f_trajeto'))).toBe('Trajeto: preenchido')
    expect(describeFilter('cr40f_motorista', { kind: 'lookup', op: 'in', values: [{ id: 'x', nome: 'Carlos Lima' }, { id: 'y', nome: 'Ana Souza' }] }, attr('cr40f_motorista'))).toBe('Motorista: Carlos Lima, Ana Souza')
    expect(describeFilter('cr40f_receber', { kind: 'bool', op: 'no' }, attr('cr40f_receber'))).toBe('Receber: Não')
  })
  it('número sem moeda usa formato pt-BR e atributo desconhecido cai no nome lógico', () => {
    const plain: AttributeInfo = { logicalName: 'x', type: 'Integer', label: 'Qtd', updatable: true, targets: [], options: [] }
    expect(describeFilter('x', { kind: 'number', op: 'le', value: 1500 }, plain)).toBe('Qtd: ≤ 1.500')
    expect(describeFilter('abc', { kind: 'bool', op: 'yes' }, undefined)).toBe('abc: Sim')
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
