// @vitest-environment jsdom
import { EMPTY_GROUP_ID, OTHERS_GROUP_ID } from '@betinhos/ui'
import { describe, expect, it } from 'vitest'
import { buildFetch, buildGroupsFetch } from './fetch'
import { bucketsFromRows, GROUPS_LIMIT_MESSAGE, isAggregateLimit, periodRange, type GroupSpec } from './grouping'
import { searchConditions } from './search'

const AGENDA = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" count="25" page="3">
<entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /><attribute name="cr40f_status" />
<order attribute="cr40f_dataehorriodesada" descending="false" />
<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>
<link-entity name="cr40f_composicaodeprecos" from="cr40f_composicaodeprecosid" to="new_composicaodepreco" link-type="outer" alias="a_2b63"><attribute name="new_valortotal" /></link-entity>
</entity></fetch>`

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml')
const search = searchConditions('ana', ['cr40f_id', 'cr40f_trajeto'])
const base = { page: 1, pageSize: 100, cookie: null, sort: null, search: [] }
const groupAttributes = (xml: string) => Array.from(parse(xml).querySelectorAll('entity > attribute')).map((a) => ({ name: a.getAttribute('name'), alias: a.getAttribute('alias'), groupby: a.getAttribute('groupby'), dategrouping: a.getAttribute('dategrouping'), aggregate: a.getAttribute('aggregate') }))
const conditions = (xml: string) => Array.from(parse(xml).querySelectorAll('entity > filter:last-of-type > condition')).map((c) => [c.getAttribute('attribute'), c.getAttribute('operator'), c.getAttribute('value')])

describe('buildGroupsFetch', () => {
  it('escolha: agrupa o campo, conta e mantém filtro e link; sem ordem, colunas nem paginação', () => {
    const xml = buildGroupsFetch(AGENDA, { search: [], spec: { attribute: 'cr40f_status', kind: 'choice', by: 'value' } })
    const doc = parse(xml)
    expect(doc.documentElement.getAttribute('aggregate')).toBe('true')
    for (const name of ['count', 'page', 'distinct']) expect(doc.documentElement.hasAttribute(name)).toBe(false)
    expect(groupAttributes(xml)).toEqual([
      { name: 'cr40f_status', alias: 'grupo', groupby: 'true', dategrouping: null, aggregate: null },
      { name: 'cr40f_reservadeveculosid', alias: 'total', groupby: null, dategrouping: null, aggregate: 'count' },
    ])
    expect(doc.querySelector('order')).toBeNull()
    expect(doc.querySelector('entity > filter > condition[attribute="statecode"]')).not.toBeNull()
    expect(doc.querySelector('link-entity')?.getAttribute('alias')).toBe('a_2b63')
  })

  it('relação e Sim/Não agrupam o próprio campo, sem dategrouping', () => {
    for (const kind of ['lookup', 'bool'] as const) {
      const [group] = groupAttributes(buildGroupsFetch(AGENDA, { search: [], spec: { attribute: 'new_motorista', kind, by: 'value' } }))
      expect(group).toMatchObject({ name: 'new_motorista', groupby: 'true', dategrouping: null })
    }
  })

  it('data por mês agrupa ano e mês; por ano, só o ano', () => {
    const attribute = 'cr40f_dataehorriodesada'
    const month = groupAttributes(buildGroupsFetch(AGENDA, { search: [], spec: { attribute, kind: 'date', by: 'month' } }))
    expect(month.slice(0, 2)).toEqual([
      { name: attribute, alias: 'grupo_ano', groupby: 'true', dategrouping: 'year', aggregate: null },
      { name: attribute, alias: 'grupo_mes', groupby: 'true', dategrouping: 'month', aggregate: null },
    ])
    const year = groupAttributes(buildGroupsFetch(AGENDA, { search: [], spec: { attribute, kind: 'date', by: 'year' } }))
    expect(year.map((a) => a.alias)).toEqual(['grupo_ano', 'total'])
  })

  it('a busca da barra continua valendo nos grupos', () => {
    const xml = buildGroupsFetch(AGENDA, { search, spec: { attribute: 'cr40f_status', kind: 'choice', by: 'value' } })
    expect(parse(xml).querySelectorAll('entity > filter condition[operator="like"]').length).toBe(2)
  })
})

describe('buildFetch com grupo aberto', () => {
  const open = (id: string, extra: Partial<GroupSpec> & { exclude?: string[] } = {}) => buildFetch(AGENDA, { ...base, search, group: { attribute: 'cr40f_status', kind: 'choice', by: 'value', id, ...extra } })

  it('valor: filtro extra com eq, mantendo filtro, link e busca', () => {
    const xml = open('202410001')
    expect(conditions(xml)).toEqual([['cr40f_status', 'eq', '202410001']])
    const doc = parse(xml)
    expect(doc.querySelector('entity > filter > condition[attribute="statecode"]')).not.toBeNull()
    expect(doc.querySelectorAll('filter[type="or"] > condition').length).toBe(2)
    expect(doc.querySelector('link-entity')).not.toBeNull()
    expect(doc.documentElement.getAttribute('count')).toBe('100')
  })

  it('vazio: operador null; outros: not-in com os grupos mostrados', () => {
    expect(conditions(open(EMPTY_GROUP_ID))).toEqual([['cr40f_status', 'null', null]])
    const xml = open(OTHERS_GROUP_ID, { exclude: ['a', 'b'] })
    const doc = parse(xml)
    expect(doc.querySelector('condition[operator="not-in"]')?.getAttribute('attribute')).toBe('cr40f_status')
    expect(Array.from(doc.querySelectorAll('condition[operator="not-in"] > value')).map((v) => v.textContent)).toEqual(['a', 'b'])
  })

  it('mês e ano: intervalo [início, fim) só com datas, que o Dataverse resolve no fuso do usuário como o dategrouping', () => {
    const date = { attribute: 'cr40f_dataehorriodesada', kind: 'date' as const, by: 'month' as const }
    expect(conditions(open('2026-11', date))).toEqual([
      ['cr40f_dataehorriodesada', 'ge', '2026-11-01'],
      ['cr40f_dataehorriodesada', 'lt', '2026-12-01'],
    ])
    expect(periodRange('2026-12')).toEqual(['2026-12-01', '2027-01-01'])
    expect(periodRange('2026')).toEqual(['2026-01-01', '2027-01-01'])
  })
})

describe('isAggregateLimit', () => {
  it('reconhece o limite do agregado do Dataverse e não outros erros', () => {
    expect(isAggregateLimit(new Error('AggregateQueryRecordLimit exceeded'))).toBe(true)
    expect(isAggregateLimit(new Error('The maximum record limit is exceeded. 0x8004E023'))).toBe(true)
    expect(isAggregateLimit(new Error('Sem permissão'))).toBe(false)
    expect(GROUPS_LIMIT_MESSAGE).toMatch(/filtre mais/)
  })
})

describe('bucketsFromRows', () => {
  const choice: GroupSpec = { attribute: 'cr40f_status', kind: 'choice', by: 'value', options: [{ value: '2', label: 'Dois' }, { value: '1', label: 'Um' }] }

  it('escolha segue a ordem das opções e junta o vazio no fim', () => {
    const rows = [{ grupo: 1, total: 4 }, { total: 3 }, { grupo: 2, total: 7 }]
    expect(bucketsFromRows(rows, choice)).toEqual([
      { id: '2', label: 'Dois', count: 7 },
      { id: '1', label: 'Um', count: 4 },
      { id: EMPTY_GROUP_ID, label: 'Vazio', count: 3 },
    ])
  })

  it('Sim vem antes de Não', () => {
    const spec: GroupSpec = { attribute: 'x', kind: 'bool', by: 'value', options: [] }
    expect(bucketsFromRows([{ grupo: false, total: 1 }, { grupo: true, total: 2 }], spec).map((b) => [b.id, b.label])).toEqual([['1', 'Sim'], ['0', 'Não']])
  })

  it('data do mais novo ao mais antigo, com o rótulo do período', () => {
    const month: GroupSpec = { attribute: 'd', kind: 'date', by: 'month', options: [] }
    const rows = [{ grupo_ano: 2026, grupo_mes: 3, total: 1 }, { grupo_ano: 2026, grupo_mes: 11, total: 2 }, { grupo_ano: 2025, grupo_mes: 12, total: 3 }]
    expect(bucketsFromRows(rows, month).map((b) => [b.id, b.label])).toEqual([['2026-11', 'novembro de 2026'], ['2026-03', 'março de 2026'], ['2025-12', 'dezembro de 2025']])
    expect(bucketsFromRows([{ grupo_ano: 2024, total: 1 }, { grupo_ano: 2026, total: 1 }], { ...month, by: 'year' }).map((b) => b.id)).toEqual(['2026', '2024'])
  })

  it('relação: maior para menor, 50 grupos e o resto em Outros', () => {
    const spec: GroupSpec = { attribute: 'l', kind: 'lookup', by: 'value', options: [] }
    const rows = Array.from({ length: 53 }, (_, i) => ({ grupo: `id${i}`, 'grupo@OData.Community.Display.V1.FormattedValue': `Nome ${i}`, total: 100 - i }))
    const buckets = bucketsFromRows(rows, spec)
    expect(buckets.length).toBe(51)
    expect(buckets[0]).toMatchObject({ id: 'id0', label: 'Nome 0', count: 100 })
    const others = buckets[50]
    expect(others).toMatchObject({ id: OTHERS_GROUP_ID, label: 'Outros (3)', count: 50 + 49 + 48 })
    expect(others.exclude?.length).toBe(50)
  })
})
