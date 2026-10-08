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
    expect(await screen.findByText('Qualidade dos dados')).toBeTruthy()
    expect(screen.getByText('Total produzido')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir dashboard completo/ })).toBeTruthy()
  })

  it('trocar o período para "Mês anterior" recalcula', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Indicadores executivos' })
    fireEvent.click(screen.getByRole('combobox', { name: 'Período' }))
    fireEvent.click(await screen.findByText('Mês anterior'))
    const p = atalho('mesAnt', new Date())
    const br = (d: string) => d.split('-').reverse().join('/')
    expect((await screen.findAllByText(`${br(p.inicio)} a ${br(p.fim)}`, { exact: false })).length).toBeGreaterThan(0)
  })
})
