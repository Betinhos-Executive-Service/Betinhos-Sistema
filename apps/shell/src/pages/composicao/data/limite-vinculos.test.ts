// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countLinkEntities, dedupeLinks, expandLinkAliases, LINK_LIMIT_MESSAGE, MAX_LINK_ENTITIES } from '../../../app/fetchLinks'
import { buildNativeCompositionQuery, withRowLinks } from './composition-query'
import { countCompositions, loadCompositions } from './dataverse'
import type { CatalogField, ViewDefinition } from './views'

/** Contrato: nada que a Composição envia ao Dataverse passa de 15 `link-entity`, em leitura e contagem. */
afterEach(() => vi.unstubAllGlobals())

const TABLE = 'cr40f_composicaodeprecos'
const catalog: CatalogField[] = [
  { id: 'client', label: 'Cliente', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', path: ['cr40f_reservadeveculos', 'cr40f_clientes1'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }, { from: 'cr40f_clientes1id', to: 'cr40f_cliente' }], type: 'String', available: true },
  { id: 'route', label: 'Rota', table: 'cr40f_reservadeveculos', attribute: 'cr40f_trajeto', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'String', available: true },
  { id: 'new_valorlocacao', label: 'Locação', table: TABLE, attribute: 'new_valorlocacao', path: [], type: 'Money', available: true },
]
const definition: ViewDefinition = { columns: [{ id: 'client', width: 128, pinned: false }, { id: 'route', width: 128, pinned: false }], filters: [{ id: 'new_valorlocacao', operator: 'ge', value: '100' }], sort: [] }
const reserva = (alias: string, inner = '') => `<link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="${alias}" link-type="outer"><attribute name="cr40f_trajeto"/>${inner}</link-entity>`
const cliente = (alias: string) => `<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" alias="${alias}" link-type="outer"><attribute name="cr40f_nomedocliente"/></link-entity>`
const distinct = (count: number, type: string) => Array.from({ length: count }, (_, index) => `<link-entity name="tab${index}" from="tab${index}id" to="l${index}" alias="d${index}" link-type="${type}"><attribute name="col${index}"/></link-entity>`).join('')
const view = (body: string) => `<fetch><entity name="${TABLE}"><attribute name="new_status"/>${body}</entity></fetch>`

function stub(rows: Record<string, unknown>[] = [{ cr40f_composicaodeprecosid: '11111111-2222-4333-8444-555555555555' }]) {
  const retrieveMultipleRecords = vi.fn((entity: string) => Promise.resolve({ entities: entity === TABLE ? rows : [] }))
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })
  return retrieveMultipleRecords
}
const sentFetches = (calls: unknown[][]) => calls.filter(([entity, query]) => entity === TABLE && typeof query === 'string' && query.startsWith('?fetchXml=')).map(([, query]) => decodeURIComponent((query as string).slice('?fetchXml='.length)))

describe('limite de 15 vínculos na Composição', () => {
  it('view nativa J&J (7 filtros em vínculos repetidos) + colunas da grade + busca + vínculos da linha: cabe em 15 e as linhas mantêm os aliases', async () => {
    const native = view(`<filter>${Array.from({ length: 7 }, (_, index) => `<condition attribute="cr40f_trajeto" operator="like" value="%GRU%" entityname="a${index}"/>`).join('')}</filter>${Array.from({ length: 7 }, (_, index) => reserva(`a${index}`, cliente(`c${index}`))).join('')}`)
    const query = buildNativeCompositionQuery(native, definition, catalog, 'Ana')
    expect(countLinkEntities(withRowLinks(query))).toBeGreaterThan(MAX_LINK_ENTITIES)

    const api = stub([{ cr40f_composicaodeprecosid: '11111111-2222-4333-8444-555555555555', 'a0.cr40f_trajeto': 'GRU', 'cmp_cli.cr40f_nomedocliente': 'J&J' }])
    const page = await loadCompositions(undefined, { fetchXml: query })
    await countCompositions({ fetchXml: query })

    const fetches = sentFetches(api.mock.calls)
    expect(fetches).toHaveLength(2)
    for (const fetchXml of fetches) expect(countLinkEntities(fetchXml)).toBeLessThanOrEqual(MAX_LINK_ENTITIES)
    expect(page.rowLinks).toBe(true)
    expect(page.aviso).toBeUndefined()
    expect(page.records[0].viewFields).toMatchObject({ 'a0.cr40f_trajeto': 'GRU', 'a6.cr40f_trajeto': 'GRU' })
  })

  it('o vínculo da linha cai na leitura em lotes quando é o que falta para caber', async () => {
    const api = stub([{ cr40f_composicaodeprecosid: '11111111-2222-4333-8444-555555555555', _cr40f_servicorelacionadogeral_value: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }])
    const page = await loadCompositions(undefined, { fetchXml: view(distinct(15, 'outer')) })
    const [fetchXml] = sentFetches(api.mock.calls)
    expect(countLinkEntities(fetchXml)).toBe(15)
    expect(fetchXml).not.toContain('cmp_res')
    expect(page.rowLinks).toBe(false)
    expect(page.aviso).toBeUndefined()
    expect(api.mock.calls.map(([entity]) => entity)).toContain('cr40f_reservadeveculos')
  })

  it('sem o vínculo da linha ainda passa: tira vínculo outer de exibição e avisa as colunas vazias (leitura e contagem)', async () => {
    const api = stub()
    const xml = view(distinct(16, 'outer'))
    const page = await loadCompositions(undefined, { fetchXml: xml })
    await countCompositions({ fetchXml: xml })
    const fetches = sentFetches(api.mock.calls)
    expect(fetches).toHaveLength(2)
    for (const fetchXml of fetches) expect(countLinkEntities(fetchXml)).toBeLessThanOrEqual(MAX_LINK_ENTITIES)
    expect(page.aviso).toMatch(/col15/)
  })

  it('view que não cabe de jeito nenhum: erro em português, nada é enviado e a contagem vira null', async () => {
    const api = stub()
    const xml = view(distinct(16, 'inner'))
    await expect(loadCompositions(undefined, { fetchXml: xml })).rejects.toThrow(LINK_LIMIT_MESSAGE)
    expect(await countCompositions({ fetchXml: xml })).toBeNull()
    expect(sentFetches(api.mock.calls)).toEqual([])
  })

  it('até 15 vínculos segue como antes (nada é fundido nem tirado)', async () => {
    const api = stub()
    const page = await loadCompositions(undefined, { fetchXml: view(reserva('x') + reserva('y')) })
    const [fetchXml] = sentFetches(api.mock.calls)
    expect(fetchXml).toContain('alias="x"')
    expect(fetchXml).toContain('alias="y"')
    expect(page.rowLinks).toBe(true)
  })

  it('a view nativa com a reserva e o cliente repetidos funde para dois vínculos e devolve cada alias à linha', () => {
    const native = view(`<filter><condition attribute="cr40f_trajeto" operator="like" value="%GRU%" entityname="a_67d5"/></filter>${reserva('a_67d5')}`)
    const full = withRowLinks(buildNativeCompositionQuery(native, definition, catalog, ''))
    const before = new DOMParser().parseFromString(full, 'application/xml').querySelectorAll('link-entity').length
    const { fetchXml, aliases } = dedupeLinks(full)
    const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
    expect(before).toBe(5)
    expect([...document.querySelectorAll('link-entity')].map((item) => item.getAttribute('alias'))).toEqual(['a_67d5', 'r2'])
    expect(aliases).toEqual([['r1', 'a_67d5'], ['cmp_res', 'a_67d5'], ['cmp_cli', 'r2']])
    expect(document.querySelector('condition')?.getAttribute('entityname')).toBe('a_67d5')
    const row = expandLinkAliases({ 'a_67d5.cr40f_trajeto': 'GRU', 'r2.cr40f_nomedocliente': 'J&J' }, aliases)
    expect(row).toMatchObject({ 'r1.cr40f_trajeto': 'GRU', 'cmp_res.cr40f_trajeto': 'GRU', 'cmp_cli.cr40f_nomedocliente': 'J&J' })
  })
})
