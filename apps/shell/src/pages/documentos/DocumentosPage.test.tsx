// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentosPage } from './DocumentosPage'
import { hrefFicha } from './components/PendenciasLista'
import type { Pendencia } from './domain/types'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  window.location.hash = '#/documentos'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Central de documentos', () => {
  it('mostra KPIs de Pessoas, filtra por KPI e troca para Frota', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const vencidos = await screen.findByRole('button', { name: /Vencidos/ })
    expect(within(vencidos).getByText('1')).toBeTruthy()
    fireEvent.click(vencidos)
    await waitFor(() => expect(window.location.hash).toContain('kpi=vencido'))
    expect(screen.getAllByRole('row').some((r) => /Ana/.test(r.textContent ?? '') && /CNH/.test(r.textContent ?? ''))).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Frota' }))
    await waitFor(() => expect(window.location.hash).toContain('aba=frota'))
    expect((await screen.findAllByText('ABC1D23')).length).toBeGreaterThan(0)
  })

  it('filtro de tipo começa em "Todos os tipos", filtra e limpa', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const combo = await screen.findByRole('combobox', { name: 'Tipo de documento' })
    expect(combo.textContent).toContain('Todos os tipos')
    expect(combo.textContent).not.toContain('Selecione')
    fireEvent.click(combo)
    const opcao = await waitFor(() => {
      const el = screen.getAllByText('ASO').map((e) => e.closest('[role="option"]')).find(Boolean)
      if (!el) throw new Error('opção ASO não apareceu')
      return el
    })
    expect(screen.queryAllByRole('option').some((o) => o.textContent === 'Todos os tipos')).toBe(false)
    fireEvent.click(opcao)
    await waitFor(() => expect(window.location.hash).toContain('tipo=t-aso'))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    await waitFor(() => expect(window.location.hash).not.toContain('tipo='))
    expect(screen.getByRole('combobox', { name: 'Tipo de documento' }).textContent).toContain('Todos os tipos')
  })

  it('Renovar abre o drawer do documento', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const linha = (await screen.findAllByRole('row')).find((r) => /Bruno/.test(r.textContent ?? '') && /CNH/.test(r.textContent ?? ''))!
    fireEvent.click(within(linha).getByRole('button', { name: 'Renovar' }))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })

  it('link da ficha: Pessoas abre a seção Documentos do funcionário; Frota abre a ficha do veículo', () => {
    const base = { chave: 'k', tipo: {}, doc: null, estado: 'faltando', dias: null }
    expect(hrefFicha({ ...base, dono: { id: 'f1', categoria: 'pessoas' } } as unknown as Pendencia)).toBe('#/funcionarios?ficha=f1&secao=documentos')
    expect(hrefFicha({ ...base, dono: { id: 'v1', categoria: 'frota' } } as unknown as Pendencia)).toBe('#/frota?ficha=v1')
  })
})
