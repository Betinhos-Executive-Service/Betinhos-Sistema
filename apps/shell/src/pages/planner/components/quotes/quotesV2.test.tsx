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
  it('criar exige só solicitante, texto do pedido e prazo, um por passo', async () => {
    render(<QuoteCreateDrawer employees={[]} onClose={() => {}} onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    await waitFor(() => expect(screen.getByText('Informe o nome do solicitante.')).toBeTruthy())
    expect(screen.queryByText('Informe o texto do pedido.')).toBeNull()
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

  it('Enviei depois de salvar a edição não reaproveita a versão anterior ao salvamento', async () => {
    const quote = { ...pricedQuote, clientContact: 'Walter', notes: 'GRU → Centro', etag: 'W/"1"' }
    const onUpdate = vi.fn(async () => true)
    const onMarkSent = vi.fn(async (_id: string, _request: Record<string, unknown>) => true)
    const { container } = render(<QuoteManagementDrawer quote={quote} employees={[]} teams={[]} onClose={() => {}} onUpdate={onUpdate} onMarkSent={onMarkSent} onOutcome={vi.fn()} />)
    fireEvent.change(container.querySelector('#quote-notes')!, { target: { value: 'GRU → Centro, 2 malas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviei ao cliente' }))
    await waitFor(() => expect(onMarkSent).toHaveBeenCalled())
    expect(onUpdate).toHaveBeenCalled()
    const request = onMarkSent.mock.calls[0][1]
    expect(request.expectedEtag).toBeUndefined()
    expect(request.expectedModifiedAt).toBeUndefined()
  })

  it('Enviei sem edição mantém a checagem de versão', async () => {
    const quote = { ...pricedQuote, clientContact: 'Walter', notes: 'GRU → Centro', etag: 'W/"1"' }
    const onUpdate = vi.fn(async () => true)
    const onMarkSent = vi.fn(async (_id: string, _request: Record<string, unknown>) => true)
    render(<QuoteManagementDrawer quote={quote} employees={[]} teams={[]} onClose={() => {}} onUpdate={onUpdate} onMarkSent={onMarkSent} onOutcome={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviei ao cliente' }))
    await waitFor(() => expect(onMarkSent).toHaveBeenCalled())
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onMarkSent.mock.calls[0][1]).toMatchObject({ expectedEtag: 'W/"1"', expectedModifiedAt: 'm1' })
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

describe('cotações V2.1 nas telas', () => {
  const analysis = { ...pricedQuote, status: 'Em análise pelo financeiro', options: [], notes: 'GRU', clientContact: 'Walter' }
  const attachments = { get: () => ({ items: [], loading: false, error: '' }), ensure: vi.fn(async () => {}), add: vi.fn(async () => 0), remove: vi.fn(async () => {}) }

  it('criação não oferece "Aguardar informação"', () => {
    render(<QuoteCreateDrawer employees={[]} onClose={() => {}} onCreate={vi.fn()} />)
    expect(screen.queryByText(/Aguardar informação/)).toBeNull()
  })

  it('edição pede o que falta, de quem e retorno (padrão +2 dias úteis) e grava junto com o status', async () => {
    const onUpdate = vi.fn(async () => true)
    render(<QuoteManagementDrawer quote={analysis} onUpdate={onUpdate} onClose={() => {}} quoteAttachments={attachments} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aguardar informação' }))
    const date = screen.getByLabelText(/Data de retorno/) as HTMLInputElement
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    fireEvent.click(screen.getByRole('button', { name: 'Aguardar' }))
    expect(await screen.findByText('Informe o que falta.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/O que falta/), { target: { value: 'Horário do voo' } })
    fireEvent.change(screen.getByLabelText(/De quem/), { target: { value: 'Walter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aguardar' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('q1', expect.objectContaining({ status: 'Aguardando informação', waitingFor: 'Horário do voo', waitingFrom: 'Walter', waitingReturnDate: date.value })))
  })

  it('carrega os anexos da cotação ao abrir', () => {
    render(<QuoteManagementDrawer quote={analysis} onUpdate={vi.fn()} onClose={() => {}} quoteAttachments={attachments} />)
    expect(attachments.ensure).toHaveBeenCalledWith('q1')
  })

  it('sininho rotula o lembrete de retorno', () => {
    const notification = { id: 'n1', quoteId: 'q1', type: 'quote_waiting_return', title: 'Retorno de informação', message: 'COT-0001 · GRU', occurredAt: new Date().toISOString(), readAt: '', recipientEmployeeId: 'e1' }
    render(<NotificationsPanel notifications={[notification]} tasks={[]} contacts={[]} employees={[]} teams={[]} currentEmployee={{ id: 'e1' }} onClose={() => {}} onOpenTask={() => {}} onOpenQuote={() => {}} onMarkRead={() => {}} onMarkAllRead={() => {}} />)
    expect(screen.getAllByText('Retorno de informação').length).toBeGreaterThan(0)
  })
})

describe('cotações V2.2 nas telas', () => {
  // O passo 1 usa o solicitante livre (o cadastrado vem do Dataverse).
  const typeRequester = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Digitar solicitante livre' }))
    fireEvent.change(document.querySelector('#quote-contact')!, { target: { value: name } })
  }

  it('criação em 3 passos não salva antes do terceiro e Voltar preserva os valores', async () => {
    const onCreate = vi.fn(async () => true)
    render(<QuoteCreateDrawer employees={[]} onClose={() => {}} onCreate={onCreate} />)
    expect(screen.getByText('Passo 1 de 3')).toBeTruthy()
    typeRequester('Walter')
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(await screen.findByText('Passo 2 de 3')).toBeTruthy()
    fireEvent.change(document.querySelector('#quote-notes')!, { target: { value: 'GRU → Centro' } })
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(await screen.findByText('Passo 1 de 3')).toBeTruthy()
    expect((document.querySelector('#quote-contact') as HTMLInputElement).value).toBe('Walter')
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    expect((await screen.findByLabelText(/Pedido do cliente/) as HTMLTextAreaElement).value).toBe('GRU → Centro')
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(await screen.findByText('Passo 3 de 3')).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar cotação' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate.mock.calls[0]).toEqual([expect.objectContaining({ clientContact: 'Walter', notes: 'GRU → Centro', status: 'Nova' })])
  })

  it('opcionais ficam recolhidos em "Adicionar detalhes"', () => {
    render(<QuoteCreateDrawer employees={[]} onClose={() => {}} onCreate={vi.fn()} />)
    const details = screen.getByText('Adicionar detalhes').closest('details')!
    expect(details.open).toBe(false)
    expect(details.querySelector('#quote-email')).toBeTruthy()
  })

  const base = { ...pricedQuote, clientContact: 'Walter', notes: 'GRU' }
  const primaryButtons = () => [...document.querySelectorAll('.quote-current-step .button-primary')].map((button) => button.textContent)
  it.each([
    ['Nova', ['Começar a cotar']],
    ['Em análise pelo financeiro', ['Salvar preços']],
    ['Cotada', ['Enviei ao cliente']],
    ['Respondida ao cliente', ['Cliente aceitou']],
    ['Aguardando informação', ['Registrar retorno']],
  ])('drawer em %s mostra um só botão principal', (status, expected) => {
    const quote = status === 'Respondida ao cliente' ? { ...sentQuote, clientContact: 'Walter', notes: 'GRU' } : { ...base, status, waitingFor: 'Voo', waitingFrom: 'Walter', waitingReturnDate: '2026-10-30' }
    render(<QuoteManagementDrawer quote={quote} employees={[]} teams={[]} onClose={() => {}} onUpdate={vi.fn()} onOutcome={vi.fn()} />)
    expect(primaryButtons()).toEqual(expected)
    expect(screen.getByText('Ver detalhes').closest('details')!.open).toBe(false)
  })

  it('Respondida oferece "Perdida" que abre o motivo em lista', async () => {
    render(<QuoteManagementDrawer quote={sentQuote} employees={[]} teams={[]} onClose={() => {}} onUpdate={vi.fn()} onOutcome={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Perdida' }))
    expect(await screen.findByText('Motivo da perda')).toBeTruthy()
  })
})
