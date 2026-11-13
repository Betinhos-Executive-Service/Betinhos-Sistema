// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'
import { LAST_VIEW_KEY } from './data/open-query'
import type { CatalogField } from './data/views'
import type { Host } from '../../host'

const catalog = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('./data/views', async (original) => ({
  ...await original<typeof import('./data/views')>(),
  loadColumnCatalog: () => catalog.load(),
}))

const F = '@OData.Community.Display.V1.FormattedValue'
const CLIENT_URL = 'https://visao-quebrada.crm.example'
const host = { mode: 'dataverse', clientUrl: CLIENT_URL, metadata: { choices: async () => [] }, client: {}, insideModelDriven: false, appId: async () => undefined } as unknown as Host
const status: CatalogField = { id: 'new_status', label: 'Status', table: 'cr40f_composicaodeprecos', attribute: 'new_status', path: [], type: 'Picklist', available: true, writable: true }
const layout = (cells: string[]) => `<grid name="resultset" object="1" jump="new_status" select="1" icon="1" preview="1"><row name="result" id="cr40f_composicaodeprecosid">${cells.map((name) => `<cell name="${name}" width="140"/>`).join('')}</row></grid>`
const standard = { savedqueryid: 'vvvvvvvv-0000-4000-8000-000000000001', name: 'Padrão', description: '', fetchxml: '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/></entity></fetch>', layoutxml: layout(['new_status']), querytype: 0, isdefault: true }
const BROKEN_ID = 'uuuuuuuu-0000-4000-8000-000000000002'
const broken = { userqueryid: BROKEN_ID, name: 'Visualização Padrão SF', description: '', fetchxml: '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><attribute name="new_valorsubtotal"/></entity></fetch>', layoutxml: layout(['new_status', 'new_valorsubtotal']) }
/** Erro que o Xrm.WebApi devolve para atributo que não existe mais (HTTP 400). */
const missingAttribute = { errorCode: -2147217149, message: "'cr40f_composicaodeprecos' entity doesn't contain attribute with Name = 'new_valorsubtotal' and NameMapping = 'Logical'. MetadataCacheDetails: ProviderType=Dynamic", status: 400 }

function fakeXrm() {
  const retrieveMultipleRecords = vi.fn((entity: string, query = '') => {
    if (entity === 'userquery') return Promise.resolve({ entities: [broken] })
    if (entity === 'savedquery') return Promise.resolve({ entities: [standard] })
    if (entity === 'cr40f_composicaodeprecos') {
      const decoded = decodeURIComponent(query)
      if (decoded.includes('new_valorsubtotal')) return Promise.reject(missingAttribute)
      return Promise.resolve({ entities: decoded.includes('aggregate') ? [{ total: 1 }] : [{ cr40f_composicaodeprecosid: '11111111-1111-4111-8111-111111111111', new_status: 1, [`new_status${F}`]: 'Aprovada', versionnumber: 1 }] })
    }
    return Promise.resolve({ entities: [] })
  })
  window.Xrm = { WebApi: { retrieveMultipleRecords }, Utility: { getGlobalContext: () => ({ getClientUrl: () => CLIENT_URL }) } } as unknown as typeof window.Xrm
}

async function openView(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Visão: / }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name, hidden: true }, { timeout: 5000 }))
}

const brokenAlert = () => screen.queryByText(/usa o campo new_valorsubtotal, que não existe mais/)

beforeEach(() => { try { localStorage.clear() } catch { /* sem storage */ } catalog.load.mockResolvedValue([status]); fakeXrm() })
afterEach(() => { cleanup(); catalog.load.mockReset(); delete (window as { Xrm?: unknown }).Xrm; vi.restoreAllMocks() })

it('abrir a tela na visão com campo removido mostra o aviso na hora, sem o vazio de "nenhuma composição"', async () => {
  localStorage.setItem(LAST_VIEW_KEY, BROKEN_ID)
  render(<ComposicaoPage host={host} />)

  const alert = await screen.findByText(/usa o campo new_valorsubtotal, que não existe mais/)
  expect(alert.closest('[role="alert"]')?.textContent).toMatch(/Edite as colunas ou troque de visão/)
  expect(screen.queryByText('Nenhuma composição encontrada')).toBeNull()
  expect(screen.getByText('Dados não carregados')).toBeTruthy()

  await openView('Padrão')
  expect(await screen.findByText('Aprovada')).toBeTruthy()
  expect(brokenAlert()).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('trocar para a visão com campo removido mostra o aviso, e voltar para outra visão o limpa', async () => {
  render(<ComposicaoPage host={host} />)
  expect(await screen.findByText('Aprovada')).toBeTruthy()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', false))

  await openView('Visualização Padrão SF')
  expect(await screen.findByText(/usa o campo new_valorsubtotal, que não existe mais/)).toBeTruthy()
  expect(screen.queryByText('Nenhuma composição encontrada')).toBeNull()
  // Atualizar na visão quebrada mantém o aviso na grade, sem aviso flutuante que siga para as outras visões.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', false))
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveProperty('disabled', false))
  expect(brokenAlert()).toBeTruthy()
  expect(screen.queryByText('Não foi possível atualizar')).toBeNull()

  await openView('Padrão')
  expect(await screen.findByText('Aprovada')).toBeTruthy()
  expect(brokenAlert()).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})
