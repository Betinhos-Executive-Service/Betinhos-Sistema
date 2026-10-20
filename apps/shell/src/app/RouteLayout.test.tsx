// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findItem } from '../nav/menu'
import { RouteLayout } from './RouteLayout'
import { usePrefetchOnIntent } from './routes'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const infracoesCarregada = vi.fn()
vi.mock('../pages/despesas/DespesasPage', () => ({ DespesasPage: () => <p>Tela de despesas</p> }))
vi.mock('../pages/infracoes/InfracoesPage', () => {
  infracoesCarregada()
  return { InfracoesPage: () => <p>Tela de infrações</p> }
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Rota({ id }: { id: string }) {
  const found = findItem(id)!
  return <RouteLayout host={{ mode: 'mock' }} group={found.group} item={found.item} label={found.item.label ?? id} />
}

describe('rotas sob demanda', () => {
  it('mostra o cabeçalho neutro com Skeleton enquanto o chunk da tela chega e depois a tela', async () => {
    render(<Rota id="despesas-operacionais" />)
    expect(screen.getByRole('status', { name: 'Carregando Despesas (App Motoristas)' })).toBeTruthy()
    // Cabeçalho neutro: reserva a altura do PageHeader sem adivinhar o título/eyebrow da tela real.
    expect(screen.getByRole('heading', { level: 1 }).querySelector('.bt-skeleton')).toBeTruthy()
    expect(await screen.findByText('Tela de despesas')).toBeTruthy()
    expect(screen.queryByRole('status', { name: /^Carregando/ })).toBeNull()
  })

  it('passar o mouse num link do menu baixa a tela antes do clique', async () => {
    function Menu() {
      usePrefetchOnIntent()
      return <a href="#/infracoes">Infrações</a>
    }
    render(<Menu />)
    expect(infracoesCarregada).not.toHaveBeenCalled()
    fireEvent.pointerOver(screen.getByText('Infrações'))
    await vi.waitFor(() => expect(infracoesCarregada).toHaveBeenCalledTimes(1))
  })
})

describe('telas legadas (WebResource)', () => {
  it('abre o WebResource com host=shell para a tela recolher a própria barra lateral', () => {
    const found = findItem('new_telaplanner')!
    const host = { mode: 'dataverse', clientUrl: 'https://org.crm2.dynamics.com' } as unknown as Parameters<typeof RouteLayout>[0]['host']
    const { container } = render(<RouteLayout host={host} group={found.group} item={found.item} label="Planner" />)
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://org.crm2.dynamics.com/WebResources/new_TelaPlanner.html?host=shell')
  })
})
