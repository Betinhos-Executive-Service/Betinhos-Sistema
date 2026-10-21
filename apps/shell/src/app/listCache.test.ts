import { describe, expect, it, vi } from 'vitest'
import { LIST_TTL, ListCache, listCache, staleOnWrite } from './listCache'

describe('ListCache', () => {
  it('vale dentro do TTL e vence depois', () => {
    let now = 1_000
    const cache = new ListCache(() => now)
    cache.set('pessoas', [1, 2])
    const entry = cache.get<number[]>('pessoas')!
    expect(entry.value).toEqual([1, 2])
    now += LIST_TTL - 1
    expect(cache.isFresh(entry)).toBe(true)
    now += 1
    expect(cache.isFresh(entry)).toBe(false)
  })

  it('update aplica a gravação e marca a cópia como vencida (próxima abertura revalida)', () => {
    const cache = new ListCache(() => 5_000)
    cache.set('ops:90', ['a', 'b'])
    cache.update<string[]>('ops:90', (list) => list.map((x) => (x === 'a' ? 'A' : x)))
    const entry = cache.get<string[]>('ops:90')!
    expect(entry.value).toEqual(['A', 'b'])
    expect(cache.isFresh(entry)).toBe(false)
    cache.update('inexistente', () => 1)
    expect(cache.get('inexistente')).toBeUndefined()
  })

  it('invalidate descarta as outras variantes do grupo; stale mantém e só vence', () => {
    const cache = new ListCache(() => 5_000)
    for (const key of ['ops:30', 'ops:90', 'ops:all', 'pagantes:90']) cache.set(key, key)
    cache.invalidate('ops:', 'ops:90')
    expect(['ops:30', 'ops:90', 'ops:all', 'pagantes:90'].map((k) => cache.get(k) != null)).toEqual([false, true, false, true])
    cache.stale('pagantes:')
    expect(cache.get('pagantes:90')!.value).toBe('pagantes:90')
    expect(cache.isFresh(cache.get('pagantes:90')!)).toBe(false)
    expect(cache.isFresh(cache.get('ops:90')!)).toBe(true)
  })

  it('um cache por escopo: outro host (ou outro teste) começa vazio', () => {
    const a = {}
    listCache(a).set('x', 1)
    expect(listCache(a).get('x')?.value).toBe(1)
    expect(listCache({}).get('x')).toBeUndefined()
  })

  it('staleOnWrite: gravação (com sucesso ou erro) vence a lista da fonte', async () => {
    const source = { list: vi.fn(async () => [1]), save: vi.fn(async (id: string) => id), falha: vi.fn(async () => { throw new Error('x') }) }
    const wrapped = staleOnWrite(source, 'funcionarios', ['save', 'falha'])
    listCache(wrapped).set('funcionarios', [1])
    expect(listCache(wrapped).isFresh(listCache(wrapped).get('funcionarios')!)).toBe(true)
    await expect(wrapped.save('m1')).resolves.toBe('m1')
    expect(source.save).toHaveBeenCalledWith('m1')
    expect(listCache(wrapped).isFresh(listCache(wrapped).get('funcionarios')!)).toBe(false)
    listCache(wrapped).set('funcionarios', [1])
    await expect(wrapped.falha()).rejects.toThrow('x')
    expect(listCache(wrapped).isFresh(listCache(wrapped).get('funcionarios')!)).toBe(false)
    expect(wrapped.list).toBe(source.list)
  })
})
