// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentesPage } from './AgentesPage'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => { vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Assistente', () => {
  it('mostra resumo, propostas por prioridade e histórico', async () => {
    render(<AgentesPage host={{ mode: 'mock' }} agente="financeiro" />)
    expect(await screen.findByText(/Duas OS concluídas sem recibo/)).toBeTruthy()
    const alta = screen.getByRole('region', { name: 'Prioridade alta' })
    expect(within(alta).getByText('OS-1234 sem recibo')).toBeTruthy()
    expect(within(alta).getByText(/Aprovada por Renan Mendonça/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Prioridade média' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Histórico' })).getAllByRole('listitem')).toHaveLength(2)
  })
  it('aprovar mostra a prévia e só grava depois de confirmar', async () => {
    render(<AgentesPage host={{ mode: 'mock' }} agente="financeiro" />)
    const card = (await screen.findByText('OS-1234 sem recibo')).closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Aprovar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aprovar proposta' })
    expect(within(dialog).getByText('Criar a pendência "Emitir recibo da OS-1234" no Planner.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Proposta aprovada.')).toBeTruthy()
    await waitFor(() => expect(within(card).getByText(/Aprovada por Você/)).toBeTruthy())
    expect(within(card).queryByRole('button', { name: 'Aprovar' })).toBeNull()
  })
  it('descartar exige motivo', async () => {
    render(<AgentesPage host={{ mode: 'mock' }} agente="financeiro" />)
    const card = (await screen.findByText('OS-1230 sem OP')).closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Descartar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Descartar proposta' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    expect(await within(dialog).findByText('Informe o motivo do descarte.')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: 'já resolvido' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(within(card).getByText(/Descartada por Você/)).toBeTruthy())
  })
  it('mostra o resumo da última execução de Logística e de Pessoas', async () => {
    render(<AgentesPage host={{ mode: 'mock' }} agente="logistica" />)
    expect(await screen.findByText(/Um serviço sem motorista/)).toBeTruthy()
    render(<AgentesPage host={{ mode: 'mock' }} agente="pessoas" />)
    expect(await screen.findByText(/CNH de um motorista/)).toBeTruthy()
  })
  it('analisar agora mostra o estado de análise e conclui', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<AgentesPage host={{ mode: 'mock' }} agente="pessoas" />)
    await screen.findByText(/CNH de um motorista/)
    fireEvent.change(screen.getByLabelText('Pergunta'), { target: { value: 'quem faz aniversário?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analisar agora' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Analisando'))
    await vi.advanceTimersByTimeAsync(8000)
    expect(await screen.findByText(/Resposta de exemplo para "quem faz aniversário\?"/)).toBeTruthy()
    vi.useRealTimers()
  })
})
