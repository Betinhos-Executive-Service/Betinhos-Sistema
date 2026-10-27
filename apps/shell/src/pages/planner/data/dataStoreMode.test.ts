// Porte de Tela Planner/tests/dataStoreMode.test.mjs (mesmas asserções).
// Roda no ambiente node do Vitest: sem `window`, como no `node --test` original.
import { describe, expect, test } from 'vitest'
import { createDataStore } from './dataverse'

const g = globalThis as unknown as Record<string, unknown>

describe('dataStoreMode', () => {
  test('fora do Model-driven app usa mock local sem chamar Dataverse', async () => {
    const values = new Map<string, string>()
    g.localStorage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) }
    let fetchCalls = 0
    const originalFetch = g.fetch
    g.fetch = async () => { fetchCalls += 1; throw new Error('fetch não deveria ser chamado no modo local') }

    try {
      delete g.window
      const store = createDataStore()
      const state = await store.load()
      expect(store.live).toBe(false)
      expect(state.live).toBe(false)
      expect(state.tasks.length > 0).toBe(true)
      await store.createTask(state, { title: 'Tarefa local' })
      expect(fetchCalls).toBe(0)
    } finally {
      g.fetch = originalFetch
    }
  })

  test('modo local expõe bootstrap por etapas sem bloquear dados essenciais', async () => {
    const originalWindow = g.window
    try {
      delete g.window
      const store = createDataStore()
      const core = await store.loadCore()
      expect(core.loading?.core).toBe(false)
      expect(core.loading?.quotes).toBe(false)
      expect(core.tasks.length > 0).toBe(true)
      const supplemental = await store.loadSupplemental(core)
      expect(supplemental.loading?.quality).toBe(false)
      const details = await store.loadTaskDetails(core.tasks[0].id)
      expect(details.taskId).toBe(core.tasks[0].id)
    } finally {
      if (originalWindow === undefined) delete g.window
      else g.window = originalWindow
    }
  })

  test('com Xrm disponível mantém adapter live', () => {
    const originalWindow = g.window
    g.window = { Xrm: { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm.dynamics.com' }) }, WebApi: {} } }
    try {
      expect(createDataStore().live).toBe(true)
    } finally {
      if (originalWindow === undefined) delete g.window
      else g.window = originalWindow
    }
  })

  test('WebResource direto usa GetGlobalContext e mantém adapter live', () => {
    const originalWindow = g.window
    g.window = {
      location: { hostname: 'org23b93544.crm2.dynamics.com', pathname: '/webResources/new_TelaPlanner.html' },
      GetGlobalContext: () => ({ getClientUrl: () => 'https://org23b93544.crm2.dynamics.com', userSettings: { userId: 'user-id' } }),
    }
    try {
      expect(createDataStore().live).toBe(true)
    } finally {
      if (originalWindow === undefined) delete g.window
      else g.window = originalWindow
    }
  })

  test('WebResource Dynamics sem contexto não carrega mock', () => {
    const originalWindow = g.window
    g.window = { location: { hostname: 'org23b93544.crm2.dynamics.com', pathname: '/webResources/new_TelaPlanner.html' } }
    try {
      expect(() => createDataStore()).toThrow(/contexto autenticado do Dataverse indisponível/)
    } finally {
      if (originalWindow === undefined) delete g.window
      else g.window = originalWindow
    }
  })
})

