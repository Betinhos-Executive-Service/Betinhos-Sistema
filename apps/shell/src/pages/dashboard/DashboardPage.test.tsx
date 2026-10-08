// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { atalho } from './domain/periodo'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Dashboard', () => {
  it('abre no mock com "Este ano" e mostra as seções', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Dados de exemplo')).toBeTruthy()
    const kpis = await screen.findByRole('region', { name: 'Indicadores executivos' })
    expect(within(kpis).getByText('Faturamento')).toBeTruthy()
    expect(within(kpis).getAllByRole('article').length).toBe(6)
    expect(await screen.findByRole('region', { name: 'Qualidade dos dados' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Operação' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Frota e pessoas' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Total produzido' })).toBeTruthy()
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
})
