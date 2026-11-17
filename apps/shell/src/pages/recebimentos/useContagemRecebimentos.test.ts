// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RecebimentosSource } from './source'
import { useContagemRecebimentos } from './useContagemRecebimentos'

const fonte = (contarPorOp: RecebimentosSource['contarPorOp']) => ({ contarPorOp }) as unknown as RecebimentosSource
const IDS = ['op-a', 'op-b']

describe('useContagemRecebimentos', () => {
  it('marca os ids lidos; versão nova (Atualizar) conta de novo e zera quem perdeu o comprovante', async () => {
    const contar = vi.fn(async () => new Map([['op-a', 2]]))
    const source = fonte(contar)
    const { result, rerender } = renderHook(({ versao }) => useContagemRecebimentos(source, IDS, 'op', versao), { initialProps: { versao: 0 } })
    await waitFor(() => expect(result.current.lidos.has('op-b')).toBe(true))
    expect(result.current.contagem.get('op-a')).toBe(2)
    contar.mockResolvedValueOnce(new Map())
    rerender({ versao: 1 })
    expect(result.current.contagem.get('op-a')).toBe(2)
    await waitFor(() => expect(result.current.contagem.has('op-a')).toBe(false))
    expect(contar).toHaveBeenCalledTimes(2)
  })

  it('falha deixa os ids sem leitura e "tentar" consulta de novo', async () => {
    const contar = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(new Map([['op-b', 1]]))
    const source = fonte(contar)
    const { result } = renderHook(() => useContagemRecebimentos(source, IDS, 'op'))
    await waitFor(() => expect(result.current.falhou).toBe(true))
    expect(result.current.lidos.size).toBe(0)
    act(() => result.current.tentar())
    await waitFor(() => expect(result.current.lidos.has('op-a')).toBe(true))
    expect(result.current.falhou).toBe(false)
    expect(result.current.contagem.get('op-b')).toBe(1)
  })

  it('resposta de versão já substituída não sobrescreve a nova', async () => {
    let soltarAntiga: (m: Map<string, number>) => void = () => undefined
    const contar = vi.fn()
      .mockImplementationOnce(() => new Promise<Map<string, number>>((r) => { soltarAntiga = r }))
      .mockResolvedValueOnce(new Map([['op-a', 5]]))
    const source = fonte(contar)
    const { result, rerender } = renderHook(({ versao }) => useContagemRecebimentos(source, IDS, 'op', versao), { initialProps: { versao: 0 } })
    rerender({ versao: 1 })
    await waitFor(() => expect(result.current.contagem.get('op-a')).toBe(5))
    await act(async () => soltarAntiga(new Map([['op-a', 9]])))
    expect(result.current.contagem.get('op-a')).toBe(5)
  })

  it('falha tardia de versão já substituída não acende o alerta', async () => {
    let falharAntiga: (e: Error) => void = () => undefined
    const contar = vi.fn()
      .mockImplementationOnce(() => new Promise<Map<string, number>>((_, rej) => { falharAntiga = rej }))
      .mockResolvedValueOnce(new Map([['op-a', 1]]))
    const source = fonte(contar)
    const { result, rerender } = renderHook(({ versao }) => useContagemRecebimentos(source, IDS, 'op', versao), { initialProps: { versao: 0 } })
    rerender({ versao: 1 })
    await waitFor(() => expect(result.current.lidos.has('op-a')).toBe(true))
    await act(async () => falharAntiga(new Error('rede')))
    expect(result.current.falhou).toBe(false)
  })
})
