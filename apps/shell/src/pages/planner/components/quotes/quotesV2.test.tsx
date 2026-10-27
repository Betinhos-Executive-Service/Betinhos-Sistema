// @vitest-environment jsdom
// Cotações V2 nas telas: obrigatórios do pedido, "Enviei" direto, motivo de perda em lista e aviso que abre a cotação.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import HybridQuotesView from './HybridQuotesView'
import QuoteCreateDrawer from './QuoteCreateDrawer'
import QuoteManagementDrawer from './QuoteManagementDrawer'
import { NotificationsPanel } from '../NotificationsPanel'
import { saveQuoteViewPreference } from '../../domain/quoteViewPreference'

beforeAll(() => {
  if (!('ResizeObserver' in window)) {
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
})
afterEach(() => { cleanup(); localStorage.clear() })

const option = { id: 'o1', name: 'Sedan', value: '350', items: [] }
const pricedQuote = { id: 'q1', code: 'COT-0001', title: 'GRU', client: 'Tenaris', status: 'Cotada', priority: 'medium', deadline: '2026-10-30', options: [option], proposalVersions: [], modifiedAt: 'm1' }
const sentQuote = { ...pricedQuote, status: 'Respondida ao cliente', responseSent: true, proposalVersions: [{ id: 'v1', sentAt: '2026-10-27T12:00:00.000Z', createdAt: '2026-10-27T12:00:00.000Z', options: [option] }] }

describe('cotações V2 nas telas', () => {
  it('criar exige só solicitante, texto do pedido e prazo', async () => {
    render(<QuoteCreateDrawer employees={[]} onClose={() => {}} onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
    await waitFor(() => expect(screen.getByText('Informe o nome do solicitante.')).toBeTruthy())
    expect(screen.getByText('Informe o texto do pedido.')).toBeTruthy()
    expect(screen.getByText('Escolha o prazo para responder.')).toBeTruthy()
    expect(screen.queryByText('Informe o cliente ou empresa.')).toBeNull()
    expect(screen.queryByText('Informe pelo menos o telefone ou o e-mail.')).toBeNull()
  })

  it('card em Cotada mostra "Enviei" e registra o envio sem diálogo', async () => {
    saveQuoteViewPreference('kanban')
    const onMarkQuoteSent = vi.fn(async () => true)
    render(<HybridQuotesView state={{ quotes: [pricedQuote], tasks: [], employees: [], teams: [] }} onMarkQuoteSent={onMarkQuoteSent} onSelectQuote={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviei' }))
    await waitFor(() => expect(onMarkQuoteSent).toHaveBeenCalledWith('q1', { expectedEtag: undefined, expectedModifiedAt: 'm1' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cotação sem tarefa não mostra o histórico da tarefa', async () => {
    render(<QuoteManagementDrawer quote={sentQuote} employees={[]} teams={[]} onClose={() => {}} onUpdate={vi.fn()} onOutcome={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Propostas enviadas')).toBeTruthy())
    expect(screen.queryByText('Histórico da tarefa')).toBeNull()
  })

  it('Perdida exige motivo da lista', async () => {
    const onOutcome = vi.fn(async () => true)
    render(<QuoteManagementDrawer quote={sentQuote} initialAction="outcome" employees={[]} teams={[]} onClose={() => {}} onUpdate={vi.fn()} onOutcome={onOutcome} />)
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Perdida' })).toBeTruthy())
    fireEvent.click(screen.getByRole('radio', { name: 'Perdida' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.getAllByText('Escolha o motivo da perda.').length).toBeGreaterThan(0))
    expect(onOutcome).not.toHaveBeenCalled()
    expect(screen.getByText('Motivo da perda')).toBeTruthy()
  })

  it('aviso de cotação no sininho abre a cotação', () => {
    const item = { id: 'n1', quoteId: 'q1', taskId: '', type: 'quote_ready', title: 'Preço pronto para enviar', message: 'COT-0001 · GRU', recipientEmployeeId: 'e1', readAt: '' }
    const onOpenContact = vi.fn()
    const onOpenTask = vi.fn()
    render(<NotificationsPanel notifications={[item]} tasks={[]} currentEmployee={{ id: 'e1' }} onClose={() => {}} onOpenTask={onOpenTask} onOpenContact={onOpenContact} onMarkRead={() => {}} onMarkAllRead={() => {}} />)
    fireEvent.click(screen.getByText('Preço pronto para enviar'))
    expect(onOpenContact).toHaveBeenCalledWith(item)
    expect(onOpenTask).not.toHaveBeenCalled()
  })
})
