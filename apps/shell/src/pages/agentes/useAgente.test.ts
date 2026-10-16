// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createSource } from './data/source'
import { useAgente } from './useAgente'

describe('useAgente', () => {
  it('carrega a última execução e as propostas do agente', async () => {
    const source = createSource({ mode: 'mock' })
    const { result } = renderHook(() => useAgente(source, 'financeiro'))
    await waitFor(() => expect(result.current.atual?.id).toBe('mock-exec-fin-1'))
    expect(result.current.propostas.map((p) => p.id)).toEqual(['mock-prop-1', 'mock-prop-2', 'mock-prop-3'])
    expect(result.current.historico).toHaveLength(2)
  })
  it('analisar cria a execução e faz polling até concluir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const source = createSource({ mode: 'mock' })
    const { result } = renderHook(() => useAgente(source, 'financeiro'))
    await waitFor(() => expect(result.current.atual).not.toBeNull())
    await act(async () => { await result.current.analisar('teste') })
    expect(result.current.polling).toBe(true)
    // Um act por intervalo: o efeito de polling só reagenda o próximo tick quando o act termina.
    await act(async () => { await vi.advanceTimersByTimeAsync(3500) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3500) })
    await waitFor(() => expect(result.current.atual?.status).toBe('concluida'))
    expect(result.current.polling).toBe(false)
    expect(result.current.propostas[0]?.titulo).toBe('OS-9999 sem recibo')
    vi.useRealTimers()
  })
  it('depois de analisar, o polling não recarrega a execução anterior e termina na nova', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const source = createSource({ mode: 'mock' })
    // criar demora mais que um intervalo de polling: é a janela em que `atual` ainda é a execução concluída anterior.
    const criarOriginal = source.criar
    vi.spyOn(source, 'criar').mockImplementation(async (agente, pergunta) => { await new Promise((r) => setTimeout(r, 3500)); return criarOriginal(agente, pergunta) })
    const buscar = vi.spyOn(source, 'buscar')
    const propostas = vi.spyOn(source, 'propostas')
    const { result } = renderHook(() => useAgente(source, 'financeiro'))
    await waitFor(() => expect(result.current.atual?.id).toBe('mock-exec-fin-1'))
    propostas.mockClear()
    act(() => { void result.current.analisar('') })
    for (let i = 0; i < 4; i++) await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await waitFor(() => expect(result.current.atual?.status).toBe('concluida'))
    expect(result.current.atual?.id).toMatch(/^mock-exec-novo-/)
    expect(result.current.polling).toBe(false)
    expect(buscar.mock.calls.filter(([id]) => id === 'mock-exec-fin-1')).toHaveLength(0)
    expect(propostas.mock.calls.filter(([id]) => id === 'mock-exec-fin-1')).toHaveLength(0)
    vi.useRealTimers()
  })
  it('reaproveita execução em andamento em vez de criar outra', async () => {
    const source = createSource({ mode: 'mock' })
    const criar = vi.spyOn(source, 'criar')
    const { result } = renderHook(() => useAgente(source, 'financeiro'))
    await waitFor(() => expect(result.current.atual).not.toBeNull())
    await act(async () => { await result.current.analisar('') })
    await act(async () => { await result.current.analisar('') })
    expect(criar).toHaveBeenCalledTimes(1)
  })
  it('aprovar executa a ação e grava a decisão; descartar exige motivo', async () => {
    const source = createSource({ mode: 'mock' })
    const exec = vi.spyOn(source, 'executarAcao')
    const { result } = renderHook(() => useAgente(source, 'financeiro'))
    await waitFor(() => expect(result.current.propostas.length).toBe(3))
    await act(async () => { await result.current.aprovar(result.current.propostas[0]) })
    expect(exec).toHaveBeenCalledTimes(1)
    expect(result.current.propostas[0].decisao).toBe('aprovada')
    await expect(result.current.descartar(result.current.propostas[2], '  ')).rejects.toThrow('Informe o motivo do descarte.')
    await act(async () => { await result.current.descartar(result.current.propostas[2], 'já resolvido') })
    expect(result.current.propostas[2].decisao).toBe('descartada')
  })
})
