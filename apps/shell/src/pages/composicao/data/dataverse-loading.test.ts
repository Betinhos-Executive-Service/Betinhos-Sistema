// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { loadCompositions } from './dataverse'

afterEach(() => vi.unstubAllGlobals())

it('busca fórmulas e reservas em paralelo durante o carregamento', async () => {
  const compositionId = '11111111-2222-4333-8444-555555555555'
  const reservationId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  let finishFormulas!: (value: { entities: unknown[] }) => void
  const formulas = new Promise<{ entities: unknown[] }>((resolve) => { finishFormulas = resolve })
  const retrieveMultipleRecords = vi.fn((entity: string) => {
    if (entity === 'cr40f_composicaodeprecos') return Promise.resolve({ entities: [{ cr40f_composicaodeprecosid: compositionId, _cr40f_servicorelacionadogeral_value: reservationId }] })
    if (entity === 'new_formuladecelulacomposicao') return formulas
    return Promise.resolve({ entities: [{ cr40f_reservadeveculosid: reservationId, cr40f_trajeto: 'Aeroporto' }] })
  })
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })

  const loading = loadCompositions()
  await vi.waitFor(() => expect(retrieveMultipleRecords.mock.calls.some(([entity]) => entity === 'cr40f_reservadeveculos')).toBe(true))
  finishFormulas({ entities: [] })

  expect((await loading).records[0].route).toBe('Aeroporto')
})

it('pagina views com ordem na link-entity, em que o Dataverse devolve sempre pagenumber 2 sem cookie', async () => {
  const pageOf = (query: string) => new DOMParser().parseFromString(decodeURIComponent(query.slice('?fetchXml='.length)), 'application/xml').querySelector('fetch')!.getAttribute('page') ?? '1'
  const retrieveMultipleRecords = vi.fn((entity: string, query: string) => {
    if (entity !== 'cr40f_composicaodeprecos') return Promise.resolve({ entities: [] })
    const page = Number(pageOf(query))
    const entities = Array.from({ length: 100 }, (_, index) => ({ cr40f_composicaodeprecosid: `${page}-${index}` }))
    return Promise.resolve({ entities, fetchXmlPagingCookie: '<cookie pagenumber="2" pagingcookie="" istracking="False" />' })
  })
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })
  const fetchXml = '<fetch distinct="true"><entity name="cr40f_composicaodeprecos"><attribute name="cr40f_composicaodeprecosid"/><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a"><order attribute="cr40f_dataehorriodesada" descending="true"/></link-entity></entity></fetch>'

  const pages: string[] = []
  let link: string | null = null
  for (let index = 0; index < 3; index++) {
    const result = await loadCompositions(link ?? undefined, { fetchXml })
    link = result.nextLink
    pages.push(pageOf(link!))
  }
  expect(pages).toEqual(['2', '3', '4'])
})
