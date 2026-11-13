// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'
import { catalogCacheKey } from './data/catalog-cache'
import type { CatalogField } from './data/views'
import type { Host } from '../../host'

const catalog = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('./data/views', async (original) => ({
  ...await original<typeof import('./data/views')>(),
  loadColumnCatalog: () => catalog.load(),
}))

const F = '@OData.Community.Display.V1.FormattedValue'
const CLIENT_URL = 'https://abertura.crm.example'
const host = { mode: 'dataverse', clientUrl: CLIENT_URL, metadata: { choices: async () => [] }, client: {}, insideModelDriven: false, appId: async () => undefined } as unknown as Host
const FETCH = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>'
const LAYOUT = '<grid name="resultset" object="1" jump="new_status" select="1" icon="1" preview="1"><row name="result" id="cr40f_composicaodeprecosid"><cell name="new_status" width="140"/></row></grid>'
const view = { savedqueryid: 'vvvvvvvv-0000-4000-8000-000000000001', name: 'Padrão', description: '', fetchxml: FETCH, layoutxml: LAYOUT, querytype: 0, isdefault: true }
const row = (id: string, extra: Record<string, unknown> = {}) => ({ cr40f_composicaodeprecosid: id, new_status: 1, [`new_status${F}`]: 'Aprovada', 'cmp_cli.cr40f_nomedocliente': `Cliente ${id.slice(0, 4)}`, versionnumber: 1, ...extra })
const field = (id: string, label: string): CatalogField => ({ id, label, table: 'cr40f_composicaodeprecos', attribute: id, path: [], type: 'String', available: true, writable: true })

type Handler = (entity: string, query: string, call: number) => unknown
function fakeXrm(handler: Handler = () => ({ entities: [] })) {
  const calls: { entity: string; query: string }[] = []
  const retrieveMultipleRecords = vi.fn((entity: string, query = '') => {
    calls.push({ entity, query })
    const answer = handler(entity, decodeURIComponent(query), calls.filter((item) => item.entity === entity).length)
    return answer instanceof Promise ? answer : Promise.resolve(answer)
  })
  const xrm = { WebApi: { retrieveMultipleRecords }, Utility: { getGlobalContext: () => ({ getClientUrl: () => CLIENT_URL }) } }
  window.Xrm = xrm as unknown as typeof window.Xrm
  return { calls, count: (entity: string) => calls.filter((item) => item.entity === entity).length }
}
const standard: Handler = (entity, query) => {
  if (entity === 'savedquery') return { entities: [view] }
  if (entity === 'cr40f_composicaodeprecos') return { entities: query.includes('aggregate') ? [{ total: 1 }] : [row('11111111-1111-4111-8111-111111111111')] }
  return { entities: [] }
}

beforeEach(() => { try { localStorage.clear() } catch { /* sem storage */ } })
afterEach(() => { cleanup(); catalog.load.mockReset(); delete (window as { Xrm?: unknown }).Xrm; vi.restoreAllMocks() })

it('abre mostrando a primeira página sem esperar a metadata e sem ler EntityDefinitions', async () => {
  catalog.load.mockReturnValue(new Promise(() => undefined))
  const xrm = fakeXrm(standard)

  render(<ComposicaoPage host={host} />)

  expect(await screen.findByText('Aprovada')).toBeTruthy()
  await waitFor(() => expect(xrm.count('cr40f_composicaodeprecos')).toBe(2))
  const data = xrm.calls.map((call) => call.entity).filter((entity) => entity !== 'new_formuladecelulacomposicao')
  expect(data.slice(0, 3).sort()).toEqual(['new_configuracaovisualizacaocomposicao', 'savedquery', 'userquery'])
  expect(data.slice(3)).toEqual(['cr40f_composicaodeprecos', 'cr40f_composicaodeprecos'])
  expect(xrm.calls.some((call) => call.entity.includes('EntityDefinitions') || call.query.includes('EntityDefinitions'))).toBe(false)
  // A busca fica desabilitada até a metadata chegar, mas a grade já é usável.
  expect(catalog.load).toHaveBeenCalledTimes(1)
})

it('catálogo que chega depois não refaz a consulta e o cabeçalho provisório vira o rótulo', async () => {
  let release!: (fields: CatalogField[]) => void
  catalog.load.mockReturnValue(new Promise<CatalogField[]>((resolve) => { release = resolve }))
  const xrm = fakeXrm(standard)

  const { container } = render(<ComposicaoPage host={host} />)
  expect(await screen.findByText('Aprovada')).toBeTruthy()
  // PARK-T2c: antes do catálogo o cabeçalho fica marcado como provisório; o status da visão padrão já mostra "Status"
  // (os demais campos mostram a parte do id depois do último ponto).
  expect(container.querySelector('.column-header--provisional')?.textContent).toBe('Status')
  expect(container.querySelector('.column-header--provisional')?.getAttribute('title')).toBe('new_status')
  await waitFor(() => expect(xrm.count('cr40f_composicaodeprecos')).toBe(2))
  const before = xrm.count('cr40f_composicaodeprecos')

  await act(async () => { release([field('new_status', 'Situação')]) })

  await waitFor(() => expect(screen.getByRole('textbox', { name: /Buscar/ })).toHaveProperty('disabled', false))
  expect(container.querySelector('.column-header--provisional')).toBeNull()
  expect(screen.getByText('Situação')).toBeTruthy()
  expect(screen.getByText('Aprovada')).toBeTruthy()
  expect(xrm.count('cr40f_composicaodeprecos')).toBe(before)
})

it('view sem FetchXML cai para userQuery com releitura por id', async () => {
  catalog.load.mockResolvedValue([field('new_status', 'Situação')])
  const xrm = fakeXrm((entity, query) => {
    if (entity === 'savedquery') return { entities: [{ ...view, fetchxml: '' }] }
    if (entity === 'cr40f_composicaodeprecos') {
      if (query.includes('aggregate')) return { entities: [{ total: 1 }] }
      return { entities: [row('11111111-1111-4111-8111-111111111111')] }
    }
    return { entities: [] }
  })

  render(<ComposicaoPage host={host} />)

  await waitFor(() => expect(screen.getByText('Aprovada')).toBeTruthy())
  const table = xrm.calls.filter((call) => call.entity === 'cr40f_composicaodeprecos').map((call) => call.query)
  const userQueryAt = table.findIndex((query) => query.includes('userQuery=') || query.includes('savedQuery='))
  expect(userQueryAt).toBeGreaterThanOrEqual(0)
  // A releitura por id (FetchXML com os vínculos) vem depois da página da view.
  expect(table.slice(userQueryAt + 1).some((query) => decodeURIComponent(query).includes('operator="in"'))).toBe(true)
})

it('PARK-T2b: view com layout vazio abre pela consulta e colunas padrão', async () => {
  catalog.load.mockReturnValue(new Promise(() => undefined))
  const xrm = fakeXrm((entity, query) => entity === 'savedquery'
    ? { entities: [{ ...view, layoutxml: '' }] }
    : standard(entity, query, 1))

  render(<ComposicaoPage host={host} />)

  expect(await screen.findByText(/Cliente 1111/)).toBeTruthy()
  const first = xrm.calls.find((call) => call.entity === 'cr40f_composicaodeprecos')!
  expect(first.query).toContain('modifiedon')
  expect(screen.queryByText('new_status')).toBeNull()
})

it('sem leitura numa tabela relacionada: repete sem os vínculos, a grade carrega e não há alerta', async () => {
  catalog.load.mockResolvedValue([])
  const xrm = fakeXrm((entity, query) => {
    if (entity === 'cr40f_composicaodeprecos' && !query.includes('aggregate') && query.includes('cmp_res')) {
      return Promise.reject({ errorCode: -2147220960, message: 'sem privilégio' })
    }
    return standard(entity, query, 1)
  })

  render(<ComposicaoPage host={host} />)

  expect(await screen.findByText('Aprovada')).toBeTruthy()
  const pages = xrm.calls.filter((call) => call.entity === 'cr40f_composicaodeprecos' && !decodeURIComponent(call.query).includes('aggregate')).map((call) => decodeURIComponent(call.query))
  expect(pages.filter((query) => query.includes('cmp_res'))).toHaveLength(1)
  expect(pages.some((query) => !query.includes('cmp_res'))).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('mais de 1000 composições: carrega página por página e interrompe página repetida', async () => {
  catalog.load.mockResolvedValue([])
  let notify: (() => void) | undefined
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { notify = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    observe() {}
    disconnect() {}
  })
  const ids = (start: number) => Array.from({ length: 100 }, (_, index) => `00000000-0000-4000-8000-${String(start + index).padStart(12, '0')}`)
  const pageCalls: string[] = []
  fakeXrm((entity, query) => {
    if (entity === 'savedquery') return { entities: [view] }
    if (entity !== 'cr40f_composicaodeprecos') return { entities: [] }
    if (query.includes('aggregate')) return { entities: [{ total: 1500 }] }
    pageCalls.push(query)
    // A terceira leitura devolve de novo os mesmos registros da segunda.
    return { entities: ids(pageCalls.length === 1 ? 1 : 101).map((id) => row(id)) }
  })

  render(<ComposicaoPage host={host} />)
  expect(await screen.findByText(/100 de 1\.500 registros/)).toBeTruthy()
  await waitFor(() => expect(notify).toBeTruthy())
  act(() => notify!())
  expect(await screen.findByText(/200 de 1\.500 registros/)).toBeTruthy()
  await waitFor(() => expect(pageCalls).toHaveLength(2))
  act(() => notify!())
  expect(await screen.findByText(/repetiu uma página/)).toBeTruthy()
  expect(pageCalls).toHaveLength(3)
  vi.unstubAllGlobals()
})

it('cache de catálogo vencido é ignorado: abre igual e usa o catálogo da rede depois', async () => {
  const key = catalogCacheKey(CLIENT_URL)
  localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now() - 13 * 60 * 60 * 1000, fields: [field('new_status', 'Antigo')] }))
  catalog.load.mockResolvedValue([field('new_status', 'Situação')])
  fakeXrm(standard)

  render(<ComposicaoPage host={host} />)

  expect(await screen.findByText('Situação')).toBeTruthy()
  expect(screen.queryByText('Antigo')).toBeNull()
  expect(catalog.load).toHaveBeenCalledTimes(1)
})

const RESERVATION = '22222222-2222-4222-8222-222222222222'
const LINKED_FETCH = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_67d5" link-type="outer"><attribute name="cr40f_trajeto"/></link-entity><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>'
const LINKED_LAYOUT = '<grid name="resultset" object="1" jump="new_status" select="1" icon="1" preview="1"><row name="result" id="cr40f_composicaodeprecosid"><cell name="new_status" width="140"/><cell name="a_67d5.cr40f_trajeto" width="160"/></row></grid>'
const relationships = [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }]
const trajeto: CatalogField = {
  id: `cr40f_reservadeveculos@cr40f_servicorelacionadogeral.cr40f_trajeto`, label: 'Trajeto da reserva', table: 'cr40f_reservadeveculos', attribute: 'cr40f_trajeto',
  primaryIdAttribute: 'cr40f_reservadeveculosid', path: ['cr40f_reservadeveculos'], relationships, type: 'String', available: true, writable: true,
}

it('coluna de tabela relacionada: catálogo tardio não refaz a consulta, preserva linhas e seleção e a célula vira editável', async () => {
  let release!: (fields: CatalogField[]) => void
  catalog.load.mockReturnValue(new Promise<CatalogField[]>((resolve) => { release = resolve }))
  const xrm = fakeXrm((entity, query) => {
    if (entity === 'savedquery') return { entities: [{ ...view, fetchxml: LINKED_FETCH, layoutxml: LINKED_LAYOUT }] }
    if (entity === 'cr40f_composicaodeprecos') {
      return { entities: query.includes('aggregate') ? [{ total: 1 }] : [row('11111111-1111-4111-8111-111111111111', { 'a_67d5.cr40f_trajeto': 'Aeroporto', 'a_67d5.cr40f_reservadeveculosid': RESERVATION })] }
    }
    return { entities: [] }
  })

  const { container } = render(<ComposicaoPage host={host} />)
  expect(await screen.findByText('Aeroporto')).toBeTruthy()
  await waitFor(() => expect(xrm.count('cr40f_composicaodeprecos')).toBe(2))
  const checkbox = screen.getByRole('checkbox', { name: /Selecionar Cliente 1111/ }) as HTMLInputElement
  fireEvent.click(checkbox)
  expect(checkbox.checked).toBe(true)
  const before = xrm.count('cr40f_composicaodeprecos')
  // A consulta da abertura leva a chave do registro relacionado (`from` do vínculo), necessária para editar depois.
  const openQuery = decodeURIComponent(xrm.calls.find((call) => call.entity === 'cr40f_composicaodeprecos')!.query)
  expect(openQuery).toMatch(/alias="a_67d5"[^>]*>(?:<attribute[^>]*>)*<attribute name="cr40f_reservadeveculosid"/)

  await act(async () => { release([field('new_status', 'Situação'), trajeto]) })

  expect(await screen.findByText('Trajeto da reserva')).toBeTruthy()
  expect(screen.getByText('Aeroporto')).toBeTruthy()
  expect((screen.getByRole('checkbox', { name: /Selecionar Cliente 1111/ }) as HTMLInputElement).checked).toBe(true)
  expect(xrm.count('cr40f_composicaodeprecos')).toBe(before)
  const cell = container.querySelector(`[data-grid-cell="11111111-1111-4111-8111-111111111111:${trajeto.id}"]`)
  expect(cell?.getAttribute('data-grid-editable')).toBe('true')
})

it('sem catálogo, ordenar e filtrar ficam desabilitados até a metadata chegar', async () => {
  let release!: (fields: CatalogField[]) => void
  catalog.load.mockReturnValue(new Promise<CatalogField[]>((resolve) => { release = resolve }))
  fakeXrm(standard)

  render(<ComposicaoPage host={host} />)

  expect(await screen.findByText('Aprovada')).toBeTruthy()
  expect(screen.queryAllByRole('group')).toHaveLength(0)

  await act(async () => { release([field('new_status', 'Situação')]) })

  await waitFor(() => expect(screen.getAllByRole('group').length).toBeGreaterThan(0))
})
