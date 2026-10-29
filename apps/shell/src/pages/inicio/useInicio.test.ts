// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSource } from './data/mock'
import { useInicio } from './useInicio'

beforeEach(() => { window.location.hash = '#/inicio' })

describe('useInicio', () => {
  it('carrega cada visão uma vez (sem laço de render) e reaproveita o cache ao voltar', async () => {
    const source = createMockSource()
    const visao = vi.spyOn(source, 'visao')
    const noticias = vi.spyOn(source, 'noticias')
    const { result } = renderHook(() => useInicio(source))
    await waitFor(() => expect(result.current.dados?.visao).toBe('operacao'))
    await new Promise((r) => setTimeout(r, 50))
    expect(visao).toHaveBeenCalledTimes(1)
    expect(noticias).toHaveBeenCalledTimes(1)

    act(() => result.current.setVisao('gestao'))
    await waitFor(() => expect(result.current.dados?.visao).toBe('gestao'))
    act(() => result.current.setVisao('operacao'))
    await waitFor(() => expect(result.current.dados?.visao).toBe('operacao'))
    expect(visao).toHaveBeenCalledTimes(2)

    act(() => result.current.atualizar())
    await waitFor(() => expect(visao).toHaveBeenCalledTimes(3))
  })

  it('erro parcial: tenta de novo uma vez e mostra o aviso se persistir', async () => {
    const source = createMockSource()
    const base = source.visao
    const visao = vi.spyOn(source, 'visao').mockImplementation(async (v, now) => ({ ...(await base(v, now)), erro: 'reservas indisponível' }))
    const { result } = renderHook(() => useInicio(source))
    await waitFor(() => expect(result.current.erro).toBe('reservas indisponível'))
    expect(visao).toHaveBeenCalledTimes(2)
  })
})
