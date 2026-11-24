import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App'
import { armazenamentoEmMemoria, createMockApi, type Armazenamento } from './api/mockApi'

const T0 = new Date('2026-10-28T13:00:00Z').getTime()
const agora = () => new Date(T0)
const SENHA = 'senha-boa-123'

function abrir(armazenamento: Armazenamento = armazenamentoEmMemoria()) {
  return render(<App api={createMockApi({ agora, armazenamento })} dicaCodigo="Protótipo: use o código 123456." />)
}

/** "Primeiro acesso ou esqueci a senha": e-mail, código do e-mail e Continuar. */
async function pedirCodigo(email = 'fiscal@tenaris.com', codigo = '123456') {
  fireEvent.click(await screen.findByRole('button', { name: 'Primeiro acesso ou esqueci a senha' }))
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
  // 6 números confirmam sozinhos, sem clicar em Continuar.
  fireEvent.change(await screen.findByLabelText(/Código do e-mail/), { target: { value: codigo } })
}

/** 1º acesso completo: código do e-mail e senha criada. */
async function entrarCompleto(email = 'fiscal@tenaris.com') {
  await pedirCodigo(email)
  fireEvent.change(await screen.findByLabelText(/Nova senha/), { target: { value: SENHA } })
  fireEvent.change(screen.getByLabelText(/Repita a senha/), { target: { value: SENHA } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }))
}

async function entrarComSenha(senha = SENHA, email = 'fiscal@tenaris.com') {
  fireEvent.change(await screen.findByLabelText(/E-mail/), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: senha } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Portal do cliente', () => {
  it('mostra a versão do build já na tela de entrada', async () => {
    abrir()
    expect(await screen.findByRole('heading', { name: 'Portal do cliente' })).toBeTruthy()
    expect(document.querySelector('.bt-build-badge')?.textContent).toMatch(/^v\d+\.\d+\.\d+ · /)
  })

  it('e-mail incompleto não avança', async () => {
    abrir()
    fireEvent.change(await screen.findByLabelText(/E-mail/), { target: { value: 'fiscal@' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByText(/Digite um e-mail completo/)).toBeTruthy()
  })

  it('sem senha digitada, o aviso fica no campo Senha', async () => {
    abrir()
    await entrarComSenha('')
    const campo = screen.getByLabelText(/^Senha/)
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Digite sua senha.')).toBeTruthy()
  })

  it('sem senha criada, o login avisa como senha incorreta e aponta o 1º acesso', async () => {
    abrir()
    await entrarComSenha()
    expect(await screen.findByText(/E-mail ou senha incorretos/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Primeiro acesso ou esqueci a senha' })).toBeTruthy()
  })

  it('código errado avisa e permite trocar o e-mail', async () => {
    abrir()
    await pedirCodigo('fiscal@tenaris.com', '000000')
    expect(await screen.findByText(/Código incorreto/)).toBeTruthy()
    const campo = screen.getByLabelText(/Código do e-mail/)
    expect(campo.getAttribute('inputmode')).toBe('numeric')
    expect(campo.getAttribute('autocomplete')).toBe('one-time-code')
    fireEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeTruthy()
  })

  it('código: reenviar só depois da contagem, com aviso de spam', async () => {
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Primeiro acesso ou esqueci a senha' }))
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'fiscal@tenaris.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    const reenviar = await screen.findByRole('button', { name: /Reenviar código em 60 s/ })
    expect((reenviar as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Confira a caixa de spam/)).toBeTruthy()
  })

  it('mostrar senha troca o campo para texto e volta', async () => {
    abrir()
    const campo = await screen.findByLabelText(/^Senha/)
    expect(campo.getAttribute('type')).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(campo.getAttribute('type')).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(campo.getAttribute('type')).toBe('password')
  })

  it('criar senha confere tamanho e repetição antes de enviar', async () => {
    abrir()
    await pedirCodigo()
    const nova = await screen.findByLabelText(/Nova senha/)
    expect(nova.getAttribute('autocomplete')).toBe('new-password')
    fireEvent.change(nova, { target: { value: 'curta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }))
    expect(screen.getByText(/pelo menos 8 caracteres/)).toBeTruthy()
    fireEvent.change(nova, { target: { value: SENHA } })
    fireEvent.change(screen.getByLabelText(/Repita a senha/), { target: { value: 'outra-senha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }))
    expect(screen.getByText('As duas senhas não são iguais.')).toBeTruthy()
    expect(screen.getByLabelText(/Repita a senha/).getAttribute('aria-invalid')).toBe('true')
    expect(nova.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('1º acesso cria a senha e entra; ao recarregar já abre logado; depois de sair entra com a senha', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const primeiro = abrir(armazenamento)
    await entrarCompleto()
    await screen.findByText(/Serviços de outubro de 2026/)
    primeiro.unmount()

    const segundo = abrir(armazenamento)
    expect(await screen.findByText(/Serviços de outubro de 2026/)).toBeTruthy()
    segundo.unmount()

    armazenamento.removeItem('pc-mock-sessao')
    abrir(armazenamento)
    await entrarComSenha('errada-000')
    expect(await screen.findByText(/E-mail ou senha incorretos/)).toBeTruthy()
    await entrarComSenha()
    expect(await screen.findByText(/Serviços de outubro de 2026/)).toBeTruthy()
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

    it('e-mail sem acesso ouve isso na hora e não vai para a etapa do código', async () => {
      abrir()
      fireEvent.click(await screen.findByRole('button', { name: 'Primeiro acesso ou esqueci a senha' }))
      fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'alguem@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
      expect(await screen.findByText(/não tem acesso ao portal/)).toBeTruthy()
      expect(screen.queryByLabelText(/Código/)).toBeNull()
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
      const linha = (await screen.findByText('Hiroshi Tanaka, Juliana Prado')).closest<HTMLElement>('[role=row], tr')!
      expect(within(linha).getByText('Solicitado')).toBeTruthy()
      expect(within(linha).getByText('Latasa, Pindamonhangaba', { selector: '.pc-ped__local' })).toBeTruthy()
      expect(within(linha).getByText('Aeroporto de Guarulhos', { selector: '.pc-ped__local' })).toBeTruthy()
    })

    it('Meus serviços mostra o programado com voucher e separa próximos de todos', async () => {
      abrir()
      await entrarCompleto(LATASA)
      fireEvent.click(await screen.findByRole('radio', { name: 'Meus serviços' }))
      await screen.findByRole('heading', { name: 'Meus serviços' })
      expect((await screen.findAllByText('Programado')).length).toBe(2)
      expect(screen.getAllByText('Voucher disponível').length).toBe(2)
      expect(screen.queryByRole('link', { name: /Voucher/ })).toBeNull()
      expect(screen.queryByText('Concluído')).toBeNull()
      // A linha abre o painel com o voucher.
      fireEvent.click(screen.getAllByText('Programado')[0].closest<HTMLElement>('[role=row], tr, button')!)
      expect((await screen.findByRole('link', { name: /Ver voucher/ })).getAttribute('href')).toMatch(/\.pdf$/)
      expect(screen.getByText('Motorista programado')).toBeTruthy()
      fireEvent.click(screen.getByRole('radio', { name: /Todos · 7/ }))
      expect((await screen.findAllByText('Concluído')).length).toBeGreaterThan(0)
    })
  })
})
