// @vitest-environment jsdom
import { act, configure, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Row } from '@betinhos/dataverse'
import { MOCK_MANUTENCOES } from './data/mock'
import { createSource } from './data/source'
import { gravarManutencoesNaVisao } from './domain/manutencao'
import { useGeral } from './useGeral'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const make = () => createSource({ mode: 'mock' }, { latency: 0, manutencoes: true })
const manutencoes = (rows: Row[]) => rows.map((r) => String(r.cr40f_id)).filter((c) => c.startsWith('OS-90'))

describe('useGeral › Mostrar manutenções', () => {
  it('a Agenda (programação) já vem com as manutenções, entre os serviços, e a consulta leva o link da manutenção', async () => {
    const source = make()
    const page = vi.fn(source.page)
    const { result } = renderHook(() => useGeral({ ...source, page }))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    expect(result.current.mostrarManutencoes).toBe(true)
    expect(result.current.manutencoesAlteradas).toBe(false)
    expect(page.mock.calls[0][0].fetchxml).toContain('alias="bt_manut"')
    // Ordem da visão (saída crescente): a Agendada atrasada (semana passada) abre a lista, depois a Programada de 3 dias
    // atrás; as da semana que vem (a programar e a sem dados do link) ficam entre os serviços.
    expect(String(result.current.rows[0].cr40f_id)).toBe('OS-9003')
    expect(manutencoes(result.current.rows)).toEqual(['OS-9003', 'OS-9002', 'OS-9001', 'OS-9004'])
  })

  it('desligar tira as manutenções, marca a mudança e vai para a URL; voltar ao da visão limpa', async () => {
    const onStateChange = vi.fn()
    const { result } = renderHook(() => useGeral(make(), { onStateChange }))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    act(() => result.current.setMostrarManutencoes(false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(manutencoes(result.current.rows)).toEqual([]))
    expect(result.current.manutencoesAlteradas).toBe(true)
    expect(onStateChange).toHaveBeenLastCalledWith({ view: 'mock-agenda', manutencoes: false })
    act(() => result.current.resetManutencoes())
    await waitFor(() => expect(result.current.manutencoesAlteradas).toBe(false))
    expect(onStateChange).toHaveBeenLastCalledWith({ view: 'mock-agenda' })
    await waitFor(() => expect(manutencoes(result.current.rows).length).toBe(MOCK_MANUTENCOES))
  })

  it('a visão de faturamento vem desligada; ligar traz as manutenções (não faturáveis) nela', async () => {
    const { result } = renderHook(() => useGeral(make()))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    act(() => result.current.selectView('mock-faturamento'))
    await waitFor(() => expect(result.current.view?.id).toBe('mock-faturamento'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mostrarManutencoes).toBe(false)
    expect(manutencoes(result.current.rows)).toEqual([])
    act(() => result.current.setMostrarManutencoes(true))
    await waitFor(() => expect(manutencoes(result.current.rows).length).toBe(MOCK_MANUTENCOES))
    // Trocar de visão volta ao padrão de cada uma.
    act(() => result.current.selectView('mock-agenda'))
    await waitFor(() => expect(result.current.view?.id).toBe('mock-agenda'))
    expect(result.current.manutencoesAlteradas).toBe(false)
  })

  it('o estado inicial da URL desliga', async () => {
    const { result } = renderHook(() => useGeral(make(), { initial: { manutencoes: false } }))
    await waitFor(() => expect(result.current.view?.padrao).toBe(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mostrarManutencoes).toBe(false)
    expect(result.current.manutencoesAlteradas).toBe(true)
    expect(manutencoes(result.current.rows)).toEqual([])
  })

  it('visão gravada com a marca abre como foi salva, e a marca não vira filtro nem condição só de leitura', async () => {
    const source = make()
    const [agenda] = await source.views()
    const salva = await source.createView({ name: 'Sem manutenções', fetchxml: gravarManutencoesNaVisao(agenda.fetchxml, false), layoutxml: agenda.layoutxml })
    const { result } = renderHook(() => useGeral(source, { initial: { view: salva.id } }))
    await waitFor(() => expect(result.current.view?.id).toBe(salva.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mostrarManutencoes).toBe(false)
    expect(result.current.manutencoesAlteradas).toBe(false)
    expect(result.current.view?.fetchxml).not.toContain('new_categoriadoitem')
    expect(result.current.viewFilters.locked.some((l) => l.label.startsWith('uma destas'))).toBe(false)
    expect(manutencoes(result.current.rows)).toEqual([])
  })

  it('precedência visão → URL: o padrão da visão vale antes de m=, e a URL só leva m quando difere dele', async () => {
    // m=1 na Agenda (já ligada): é o da visão, não é mudança e não volta para a URL.
    const igual = vi.fn()
    const a = renderHook(() => useGeral(make(), { initial: { manutencoes: true }, onStateChange: igual }))
    await waitFor(() => expect(a.result.current.view?.padrao).toBe(true))
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    expect(a.result.current.mostrarManutencoes).toBe(true)
    expect(a.result.current.manutencoesAlteradas).toBe(false)
    await waitFor(() => expect(igual).toHaveBeenCalled())
    expect(igual.mock.calls.every(([estado]) => !('manutencoes' in estado))).toBe(true)
    // m=1 na visão de faturamento (desligada por padrão): difere, vale e vai para a URL.
    const diferente = vi.fn()
    const b = renderHook(() => useGeral(make(), { initial: { view: 'mock-faturamento', manutencoes: true }, onStateChange: diferente }))
    await waitFor(() => expect(b.result.current.view?.id).toBe('mock-faturamento'))
    await waitFor(() => expect(b.result.current.loading).toBe(false))
    expect(b.result.current.mostrarManutencoes).toBe(true)
    expect(b.result.current.manutencoesAlteradas).toBe(true)
    expect(diferente).toHaveBeenLastCalledWith({ view: 'mock-faturamento', manutencoes: true })
    await waitFor(() => expect(manutencoes(b.result.current.rows).length).toBe(MOCK_MANUTENCOES))
  })

  it('a consulta parte do FetchXML sem a marca: a marca gravada não vai duas vezes à consulta', async () => {
    const source = make()
    const [agenda] = await source.views()
    const salva = await source.createView({ name: 'Com manutenções', fetchxml: gravarManutencoesNaVisao(agenda.fetchxml, true), layoutxml: agenda.layoutxml })
    const page = vi.fn(source.page)
    const { result } = renderHook(() => useGeral({ ...source, page }, { initial: { view: salva.id } }))
    await waitFor(() => expect(result.current.view?.id).toBe(salva.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const consulta = page.mock.calls.at(-1)![0].fetchxml
    expect(consulta).toContain('alias="bt_manut"')
    expect(consulta.match(/new_categoriadoitem" operator="eq"/g) ?? []).toEqual([])
    expect(manutencoes(result.current.rows)).toEqual(['OS-9003', 'OS-9002', 'OS-9001', 'OS-9004'])
  })
})
