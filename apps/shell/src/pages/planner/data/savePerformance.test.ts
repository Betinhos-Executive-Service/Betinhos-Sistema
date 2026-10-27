// Porte de Tela Planner/tests/savePerformance.test.mjs (mesmas asserções).
import { describe, expect, test } from 'vitest'
import { createDataStore, type LiveState } from './dataverse'

const g = globalThis as unknown as Record<string, unknown>

describe('savePerformance', () => {
  test('save live confirma a tarefa sem recarregar todo o estado', async () => {
    const originalWindow = g.window
    const originalFetch = g.fetch
    const calls: Array<{ url: string; method?: string }> = []
    g.window = {
      Xrm: {
        Utility: {
          getGlobalContext: () => ({
            getClientUrl: () => 'https://org.crm.dynamics.com',
            userSettings: { userId: 'user-1' },
          }),
        },
        WebApi: {},
      },
    }
    g.fetch = async (url: string, options: { method?: string }) => {
      calls.push({ url, method: options.method })
      const body = url.includes('EntityDefinitions')
        ? JSON.stringify({ value: [{ ReferencingAttribute: 'cr40f_tarefa', ReferencingEntityNavigationPropertyName: 'cr40f_tarefa', ReferencedEntity: 'cr40f_plannertarefa' }] })
        : ''
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => body,
      }
    }

    try {
      const store = createDataStore()
      const state = {
        live: true,
        tasks: [{
          id: 'task-1',
          title: 'Antigo',
          status: 'todo',
          priority: 'medium',
          description: '',
          dueDate: '',
          waitingContext: {},
          assigneeIds: [],
          assigneeNames: [],
          detailsLoaded: true,
        }],
        quotes: [{ id: 'quote-1' }],
        teams: [],
        employees: [],
      } as LiveState
      const next = await store.updateTask(state, 'task-1', { title: 'Novo' })

      expect(calls.length).toBe(3)
      expect(calls.map((call) => call.method)).toEqual(['PATCH', undefined, 'POST'])
      expect(next.tasks[0].title).toBe('Novo')
      expect(next.tasks[0].syncStatus).toBe(undefined)
      expect(next.tasks[0].detailsLoaded).toBe(false)
      expect(next.quotes).toEqual(state.quotes)
    } finally {
      g.fetch = originalFetch
      if (originalWindow === undefined) delete g.window
      else g.window = originalWindow
    }
  })
})
