// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INTERVALO_MS, useDashboard } from './useDashboard'
import type { ConjuntoExtra, ParteExtra, Source } from './data/source'
import { manutencao } from './domain/test-utils'
import type { Dados, Pagante } from './domain/types'

const dados = (n: number): Dados => ({ reservas: [], manutencoes: Array.from({ length: n }, () => manutencao({ dia: '2026-10-01', valor: 1 })), multas: [], ocorrencias: [], funcionarios: [], veiculos: [], viagens: [], eventos: [], telemetria: [], pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], preventivas: { veiculos: [], manutencoes: [], itens: [], baselines: [] }, indisponiveis: [], pendentes: ['pagantes', 'despesas'] })
const pagantes = (n: number): ParteExtra => ({ campos: { pagantes: Array.from({ length: n }, (_, i) => ({ id: `p${i}` }) as Pagante) }, indisponivel: false })
const fonte = (impl: Source['carregar'], extra: Source['carregarExtra'] = async () => pagantes(1)): Source => ({ mock: true, carregar: vi.fn(impl), carregarExtra: vi.fn(extra) })
const PAG: ReadonlySet<ConjuntoExtra> = new Set(['pagantes'])
const NADA: ReadonlySet<ConjuntoExtra> = new Set()
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

  it('sem conjuntos extras só o estágio 1 é consultado e pagantes/despesas ficam pendentes', async () => {
    const s = fonte(async () => dados(1))
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15'))
    await waitFor(() => expect(result.current.dados).not.toBeNull())
    expect(s.carregarExtra).not.toHaveBeenCalled()
    expect(result.current.dados?.pendentes).toEqual(['pagantes', 'despesas'])
    expect(result.current.dados?.pagantes).toEqual([])
  })

  it('aba que usa pagantes carrega só o estágio 2 ao abrir e mescla nos dados', async () => {
    const s = fonte(async () => dados(1), async () => pagantes(3))
    const { result, rerender } = renderHook(({ extras }) => useDashboard(s, '2024-01-01', '2026-10-15', { conjuntosExtras: extras }), { initialProps: { extras: NADA } })
    await waitFor(() => expect(result.current.dados).not.toBeNull())
    rerender({ extras: PAG })
    await waitFor(() => expect(result.current.dados?.pagantes).toHaveLength(3))
    expect(result.current.dados?.pendentes).toEqual(['despesas'])
    expect(result.current.dados?.manutencoes).toHaveLength(1)
    expect(s.carregar).toHaveBeenCalledTimes(1)
    expect(s.carregarExtra).toHaveBeenCalledTimes(1)
    expect(s.carregarExtra).toHaveBeenCalledWith('pagantes', '2024-01-01', '2026-10-15')
  })

  it('aba aberta já na carga: os dois estágios saem juntos', async () => {
    const s = fonte(() => new Promise<Dados>(() => undefined))
    renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15', { conjuntosExtras: PAG }))
    expect(s.carregar).toHaveBeenCalledTimes(1)
    expect(s.carregarExtra).toHaveBeenCalledTimes(1)
  })

  it('recarga de 60 s só refaz o estágio 2 com a aba que o usa ativa; os dados carregados ficam', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let n = 0
    const s = fonte(async () => dados(1), async () => pagantes(++n))
    const { result, rerender } = renderHook(({ extras }) => useDashboard(s, '2024-01-01', '2026-10-15', { conjuntosExtras: extras }), { initialProps: { extras: PAG } })
    await waitFor(() => expect(result.current.dados?.pagantes).toHaveLength(1))
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    await waitFor(() => expect(result.current.dados?.pagantes).toHaveLength(2))
    expect(s.carregarExtra).toHaveBeenCalledTimes(2)
    rerender({ extras: NADA })
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    await waitFor(() => expect(s.carregar).toHaveBeenCalledTimes(3))
    expect(s.carregarExtra).toHaveBeenCalledTimes(2)
    expect(result.current.dados?.pagantes).toHaveLength(2)
    expect(result.current.dados?.pendentes).toEqual(['despesas'])
    // Volta à aba com o estágio 2 velho (> 60 s): atualiza em segundo plano, sem esqueleto.
    rerender({ extras: PAG })
    expect(result.current.dados?.pendentes).toEqual(['despesas'])
    await waitFor(() => expect(result.current.dados?.pagantes).toHaveLength(3))
  })

  it('resposta antiga do estágio 2 não sobrescreve a nova', async () => {
    const pendentes: ((p: ParteExtra) => void)[] = []
    const s = fonte(async () => dados(1), () => new Promise<ParteExtra>((resolve) => pendentes.push(resolve)))
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15', { conjuntosExtras: PAG }))
    await waitFor(() => expect(result.current.dados).not.toBeNull())
    await act(async () => { void result.current.atualizar() })
    expect(s.carregarExtra).toHaveBeenCalledTimes(2)
    await act(async () => { pendentes[1](pagantes(4)) })
    await act(async () => { pendentes[0](pagantes(8)) })
    expect(result.current.dados?.pagantes).toHaveLength(4)
  })

  it('troca de janela descarta o estágio 2 da janela anterior e recarrega o da aba ativa', async () => {
    const respostas = new Map<string, (p: ParteExtra) => void>()
    const s = fonte(async () => dados(1), (_c, _d, ate) => new Promise<ParteExtra>((resolve) => { respostas.set(ate, resolve) }))
    const { result, rerender } = renderHook(({ ate }) => useDashboard(s, '2024-01-01', ate, { conjuntosExtras: PAG }), { initialProps: { ate: '2026-10-15' } })
    await act(async () => { respostas.get('2026-10-15')?.(pagantes(5)) })
    await waitFor(() => expect(result.current.dados?.pagantes).toHaveLength(5))
    rerender({ ate: '2026-09-30' })
    await waitFor(() => expect(result.current.dados).not.toBeNull())
    expect(result.current.dados?.pendentes).toEqual(['pagantes', 'despesas'])
    expect(result.current.dados?.pagantes).toEqual([])
    await act(async () => { respostas.get('2026-09-30')?.(pagantes(2)) })
    expect(result.current.dados?.pagantes).toHaveLength(2)
  })

  it('estágio 2 que falha vira indisponível (s/dado), não pendente', async () => {
    const s = fonte(async () => dados(1), async () => { throw new Error('sem permissão') })
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15', { conjuntosExtras: PAG }))
    await waitFor(() => expect(result.current.dados?.indisponiveis).toContain('pagantes'))
    expect(result.current.dados?.pendentes).toEqual(['despesas'])
    expect(result.current.erro).toBeNull()
  })
})
