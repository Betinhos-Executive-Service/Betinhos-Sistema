// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComunicadosPage } from './ComunicadosPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/comunicados'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Comunicados', () => {
  it('lista e abre o relatório com assinatura, observação e reenvio do push que falhou', async () => {
    render(<ComunicadosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: /Novo procedimento de embarque/ }))
    expect(await screen.findByRole('heading', { name: 'Novo procedimento de embarque no GRU' })).toBeTruthy()
    expect(await screen.findByText(/porta 4 fica fechada/)).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Assinatura registrada' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar push para Rafael Souza' }))
    expect(await screen.findByText('Push reenfileirado.')).toBeTruthy()
  })

  it('cria um comunicado para motoristas selecionados e dispara depois de confirmar', async () => {
    render(<ComunicadosPage host={{ mode: 'mock' }} />)
    await screen.findByRole('button', { name: /^Revisão dos veículos/ })
    fireEvent.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    fireEvent.change(await screen.findByLabelText(/Título/), { target: { value: 'Teste de envio' } })
    fireEvent.change(screen.getByLabelText(/Mensagem/), { target: { value: 'Olá, motoristas.' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Selecionar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disparar comunicado' }))
    expect(await screen.findByText('Selecione pelo menos um motorista.')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /Paulo Henrique/ }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Carlos Andrade/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Disparar comunicado' }))
    const dialog = await screen.findByRole('dialog', { name: 'Disparar para 1 motorista?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disparar agora' }))
    expect(await screen.findByText('Comunicado disparado. Acompanhe a entrega do push.')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Teste de envio' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Lembrar Carlos Andrade' })).toBeTruthy()
  })

  it('relatório: marca concluídos e baixa o PDF só deles; sem marcação inclui todos os concluídos', async () => {
    const baixados: string[] = []
    Object.assign(URL, { createObjectURL: () => 'blob:pdf', revokeObjectURL: () => undefined })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { baixados.push(this.download) })
    render(<ComunicadosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: /Novo procedimento de embarque/ }))
    const botao = await screen.findByRole('button', { name: 'Gerar PDF (2)' })
    // Pendente não tem caixa; os dois concluídos têm.
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Rafael Souza' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Carlos Andrade' }))
    expect(await screen.findByRole('button', { name: 'Gerar PDF (1)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar PDF (1)' }))
    await waitFor(() => expect(baixados).toEqual(['comprovante-novo-procedimento-de-embarque-no-gru-carlos-andrade.pdf']))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Carlos Andrade' }))
    expect(botao.textContent).toContain('(2)')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos os concluídos' }))
    expect((screen.getByRole('checkbox', { name: 'Selecionar Márcio Lima' }) as HTMLInputElement).checked).toBe(true)
  })
})
