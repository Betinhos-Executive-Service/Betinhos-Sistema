// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { countLinkEntities, dedupeLinks, expandLinkAliases, FetchLinkLimitError, LINK_LIMIT_MESSAGE, MAX_LINK_ENTITIES, prepareFetchXml, removedLinksNotice } from './fetchLinks'

const link = (alias: string, table = `t_${alias}`, type = 'outer', inner = '') => `<link-entity name="${table}" from="${table}id" to="l_${alias}" alias="${alias}" link-type="${type}">${inner}</link-entity>`
const fetch = (body: string) => `<fetch><entity name="raiz"><attribute name="a"/>${body}</entity></fetch>`
const aliasesOf = (xml: string) => [...new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('link-entity')].map((node) => node.getAttribute('alias'))
const many = (count: number, type = 'outer', prefix = 'x') => Array.from({ length: count }, (_, index) => link(`${prefix}${index}`, undefined, type, `<attribute name="col_${prefix}${index}"/>`)).join('')

describe('countLinkEntities', () => {
  it('conta vínculos aninhados e os any/not any', () => {
    const xml = fetch(link('a', 't1', 'inner', link('b', 't2', 'outer', link('c', 't3'))) + link('d', 't4', 'any') + link('e', 't5', 'not any'))
    expect(countLinkEntities(xml)).toBe(5)
  })
  it('texto que não é XML conta 0', () => expect(countLinkEntities('<fetch')).toBe(0))
})

describe('dedupeLinks', () => {
  const same = (alias: string, type = 'outer', inner = '') => `<link-entity name="reserva" from="reservaid" to="servico" alias="${alias}" link-type="${type}">${inner}</link-entity>`

  it('funde a mesma tabela repetida, religa condições (entityname) e devolve [removido, mantido]', () => {
    const xml = fetch(`<filter><condition attribute="trajeto" operator="like" value="%GRU%" entityname="b"/></filter>${same('a', 'outer', '<attribute name="trajeto"/>')}${same('b', 'outer', '<attribute name="trajeto"/><attribute name="destino"/>')}${same('c')}`)
    const { fetchXml, aliases } = dedupeLinks(xml)
    const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
    expect(aliasesOf(fetchXml)).toEqual(['a'])
    expect(aliases).toEqual([['b', 'a'], ['c', 'a']])
    expect(document.querySelector('condition')?.getAttribute('entityname')).toBe('a')
    expect([...document.querySelectorAll('link-entity > attribute')].map((node) => node.getAttribute('name'))).toEqual(['trajeto', 'destino'])
  })

  it('funde também os vínculos aninhados dos fundidos', () => {
    const cliente = (alias: string) => `<link-entity name="cliente" from="clienteid" to="cliente" alias="${alias}" link-type="outer"><attribute name="nome"/></link-entity>`
    const { fetchXml, aliases } = dedupeLinks(fetch(same('a', 'outer', cliente('ca')) + same('b', 'outer', cliente('cb'))))
    expect(aliasesOf(fetchXml)).toEqual(['a', 'ca'])
    expect(aliases).toEqual([['b', 'a'], ['cb', 'ca']])
  })

  it('não funde vínculo com filtro próprio nem o inner que se repete; o outer sem filtro entra no inner', () => {
    const filtered = same('k', 'outer', '<filter><condition attribute="s" operator="eq" value="1"/></filter>')
    expect(dedupeLinks(fetch(filtered + same('o'))).aliases).toEqual([])
    expect(dedupeLinks(fetch(same('i1', 'inner') + same('i2', 'inner'))).aliases).toEqual([])
    expect(dedupeLinks(fetch(same('i', 'inner') + same('o'))).aliases).toEqual([['o', 'i']])
  })
})

describe('expandLinkAliases', () => {
  it('devolve à linha as colunas com o alias original, inclusive o valor formatado', () => {
    const row = expandLinkAliases({ 'a.trajeto': 'GRU', 'a.trajeto@OData.Community.Display.V1.FormattedValue': 'Guarulhos', outra: 1 }, [['b', 'a']])
    expect(row).toMatchObject({ 'a.trajeto': 'GRU', 'b.trajeto': 'GRU', 'b.trajeto@OData.Community.Display.V1.FormattedValue': 'Guarulhos', outra: 1 })
  })
  it('sem aliases devolve a mesma linha', () => {
    const row = { 'a.x': 1 }
    expect(expandLinkAliases(row, [])).toBe(row)
  })
})

describe('prepareFetchXml', () => {
  it('até 15 vínculos devolve o texto como veio', () => {
    const xml = fetch(many(MAX_LINK_ENTITIES))
    expect(prepareFetchXml(xml)).toEqual({ fetchXml: xml, aliases: [], degraded: { rowLinks: false, removed: [] } })
  })

  it('acima de 15, junta os repetidos e guarda os aliases para as linhas', () => {
    const repetido = (alias: string) => `<link-entity name="reserva" from="reservaid" to="servico" alias="${alias}" link-type="outer"><attribute name="trajeto"/></link-entity>`
    const xml = fetch(Array.from({ length: 16 }, (_, index) => repetido(`r${index}`)).join(''))
    const prepared = prepareFetchXml(xml)
    expect(countLinkEntities(prepared.fetchXml)).toBe(1)
    expect(prepared.aliases).toHaveLength(15)
    expect(prepared.degraded).toEqual({ rowLinks: false, removed: [] })
    expect(expandLinkAliases<Record<string, unknown>>({ 'r0.trajeto': 'GRU' }, prepared.aliases)['r15.trajeto']).toBe('GRU')
  })

  it('tira os vínculos da linha antes de mexer em colunas', () => {
    const xml = fetch(many(15, 'outer', 'v') + link('cmp_res', 'reserva', 'outer', link('cmp_cli', 'cliente')))
    const prepared = prepareFetchXml(xml, { dropRowLinks: (text) => text.replace(/<link-entity[^>]*alias="cmp_res".*<\/link-entity>/, '') })
    expect(prepared.degraded).toEqual({ rowLinks: true, removed: [] })
    expect(countLinkEntities(prepared.fetchXml)).toBe(15)
  })

  it('sem dropRowLinks ou com ele insuficiente, tira vínculo outer sem filtro que só serve coluna e informa quais', () => {
    const xml = fetch(many(14, 'outer', 'v') + link('extra1', 'pessoa', 'outer', '<attribute name="nome" alias="pessoa_nome"/>') + link('extra2', 'carro', 'outer', '<attribute name="placa"/>'))
    const prepared = prepareFetchXml(xml)
    expect(countLinkEntities(prepared.fetchXml)).toBe(15)
    expect(prepared.degraded.removed).toEqual([{ alias: 'extra2', table: 'carro', columns: ['placa'] }])
    expect(aliasesOf(prepared.fetchXml)).not.toContain('extra2')
    expect(removedLinksNotice(prepared.degraded.removed)).toContain('placa')
  })

  it('nunca tira inner, any/not any, com filtro ou citado por condição ou ordem; sem saída, lança erro amigável', () => {
    const filtro = link('f', 'tf', 'outer', '<filter><condition attribute="x" operator="eq" value="1"/></filter>')
    const base = [many(3, 'inner', 'i'), many(2, 'any', 'a'), many(2, 'not any', 'n'), filtro, link('citado', 'tc', 'outer', '<attribute name="c"/>'), link('ordenado', 'to', 'outer', '<attribute name="o"/>'), many(6, 'inner', 'j')].join('')
    const xml = fetch(`<filter><condition attribute="c" operator="eq" value="1" entityname="citado"/></filter><order attribute="o" entityname="ordenado"/>${base}`)
    expect(countLinkEntities(xml)).toBe(16)
    let erro: unknown
    try { prepareFetchXml(xml) } catch (error) { erro = error }
    expect(erro).toBeInstanceOf(FetchLinkLimitError)
    expect((erro as Error).message).toBe(LINK_LIMIT_MESSAGE)
    expect((erro as Error).message).toMatch(/tabelas relacionadas demais/)
  })

  it('não tira vínculo outer que guarda um inner, uma ordem ou uma agregação por dentro', () => {
    const comInner = link('pai1', 'p1', 'outer', link('filho', 'f1', 'inner'))
    const comOrdem = link('pai2', 'p2', 'outer', '<order attribute="x"/>')
    const comAgregado = link('pai3', 'p3', 'outer', '<attribute name="x" aggregate="count" alias="n"/>')
    expect(() => prepareFetchXml(fetch(many(12, 'inner', 'i') + comInner + comOrdem + comAgregado))).toThrow(FetchLinkLimitError)
  })

  it('tira primeiro o vínculo aninhado quando os dois só servem coluna', () => {
    const xml = fetch(many(14, 'inner', 'i') + link('pai', 'p', 'outer', link('filho', 'f')))
    const prepared = prepareFetchXml(xml)
    expect(prepared.degraded.removed.map((item) => item.alias)).toEqual(['filho'])
    expect(countLinkEntities(prepared.fetchXml)).toBe(15)
  })
})
