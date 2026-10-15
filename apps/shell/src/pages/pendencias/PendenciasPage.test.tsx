// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendenciasPage } from './PendenciasPage'

const falhaAplicar = vi.hoisted(() => ({ on: false }))
vi.mock('./data/source', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./data/source')>()
  return {
    ...mod,
    createSource: (host: Parameters<typeof mod.createSource>[0]) => {
      const s = mod.createSource(host)
      return { ...s, sincronizar: (id: string, modo: 'simular' | 'aplicar') => (falhaAplicar.on && modo === 'aplicar' ? Promise.reject(new Error('Falha na Custom API')) : s.sincronizar(id, modo)) }
    },
  }
})

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  falhaAplicar.on = false
  window.location.hash = '#/pendencias'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const rows = () => document.querySelectorAll('.pg-open').length

describe('Pendências', () => {
  it('mostra as 5 pendências do mock e filtra pela visão Rateio', async () => {
    render(<PendenciasPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-501')
    expect(rows()).toBe(5)
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    await waitFor(() => expect(screen.getAllByText('Rateio').length).toBeGreaterThan(1))
    fireEvent.click(screen.getAllByText('Rateio').find((el) => !el.closest('.bt-button'))!)
    await waitFor(() => expect(rows()).toBe(1))
    expect(screen.getByText('OP-505')).toBeTruthy()
  })

  it('fecha o mês do tipo 4: confirma, avisa e a pendência some', async () => {
    render(<PendenciasPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-501')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar mês' }))
    const dialog = await screen.findByRole('dialog', { name: 'Fechar mês?' })
    expect(within(dialog).getByText('RES-741')).toBeTruthy()
    expect(within(dialog).getByText('RES-742')).toBeTruthy()
    expect(within(dialog).getByText('Construtora Horizonte')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar mês' }))
    await screen.findByText('OP criada com 2 serviço(s).')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Fechar mês' })).toBeNull())
    await waitFor(() => expect(rows()).toBe(4))
  })

  it('abre a ficha da pendência', async () => {
    render(<PendenciasPage host={{ mode: 'mock' }} />)
    fireEvent.click((await screen.findByText('OP-501')).closest('button')!)
    const ficha = await screen.findByRole('dialog', { name: 'OP-501' })
    expect(within(ficha).getByText('RES-701')).toBeTruthy()
    expect(within(ficha).getByRole('button', { name: 'Corrigir' })).toBeTruthy()
  })

  it('corrige com prévia e confirmação; a linha some após a recarga', async () => {
    render(<PendenciasPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-501')
    fireEvent.click(screen.getAllByRole('button', { name: 'Corrigir' })[0])
    const dialog = await screen.findByRole('dialog', { name: /Corrigir OP-501/ })
    expect(await within(dialog).findByText('Serviço RES-701: Pendente → Pago')).toBeTruthy()
    expect(within(dialog).getByText('Composição: Pendente → Concluída')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar correção' }))
    expect(await screen.findByText('2 alterações aplicadas.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('OP-501')).toBeNull())
  })

  it('erro ao aplicar mostra a mensagem e mantém o diálogo aberto', async () => {
    falhaAplicar.on = true
    render(<PendenciasPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-501')
    fireEvent.click(screen.getAllByRole('button', { name: 'Corrigir' })[0])
    const dialog = await screen.findByRole('dialog', { name: /Corrigir OP-501/ })
    await within(dialog).findByText('Composição: Pendente → Concluída')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar correção' }))
    expect(await within(dialog).findByText('Falha na Custom API')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: /Corrigir OP-501/ })).toBeTruthy()
  })
})
