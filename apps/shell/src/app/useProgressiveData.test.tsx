// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIST_TTL, ListCache } from './listCache'
import { useProgressiveData } from './useProgressiveData'

afterEach(cleanup)

/** Promessa que o teste resolve na hora que quiser. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

type Loader = (partial: (value: string[]) => void) => Promise<string[]>

function setup(load: Loader, cache = new ListCache(), key = 'lista', group?: string) {
  return renderHook((props: { key: string; load: Loader }) => useProgressiveData<string[]>({ cache, key: props.key, load: props.load, group }), { initialProps: { key, load } })
}

describe('useProgressiveData', () => {
  it('mostra a primeira página, depois o conjunto todo, e guarda no cache', async () => {
    const full = deferred<string[]>()
    let partial!: (value: string[]) => void
    const cache = new ListCache()
    const { result } = setup((p) => { partial = p; return full.promise }, cache)
    expect(result.current).toMatchObject({ data: null, loading: true, complete: false })
    act(() => partial(['a']))
    expect(result.current).toMatchObject({ data: ['a'], loading: true, complete: false })
    await act(async () => full.resolve(['a', 'b', 'c']))
    expect(result.current).toMatchObject({ data: ['a', 'b', 'c'], loading: false, complete: true })
    expect(cache.get('lista')?.value).toEqual(['a', 'b', 'c'])
  })

  it('lista vazia: termina completa e sem dados', async () => {
    const { result } = setup(async () => [])
    await waitFor(() => expect(result.current.complete).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('cache dentro do TTL: mostra na hora e não vai ao servidor', () => {
    let now = 10_000
    const cache = new ListCache(() => now)
    cache.set('lista', ['cache'])
    now += LIST_TTL - 1_000
    const load = vi.fn<Loader>(async () => ['novo'])
    const { result } = setup(load, cache)
    expect(result.current).toMatchObject({ data: ['cache'], complete: true, loading: false })
    expect(load).not.toHaveBeenCalled()
  })

  it('cache vencido: mostra a cópia e revalida em segundo plano, sem encolher a lista com a parcial', async () => {
    let now = 10_000
    const cache = new ListCache(() => now)
    cache.set('lista', ['a', 'b', 'c'])
    now += LIST_TTL
    const full = deferred<string[]>()
    let partial!: (value: string[]) => void
    const { result } = setup((p) => { partial = p; return full.promise }, cache)
    expect(result.current.data).toEqual(['a', 'b', 'c'])
    await waitFor(() => expect(result.current.loading).toBe(true))
    act(() => partial(['a']))
    expect(result.current.data).toEqual(['a', 'b', 'c'])
    await act(async () => full.resolve(['a', 'b', 'c', 'd']))
    expect(result.current).toMatchObject({ data: ['a', 'b', 'c', 'd'], loading: false })
    expect(cache.isFresh(cache.get('lista')!)).toBe(true)
  })

  it('resposta antiga é descartada: a recarga mais recente vence', async () => {
    const primeira = deferred<string[]>()
    const segunda = deferred<string[]>()
    const calls = [primeira, segunda]
    let n = 0
    const { result } = setup(() => calls[n++].promise)
    await waitFor(() => expect(n).toBe(1))
    act(() => { void result.current.reload() })
    await act(async () => segunda.resolve(['nova']))
    expect(result.current.data).toEqual(['nova'])
    await act(async () => primeira.resolve(['velha']))
    expect(result.current.data).toEqual(['nova'])
  })

  it('erro no meio da carga mantém a primeira página e avisa', async () => {
    const full = deferred<string[]>()
    let partial!: (value: string[]) => void
    const { result } = setup((p) => { partial = p; return full.promise })
    act(() => partial(['a']))
    await act(async () => full.reject(new Error('Falhou na página 3')))
    expect(result.current).toMatchObject({ data: ['a'], complete: false, loading: false, error: 'Falhou na página 3' })
  })

  it('tentar de novo depois do erro completa normalmente', async () => {
    let falhar = true
    const { result } = setup(async () => { if (falhar) throw new Error('fora do ar'); return ['ok'] })
    await waitFor(() => expect(result.current.error).toBe('fora do ar'))
    falhar = false
    await act(async () => { await result.current.reload() })
    expect(result.current).toMatchObject({ data: ['ok'], complete: true, error: null })
  })

  it('gravação durante a carga vale também sobre o que a carga trouxer, e vence o cache', async () => {
    const full = deferred<string[]>()
    const cache = new ListCache()
    const { result } = setup(() => full.promise, cache, 'ops:90', 'ops:')
    cache.set('ops:30', ['outra variante'])
    await waitFor(() => expect(result.current.loading).toBe(true))
    act(() => result.current.mutate((list) => list.map((x) => (x === 'b' ? 'B editado' : x))))
    await act(async () => full.resolve(['a', 'b']))
    expect(result.current.data).toEqual(['a', 'B editado'])
    expect(cache.get('ops:30')).toBeUndefined()
    // Outra gravação depois da carga: tela e cache mudam, e o cache fica vencido (a próxima abertura revalida).
    act(() => result.current.mutate((list) => [...list, 'c']))
    expect(result.current.data).toEqual(['a', 'B editado', 'c'])
    expect(cache.get('ops:90')?.value).toEqual(['a', 'B editado', 'c'])
    expect(cache.isFresh(cache.get('ops:90')!)).toBe(false)
  })

  it('trocar de chave usa a cópia dela; voltar à anterior não recarrega dentro do TTL', async () => {
    const cache = new ListCache()
    const load = vi.fn<Loader>(async () => ['x'])
    const { result, rerender } = setup(load, cache, 'ops:90')
    await waitFor(() => expect(result.current.complete).toBe(true))
    const outro = deferred<string[]>()
    rerender({ key: 'ops:30', load: () => outro.promise })
    // Enquanto o outro período carrega, a lista anterior fica, mas não vale como completa (totais esperam).
    expect(result.current).toMatchObject({ data: ['x'], complete: false })
    await act(async () => outro.resolve(['y']))
    expect(result.current).toMatchObject({ data: ['y'], complete: true })
    rerender({ key: 'ops:90', load })
    expect(result.current.data).toEqual(['x'])
    expect(load).toHaveBeenCalledTimes(1)
  })
})
