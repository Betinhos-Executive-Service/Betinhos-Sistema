// 412 na cotação logo depois de criada: o flow legado "Pedido de Cotação - Planner e Teams"
// grava cr40f_plannertaskid/cr40f_linktarefaplanner e a ETag da tela fica velha. Se só
// campos de automação mudaram, a gravação repete com a ETag atual; se o negócio mudou, é conflito.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { LiveState, PlannerDataStore } from './dataverse'

const quoteId = '11111111-1111-4111-8111-111111111111'
const quotePath = `/cr40f_pedidodecotacaos(${quoteId})`

type Patch = { url: string; ifMatch: string; body: Record<string, unknown> }
const g = globalThis as unknown as Record<string, unknown>
let previous: Record<string, unknown> = {}

beforeEach(() => { previous = { window: g.window, parent: g.parent, fetch: g.fetch }; vi.resetModules() })
afterEach(() => { Object.assign(globalThis, previous) })

async function setup(freshRow: Record<string, unknown>): Promise<{ store: PlannerDataStore; patches: Patch[]; deletes: string[] }> {
  const patches: Patch[] = []
  const deletes: string[] = []
  const xrm = { WebApi: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://test.crm.dynamics.com', userSettings: { userId: 'u', userName: 'Renan' } }) } }
  g.window = { Xrm: xrm, location: { origin: 'https://test.crm.dynamics.com' }, setTimeout }
  g.parent = g.window
  g.fetch = async (rawUrl: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
    const url = decodeURIComponent(rawUrl)
    const method = init.method || 'GET'
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (method === 'DELETE') { deletes.push(url); return ok(null) }
    if (method === 'PATCH' && url.endsWith(quotePath)) {
      const ifMatch = init.headers?.['If-Match'] || ''
      patches.push({ url, ifMatch, body: JSON.parse(init.body || '{}') })
      if (ifMatch !== freshRow['@odata.etag']) return new Response(JSON.stringify({ error: { code: '0x80060882', message: "The version of the existing record doesn't match the RowVersion property provided." } }), { status: 412 })
      return ok(null)
    }
    if (method === 'GET' && url.includes(`${quotePath}?$select=`)) return ok(freshRow)
    if (url.includes('ManyToOneRelationships')) return ok({ value: [{ ReferencingAttribute: 'cr40f_pedidocotacao', ReferencedEntity: 'cr40f_pedidodecotacao', ReferencingEntityNavigationPropertyName: 'cr40f_PedidoCotacao' }, { ReferencingAttribute: 'cr40f_opcao', ReferencedEntity: 'cr40f_cotacaoopcao', ReferencingEntityNavigationPropertyName: 'cr40f_Opcao' }] })
    if (url.includes("EntityDefinitions(LogicalName='cr40f_cotacaoopcao')")) return ok({ EntitySetName: 'cr40f_cotacaoopcaos' })
    if (url.includes("EntityDefinitions(LogicalName='cr40f_cotacaoopcaoitem')")) return ok({ EntitySetName: 'cr40f_cotacaoopcaoitems' })
    if (url.includes("EntityDefinitions(LogicalName='cr40f_cotacaopropostaversao')")) return ok({ EntitySetName: 'cr40f_cotacaopropostaversaos' })
    if (method === 'GET' && url.includes('/cr40f_pedidodecotacaos?')) return ok({ value: [freshRow] })
    return ok({ value: [], PrimaryNameAttribute: 'cr40f_name' })
  }
  const { createDataStore } = await import('./dataverse')
  return { store: createDataStore(), patches, deletes }
}

// Cotação como a tela leu logo depois do POST (ETag 1, sem o ID do MS Planner).
const stateWith = (quote: Record<string, unknown> = {}): LiveState => ({
  quotes: [{ id: quoteId, code: 'COT-1102', title: 'GRU', status: 'Nova', priority: 'medium', etag: 'W/"1"', options: [], ...quote }],
  tasks: [], employees: [], teams: [], notifications: [],
} as unknown as LiveState)

// Linha atual: o flow já gravou o ID e o link do MS Planner (ETag 2).
const rowAfterFlow = (overrides: Record<string, unknown> = {}) => ({
  cr40f_pedidodecotacaoid: quoteId, '@odata.etag': 'W/"2"', cr40f_numerodacotacao: 'COT-1102', cr40f_titulo: 'GRU',
  cr40f_statuscotacao: 100004000, cr40f_plannertaskid: 'yIXt6CVJlUmvbIZxoGvpFmUADUR5',
  cr40f_linktarefaplanner: 'https://planner.cloud.microsoft/webui/mytasks/all/view/task/yIXt6CVJlUmvbIZxoGvpFmUADUR5',
  ...overrides,
})

describe('412 na cotação', () => {
  test('flow só gravou o ID do MS Planner: repete com a ETag atual e salva na primeira tentativa', async () => {
    const { store, patches } = await setup(rowAfterFlow())
    await store.updateQuote(stateWith(), quoteId, { status: 'Em análise pelo financeiro' })
    expect(patches.map((item) => item.ifMatch)).toEqual(['W/"1"', 'W/"2"'])
    expect(patches[1].body.cr40f_statuscotacao).toBe(100004001)
  })

  test('outra pessoa mudou um campo de negócio: não repete e avisa o conflito', async () => {
    const { store, patches } = await setup(rowAfterFlow({ cr40f_statuscotacao: 100004001 }))
    await expect(store.updateQuote(stateWith(), quoteId, { title: 'GRU editado' })).rejects.toThrow('alterada por outra pessoa')
    expect(patches).toHaveLength(1)
  })

  test('conflito de verdade com opções novas apaga as opções preparadas', async () => {
    const { store, patches, deletes } = await setup(rowAfterFlow({ cr40f_statuscotacao: 100004001, cr40f_condicaocomercial: 'Pagamento à vista' }))
    await expect(store.updateQuote(stateWith({ status: 'Em análise pelo financeiro' }), quoteId, { options: [{ id: 'option-1', name: 'Sedan', value: '350' }] })).rejects.toThrow('alterada por outra pessoa')
    expect(patches).toHaveLength(1)
    expect(deletes.some((url) => url.includes('/cr40f_cotacaoopcaos('))).toBe(true)
  })
})
