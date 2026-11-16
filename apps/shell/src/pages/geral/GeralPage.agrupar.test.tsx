// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MOCK_ROW_COUNT } from './data/mock'
import { GeralPage } from './GeralPage'
import { columnMenu, dataRows, FakeObserver, PAGE1, usarAmbienteGeral } from './testUtils'

vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>()))
usarAmbienteGeral()

const toggles = () => screen.getAllByRole('button', { hidden: true }).filter((b) => b.classList.contains('bt-groups__toggle'))
const countOf = (toggle: HTMLElement) => Number(toggle.querySelector('.bt-groups__count')?.textContent)

describe('Geral: agrupar no servidor', () => {
  it('Status de Operação agrupa com a contagem real, abre um grupo com as linhas do servidor e Desagrupar volta', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)

    await columnMenu(/Status de Operação/, 'Agrupar por esta coluna')
    await waitFor(() => expect(toggles().length).toBeGreaterThan(1))
    const groups = toggles()
    // Os grupos somam o total de reservas, não só as 20 linhas da primeira página.
    expect(groups.reduce((sum, g) => sum + countOf(g), 0)).toBe(MOCK_ROW_COUNT)
    expect(groups.every((g) => g.getAttribute('aria-expanded') === 'false')).toBe(true)
    expect(screen.queryAllByRole('button', { name: /^Abrir serviço /, hidden: true }).length).toBe(0)

    const first = groups[0]
    fireEvent.click(first)
    await waitFor(() => expect(first.getAttribute('aria-expanded')).toBe('true'))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Abrir serviço /, hidden: true }).length).toBeGreaterThan(0))
    expect(screen.getAllByRole('button', { name: /^Abrir serviço /, hidden: true }).length).toBe(Math.min(countOf(first), 20))

    await columnMenu(/Status de Operação/, 'Desagrupar')
    await waitFor(() => expect(toggles().length).toBe(0))
    await screen.findAllByText(PAGE1)
    expect(dataRows().length).toBeGreaterThan(1)
  })

  it('fechar um grupo tira as linhas dele da tela e reabrir carrega de novo', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    await columnMenu(/Status de Operação/, 'Agrupar por esta coluna')
    await waitFor(() => expect(toggles().length).toBeGreaterThan(1))

    const first = toggles()[0]
    const opened = () => screen.queryAllByRole('button', { name: /^Abrir serviço /, hidden: true }).length
    fireEvent.click(first)
    await waitFor(() => expect(opened()).toBeGreaterThan(0))
    fireEvent.click(first)
    await waitFor(() => expect(opened()).toBe(0))
    fireEvent.click(first)
    await waitFor(() => expect(opened()).toBeGreaterThan(0))
  })
})
