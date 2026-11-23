// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { countLinkEntities, LINK_LIMIT_MESSAGE, MAX_LINK_ENTITIES } from '../../../app/fetchLinks'
import { addExtraLinks } from '../domain/extraLinks'
import { createSource } from './source'

/** Contrato: nada que a Geral envia ao Dataverse passa de 15 `link-entity`, em leitura, contagem e agrupamento. */
const ENTITY = 'cr40f_reservadeveculos'
const link = (alias: string, table: string, type: string, inner = '') => `<link-entity name="${table}" from="${table}id" to="l_${alias}" alias="${alias}" link-type="${type}">${inner}</link-entity>`
const view = (body: string) => `<fetch version="1.0" mapping="logical"><entity name="${ENTITY}"><attribute name="cr40f_id"/><order attribute="cr40f_id"/><filter type="and"><condition attribute="statecode" operator="eq" value="0"/></filter>${body}</entity></fetch>`
const distinct = (count: number, type: string, prefix: string) => Array.from({ length: count }, (_, index) => link(`${prefix}${index}`, `${prefix}tab${index}`, type, `<attribute name="${prefix}col${index}"/>`)).join('')

function fakeHost(value: Record<string, unknown>[] = []) {
  const request = vi.fn(async (_path: string, _init?: RequestInit) => ({ value }))
  const host = {
    mode: 'dataverse', clientUrl: 'https://org.crm.dynamics.com', insideModelDriven: false, appId: async () => undefined,
    client: { request, update: vi.fn(), getAll: vi.fn(async () => []), create: vi.fn(), remove: vi.fn() },
    metadata: {
      entities: async () => new Map([[ENTITY, { entitySetName: 'cr40f_reservadeveculoses' }]]),
      entity: async (name: string) => ({ logicalName: name, entitySetName: `${name}s`, primaryName: 'cr40f_nome', objectTypeCode: null }),
      attributes: async () => [{ logicalName: 'cr40f_status', type: 'Picklist', label: 'Status', updatable: true, targets: [] }],
      choices: async () => [{ value: 1, label: 'Confirmado' }],
      picklists: async () => new Map([['cr40f_status', [{ value: 1, label: 'Confirmado' }]]]),
    },
  } as unknown as Host
  return { host, request }
}

const sent = (request: ReturnType<typeof fakeHost>['request']) => request.mock.calls.map(([path]) => decodeURIComponent(path.slice(path.indexOf('fetchXml=') + 'fetchXml='.length)))
const group = { attribute: 'cr40f_status', kind: 'choice', by: 'month', options: [] } as never

describe('limite de 15 vínculos na Geral', () => {
  it('visão com colunas de várias tabelas + busca por palavra: o que vai ao Dataverse cabe em 15 e avisa as colunas vazias', async () => {
    const xml = view(distinct(13, 'outer', 'c'))
    expect(countLinkEntities(xml)).toBe(13)
    const { host, request } = fakeHost([{ cr40f_id: 'OS-1' }])
    const source = createSource(host)
    const page = await source.page({ fetchxml: xml, page: 1, cookie: null, sort: null, query: 'Ana' })
    await source.count({ fetchxml: xml, query: 'Ana' })
    await source.groups({ fetchxml: xml, query: 'Ana', spec: group })
    const requests = sent(request)
    expect(requests).toHaveLength(3)
    for (const fetchXml of requests) expect(countLinkEntities(fetchXml)).toBeLessThanOrEqual(MAX_LINK_ENTITIES)
    expect(countLinkEntities(requests[0])).toBe(MAX_LINK_ENTITIES)
    expect(page.aviso).toMatch(/ficaram vazias/)
    expect(requests[0]).toContain('busca_cr40f_cliente')
  })

  it('colunas extras de outras tabelas somadas à visão e à busca também cabem', async () => {
    const extra = (nav: string, target: string) => ({ links: [{ nav, target, targetId: `${target}id`, attribute: `l_${nav}` }], attr: { name: `${nav}_nome` } }) as never
    const base = addExtraLinks(view(distinct(8, 'outer', 'c')), Array.from({ length: 6 }, (_, index) => extra(`n${index}`, `ext${index}`)))
    const { host, request } = fakeHost()
    await createSource(host).page({ fetchxml: base, page: 2, cookie: null, sort: null, query: 'Ana' })
    expect(countLinkEntities(base)).toBe(14)
    for (const fetchXml of sent(request)) expect(countLinkEntities(fetchXml)).toBeLessThanOrEqual(MAX_LINK_ENTITIES)
  })

  it('vínculos repetidos da visão são fundidos e as linhas voltam com os aliases originais', async () => {
    const repetido = (alias: string) => `<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" alias="${alias}" link-type="outer"><attribute name="cr40f_nomedocliente"/></link-entity>`
    const xml = view(Array.from({ length: 16 }, (_, index) => repetido(`k${index}`)).join(''))
    const { host, request } = fakeHost([{ cr40f_id: 'OS-1', 'k0.cr40f_nomedocliente': 'J&J' }])
    const page = await createSource(host).page({ fetchxml: xml, page: 1, cookie: null, sort: null, query: '' })
    expect(countLinkEntities(sent(request)[0])).toBe(1)
    expect(page.rows[0]['k15.cr40f_nomedocliente']).toBe('J&J')
    expect(page.aviso).toBeUndefined()
  })

  it('visão que não cabe de jeito nenhum: erro em português, nada é enviado e a contagem vira null', async () => {
    const xml = view(distinct(16, 'inner', 'i'))
    const { host, request } = fakeHost()
    const source = createSource(host)
    await expect(source.page({ fetchxml: xml, page: 1, cookie: null, sort: null, query: '' })).rejects.toThrow(LINK_LIMIT_MESSAGE)
    await expect(source.groups({ fetchxml: xml, query: '', spec: group })).rejects.toThrow(LINK_LIMIT_MESSAGE)
    expect(await source.count({ fetchxml: xml, query: '' })).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('até 15 vínculos segue como antes, sem aviso', async () => {
    const { host, request } = fakeHost([{ cr40f_id: 'OS-1' }])
    const page = await createSource(host).page({ fetchxml: view(distinct(15, 'outer', 'c')), page: 1, cookie: null, sort: null, query: '' })
    expect(countLinkEntities(sent(request)[0])).toBe(15)
    expect(page.aviso).toBeUndefined()
  })
})
