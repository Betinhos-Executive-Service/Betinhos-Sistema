// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keywordIndex, searchWords, useDebouncedText, useMergedById, useServerSearch } from './search'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('useDebouncedText', () => {
  it('só muda 200 ms depois da última tecla; limpar vale na hora', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebouncedText(v), { initialProps: { v: '' } })
    rerender({ v: 'a' })
    act(() => { vi.advanceTimersByTime(150) })
    rerender({ v: 'an' })
    act(() => { vi.advanceTimersByTime(150) })
    rerender({ v: 'ana' })
    expect(result.current).toBe('')
    act(() => { vi.advanceTimersByTime(199) })
    expect(result.current).toBe('')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('ana')
    rerender({ v: '' })
    expect(result.current).toBe('')
    // Recomeçar a digitar não mostra a busca antiga enquanto espera.
    rerender({ v: 'b' })
    expect(result.current).toBe('')
  })
})

describe('keywordIndex', () => {
  it('normaliza o texto de cada linha uma vez e exige todas as palavras', () => {
    const text = vi.fn((p: { nome: string; cidade: string }) => `${p.nome} ${p.cidade}`)
    const index = keywordIndex(text)
    const joao = { nome: 'João Ávila', cidade: 'São Paulo' }
    expect(index.matches(joao, searchWords('joao sao'))).toBe(true)
    expect(index.matches(joao, searchWords('JOAO rio'))).toBe(false)
    expect(index.matches(joao, [])).toBe(true)
    expect(text).toHaveBeenCalledTimes(1)
  })
})

describe('useServerSearch', () => {
  it('descarta a resposta de uma busca antiga e não busca com a lista completa', async () => {
    const pending = new Map<string, (rows: { id: string }[]) => void>()
    const search = vi.fn((q: string) => new Promise<{ id: string }[]>((resolve) => pending.set(q, resolve)))
    const { result, rerender } = renderHook(({ query, enabled }) => useServerSearch({ query, enabled, search }), { initialProps: { query: 'an', enabled: true } })
    rerender({ query: 'ana', enabled: true })
    await act(async () => pending.get('ana')!([{ id: 'nova' }]))
    expect(result.current).toEqual([{ id: 'nova' }])
    await act(async () => pending.get('an')!([{ id: 'velha' }]))
    expect(result.current).toEqual([{ id: 'nova' }])
    rerender({ query: 'ana', enabled: false })
    expect(result.current).toEqual([])
    rerender({ query: 'a', enabled: true })
    expect(search).toHaveBeenCalledTimes(2)
  })
})

describe('useMergedById', () => {
  it('acrescenta só as linhas que faltam, sem repetir id', () => {
    const list = [{ id: '1' }, { id: '2' }]
    const { result, rerender } = renderHook(({ extras }) => useMergedById(list, extras), { initialProps: { extras: [] as { id: string }[] } })
    expect(result.current).toBe(list)
    rerender({ extras: [{ id: '2' }, { id: '3' }] })
    expect(result.current.map((r) => r.id)).toEqual(['1', '2', '3'])
  })
})
