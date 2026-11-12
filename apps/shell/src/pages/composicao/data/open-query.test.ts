// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { openQueryFromViewRow, pickOpenView } from './open-query'

const fetchxml = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_1"><attribute name="cr40f_trajeto"/></link-entity></entity></fetch>'
const layoutxml = '<grid><row><cell name="new_status" width="120"/><cell name="a_1.cr40f_trajeto" width="200"/></row></grid>'

describe('openQueryFromViewRow', () => {
  it('usa o FetchXML da view e lê colunas vinculadas pelo alias da view', () => {
    const q = openQueryFromViewRow({ fetchxml, layoutxml })!
    expect(q.fetchXml).toBe(fetchxml)
    expect(q.columns.map((c) => c.valueKey)).toEqual(['new_status', 'a_1.cr40f_trajeto'])
    expect(q.columns[1].width).toBe(200)
  })
  it('view sem FetchXML devolve null (cai na consulta padrão)', () => {
    expect(openQueryFromViewRow({ fetchxml: '', layoutxml })).toBeNull()
  })
})

describe('pickOpenView', () => {
  const rows = { personal: [{ userqueryid: 'p1', name: 'Minha' }], publicViews: [{ savedqueryid: 's1', name: 'Ativas', isdefault: true }], pins: [] }
  it('prefere a última usada', () => expect(pickOpenView(rows, 'p1')?.id).toBe('p1'))
  it('sem última, usa a padrão', () => expect(pickOpenView(rows, null)?.id).toBe('s1'))
  it('última que sumiu cai na padrão', () => expect(pickOpenView(rows, 'x')?.id).toBe('s1'))
  it('sem padrão nem última devolve null', () => expect(pickOpenView({ ...rows, publicViews: [{ savedqueryid: 's1' }] }, null)).toBeNull())
})
