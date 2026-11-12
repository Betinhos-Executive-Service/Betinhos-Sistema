// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { loadCompositionById, loadCompositions } from './dataverse'

afterEach(() => vi.unstubAllGlobals())

const compositionId = '11111111-2222-4333-8444-555555555555'
const reservationId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const F = '@OData.Community.Display.V1.FormattedValue'
const linkedRow = {
  cr40f_composicaodeprecosid: compositionId,
  _cr40f_servicorelacionadogeral_value: reservationId,
  'cmp_res.cr40f_trajeto': 'Aeroporto',
  'cmp_res.cr40f_cliente': 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  [`cmp_res.cr40f_cliente${F}`]: 'Rótulo do cliente',
  [`cmp_res.cr40f_status${F}`]: 'Confirmada',
  [`cmp_res.cr40f_tipodoservico${F}`]: 'Transfer',
  [`cmp_res.cr40f_tipodeveiculo${F}`]: 'Sedan',
  [`cmp_res.cr40f_passageiro1${F}`]: 'Ana',
  [`cmp_res.cr40f_passageiro2${F}`]: 'Bia',
  'cmp_cli.cr40f_nomedocliente': 'Cliente Teste',
  'cmp_cli.cr40f_registro': '123',
  'cmp_cli.cr40f_endereco': 'Rua A',
}

it('lê reserva e cliente na própria consulta, em uma chamada por página', async () => {
  const retrieveMultipleRecords = vi.fn((entity: string) => {
    if (entity === 'cr40f_composicaodeprecos') return Promise.resolve({ entities: [linkedRow] })
    return Promise.resolve({ entities: [] })
  })
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })

  const page = await loadCompositions(undefined, { fetchXml: '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/></entity></fetch>' })

  expect(retrieveMultipleRecords.mock.calls.filter(([entity]) => entity === 'cr40f_composicaodeprecos')).toHaveLength(1)
  expect(retrieveMultipleRecords.mock.calls.map(([entity]) => entity).filter((entity) => ['cr40f_reservadeveculos', 'cr40f_clientes1'].includes(entity))).toEqual([])
  expect(page.rowLinks).toBe(true)
  expect(page.records[0]).toMatchObject({ client: 'Cliente Teste', clientId: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', clientRegistration: '123', clientAddress: 'Rua A', route: 'Aeroporto', serviceStatus: 'Confirmada', serviceType: 'Transfer', vehicleType: 'Sedan', passengers: ['Ana', 'Bia'] })
})

it('a consulta padrão (sem view) também leva os vínculos', async () => {
  const retrieveMultipleRecords = vi.fn(() => Promise.resolve({ entities: [] }))
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })

  await loadCompositions()

  const query = decodeURIComponent((retrieveMultipleRecords.mock.calls as unknown[][]).find(([entity]) => entity === 'cr40f_composicaodeprecos')![1] as string)
  expect(query).toContain('alias="cmp_res"')
  expect(query).toContain('attribute="statecode"')
  expect(query).toContain('count="100"')
  expect(query).toContain('attribute="modifiedon" descending="true"')
})

it.each([
  ['código 0x80040220', { errorCode: -2147220960, message: 'sem privilégio' }],
  ['status HTTP 403', { status: 403, message: 'Forbidden' }],
])('sem privilégio na reserva ou no cliente (%s), repete sem os vínculos e lê reservas como antes', async (_name, failure) => {
  const queries: string[] = []
  const retrieveMultipleRecords = vi.fn((entity: string, query: string) => {
    if (entity === 'cr40f_composicaodeprecos') {
      queries.push(decodeURIComponent(query))
      if (query.includes(encodeURIComponent('cmp_res'))) return Promise.reject(failure)
      return Promise.resolve({ entities: [{ cr40f_composicaodeprecosid: compositionId, _cr40f_servicorelacionadogeral_value: reservationId }] })
    }
    if (entity === 'cr40f_reservadeveculos') return Promise.resolve({ entities: [{ cr40f_reservadeveculosid: reservationId, cr40f_trajeto: 'Aeroporto' }] })
    return Promise.resolve({ entities: [] })
  })
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })

  const page = await loadCompositions(undefined, { fetchXml: '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/></entity></fetch>' })

  expect(queries).toHaveLength(2)
  expect(queries[1]).not.toContain('cmp_')
  expect(page.rowLinks).toBe(false)
  expect(page.records[0].route).toBe('Aeroporto')
  expect(page.records[0].client).toBe('Cliente sem nome')
})

it('outro erro da consulta não vira repetição sem vínculos', async () => {
  const retrieveMultipleRecords = vi.fn(() => Promise.reject(new Error('timeout')))
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })

  await expect(loadCompositions()).rejects.toThrow('timeout')
  expect(retrieveMultipleRecords).toHaveBeenCalledTimes(1)
})

it('view sem FetchXML relê as linhas por FetchXML com os vínculos', async () => {
  const retrieveMultipleRecords = vi.fn((entity: string, query: string) => {
    if (entity !== 'cr40f_composicaodeprecos') return Promise.resolve({ entities: [] })
    if (query.startsWith('?userQuery=')) return Promise.resolve({ entities: [{ cr40f_composicaodeprecosid: compositionId }] })
    return Promise.resolve({ entities: [linkedRow] })
  })
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })

  const page = await loadCompositions(undefined, { kind: 'personal', id: 'u1' } as never)

  const reread = decodeURIComponent(String((retrieveMultipleRecords.mock.calls as unknown[][])[1][1]))
  expect(reread).toContain('alias="cmp_res"')
  expect(reread).toContain(compositionId)
  expect(page.records[0].client).toBe('Cliente Teste')
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

const formulaRow = { _new_composicao_value: compositionId, new_campodestino: 'new_ajuste', new_expressao: '=1+1', versionnumber: '7' }

function formulaXrm(formulaCall: () => Promise<{ entities: unknown[] }>) {
  const retrieveMultipleRecords = vi.fn((entity: string) => {
    if (entity === 'cr40f_composicaodeprecos') return Promise.resolve({ entities: [linkedRow] })
    if (entity === 'new_formuladecelulacomposicao') return formulaCall()
    return Promise.resolve({ entities: [] })
  })
  vi.stubGlobal('window', { Xrm: { WebApi: { retrieveMultipleRecords } } })
}

it('a página resolve antes das fórmulas; elas chegam à parte', async () => {
  let release!: (value: { entities: unknown[] }) => void
  formulaXrm(() => new Promise((resolve) => { release = resolve }))

  const page = await loadCompositions(undefined, { fetchXml: '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/></entity></fetch>' })

  expect(page.records[0].formulas).toEqual({})
  release({ entities: [formulaRow] })
  const map = await page.formulas
  expect(map.get(compositionId)).toMatchObject({ new_ajuste: { expression: '=1+1', rowVersion: '7' } })
})

it('falha ao ler fórmulas não derruba a página e rejeita só para quem aguarda', async () => {
  const unhandled = vi.fn()
  process.on('unhandledRejection', unhandled)
  formulaXrm(() => Promise.reject(new Error('sem acesso')))

  const page = await loadCompositions(undefined, { fetchXml: '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/></entity></fetch>' })
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(page.records).toHaveLength(1)
  expect(unhandled).not.toHaveBeenCalled()
  await expect(page.formulas).rejects.toThrow('sem acesso')
  process.off('unhandledRejection', unhandled)
})

it('no mock as fórmulas já vêm resolvidas', async () => {
  vi.stubGlobal('window', {})
  const page = await loadCompositions()
  expect(page.source).toBe('mock')
  expect((await page.formulas).size).toBe(0)
})

it('recarregar por ID espera as fórmulas e as devolve na linha', async () => {
  formulaXrm(() => Promise.resolve({ entities: [formulaRow] }))
  const row = await loadCompositionById(compositionId)
  expect(row?.formulas).toMatchObject({ new_ajuste: { expression: '=1+1' } })
})
