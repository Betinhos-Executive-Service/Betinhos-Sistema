import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const totpAgora = (segredo: string, email = 'fiscal@tenaris.com') => totpDo(email, segredo).generate({ timestamp: T0 })

async function confirmarTotp(codigo: string, lembrar = false) {
  const campo = await screen.findByLabelText(/Código do autenticador/)
  if (lembrar) fireEvent.click(screen.getByLabelText('Lembrar este computador por 30 dias'))
  fireEvent.change(campo, { target: { value: codigo } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
}

/** Login completo no 1º acesso: código do e-mail, QR e TOTP gerado com a mesma biblioteca. */
async function entrarCompleto(email = 'fiscal@tenaris.com') {
  await entrar('123456', email)
  await screen.findByRole('img', { name: /QR code/ })
  await confirmarTotp(totpAgora(segredoNaTela(), email))
}

async function entrar(codigo = '123456', email = 'fiscal@tenaris.com') {
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
  const campo = await screen.findByLabelText(/Código de acesso/)
  fireEvent.change(campo, { target: { value: codigo } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Portal do cliente', () => {
  it('mostra a versão do build já na tela de entrada', () => {
    abrir()
    expect(screen.getByRole('heading', { name: 'Portal do cliente' })).toBeTruthy()
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

  it('Tenaris vê só a validação, sem troca de módulo', async () => {
    abrir()
    await entrarCompleto()
    await screen.findByText(/Serviços de outubro de 2026/)
    expect(screen.queryByRole('radiogroup', { name: 'Área do portal' })).toBeNull()
    expect(screen.getByText('Marcos Albuquerque · Tenaris')).toBeTruthy()
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

  describe('Latasa (Pedir + Meus serviços)', () => {
    const LATASA = 'compras@latasa.com.br'
    // Só o Date: as telas usam o relógio real para "daqui para a frente" e os dados do mock nascem em T0.
    beforeEach(() => vi.setSystemTime(T0))
    afterEach(() => vi.useRealTimers())
    /** `datetime-local` de amanhã às 09:00 (sem fuso). */
    const amanha = () => `${new Date(T0 + 86400_000).toISOString().slice(0, 10)}T09:00`

    it('entra pelo domínio e vê só Pedir e Meus serviços', async () => {
      abrir()
      await entrarCompleto(LATASA)
      expect(await screen.findByRole('heading', { name: 'Pedir serviço' })).toBeTruthy()
      const areas = screen.getByRole('radiogroup', { name: 'Área do portal' })
      expect(within(areas).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Pedir serviço', 'Meus serviços'])
      expect(screen.queryByText(/A validar/)).toBeNull()
      expect(screen.getByText('Compras · Latasa')).toBeTruthy()
    })

    it('trocar de área no meio do pedido não perde o que foi digitado', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      fireEvent.change(screen.getByLabelText(/^Passageiro/), { target: { value: 'Hiroshi Tanaka' } })
      fireEvent.click(screen.getByRole('radio', { name: 'Meus serviços' }))
      await screen.findByRole('heading', { name: 'Meus serviços' })
      fireEvent.click(screen.getByRole('radio', { name: 'Pedir serviço' }))
      expect((screen.getByLabelText(/^Passageiro/) as HTMLInputElement).value).toBe('Hiroshi Tanaka')
    })

    it('e-mail de domínio não autorizado recebe a mesma mensagem de código incorreto', async () => {
      abrir()
      await entrar('123456', 'alguem@gmail.com')
      expect(await screen.findByText(/Código incorreto/)).toBeTruthy()
    })

    it('erros por campo: sem origem e data no passado', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      fireEvent.change(screen.getByLabelText(/^Passageiro/), { target: { value: 'Hiroshi Tanaka' } })
      fireEvent.change(screen.getByLabelText(/Destino/), { target: { value: 'GRU' } })
      fireEvent.change(screen.getByLabelText(/Data e hora da saída/), { target: { value: '2020-01-01T10:00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }))
      expect(await screen.findByText('Informe o endereço de saída.')).toBeTruthy()
      expect(screen.getByText('A saída precisa ser daqui para a frente.')).toBeTruthy()
      expect(screen.queryByText(/Pedido RV-/)).toBeNull()
    })

    it('pedido completo aparece em Meus serviços como Solicitado', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      fireEvent.change(screen.getByLabelText(/^Passageiro/), { target: { value: 'Hiroshi Tanaka' } })
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar passageiro' }))
      fireEvent.change(screen.getByLabelText('Passageiro 2'), { target: { value: 'Juliana Prado' } })
      fireEvent.change(screen.getByLabelText(/Saída de/), { target: { value: 'Latasa, Pindamonhangaba' } })
      fireEvent.change(screen.getByLabelText(/Destino/), { target: { value: 'Aeroporto de Guarulhos' } })
      fireEvent.change(screen.getByLabelText(/Data e hora da saída/), { target: { value: amanha() } })
      fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: 'Voo LA3421' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }))
      expect(await screen.findByText(/Pedido RV-\d+ enviado/)).toBeTruthy()
      expect(await screen.findByRole('heading', { name: 'Meus serviços' })).toBeTruthy()
      const linha = (await screen.findByText('Latasa, Pindamonhangaba → Aeroporto de Guarulhos', { selector: '.pc-trajeto' })).closest<HTMLElement>('tr, [role=row]')!
      expect(within(linha).getByText('Solicitado')).toBeTruthy()
      expect(within(linha).getByText('Hiroshi Tanaka, Juliana Prado')).toBeTruthy()
    })

    it('Meus serviços mostra o programado com voucher e separa próximos de todos', async () => {
      abrir()
      await entrarCompleto(LATASA)
      fireEvent.click(await screen.findByRole('radio', { name: 'Meus serviços' }))
      await screen.findByRole('heading', { name: 'Meus serviços' })
      expect(await screen.findByText('Programado')).toBeTruthy()
      expect(screen.getByRole('link', { name: /Voucher/ }).getAttribute('href')).toMatch(/\.pdf$/)
      expect(screen.queryByText('Concluído')).toBeNull()
      fireEvent.click(screen.getByRole('radio', { name: /Todos · 6/ }))
      expect((await screen.findAllByText('Concluído')).length).toBe(3)
    })
  })
})
