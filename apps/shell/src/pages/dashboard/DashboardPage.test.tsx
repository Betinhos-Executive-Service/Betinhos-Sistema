// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { ABAS_POR_SERVICO, avisoSegmento } from './components/abas/abas'
import { atalho } from './domain/periodo'
import type { Filtros } from './domain/types'

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
    expect(screen.getByRole('combobox', { name: 'Período' }).textContent).toContain('Este ano')
    // O dashboard antigo (legado) segue como modo TV.
    expect(screen.getByRole('link', { name: /Abrir modo TV/ }).getAttribute('href')).toContain('new_dashboard')
  })

  it('trocar o período para "Mês anterior" recalcula', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Total produzido' })
    fireEvent.click(screen.getByRole('combobox', { name: 'Período' }))
    fireEvent.click(await screen.findByText('Mês anterior'))
    expect(screen.getByRole('combobox', { name: 'Período' }).textContent).toContain('Mês anterior')
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
    expect(within(painel).getByRole('region', { name: 'Indicadores de serviços' })).toBeTruthy()
    // Só a aba ativa é renderizada.
    expect(screen.queryByRole('tabpanel', { name: 'Resumo' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Indicadores executivos' })).toBeNull()
    // Filtros globais e "Abrir modo TV" continuam fora do Resumo.
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeTruthy()
    // O dashboard antigo (legado) segue como modo TV.
    expect(screen.getByRole('link', { name: /Abrir modo TV/ }).getAttribute('href')).toContain('new_dashboard')

    fireEvent.click(within(abas).getByRole('tab', { name: 'Financeiro' }))
    expect(location.hash).toBe('#/dashboard?tab=financeiro')
    expect(within(screen.getByRole('tabpanel', { name: 'Financeiro' })).getByRole('region', { name: 'Indicadores financeiros' })).toBeTruthy()

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

  it('o painel fica ligado à aba ativa pelos ids do Tabs (aria-controls ↔ id, aria-labelledby ↔ aba)', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Total produzido' })
    const abas = screen.getByRole('tablist', { name: 'Abas do dashboard' })
    for (const nome of ['Resumo', 'Frota']) {
      fireEvent.click(within(abas).getByRole('tab', { name: nome }))
      const aba = within(abas).getByRole('tab', { name: nome })
      const painel = screen.getByRole('tabpanel', { name: nome })
      expect(painel.id).toBeTruthy()
      expect(aba.getAttribute('aria-controls')).toBe(painel.id)
      expect(painel.getAttribute('aria-labelledby')).toBe(aba.id)
    }
  })

  it('o filtro Próprios/Terceiros do ranking de motoristas sobrevive à troca de aba', async () => {
    history.replaceState(null, '', '#/dashboard?tab=motoristas')
    render(<DashboardPage host={{ mode: 'mock' }} />)
    const terceiros = await screen.findByRole('radio', { name: 'Terceiros' })
    fireEvent.click(terceiros)
    expect(screen.getByRole('radio', { name: 'Terceiros' }).getAttribute('aria-checked')).toBe('true')
    const abas = screen.getByRole('tablist', { name: 'Abas do dashboard' })
    fireEvent.click(within(abas).getByRole('tab', { name: 'Multas' }))
    expect(screen.queryByRole('radio', { name: 'Terceiros' })).toBeNull()
    fireEvent.click(within(abas).getByRole('tab', { name: 'Motoristas' }))
    expect(screen.getByRole('radio', { name: 'Terceiros' }).getAttribute('aria-checked')).toBe('true')
  })

  it('drill-down: KPI, alerta e linha do ranking abrem o Drawer com a lista; fecha pelo X', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Total produzido' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver serviços de CP pendente' }))
    const drawer = screen.getByRole('dialog', { name: 'CP pendente' })
    const valorKpi = within(screen.getByRole('article', { name: 'CP pendente' })).getByText(/^R\$/).textContent
    // Resumo do Drawer: quantidade e a mesma soma do card (moeda curta no card, cheia no Drawer).
    expect(within(drawer).getByText(/serviços? · R\$/)).toBeTruthy()
    expect(valorKpi).toBeTruthy()
    expect(within(drawer).getAllByRole('row').length).toBeGreaterThan(1)
    // Modo exemplo: sem link para o Dataverse.
    expect(within(drawer).queryByRole('link', { name: /Abrir no Dataverse/ })).toBeNull()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar painel' }))
    expect(screen.queryByRole('dialog', { name: 'CP pendente' })).toBeNull()
    const cnh = screen.queryByRole('button', { name: 'Ver lista de CNH' })
    if (cnh) {
      fireEvent.click(cnh)
      expect(screen.getByRole('dialog', { name: 'CNH em atenção' })).toBeTruthy()
    }
    const abas = screen.getByRole('tablist', { name: 'Abas do dashboard' })
    fireEvent.click(within(abas).getByRole('tab', { name: 'Motoristas' }))
    const [primeiro] = await screen.findAllByRole('button', { name: /: ver serviços$/ })
    fireEvent.click(primeiro)
    expect(screen.getByRole('dialog', { name: /^Serviços de / })).toBeTruthy()
  })

  it('na primeira carga, cada aba mostra KPIs e blocos ocupados no mesmo padrão', () => {
    history.replaceState(null, '', '#/dashboard?tab=frota')
    render(<DashboardPage host={{ mode: 'mock' }} />)
    const kpis = screen.getByRole('region', { name: 'Indicadores da frota' })
    expect(kpis.getAttribute('aria-busy')).toBe('true')
    expect(within(kpis).getAllByText('Carregando')).toHaveLength(5)
    expect(document.querySelectorAll('.dash-grade[aria-hidden="true"] .dash-card')).toHaveLength(4)
  })
})

describe('filtros de segmento por aba', () => {
  const f = (p: Partial<Filtros> = {}): Filtros => ({ atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p })

  it('"Nenhum serviço para estes filtros" só nas abas que respondem aos segmentos', () => {
    expect([...ABAS_POR_SERVICO]).toEqual(['resumo', 'servicos', 'financeiro', 'motoristas'])
  })

  it('nas demais, uma linha diz quais segmentos não valem ali; sem segmento, nada', () => {
    for (const aba of ['despesas', 'frota', 'manutencoes', 'multas'] as const) expect(avisoSegmento(aba, f())).toBeNull()
    for (const aba of ['resumo', 'servicos', 'financeiro', 'motoristas'] as const) expect(avisoSegmento(aba, f({ clientes: ['Tenaris'] }))).toBeNull()
    expect(avisoSegmento('despesas', f({ clientes: ['Tenaris'] }))).toBe('Status, cliente e tipo de veículo não se aplicam a esta aba.')
    // Nas despesas o motorista vale (filtro global): sozinho, não há aviso.
    expect(avisoSegmento('despesas', f({ motoristas: ['m1'] }))).toBeNull()
    expect(avisoSegmento('multas', f({ motoristas: ['m1'] }))).toBe('Status, cliente, motorista e tipo de veículo não se aplicam a esta aba.')
    expect(avisoSegmento('manutencoes', f({ status: ['Concluído'] }))).toMatch(/exceto no % da receita/)
    expect(avisoSegmento('frota', f({ tipos: ['Van'] }))).toMatch(/KPIs do cadastro/)
  })
})
