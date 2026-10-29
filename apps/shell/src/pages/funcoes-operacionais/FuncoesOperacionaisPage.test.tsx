// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FuncoesOperacionaisPage } from './FuncoesOperacionaisPage'
import { MOCK_SWAP_ID } from './data/mock'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  // 06:00 local: a troca semeada (13:00–13:40 de hoje) está ativa e todos os serviços do dia ainda vão sair.
  vi.useFakeTimers({ toFake: ['Date'] })
  const morning = new Date()
  morning.setHours(6, 0, 0, 0)
  vi.setSystemTime(morning)
  window.history.replaceState(null, '', `${location.pathname}#/funcoes-operacionais`)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const tab = (name: string) => screen.getByRole('tab', { name })
const hashQuery = () => new URLSearchParams(location.hash.split('?')[1] ?? '')

async function pick(selectId: string, label: string) {
  fireEvent.click(document.getElementById(selectId)!)
  await waitFor(() => expect(document.querySelector('.bt-select-panel')).toBeTruthy())
  const option = [...document.querySelectorAll<HTMLElement>('.bt-select-option')].find((item) => item.textContent?.includes(label))
  if (!option) throw new Error(`opção ${label} não apareceu`)
  fireEvent.click(option)
  await waitFor(() => expect((document.querySelector(`input[type="hidden"][name="${selectId}"]`) as HTMLInputElement | null)?.value).toBeTruthy())
}

describe('Funções Operacionais', () => {
  it('abre na aba Motorista com os serviços do mock e troca de aba pela query do shell', async () => {
    render(<FuncoesOperacionaisPage host={{ mode: 'mock' }} />)
    await waitFor(() => expect(document.querySelectorAll('.service-card').length).toBeGreaterThan(0))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Trocar Motorista')
    expect(screen.getByText('A partir de hoje')).toBeTruthy()
    expect(document.querySelector('.service-card [data-current-driver] strong')?.textContent).toBe('Diego')
    expect(document.querySelector('.service-card__meta-item strong')?.textContent).toBe('3 PAX')
    expect(screen.getByText('5 serviços')).toBeTruthy()

    fireEvent.click(tab('Pedido'))
    await waitFor(() => expect(hashQuery().get('aba')).toBe('pedido'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Duplicar pedido')
    expect(screen.getAllByRole('button', { name: /Duplicar este pedido/ }).length).toBeGreaterThan(0)

    fireEvent.click(tab('Carro'))
    await waitFor(() => expect(hashQuery().get('aba')).toBe('carro'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Trocar carro')
    expect(screen.getByText('Novo agendamento')).toBeTruthy()

    fireEvent.click(tab('Motorista'))
    await waitFor(() => expect(hashQuery().get('aba')).toBeNull())
  })

  it('troca o motorista com desfazer', async () => {
    render(<FuncoesOperacionaisPage host={{ mode: 'mock' }} />)
    const card = await waitFor(() => { const el = document.querySelector<HTMLElement>('.service-card'); if (!el) throw new Error('sem card'); return el })
    fireEvent.click(within(card).getByRole('button', { name: /Trocar motorista/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Trocar motorista' })
    fireEvent.click(within(drawer).getByRole('option', { name: /Bruno/ }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Salvar motorista/ }))
    await waitFor(() => expect(card.querySelector('[data-current-driver] strong')?.textContent).toBe('Bruno'))
    await screen.findByText(/#11482: Diego → Bruno\./)
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await screen.findByText(/#11482 voltou para Diego\./)
    expect(card.querySelector('[data-current-driver] strong')?.textContent).toBe('Diego')
  })

  it('duplica um pedido para uma data escolhida no calendário', async () => {
    window.history.replaceState(null, '', `${location.pathname}#/funcoes-operacionais?aba=pedido`)
    render(<FuncoesOperacionaisPage host={{ mode: 'mock' }} />)
    const botoes = await screen.findAllByRole('button', { name: /Duplicar este pedido/ })
    fireEvent.click(botoes[0])
    const drawer = await screen.findByRole('dialog', { name: 'Duplicar pedido' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Criar pedido' }))
    await screen.findAllByText('Escolha pelo menos uma data.')
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const dia = within(drawer).getAllByRole('button', { pressed: false }).find((b) => b.classList.contains('mini-calendar__day') && b.textContent === String(amanha.getDate()) && !(b as HTMLButtonElement).disabled)!
    fireEvent.click(dia)
    fireEvent.click(within(drawer).getByRole('button', { name: 'Criar pedido' }))
    await screen.findByText(/^Cópia de #/)
    await waitFor(() => expect(screen.getByText('6 serviços')).toBeTruthy())
  })

  it('agenda uma troca de carro entre serviços no mock', async () => {
    window.history.replaceState(null, '', `${location.pathname}#/funcoes-operacionais?aba=carro`)
    render(<FuncoesOperacionaisPage host={{ mode: 'mock' }} />)
    await waitFor(() => expect(document.getElementById('vehicleDriver1')).toBeTruthy())
    await act(async () => { await Promise.resolve() })
    await pick('vehicleDriver1', 'Diego')
    await pick('vehicleDriver2', 'Fernando')
    expect(within(screen.getByLabelText('Resumo da troca')).getByText('Diego')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Agendar troca/ }))
    await screen.findByText('Troca programada e disponível para o motorista.')
    // Formulário volta ao novo.
    await waitFor(() => expect((document.querySelector('input[type="hidden"][name="vehicleDriver1"]') as HTMLInputElement | null)?.value || '').toBe(''))
  })

  it('abre a edição pela URL (?troca=), salva e sai da edição', async () => {
    window.history.replaceState(null, '', `${location.pathname}#/funcoes-operacionais?aba=carro&troca=${MOCK_SWAP_ID}`)
    render(<FuncoesOperacionaisPage host={{ mode: 'mock' }} />)
    await screen.findByText(MOCK_SWAP_ID)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Editar troca de carro')
    expect(screen.getByText('Editável')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar troca' })).toBeTruthy()
    expect((document.getElementById('vehicleDriver1') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/ }))
    await screen.findByText('Troca atualizada.')
    await waitFor(() => expect(hashQuery().get('troca')).toBeNull())
    expect(hashQuery().get('aba')).toBe('carro')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Trocar carro')
  })

  it('link antigo mode=edit&id= vira aba=carro&troca= e cancela com motivo obrigatório', async () => {
    window.history.replaceState(null, '', `${location.pathname}#/funcoes-operacionais?mode=edit&id=${MOCK_SWAP_ID}`)
    render(<FuncoesOperacionaisPage host={{ mode: 'mock' }} />)
    await waitFor(() => expect(hashQuery().get('troca')).toBe(MOCK_SWAP_ID))
    expect(hashQuery().get('mode')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar troca' }))
    const drawer = await screen.findByRole('dialog', { name: 'Cancelar troca' })
    const confirmar = within(drawer).getByRole('button', { name: 'Confirmar cancelamento' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    fireEvent.change(within(drawer).getByRole('textbox'), { target: { value: 'Motorista faltou' } })
    fireEvent.click(confirmar)
    await screen.findByText('Troca cancelada.')
    await waitFor(() => expect(hashQuery().get('troca')).toBeNull())
  })
})
