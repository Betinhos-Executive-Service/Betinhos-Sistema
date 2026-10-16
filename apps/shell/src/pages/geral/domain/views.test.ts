// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { emptyFilters } from '@betinhos/ui'
import { MOCK_ATTRIBUTES, createMockViews } from '../data/mock'
import { geralFilterFields } from './tableFilters'
import { parseLayout } from './layout'
import { parse } from './fetch'
import { buildLayout, buildViewFetch } from './views'

const agenda = createMockViews()[0]
const fields = geralFilterFields(MOCK_ATTRIBUTES)

describe('buildViewFetch', () => {
  it('injeta os filtros e troca a ordenação, sem paginação nem contagem', () => {
    const xml = buildViewFetch(
      agenda.fetchxml.replace('<fetch ', '<fetch count="100" page="2" paging-cookie="x" returntotalrecordcount="true" '),
      { ...emptyFilters(), quick: { cr40f_status: { type: 'condition', id: 'a', field: 'cr40f_status', op: 'in', values: [{ value: '1', label: 'x' }] } } },
      { attribute: 'cr40f_trajeto', alias: null, descending: true },
      fields,
    )
    const { root, entity } = parse(xml)
    for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount']) expect(root.hasAttribute(name)).toBe(false)
    const orders = Array.from(entity.children).filter((c) => c.tagName === 'order')
    expect(orders.map((o) => [o.getAttribute('attribute'), o.getAttribute('descending')])).toEqual([['cr40f_trajeto', 'true']])
    expect(xml).toContain('attribute="cr40f_status"')
    expect(xml).toContain('operator="in"')
  })

  it('sem ordenação própria mantém a ordem da visão; sem filtros devolve a visão', () => {
    const xml = buildViewFetch(agenda.fetchxml, emptyFilters(), null, fields)
    expect(parse(xml).entity.querySelector('order')?.getAttribute('attribute')).toBe('cr40f_dataehorriodesada')
    expect(parse(xml).entity.querySelectorAll('filter')).toHaveLength(1)
  })
})

describe('buildLayout', () => {
  const columns = parseLayout(agenda.layoutxml).slice(0, 3)

  it('gera o grid com object, linha e uma célula por coluna visível, na ordem', () => {
    expect(buildLayout(columns, undefined, 10580)).toBe(
      `<grid name="resultset" object="10580" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="cr40f_reservadeveculosid">${columns.map((c) => `<cell name="${c.key}" width="${c.width}" />`).join('')}</row></grid>`,
    )
  })

  it('larguras personalizadas valem; sem object a metadata não é inventada; round-trip no parseLayout', () => {
    const xml = buildLayout([columns[2], columns[0]], { [columns[0].key]: 333.4 }, null)
    expect(xml).not.toContain('object=')
    expect(parseLayout(xml).map((c) => [c.key, c.width])).toEqual([[columns[2].key, columns[2].width], [columns[0].key, 333]])
  })

  it('escapa o nome da célula', () => {
    expect(buildLayout([{ key: 'a"b', attribute: 'a"b', alias: null, entity: null, width: 100 }], undefined, 1)).toContain('name="a&quot;b"')
  })
})
