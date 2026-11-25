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

  describe('identidade do cliente', () => {
    const logo = () => document.querySelector<HTMLImageElement>('.pc-parceria__cliente')
    const comLink = (c: string) => window.history.replaceState(null, '', `/?c=${c}`)
    afterEach(() => window.history.replaceState(null, '', '/'))

    it('?c=latasa mostra o logo do cliente já na entrada', async () => {
      comLink('latasa')
      abrir()
      await waitFor(() => expect(logo()?.alt).toBe('Latasa'))
    })

    it('chave desconhecida fica só com a Betinhos', async () => {
      comLink('nao-existe')
      abrir()
      await screen.findByRole('heading', { name: 'Portal do cliente' })
      await new Promise((r) => setTimeout(r, 50))
      expect(logo()).toBeNull()
    })

    it('digitar e-mail do domínio do cliente mostra o logo; domínio público não mostra nada', async () => {
      abrir()
      const campo = await screen.findByLabelText(/E-mail/)
      fireEvent.change(campo, { target: { value: 'x@gmail.com' } })
      await new Promise((r) => setTimeout(r, 700))
      expect(logo()).toBeNull()
      fireEvent.change(campo, { target: { value: 'x@reciclabr.com.br' } })
      await waitFor(() => expect(logo()?.alt).toBe('Latasa'), { timeout: 3000 })
    })

    it('depois do login o topo mostra o logo e o nome do cliente', async () => {
      abrir()
      await entrarCompleto('compras@latasa.com.br')
      expect(await screen.findByText('Compras · Latasa')).toBeTruthy()
      expect(logo()?.alt).toBe('Latasa')
    })

    it('cliente sem logo (Tenaris): topo só com a Betinhos', async () => {
      abrir()
      await entrarCompleto()
      await screen.findByText(/Marcos Albuquerque · Tenaris/)
      expect(logo()).toBeNull()
    })
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
    const amanha = () => `${new Date(T0 + 2 * 86400_000).toISOString().slice(0, 10)}T09:00`

    it('aprovador vê a aba Para aprovar, recusa com motivo e o pedido sai da lista', async () => {
      abrir()
      await entrarCompleto('gestor@latasa.com.br')
      fireEvent.click(await screen.findByRole('radio', { name: 'Para aprovar' }))
      fireEvent.click(await screen.findByText('RV-48350'))
      fireEvent.click(await screen.findByRole('button', { name: 'Recusar' }))
      const motivo = await screen.findByRole('textbox', { name: 'Motivo da recusa' })
      const botao = screen.getByRole('button', { name: 'Recusar pedido' }) as HTMLButtonElement
      expect(botao.disabled).toBe(true)
      fireEvent.change(motivo, { target: { value: 'Fora da política de viagens.' } })
      await waitFor(() => expect(botao.disabled).toBe(false))
      fireEvent.click(botao)
      await waitFor(() => expect(screen.queryByText('RV-48350')).toBeNull())
      expect(screen.getByText('RV-48351')).toBeTruthy()
    })

    it('quem pede e depende de aprovação vê Aguardando aprovação em Meus serviços', async () => {
      abrir()
      await entrarCompleto('carlos.mendes@latasa.com.br')
      fireEvent.click(await screen.findByRole('radio', { name: 'Meus serviços' }))
      expect((await screen.findAllByText('Aguardando aprovação')).length).toBeGreaterThan(0)
      expect(screen.queryByRole('radio', { name: 'Para aprovar' })).toBeNull()
    })

    it('entra pelo domínio e vê só Pedir e Meus serviços', async () => {
      abrir()
      await entrarCompleto(LATASA)
      expect(await screen.findByRole('heading', { name: 'Pedir serviço' })).toBeTruthy()
      const areas = screen.getByRole('radiogroup', { name: 'Área do portal' })
      expect(within(areas).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Pedir serviço', 'Meus serviços'])
      expect(screen.queryByText(/A validar/)).toBeNull()
      expect(screen.getByText('Compras · Latasa')).toBeTruthy()
    })

    /** Abre a busca de passageiros e escolhe o cadastrado pelo nome. */
    async function escolherPassageiro(nome: string) {
      fireEvent.click(screen.getByRole('combobox', { name: /Buscar passageiro cadastrado/ }))
      fireEvent.click(await screen.findByRole('option', { name: new RegExp(nome), hidden: true }))
    }

    /** Passo 1: cadastra um passageiro novo pelo cartão (nome + celular). */
    async function cadastrarNovo(nome: string, celular = '(12) 98888-7777') {
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo' }))
      fireEvent.change(screen.getByLabelText('Nome'), { target: { value: nome } })
      fireEvent.change(screen.getByLabelText('Celular'), { target: { value: celular } })
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar passageiro' }))
    }
    const continuar = () => fireEvent.click(screen.getByRole('button', { name: /^Continuar/ }))
    const preencherTrajeto = (destino = 'Aeroporto de Guarulhos', hora = '09:00') => {
      fireEvent.change(screen.getByLabelText(/^Saída/), { target: { value: 'Latasa, Pindamonhangaba' } })
      fireEvent.change(screen.getByLabelText(/Destino/), { target: { value: destino } })
      fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: amanha().slice(0, 10) } })
      fireEvent.change(screen.getByLabelText(/^Hora/), { target: { value: hora } })
    }

    it('trocar de área no meio do pedido não perde o que foi digitado nem o passo', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      await escolherPassageiro('Hiroshi Tanaka')
      continuar()
      fireEvent.change(await screen.findByLabelText(/^Saída/), { target: { value: 'Latasa, Pindamonhangaba' } })
      fireEvent.click(screen.getByRole('radio', { name: 'Meus serviços' }))
      await screen.findByRole('heading', { name: 'Meus serviços' })
      fireEvent.click(screen.getByRole('radio', { name: 'Pedir serviço' }))
      expect((screen.getByLabelText(/^Saída/) as HTMLInputElement).value).toBe('Latasa, Pindamonhangaba')
    })

    it('e-mail sem acesso ouve isso na hora e não vai para a etapa do código', async () => {
      abrir()
      fireEvent.click(await screen.findByRole('button', { name: 'Primeiro acesso ou esqueci a senha' }))
      fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'alguem@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
      expect(await screen.findByText(/não tem acesso ao portal/)).toBeTruthy()
      expect(screen.queryByLabelText(/Código/)).toBeNull()
    })

    it('passo 1 valida só os passageiros: vazio, sem contato e repetido', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      expect(screen.getByText('Passo 1 de 3 · Quem viaja')).toBeTruthy()
      continuar()
      expect(await screen.findByText('Informe pelo menos um passageiro.')).toBeTruthy()
      expect(screen.getByText('Passo 1 de 3 · Quem viaja')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo' }))
      fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pessoa Nova' } })
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar passageiro' }))
      expect(await screen.findByText('Informe celular ou e-mail.')).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '(12) 98888-7777' } })
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar passageiro' }))
      expect(screen.getByRole('list', { name: 'Passageiros do pedido' }).textContent).toMatch(/Pessoa Nova/)
      // Mesmo nome de novo: recusa.
      await cadastrarNovo('pessoa  nova')
      expect(await screen.findByText('Este passageiro já está no pedido.')).toBeTruthy()
    })

    it('passo 2 valida trajeto e horário: sem saída e data no passado, sem sair do passo', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      await cadastrarNovo('Pessoa Nova')
      continuar()
      expect(await screen.findByText('Passo 2 de 3 · Trajeto e horário')).toBeTruthy()
      expect(document.activeElement?.textContent).toBe('Trajeto e horário')
      fireEvent.change(screen.getByLabelText(/Destino/), { target: { value: 'GRU' } })
      fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: '2020-01-01' } })
      fireEvent.change(screen.getByLabelText(/^Hora/), { target: { value: '10:00' } })
      continuar()
      expect(await screen.findByText('Informe o endereço de saída.')).toBeTruthy()
      expect(screen.getByText('A saída precisa ser daqui para a frente.')).toBeTruthy()
      await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Saída/)))
      expect(screen.getByText('Passo 2 de 3 · Trajeto e horário')).toBeTruthy()
    })

    it('endereço: combobox com sugestões, setas, Enter e Esc; texto livre continua valendo', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      await cadastrarNovo('Pessoa Nova')
      continuar()
      await screen.findByText('Passo 2 de 3 · Trajeto e horário')
      const destino = screen.getByRole('combobox', { name: /Destino/ })
      expect(destino.getAttribute('aria-expanded')).toBe('false')
      fireEvent.focus(destino)
      fireEvent.change(destino, { target: { value: 'aeroporto' } })
      await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1))
      const opcoes = screen.getAllByRole('option')
      expect(destino.getAttribute('aria-expanded')).toBe('true')
      // Enter sem opção destacada não escolhe nada.
      fireEvent.keyDown(destino, { key: 'Enter' })
      expect((destino as HTMLInputElement).value).toBe('aeroporto')
      fireEvent.keyDown(destino, { key: 'ArrowDown' })
      expect(opcoes[0].getAttribute('aria-selected')).toBe('true')
      expect(destino.getAttribute('aria-activedescendant')).toBe(opcoes[0].id)
      fireEvent.keyDown(destino, { key: 'ArrowDown' })
      expect(opcoes[1].getAttribute('aria-selected')).toBe('true')
      fireEvent.keyDown(destino, { key: 'ArrowUp' })
      fireEvent.keyDown(destino, { key: 'Enter' })
      expect((destino as HTMLInputElement).value).toBe(opcoes[0].textContent)
      expect(destino.getAttribute('aria-expanded')).toBe('false')
      // Esc fecha sem mexer no texto; o que o cliente digita livremente fica como está.
      fireEvent.change(destino, { target: { value: 'Fábrica Latasa, portão 3' } })
      fireEvent.keyDown(destino, { key: 'Escape' })
      expect(destino.getAttribute('aria-expanded')).toBe('false')
      expect((destino as HTMLInputElement).value).toBe('Fábrica Latasa, portão 3')
    })

    it('veículo em cards de rádio com capacidade e aviso quando não cabe', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      for (const n of ['Ana Souza', 'Bia Lima', 'Caio Reis', 'Davi Melo']) await cadastrarNovo(n)
      expect(screen.queryByRole('button', { name: 'Cadastrar novo' })).toBeNull()
      expect(screen.getByText(/Máximo de 4 passageiros/)).toBeTruthy()
      continuar()
      await screen.findByText('Passo 2 de 3 · Trajeto e horário')
      const grupo = screen.getByRole('group', { name: /Veículo/ })
      expect(within(grupo).getAllByRole('radio').length).toBe(6)
      expect((within(grupo).getByRole('radio', { name: /A Betinhos escolhe/ }) as HTMLInputElement).checked).toBe(true)
      expect(within(grupo).getByText('até 14 pax')).toBeTruthy()
      expect(within(grupo).getAllByText('Não cabe 4 pessoas').length).toBe(2)
      // Aviso não bloqueia: escolher o Executivo e seguir.
      fireEvent.click(within(grupo).getByRole('radio', { name: /Executivo/ }))
      preencherTrajeto()
      continuar()
      expect(await screen.findByText('Passo 3 de 3 · Conferir e enviar')).toBeTruthy()
    })

    it('pedido em 3 passos: confere, altera, volta e envia; aparece como Solicitado', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      await escolherPassageiro('Hiroshi Tanaka')
      await cadastrarNovo('Pessoa Nova')
      continuar()
      await screen.findByText('Passo 2 de 3 · Trajeto e horário')
      expect(within(screen.getByRole('complementary', { name: 'Seu pedido' })).getByText(/Hiroshi Tanaka, Pessoa Nova/)).toBeTruthy()
      preencherTrajeto()
      fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: 'Voo LA3421' } })
      continuar()
      expect(await screen.findByText('Passo 3 de 3 · Conferir e enviar')).toBeTruthy()
      expect(screen.getByText('Pessoa Nova')).toBeTruthy()
      expect(screen.getByText('A Betinhos escolhe')).toBeTruthy()
      expect(screen.getByText('Voo LA3421')).toBeTruthy()
      expect(screen.getByText(/-feira, \d\d\/\d\d\/\d{4} às 09:00|sábado, |domingo, /)).toBeTruthy()
      // Alterar leva ao passo certo e mantém tudo.
      fireEvent.click(screen.getByRole('button', { name: 'Alterar trajeto' }))
      expect((await screen.findByLabelText(/Destino/) as HTMLInputElement).value).toBe('Aeroporto de Guarulhos')
      continuar()
      fireEvent.click(await screen.findByRole('button', { name: 'Alterar passageiros' }))
      expect(await screen.findByText('Passo 1 de 3 · Quem viaja')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
      continuar()
      await screen.findByText('Passo 2 de 3 · Trajeto e horário')
      continuar()
      fireEvent.click(await screen.findByRole('button', { name: 'Enviar pedido' }))
      expect(await screen.findByText(/Pedido RV-\d+ enviado/)).toBeTruthy()
      expect(await screen.findByRole('heading', { name: 'Meus serviços' })).toBeTruthy()
      const linha = (await screen.findByText('Hiroshi Tanaka, Pessoa Nova')).closest<HTMLElement>('[role=row], tr')!
      expect(within(linha).getByText('Solicitado')).toBeTruthy()
    })

    it('etapa já feita é clicável na barra de progresso; a futura não', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      await cadastrarNovo('Pessoa Nova')
      expect(screen.queryByRole('button', { name: /Voltar para o passo/ })).toBeNull()
      continuar()
      await screen.findByText('Passo 2 de 3 · Trajeto e horário')
      expect(screen.getByRole('button', { name: /Voltar para o passo 1/ })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /passo 3/ })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Voltar para o passo 1/ }))
      expect(await screen.findByText('Passo 1 de 3 · Quem viaja')).toBeTruthy()
    })

    it('Repetir um pedido anterior leva a Meus serviços', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      fireEvent.click(screen.getByRole('button', { name: /Repetir um pedido anterior/ }))
      expect(await screen.findByRole('heading', { name: 'Meus serviços' })).toBeTruthy()
    })

    it('Repetir pedido abre o Pedir preenchido, sem data e hora', async () => {
      abrir()
      await entrarCompleto(LATASA)
      fireEvent.click(await screen.findByRole('radio', { name: 'Meus serviços' }))
      await screen.findByRole('heading', { name: 'Meus serviços' })
      fireEvent.click((await screen.findAllByText('Programado'))[0].closest<HTMLElement>('[role=row], tr, button')!)
      fireEvent.click(await screen.findByRole('button', { name: 'Repetir pedido' }))
      expect(await screen.findByRole('heading', { name: 'Pedir serviço' })).toBeTruthy()
      expect(screen.getByText('Passo 1 de 3 · Quem viaja')).toBeTruthy()
      expect(screen.getAllByRole('listitem').filter((li) => li.className.includes('pc-pp__chip-item')).length).toBe(1)
      continuar()
      expect((await screen.findByLabelText(/^Saída/) as HTMLInputElement).value).toMatch(/\S/)
      expect((screen.getByLabelText(/^Data/) as HTMLInputElement).value).toBe('')
      expect((screen.getByLabelText(/^Hora/) as HTMLInputElement).value).toBe('')
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
      fireEvent.click(screen.getByRole('radio', { name: /Todos · 8/ }))
      expect((await screen.findAllByText('Concluído')).length).toBeGreaterThan(0)
    })

    it('pedido que sai em menos do prazo não tem Cancelar: mostra o motivo e o contato; dentro do prazo cancela', async () => {
      abrir()
      await entrarCompleto(LATASA)
      fireEvent.click(await screen.findByRole('radio', { name: 'Meus serviços' }))
      fireEvent.click(await screen.findByText('RV-48299'))
      expect((await screen.findByTestId('regra-cancelar')).textContent).toMatch(/12 h antes da saída e já passou.*\(12\) 99999-0000 \(WhatsApp\)/)
      expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Fechar/ }))
      await waitFor(() => expect(screen.queryByTestId('regra-cancelar')).toBeNull())
      fireEvent.click(screen.getByText('RV-48300'))
      expect((await screen.findByTestId('regra-cancelar')).textContent).toBe('Você cancela até 12 h antes da saída.')
      expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeTruthy()
    })

    it('Pedir avisa a antecedência e bloqueia a data fora do prazo, com o contato', async () => {
      abrir()
      await entrarCompleto(LATASA)
      await screen.findByRole('heading', { name: 'Pedir serviço' })
      await escolherPassageiro('Hiroshi Tanaka')
      continuar()
      expect(await screen.findByText('Pedidos com pelo menos 24 h de antecedência.')).toBeTruthy()
      preencherTrajeto()
      fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: new Date(T0).toISOString().slice(0, 10) } })
      fireEvent.change(screen.getByLabelText(/^Hora/), { target: { value: '18:00' } })
      continuar()
      expect((await screen.findByRole('alert', { name: '' })).textContent).toMatch(/menos de 24 h.*\(12\) 99999-0000 \(WhatsApp\)/)
      expect(screen.getByText('Passo 2 de 3 · Trajeto e horário')).toBeTruthy()
    })
  })
})
