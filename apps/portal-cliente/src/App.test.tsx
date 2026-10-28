import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App'
import { createMockApi } from './api/mockApi'

const agora = () => new Date('2026-10-28T13:00:00Z')

function abrir() {
  return render(<App api={createMockApi({ agora })} dicaCodigo="Protótipo: use o código 123456." />)
}

async function entrar(codigo = '123456') {
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'fiscal@tenaris.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
  const campo = await screen.findByLabelText(/Código de acesso/)
  fireEvent.change(campo, { target: { value: codigo } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Portal do cliente', () => {
  it('mostra a versão do build já na tela de entrada', () => {
    abrir()
    expect(screen.getByRole('heading', { name: 'Validação de serviços' })).toBeTruthy()
    expect(document.querySelector('.bt-build-badge')?.textContent).toMatch(/^v\d+\.\d+\.\d+ · /)
  })

  it('e-mail incompleto não avança', () => {
    abrir()
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'fiscal@' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(screen.getByText(/Digite um e-mail completo/)).toBeTruthy()
  })

  it('código errado avisa e permite trocar o e-mail', async () => {
    abrir()
    await entrar('000000')
    expect(await screen.findByText(/Código incorreto/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeTruthy()
  })

  it('entra, seleciona dois serviços e aprova em lote', async () => {
    abrir()
    await entrar()
    await screen.findByText(/Serviços de outubro de 2026/)
    const caixas = await screen.findAllByRole('checkbox', { name: /^Selecionar RV-/ })
    fireEvent.click(caixas[0])
    fireEvent.click(caixas[1])
    const lote = screen.getByRole('region', { name: 'Aprovação em lote' })
    fireEvent.click(within(lote).getByRole('button', { name: 'Aprovar 2 serviços' }))
    expect(await screen.findByText('2 serviços aprovados.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Aprovação em lote' })).toBeNull())
    expect(screen.getByRole('radio', { name: /A validar · 15/ })).toBeTruthy()
  })

  it('abre o detalhe, exige motivo e envia a dúvida', async () => {
    abrir()
    await entrar()
    const [primeiro] = await screen.findAllByRole('button', { name: /^RV-/ })
    fireEvent.click(primeiro)
    const painel = await screen.findByRole('dialog')
    expect(within(painel).getByText('Composição do preço')).toBeTruthy()
    fireEvent.click(within(painel).getByRole('button', { name: 'Tenho uma dúvida' }))
    fireEvent.change(within(painel).getByLabelText(/Sua dúvida/), { target: { value: 'Por que houve espera?' } })
    fireEvent.click(within(painel).getByRole('button', { name: 'Enviar dúvida' }))
    expect(within(painel).getByText('Escolha o motivo da dúvida.')).toBeTruthy()
  })

  it('fechar com texto não enviado pede confirmação', async () => {
    abrir()
    await entrar()
    const [primeiro] = await screen.findAllByRole('button', { name: /^RV-/ })
    fireEvent.click(primeiro)
    const painel = await screen.findByRole('dialog')
    fireEvent.click(within(painel).getByRole('button', { name: 'Tenho uma dúvida' }))
    fireEvent.change(within(painel).getByLabelText(/Sua dúvida/), { target: { value: 'Rascunho' } })
    fireEvent.click(within(painel).getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('Descartar alterações?')).toBeTruthy()
    // Descartar no Cancelar limpa só o formulário: o detalhe continua aberto.
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(within(painel).queryByLabelText(/Sua dúvida/)).toBeNull())
    expect(within(painel).getByRole('button', { name: 'Tenho uma dúvida' })).toBeTruthy()
  })
})
