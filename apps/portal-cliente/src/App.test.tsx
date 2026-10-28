import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App'
import { armazenamentoEmMemoria, createMockApi, totpDo, type Armazenamento } from './api/mockApi'

const T0 = new Date('2026-10-28T13:00:00Z').getTime()
const agora = () => new Date(T0)

function abrir(armazenamento: Armazenamento = armazenamentoEmMemoria()) {
  return render(<App api={createMockApi({ agora, armazenamento })} dicaCodigo="Protótipo: use o código 123456." />)
}

/** Lê o segredo mostrado no cadastro, como faria quem digita à mão no app autenticador. */
function segredoNaTela() {
  return document.querySelector('.pc-entrar__segredo')!.textContent!.replace(/\s/g, '')
}

const totpAgora = (segredo: string) => totpDo('fiscal@tenaris.com', segredo).generate({ timestamp: T0 })

async function confirmarTotp(codigo: string, lembrar = false) {
  const campo = await screen.findByLabelText(/Código do autenticador/)
  if (lembrar) fireEvent.click(screen.getByLabelText('Lembrar este computador por 30 dias'))
  fireEvent.change(campo, { target: { value: codigo } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
}

/** Login completo no 1º acesso: código do e-mail, QR e TOTP gerado com a mesma biblioteca. */
async function entrarCompleto() {
  await entrar()
  await screen.findByRole('img', { name: /QR code/ })
  await confirmarTotp(totpAgora(segredoNaTela()))
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

  it('1º acesso mostra QR e segredo; TOTP errado avisa; o certo entra', async () => {
    abrir()
    await entrar()
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeTruthy()
    expect(screen.getByText(/Microsoft ou Google Authenticator/)).toBeTruthy()
    expect((screen.getByLabelText('Lembrar este computador por 30 dias') as HTMLInputElement).checked).toBe(false)
    const campo = screen.getByLabelText(/Código do autenticador/)
    expect(campo.getAttribute('inputmode')).toBe('numeric')
    expect(campo.getAttribute('autocomplete')).toBe('one-time-code')
    await confirmarTotp('000000')
    expect(await screen.findByText(/Código do autenticador incorreto/)).toBeTruthy()
    await confirmarTotp(totpAgora(segredoNaTela()))
    expect(await screen.findByText(/Serviços de outubro de 2026/)).toBeTruthy()
  })

  it('2º acesso pede só o código; com "lembrar", o seguinte pula o autenticador', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const primeiro = abrir(armazenamento)
    await entrarCompleto()
    await screen.findByText(/Serviços de outubro de 2026/)
    primeiro.unmount()

    const segundo = abrir(armazenamento)
    await entrar()
    await screen.findByLabelText(/Código do autenticador/)
    expect(screen.queryByRole('img', { name: /QR code/ })).toBeNull()
    expect(document.querySelector('.pc-entrar__segredo')).toBeNull()
    const segredo = JSON.parse(armazenamento.getItem('pc-mock-autenticadores')!)['fiscal@tenaris.com']
    await confirmarTotp(totpAgora(segredo), true)
    await screen.findByText(/Serviços de outubro de 2026/)
    segundo.unmount()

    abrir(armazenamento)
    await entrar()
    expect(await screen.findByText(/Serviços de outubro de 2026/)).toBeTruthy()
    expect(screen.queryByLabelText(/Código do autenticador/)).toBeNull()
  })

  it('entra, seleciona dois serviços e aprova em lote', async () => {
    abrir()
    await entrarCompleto()
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
    await entrarCompleto()
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
    await entrarCompleto()
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
