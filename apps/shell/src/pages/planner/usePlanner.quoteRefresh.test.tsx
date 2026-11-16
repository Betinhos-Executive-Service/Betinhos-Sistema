// @vitest-environment jsdom
// Atualização automática x gravação de cotação: o refresh que leu a linha antes da
// gravação não pode devolver a ETag velha à tela, e um conflito de versão relê na hora.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { quoteConflictError } from './domain/quoteConflict'

const quote = (etag: string, extra: Record<string, unknown> = {}) => ({ id: 'q1', code: 'COT-1', title: 'GRU', status: 'Nova', etag, options: [], ...extra })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const store = vi.hoisted(() => ({}) as Record<string, any>)
vi.mock('./data/dataverse', () => ({ createDataStore: () => store }))

function resetStore() {
  for (const key of Object.keys(store)) delete store[key]
  Object.assign(store, {
    live: true,
    loadCore: vi.fn(async () => ({ tasks: [], employees: [], teams: [], loading: { core: false } })),
    loadSupplemental: vi.fn(async () => ({ quotes: [quote('W/"1"')], loading: { quotes: false, quality: false } })),
    loadPhotos: vi.fn(async () => ({ loading: { photos: false } })),
    loadContacts: vi.fn(async () => []),
    updateQuote: vi.fn(),
  })
}

async function mountPlanner() {
  resetStore()
  const { usePlanner } = await import('./usePlanner')
  const hook = renderHook(() => usePlanner())
  await waitFor(() => expect(hook.result.current.state.quotes[0]?.etag).toBe('W/"1"'))
  await waitFor(() => expect(hook.result.current.state.loading.core).toBe(false))
  return hook
}

afterEach(() => { vi.useRealTimers() })

describe('cotação: refresh e gravação', () => {
  test('refresh que começou antes da gravação é descartado e relido', async () => {
    const { result } = await mountPlanner()
    const stale = deferred<any>()
    store.loadSupplemental.mockImplementationOnce(() => stale.promise)
    store.updateQuote.mockImplementation(async (state: any) => ({ ...state, quotes: [quote('W/"3"', { title: 'GRU editado' })] }))

    let refresh!: Promise<void>
    act(() => { refresh = result.current.refreshInBackground({ silent: true }) })
    await act(async () => { await result.current.updateQuote('q1', { title: 'GRU editado' }) })
    expect(result.current.confirmedStateRef.current.quotes[0].etag).toBe('W/"3"')

    // A leitura antiga chega depois da gravação: não pode voltar a ETag 1.
    store.loadSupplemental.mockImplementation(async () => ({ quotes: [quote('W/"3"', { title: 'GRU editado' })], loading: { quotes: false } }))
    await act(async () => { stale.resolve({ quotes: [quote('W/"1"')], loading: { quotes: false } }); await refresh })
    expect(result.current.confirmedStateRef.current.quotes[0].etag).toBe('W/"3"')
    // E lê de novo logo em seguida, em vez de esperar o próximo ciclo de 60 s.
    await waitFor(() => expect(store.loadSupplemental).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(result.current.refreshing).toBe(false))
    expect(result.current.state.quotes[0]).toMatchObject({ etag: 'W/"3"', title: 'GRU editado' })
  })

  test('conflito de versão relê os dados na hora e avisa sem "Falha ao sincronizar"', async () => {
    const { result } = await mountPlanner()
    store.updateQuote.mockRejectedValue(quoteConflictError('A cotação foi alterada por outra pessoa. Recarregue os dados antes de salvar para evitar sobrescrever a edição.'))
    store.loadSupplemental.mockImplementation(async () => ({ quotes: [quote('W/"2"', { status: 'Em análise pelo financeiro' })], loading: { quotes: false } }))

    let saved: unknown
    await act(async () => { saved = await result.current.updateQuote('q1', { title: 'GRU editado' }) })
    expect(saved).toBe(false)
    expect(result.current.notice).toContain('alterada por outra pessoa')
    expect(result.current.notice).not.toContain('Falha ao sincronizar')
    await waitFor(() => expect(result.current.state.quotes[0]).toMatchObject({ etag: 'W/"2"', status: 'Em análise pelo financeiro' }))
  })

  test('falha que não é conflito continua como antes', async () => {
    const { result } = await mountPlanner()
    store.updateQuote.mockRejectedValue(new Error('PATCH falhou: 500 erro'))
    await act(async () => { await result.current.updateQuote('q1', { title: 'GRU editado' }) })
    expect(result.current.notice).toContain('Falha ao sincronizar')
    expect(store.loadSupplemental).toHaveBeenCalledTimes(1)
    expect(result.current.state.quotes[0].title).toBe('GRU')
  })
})
