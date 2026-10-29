// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InicioPage } from './InicioPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/inicio'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  // jsdom não implementa <dialog>.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Página Inicial (mock)', () => {
  it('saúda, mostra os indicadores da Operação, o comunicado e as minhas tarefas', async () => {
    render(<InicioPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('heading', { name: 'Olá, Renan.' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Serviços hoje: 06. Abrir' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Horário de pico: 17h–18h. Abrir' })).toBeTruthy()
    expect(screen.getByText('Janela de operação especial')).toBeTruthy()
    const planner = screen.getByRole('heading', { name: /Planner/ }).closest('section')!
    expect(within(planner).getByText('Confirmar briefing do aeroporto GRU')).toBeTruthy()
    // "Validar motorista..." é de outro responsável: só aparece em "Todas".
    expect(within(planner).queryByText('Validar motorista reserva de Congonhas')).toBeNull()
    fireEvent.click(within(planner).getByRole('button', { name: 'Todas' }))
    expect(await within(planner).findByText('Validar motorista reserva de Congonhas')).toBeTruthy()
    expect(window.location.hash).toBe('#/inicio?tarefas=todas')
  })

  it('troca de visão pela URL; Financeiro mostra os serviços a receber', async () => {
    render(<InicioPage host={{ mode: 'mock' }} />)
    await screen.findByRole('button', { name: /Serviços hoje/ })
    fireEvent.click(screen.getByRole('radio', { name: 'Financeiro' }))
    expect(window.location.hash).toBe('#/inicio?visao=financeiro')
    expect(await screen.findByRole('button', { name: 'Qtd. serviços pendentes: 05. Abrir' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recebimentos do dia: 02. Abrir' })).toBeTruthy()
    expect(await screen.findByText(/Pax: Camila Nogueira · GRU → Faria Lima/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Gestão' }))
    expect(await screen.findByRole('button', { name: 'Qt. de tarefas atrasadas: 03. Abrir' })).toBeTruthy()
    expect(screen.queryByText('Serviços a receber')).toBeNull()
  })

  it('atalhos levam às telas do shell', async () => {
    render(<InicioPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Serviços hoje: 06. Abrir' }))
    expect(window.location.hash).toBe('#/geral')
    window.location.hash = '#/inicio'
    fireEvent.click(screen.getByRole('button', { name: /Novo serviço/ }))
    expect(window.location.hash).toBe('#/geral?novo=1')
    window.location.hash = '#/inicio'
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar briefing do aeroporto GRU/ }))
    expect(window.location.hash).toBe('#/planner?taskId=demo-overdue-1')
  })

  it('Radar: 3 notícias no compacto; expandido filtra por tema e fecha', async () => {
    render(<InicioPage host={{ mode: 'mock' }} />)
    const radar = (await screen.findByRole('heading', { name: /Radar Betinhos/ })).closest('section')!
    expect(await within(radar).findByText('Operação em foco')).toBeTruthy()
    expect(within(radar).queryByText('Checklist de saída ganha nova revisão')).toBeNull()
    fireEvent.click(within(radar).getByRole('button', { name: 'Expandir radar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Radar Betinhos' })
    expect(within(dialog).getByText('Checklist de saída ganha nova revisão')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cliente' }))
    expect(within(dialog).queryByText('Operação em foco')).toBeNull()
    expect(within(dialog).getByText('Clientes executivos priorizam previsibilidade')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar radar' }))
    expect(screen.queryByRole('dialog', { name: 'Radar Betinhos' })).toBeNull()
  })

  it('frase do dia troca e lembra a escolha', async () => {
    render(<InicioPage host={{ mode: 'mock' }} />)
    const frase = screen.getByRole('figure', { name: 'Mensagem do dia' })
    const antes = frase.querySelector('blockquote')!.textContent
    fireEvent.click(within(frase).getByRole('button', { name: 'Trocar mensagem do dia' }))
    expect(frase.querySelector('blockquote')!.textContent).not.toBe(antes)
    expect(localStorage.getItem('betinhos-daily-message')).toContain('"index"')
  })
})
