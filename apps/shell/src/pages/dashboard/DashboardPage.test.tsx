// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { atalho } from './domain/periodo'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  history.replaceState(null, '', '#/dashboard')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, '', '#') })

describe('Dashboard', () => {
  it('abre no mock com "Este ano" e mostra as seções', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    // Primeira carga: Indicadores e Alertas no formato final, ocupados.
    expect(screen.getByRole('region', { name: 'Indicadores' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('region', { name: 'Alertas' }).getAttribute('aria-busy')).toBe('true')
    expect(await screen.findByText('Dados de exemplo')).toBeTruthy()
    expect(await screen.findByRole('region', { name: 'Total produzido' })).toBeTruthy()
    const kpis = screen.getByRole('region', { name: 'Indicadores executivos' })
    expect(within(kpis).getByText('Faturamento')).toBeTruthy()
    expect(within(kpis).getAllByRole('article').length).toBe(6)
    expect(await screen.findByRole('region', { name: 'Qualidade dos dados' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Operação' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Frota e pessoas' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Top 5 motoristas próprios' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Este ano' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('link', { name: /Abrir dashboard completo/ })).toBeTruthy()
  })

  it('trocar o período para "Mês anterior" recalcula', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Indicadores executivos' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: 'Mês anterior' }))
    expect(screen.getByRole('button', { name: 'Mês anterior' }).getAttribute('aria-pressed')).toBe('true')
    const p = atalho('mesAnt', new Date())
    const br = (d: string) => d.split('-').reverse().join('/')
    expect((await screen.findAllByText(`${br(p.inicio)} a ${br(p.fim)}`, { exact: false })).length).toBeGreaterThan(0)
  })

  it('Resumo em sete seções numeradas; a barra de atalhos rola até a seção e marca a ativa', async () => {
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Total produzido' })
    const titulos = ['Indicadores', 'Alertas', 'Produção', 'Faturamento', 'Clientes', 'Frota', 'Motoristas']
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(titulos.map((t, i) => `${i + 1}${t}`))
    const secao = (nome: string) => screen.getByRole('region', { name: nome })
    expect(within(secao('Alertas')).getByRole('region', { name: 'Operação' })).toBeTruthy()
    expect(within(secao('Produção')).getByRole('region', { name: 'Serviços emergenciais' })).toBeTruthy()
    expect(within(secao('Faturamento')).getByRole('region', { name: 'Meta × realizado' })).toBeTruthy()
    expect(within(secao('Clientes')).getByRole('region', { name: 'Faturamento por cliente' })).toBeTruthy()
    expect(within(secao('Frota')).getByRole('region', { name: 'Custo frota — manutenções' })).toBeTruthy()
    expect(within(secao('Frota')).getByRole('region', { name: 'Manutenções · Multas · Frota ativa' })).toBeTruthy()
    expect(within(secao('Motoristas')).getByRole('region', { name: 'Serviços por motorista' })).toBeTruthy()

    const nav = screen.getByRole('navigation', { name: 'Seções do resumo' })
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(titulos.map((t, i) => `${i + 1}${t}`))
    expect(within(nav).getByRole('button', { name: 'Indicadores' }).getAttribute('aria-current')).toBe('location')
    const clientes = within(nav).getByRole('button', { name: 'Clientes' })
    expect(clientes.getAttribute('aria-controls')).toBe('dash-secao-clientes')
    fireEvent.click(clientes)
    expect(rolar).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(rolar.mock.contexts[0]).toBe(document.getElementById('dash-secao-clientes'))
    expect(clientes.getAttribute('aria-current')).toBe('location')
    expect(within(nav).getByRole('button', { name: 'Indicadores' }).getAttribute('aria-current')).toBeNull()
    expect(document.activeElement).toBe(within(secao('Clientes')).getByRole('heading', { level: 2 }))
  })

  it('abas do dashboard antigo: Serviços no mock avisa que abre no Dataverse, guarda a aba no hash e volta ao Resumo', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Indicadores executivos' })
    const abas = screen.getByRole('tablist', { name: 'Abas do dashboard' })
    expect(within(abas).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumo', 'Serviços', 'Faturamento', 'Pagamentos', 'Despesas', 'Frota', 'Motoristas', 'Manutenções', 'Multas', 'Trocas', 'Marketing'])
    expect(within(abas).getByRole('tab', { name: 'Resumo' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.click(within(abas).getByRole('tab', { name: 'Serviços' }))
    expect(location.hash).toBe('#/dashboard?tab=servicos')
    expect(within(abas).getByRole('tab', { name: 'Serviços' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Esta aba abre dentro do Dataverse')).toBeTruthy()
    expect(screen.getByText('new_dashboard?tab=servicos')).toBeTruthy()
    // Filtros e indicadores pertencem ao Resumo.
    expect(screen.queryByRole('group', { name: 'Período' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Indicadores executivos' })).toBeNull()

    fireEvent.click(within(abas).getByRole('tab', { name: 'Faturamento' }))
    expect(location.hash).toBe('#/dashboard?tab=financeiro')

    fireEvent.click(within(abas).getByRole('tab', { name: 'Resumo' }))
    expect(location.hash).toBe('#/dashboard')
    expect(await screen.findByRole('region', { name: 'Indicadores executivos' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Período' })).toBeTruthy()
  })

  it('abre direto na aba do hash e acompanha a navegação', async () => {
    history.replaceState(null, '', '#/dashboard?tab=multas')
    render(<DashboardPage host={{ mode: 'mock' }} />)
    expect(screen.getByRole('tab', { name: 'Multas' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('new_dashboard?tab=multas')).toBeTruthy()
    act(() => {
      history.replaceState(null, '', '#/dashboard?tab=inexistente')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('tab', { name: 'Resumo' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('region', { name: 'Indicadores executivos' })).toBeTruthy()
  })
})
