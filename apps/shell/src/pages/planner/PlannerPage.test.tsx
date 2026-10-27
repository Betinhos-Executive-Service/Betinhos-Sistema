// @vitest-environment jsdom
// Substitui mountApp.test e quoteRoute (parte de rota) do Tela Planner: a tela monta no shell em modo mock
// e os deep links antigos abrem o registro certo.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PlannerPage } from './PlannerPage'

beforeAll(() => {
  if (!('ResizeObserver' in window)) {
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
})
afterEach(() => { cleanup(); localStorage.clear(); history.replaceState(null, '', '#/') })

describe('PlannerPage no shell', () => {
  it('monta em modo mock dentro de .planner-page com a navegação do Planner', async () => {
    history.replaceState(null, '', '#/planner')
    const { container } = render(<PlannerPage />)
    expect(container.querySelector('.planner-page')).not.toBeNull()
    await waitFor(() => expect(screen.getAllByText('Cotações').length).toBeGreaterThan(0), { timeout: 10_000 })
    expect(screen.getAllByText('Tarefas').length).toBeGreaterThan(0)
  })

  it('deep link view=quotes&quoteId abre a cotação', async () => {
    history.replaceState(null, '', '#/planner?view=quotes&quoteId=quote-1008')
    render(<PlannerPage />)
    await waitFor(() => expect(screen.getAllByText(/Transfer executivo · Aeroporto GRU/).length).toBeGreaterThan(0), { timeout: 10_000 })
    await waitFor(() => expect(document.querySelector('[role="dialog"], .quote-v3-drawer, .drawer')).not.toBeNull(), { timeout: 10_000 })
  })

  it('deep link taskId abre o drawer da tarefa', async () => {
    history.replaceState(null, '', '#/planner?taskId=task-1')
    render(<PlannerPage />)
    await waitFor(() => expect(document.querySelector('.task-drawer')).not.toBeNull(), { timeout: 10_000 })
  })
})
