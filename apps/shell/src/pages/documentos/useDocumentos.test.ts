// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DocsSource } from './data/source'
import type { DocsData } from './domain/types'
import { useDocumentos } from './useDocumentos'

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void }
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const dados = (): DocsData => ({ tipos: [], donos: [], docs: [], destinatarios: [] })

/** Fonte falsa: cada chamada de `carregar` devolve a próxima resposta da fila (promessa controlada). */
function fonte(respostas: Deferred<DocsData>[]) {
  let i = 0
  return { carregar: () => respostas[i++].promise } as unknown as DocsSource
}

describe('useDocumentos', () => {
  it('(a) respostas fora de ordem: vale a recarga mais recente', async () => {
    const d1 = deferred<DocsData>()
    const d2 = deferred<DocsData>()
    const src = fonte([d1, d2])
    const { result } = renderHook(() => useDocumentos(src))

    await act(async () => { void result.current.reload() })
    const dois = dados()
    await act(async () => { d2.resolve(dois) })
    expect(result.current.data).toBe(dois)

    const um = dados()
    await act(async () => { d1.resolve(um) })
    expect(result.current.data).toBe(dois)
    expect(result.current.loading).toBe(false)
  })

  it('(b) recarga que falha mantém a carga anterior e informa o erro', async () => {
    const d1 = deferred<DocsData>()
    const d2 = deferred<DocsData>()
    const src = fonte([d1, d2])
    const { result } = renderHook(() => useDocumentos(src))

    const antigo = dados()
    await act(async () => { d1.resolve(antigo) })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { void result.current.reload() })
    await act(async () => { d2.reject(new Error('Falha de rede')) })

    expect(result.current.data).toBe(antigo)
    expect(result.current.error).toBe('Falha de rede')
    expect(result.current.loading).toBe(false)
  })

  it('(c) trocar de fonte descarta os dados antigos e ignora a resposta tardia', async () => {
    const aCarga = deferred<DocsData>()
    const aRecarga = deferred<DocsData>()
    const bCarga = deferred<DocsData>()
    const fonteA = fonte([aCarga, aRecarga])
    const fonteB = fonte([bCarga])

    const { result, rerender } = renderHook(({ src }) => useDocumentos(src), { initialProps: { src: fonteA } })
    const primeiro = dados()
    await act(async () => { aCarga.resolve(primeiro) })
    await waitFor(() => expect(result.current.data).toBe(primeiro))

    await act(async () => { void result.current.reload() })
    rerender({ src: fonteB })
    await waitFor(() => expect(result.current.data).toBeNull())
    expect(result.current.loading).toBe(true)

    await act(async () => { aRecarga.resolve(dados()) })
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)

    const doB = dados()
    await act(async () => { bCarga.resolve(doB) })
    expect(result.current.data).toBe(doB)
    expect(result.current.loading).toBe(false)
  })

  it('(c) fonte nula não carrega e limpa os dados', async () => {
    const aCarga = deferred<DocsData>()
    const fonteA = fonte([aCarga])
    const { result, rerender } = renderHook(({ src }) => useDocumentos(src), { initialProps: { src: fonteA as DocsSource | null } })
    await act(async () => { aCarga.resolve(dados()) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).not.toBeNull()

    rerender({ src: null })
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
