// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../data/source'
import { invalidarFoto, useFotoVeiculo } from './FotoVeiculo'

// Cache Storage em memória (o jsdom não tem).
let store: Map<string, Response>
beforeEach(() => {
  store = new Map()
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (k: string) => store.get(k)?.clone(),
      put: async (k: string, r: Response) => { store.set(k, r) },
      delete: async (k: string) => store.delete(k),
    }),
  })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:foto', revokeObjectURL: () => {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

// Cada fonte nova tem cache em memória vazio: simula outra visita à tela.
const fonte = (blob: Blob | null) => ({ fotoVeiculo: vi.fn(async () => blob) }) as unknown as DataSource & { fotoVeiculo: ReturnType<typeof vi.fn> }

async function carregar(source: DataSource, id: string) {
  const { result } = renderHook(() => useFotoVeiculo(source, id))
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result.current.url
}

describe('useFotoVeiculo', () => {
  it('guarda "sem foto" e não chama o Flow de novo na visita seguinte', async () => {
    const primeira = fonte(null)
    expect(await carregar(primeira, 'v1')).toBeNull()
    expect(primeira.fotoVeiculo).toHaveBeenCalledTimes(1)

    const segunda = fonte(null)
    expect(await carregar(segunda, 'v1')).toBeNull()
    expect(segunda.fotoVeiculo).not.toHaveBeenCalled()
  })

  it('volta a perguntar depois de 6 h', async () => {
    await carregar(fonte(null), 'v2')
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 60 * 1000 + 1)
    const depois = fonte(new Blob(['x'], { type: 'image/jpeg' }))
    expect(await carregar(depois, 'v2')).toBe('blob:foto')
    expect(depois.fotoVeiculo).toHaveBeenCalledTimes(1)
  })

  it('enviar foto limpa a marca e a tela busca a foto nova na hora', async () => {
    const source = fonte(null)
    const { result } = renderHook(() => useFotoVeiculo(source, 'v3'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.url).toBeNull()
    source.fotoVeiculo.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    invalidarFoto(source, 'v3')
    await waitFor(() => expect(result.current.url).toBe('blob:foto'))
    expect(source.fotoVeiculo).toHaveBeenCalledTimes(2)
  })
})
