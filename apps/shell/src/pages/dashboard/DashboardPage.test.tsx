// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { atalho } from './domain/periodo'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const ABAS = ['Resumo', 'Serviços', 'Financeiro', 'Despesas', 'Frota', 'Motoristas', 'Manutenções', 'Multas']

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  history.replaceState(null, '', '#/dashboard')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  history.replaceState(null, '', '#')
})

describe('Dashboard', () => {
  it('abre no Resumo, no mock, com "Este ano": KPIs, alertas, total produzido e meta', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    const abas = screen.getByRole('tablist', { name: 'Abas do dashboard' })
    expect(within(abas).getAllByRole('tab').map((t) => t.textContent)).toEqual(ABAS)
    expect(within(abas).getByRole('tab', { name: 'Resumo' }).getAttribute('aria-selected')).toBe('true')
    // Primeira carga: KPIs ocupados no formato final.
    expect(screen.getByRole('region', { name: 'Indicadores executivos' }).getAttribute('aria-busy')).toBe('true')
    expect(await screen.findByText('Dados de exemplo')).toBeTruthy()
    const painel = await screen.findByRole('tabpanel', { name: 'Resumo' })
    await within(painel).findByRole('region', { name: 'Total produzido' })
    const kpis = within(painel).getByRole('region', { name: 'Indicadores executivos' })
    expect(within(kpis).getByText('Faturamento')).toBeTruthy()
    expect(within(kpis).getAllByRole('article').length).toBe(6)
    expect(within(painel).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Alertas de operação', 'Qualidade dos dados', 'Total produzido', 'Meta × realizado'])
    // Produção, clientes e motoristas foram para as abas próprias; seções numeradas, atalhos e iframe saíram.
    expect(painel.textContent).not.toMatch(/Produção própria|Faturamento por cliente|Serviços por motorista|Top 5 motoristas|Frota e pessoas/)
    expect(screen.queryByRole('navigation', { name: 'Seções do resumo' })).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('button', { name: 'Este ano' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('link', { name: /Abrir dashboard completo/ })).toBeTruthy()
  })

  it('trocar o período para "Mês anterior" recalcula', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Total produzido' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: 'Mês anterior' }))
    expect(screen.getByRole('button', { name: 'Mês anterior' }).getAttribute('aria-pressed')).toBe('true')
    const p = atalho('mesAnt', new Date())
    const br = (d: string) => d.split('-').reverse().join('/')
    expect((await screen.findAllByText(`${br(p.inicio)} a ${br(p.fim)}`, { exact: false })).length).toBeGreaterThan(0)
  })

  it('trocar de aba muda o hash e o painel; filtros e ações valem para todas; voltar ao Resumo limpa o parâmetro', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Total produzido' })
    const abas = screen.getByRole('tablist', { name: 'Abas do dashboard' })

    fireEvent.click(within(abas).getByRole('tab', { name: 'Serviços' }))
    expect(location.hash).toBe('#/dashboard?tab=servicos')
    expect(within(abas).getByRole('tab', { name: 'Serviços' }).getAttribute('aria-selected')).toBe('true')
    const painel = screen.getByRole('tabpanel', { name: 'Serviços' })
    expect(within(painel).getByText('A aba Serviços está em construção')).toBeTruthy()
    // Só a aba ativa é renderizada.
    expect(screen.queryByRole('tabpanel', { name: 'Resumo' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Indicadores executivos' })).toBeNull()
    // Filtros globais e "Abrir dashboard completo" continuam fora do Resumo.
    expect(screen.getByRole('group', { name: 'Período' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir dashboard completo/ })).toBeTruthy()

    fireEvent.click(within(abas).getByRole('tab', { name: 'Financeiro' }))
    expect(location.hash).toBe('#/dashboard?tab=financeiro')
    expect(screen.getByRole('tabpanel', { name: 'Financeiro' })).toBeTruthy()

    fireEvent.click(within(abas).getByRole('tab', { name: 'Resumo' }))
    expect(location.hash).toBe('#/dashboard')
    expect(await screen.findByRole('region', { name: 'Indicadores executivos' })).toBeTruthy()
  })

  it('abre direto na aba do hash e acompanha a navegação; valor desconhecido cai no Resumo', async () => {
    history.replaceState(null, '', '#/dashboard?tab=multas')
    render(<DashboardPage host={{ mode: 'mock' }} />)
    expect(screen.getByRole('tab', { name: 'Multas' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: 'Multas' })).toBeTruthy()
    act(() => {
      history.replaceState(null, '', '#/dashboard?tab=trocas')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('tab', { name: 'Resumo' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('region', { name: 'Indicadores executivos' })).toBeTruthy()
  })
})
