// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { columnAliases, pruneOwnLinks } from './fetch-links'

const entityOf = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml').querySelector('fetch > entity')!
const aliases = (entity: Element) => [...entity.querySelectorAll('link-entity')].map((link) => link.getAttribute('alias'))

describe('pruneOwnLinks', () => {
  const xml = '<fetch><entity name="cr40f_composicaodeprecos">'
    + '<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" alias="a_1" link-type="outer" />'
    + '<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" alias="r1" link-type="outer"><attribute name="cr40f_nomedocliente" /></link-entity>'
    + '<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" alias="ui_r2" link-type="outer" />'
    + '<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" alias="r3" link-type="inner" />'
    + '</entity></fetch>'

  it('tira só os vínculos da tela externos e sem uso; os da visão original e os internos ficam', () => {
    const entity = entityOf(xml)
    pruneOwnLinks(entity)
    expect(aliases(entity)).toEqual(['a_1', 'r3'])
  })

  it('vínculo citado por coluna sem campo no catálogo (r1.atributo) fica', () => {
    const entity = entityOf(xml)
    pruneOwnLinks(entity, columnAliases([{ id: 'r1.cr40f_nomedocliente' }, { id: 'new_valortotal' }]))
    expect(aliases(entity)).toEqual(['a_1', 'r1', 'r3'])
  })
})
