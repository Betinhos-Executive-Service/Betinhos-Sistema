// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INTERVALO_MS, useDashboard } from './useDashboard'
import type { Source } from './data/source'
import type { Dados } from './domain/types'

const dados = (n: number): Dados => ({ reservas: [], manutencoes: Array.from({ length: n }, () => ({ dia: '2026-10-01', valor: 1 })), multas: [], ocorrencias: [], funcionarios: [], veiculos: [], viagens: [], eventos: [], telemetria: [], indisponiveis: [] })
const fonte = (impl: Source['carregar']): Source => ({ mock: true, carregar: vi.fn(impl) })
const visibilidade = (estado: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true })

afterEach(() => { vi.useRealTimers(); visibilidade('visible') })

describe('useDashboard', () => {
  it('carrega e refaz a consulta a cada 60 s só com a aba visível', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let n = 0
    const s = fonte(async () => dados(++n))
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15'))
    await waitFor(() => expect(result.current.dados?.manutencoes).toHaveLength(1))
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    await waitFor(() => expect(result.current.dados?.manutencoes).toHaveLength(2))
    visibilidade('hidden')
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    expect(s.carregar).toHaveBeenCalledTimes(2)
  })

  it('resposta antiga não sobrescreve a nova e troca de janela zera os dados', async () => {
    const pendentes: ((d: Dados) => void)[] = []
    const s = fonte(() => new Promise<Dados>((resolve) => pendentes.push(resolve)))
    const { result, rerender } = renderHook(({ ate }) => useDashboard(s, '2024-01-01', ate), { initialProps: { ate: '2026-10-15' } })
    rerender({ ate: '2026-09-30' })
    expect(result.current.dados).toBeNull()
    await act(async () => { pendentes[1](dados(5)) })
    await act(async () => { pendentes[0](dados(9)) })
    expect(result.current.dados?.manutencoes).toHaveLength(5)
  })

  it('carga em andamento por mais de 60 s não é cancelada nem empilhada pelo relógio', async () => {
    vi.useFakeTimers()
    let resolver: (d: Dados) => void = () => undefined
    const s = fonte(() => new Promise<Dados>((resolve) => { resolver = resolve }))
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15'))
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    expect(s.carregar).toHaveBeenCalledTimes(1)
    await act(async () => { resolver(dados(3)) })
    expect(result.current.dados?.manutencoes).toHaveLength(3)
    expect(result.current.carregando).toBe(false)
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    expect(s.carregar).toHaveBeenCalledTimes(2)
  })

  it('"Atualizar" substitui a carga em andamento', async () => {
    const pendentes: ((d: Dados) => void)[] = []
    const s = fonte(() => new Promise<Dados>((resolve) => pendentes.push(resolve)))
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15'))
    await act(async () => { void result.current.atualizar() })
    expect(s.carregar).toHaveBeenCalledTimes(2)
    await act(async () => { pendentes[1](dados(2)) })
    await act(async () => { pendentes[0](dados(7)) })
    expect(result.current.dados?.manutencoes).toHaveLength(2)
  })

  it('erro mantém a mensagem e permite tentar de novo', async () => {
    let falhar = true
    const s = fonte(async () => { if (falhar) throw new Error('Sem conexão'); return dados(1) })
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15'))
    await waitFor(() => expect(result.current.erro).toBe('Sem conexão'))
    falhar = false
    await act(async () => { await result.current.atualizar() })
    expect(result.current.erro).toBeNull()
    expect(result.current.dados).not.toBeNull()
  })
})
