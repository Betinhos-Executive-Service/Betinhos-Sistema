// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcessoError, type AcessoSource } from '../data/acesso'
import type { FuncionarioParecido } from '../data/parecidos'
import { RETENTATIVA_MS } from './AcessoProgresso'
import { CadastroAcessoDrawer } from './CadastroAcessoDrawer'

const ok = { emailMicrosoft: 'ana.lima@betinhos.onmicrosoft.com', senhaTemporaria: 'Kx7#mQ2vR9pL4w', funcionarioId: 'f9', linkApp: 'https://app', etapas: [{ etapa: 'usuario', estado: 'feita' as const, detalhe: 'criado' }] }
function src(cadastrar: AcessoSource['cadastrar'], parecidos: AcessoSource['parecidos'] = async () => []): AcessoSource { return { cadastrar, parecidos, encerrar: async () => [], reativar: async () => { throw new Error('n/a') } } }
function renderDrawer(source: AcessoSource, props: Partial<Parameters<typeof CadastroAcessoDrawer>[0]> = {}) {
  const onClose = vi.fn(); const onCadastrado = vi.fn()
  render(<ToastProvider><CadastroAcessoDrawer acesso={source} onClose={onClose} onCadastrado={onCadastrado} {...props} /></ToastProvider>)
  return { onClose, onCadastrado }
}
afterEach(cleanup)

describe('CadastroAcessoDrawer', () => {
  it('gera a prévia do e-mail a partir do nome e permite editar o prefixo', () => {
    renderDrawer(src(async () => ok))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'João da Silva Ávila' } })
    expect((screen.getByLabelText(/E-mail Microsoft/) as HTMLInputElement).value).toBe('joao.avila')
    expect(screen.getByText('joao.avila@betinhos.onmicrosoft.com')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/E-mail Microsoft/), { target: { value: 'joao.silva' } })
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'João da Silva Prado' } })
    expect((screen.getByLabelText(/E-mail Microsoft/) as HTMLInputElement).value).toBe('joao.silva')
  })

  it('cadastra, mostra senha uma vez e monta o link do WhatsApp', async () => {
    const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
    const { onCadastrado } = renderDrawer(src(cadastrar))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')
    expect(cadastrar).toHaveBeenCalledWith({ nomeCompleto: 'Ana Lima', celular: '12991234567', emailPessoal: undefined, prefixoEmail: 'ana.lima', tipoVinculo: 1, funcionarioId: undefined })
    const wa = screen.getByRole('link', { name: /Enviar no WhatsApp/ })
    expect(wa.getAttribute("href")).toContain('https://wa.me/5512991234567?text=')
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('Kx7#mQ2vR9pL4w')
    expect(screen.getByText(/aparece só agora/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Abrir ficha/ }))
    expect(onCadastrado).toHaveBeenCalledWith('f9', undefined)
  })

  it('erro parcial mostra etapas e permite tentar de novo com o mesmo input', async () => {
    const cadastrar = vi.fn()
      .mockRejectedValueOnce(new AcessoError('GRAPH_INDISPONIVEL', 'O Microsoft 365 não respondeu.', [{ etapa: 'usuario', estado: 'feita', detalhe: 'criado' }, { etapa: 'licenca', estado: 'erro', detalhe: '503' }]))
      .mockResolvedValueOnce(ok)
    renderDrawer(src(cadastrar))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByRole('alert')
    expect(screen.getByText('Conta criada')).toBeTruthy()
    expect(screen.getByText('Liberando a licença')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')
    expect(cadastrar).toHaveBeenCalledTimes(2)
    expect(cadastrar.mock.calls[1][0]).toEqual(cadastrar.mock.calls[0][0])
  })

  it('tentar de novo envia os valores atuais dos campos', async () => {
    const erro = new AcessoError('GRAPH_INDISPONIVEL', 'O Microsoft 365 não respondeu.', [])
    const cadastrar = vi.fn().mockRejectedValueOnce(erro).mockResolvedValueOnce(ok)
    renderDrawer(src(cadastrar))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12988887777' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')
    expect(cadastrar.mock.calls[1][0]).toMatchObject({ nomeCompleto: 'Ana Lima', celular: '12988887777' })
  })

  it('no estado de erro, Esc pede confirmação de descarte', async () => {
    const { onClose } = renderDrawer(src(async () => { throw new AcessoError('GRAPH_INDISPONIVEL', 'O Microsoft 365 não respondeu.', []) }))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByRole('alert')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fechar com dado digitado pede confirmação; durante a criação não fecha', async () => {
    let resolver: (v: typeof ok) => void = () => {}
    const { onClose } = renderDrawer(src(() => new Promise((r) => { resolver = r })))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continuar editando/ }))
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { resolver(ok) })
  })

  it('nome da ficha aparece como informação; celular formatado na tela e original para a API', async () => {
    const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
    renderDrawer(src(cadastrar), { inicial: { funcionarioId: 'f1', nomeCompleto: 'Ana Lima', celular: '+5512900005174' } })
    expect(screen.queryByLabelText(/Nome completo/)).toBeNull()
    expect(screen.getByText('Ana Lima')).toBeTruthy()
    expect(screen.getByText(/da ficha do funcionário/)).toBeTruthy()
    expect((screen.getByLabelText(/Celular/) as HTMLInputElement).value).toBe('(12) 90000-5174')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    expect(cadastrar.mock.calls[0][0]).toMatchObject({ celular: '+5512900005174' })
  })

  it('nome de uma palavra pede sobrenome antes de enviar (o plugin recusa); prévia aparece uma vez', () => {
    renderDrawer(src(async () => ok))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Betinho' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    expect(screen.getAllByText('betinho@betinhos.onmicrosoft.com')).toHaveLength(1)
    expect(screen.getByText('Informe nome e sobrenome.')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Criar acesso/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Betinho Souza' } })
    expect(screen.queryByText('Informe nome e sobrenome.')).toBeNull()
    expect((screen.getByRole('button', { name: /Criar acesso/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('nome da ficha sem sobrenome orienta corrigir na ficha', () => {
    renderDrawer(src(async () => ok), { inicial: { funcionarioId: 'f1', nomeCompleto: 'Betinho', celular: '12991234567' } })
    expect(screen.getByText(/Inclua o sobrenome na ficha/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Criar acesso/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('vínculo é um seletor segmentado e o rodapé tem Cancelar e o resumo do efeito', () => {
    const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
    const { onClose } = renderDrawer(src(cadastrar))
    fireEvent.click(screen.getByRole('radio', { name: 'Colaborador' }))
    expect(screen.getByRole('radio', { name: 'Colaborador' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/libera a licença/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('com inicial preenche nome e celular e envia funcionarioId', async () => {
    const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
    renderDrawer(src(cadastrar), { inicial: { funcionarioId: 'f1', nomeCompleto: 'Ana Lima', celular: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    expect(cadastrar.mock.calls[0][0]).toMatchObject({ funcionarioId: 'f1', nomeCompleto: 'Ana Lima' })
  })

  it('no resultado, fechar por fora, Esc ou X pede confirmação; Abrir ficha fecha direto', async () => {
    const { onClose, onCadastrado } = renderDrawer(src(async () => ok))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')

    fireEvent.mouseDown(document.querySelector('.drawer-backdrop')!)
    expect(await screen.findByText('Fechar sem enviar?')).toBeTruthy()
    expect(screen.getByText('A senha não aparece de novo.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Voltar$/ }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Kx7#mQ2vR9pL4w')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('dialog', { name: /Cadastrar acesso/ }), { key: 'Escape' })
    expect(await screen.findByText('Fechar sem enviar?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Voltar$/ }))

    fireEvent.click(screen.getAllByRole('button', { name: /^Fechar$/ })[0])
    expect(await screen.findByText('Fechar sem enviar?')).toBeTruthy()
    const confirmar = screen.getAllByRole('button', { name: /^Fechar$/ }).at(-1)!
    fireEvent.click(confirmar)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Abrir ficha/ }))
    expect(onCadastrado).toHaveBeenCalledWith('f9', undefined)
  })

  it('liberação pendente: mostra a mensagem e devolve o e-mail para a ficha concluir', async () => {
    const pendente = { ...ok, etapas: [{ etapa: 'systemuser', estado: 'pendente' as const, detalhe: 'o Dataverse libera em instantes' }] }
    const onCadastrado = vi.fn()
    render(<ToastProvider><CadastroAcessoDrawer acesso={{ cadastrar: async () => pendente, parecidos: async () => [], encerrar: async () => [], reativar: async () => { throw new Error('n/a') } }} onClose={() => {}} onCadastrado={onCadastrado} /></ToastProvider>)
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    expect(await screen.findByText(/conclui sozinho em alguns minutos/)).toBeTruthy()
    expect(screen.getByText('Liberando no Dataverse')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Abrir ficha/ }))
    expect(onCadastrado).toHaveBeenCalledWith('f9', 'ana.lima@betinhos.onmicrosoft.com')
  })

  it('liberação pendente conclui sozinha em segundo plano com a mesma ficha e o mesmo e-mail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const pendente = { ...ok, etapas: [{ etapa: 'systemuser', estado: 'pendente' as const, detalhe: 'x' }] }
      const liberado = { ...ok, senhaTemporaria: '', etapas: [{ etapa: 'systemuser', estado: 'feita' as const, detalhe: 'x' }] }
      const cadastrar = vi.fn().mockResolvedValueOnce(pendente).mockResolvedValueOnce(liberado)
      render(<ToastProvider><CadastroAcessoDrawer acesso={{ cadastrar, parecidos: async () => [], encerrar: async () => [], reativar: async () => { throw new Error('n/a') } }} onClose={() => {}} onCadastrado={() => {}} /></ToastProvider>)
      fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
      fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
      await screen.findByText(/conclui sozinho em alguns minutos/)
      await act(async () => { await vi.advanceTimersByTimeAsync(RETENTATIVA_MS) })
      expect(cadastrar).toHaveBeenLastCalledWith(expect.objectContaining({ funcionarioId: 'f9', prefixoEmail: 'ana.lima' }))
      expect(await screen.findByText('Liberado no Dataverse')).toBeTruthy()
      expect(screen.getByText('Kx7#mQ2vR9pL4w')).toBeTruthy()   // a senha da primeira resposta continua na tela
    } finally { vi.useRealTimers() }
  })

  it('erro permanente na retentativa automática para as tentativas e mostra a mensagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const pendente = { ...ok, etapas: [{ etapa: 'systemuser', estado: 'pendente' as const, detalhe: 'x' }] }
      const cadastrar = vi.fn().mockResolvedValueOnce(pendente).mockRejectedValue(new Error('CONFIG_AUSENTE: falta config | etapas=[]'))
      render(<ToastProvider><CadastroAcessoDrawer acesso={{ cadastrar, parecidos: async () => [], encerrar: async () => [], reativar: async () => { throw new Error('n/a') } }} onClose={() => {}} onCadastrado={() => {}} /></ToastProvider>)
      fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
      fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
      await screen.findByText(/conclui sozinho em alguns minutos/)
      await act(async () => { await vi.advanceTimersByTimeAsync(RETENTATIVA_MS * 3) })
      expect(cadastrar).toHaveBeenCalledTimes(2)
      expect(screen.getByText('Conta criada, mas a liberação parou')).toBeTruthy()
    } finally { vi.useRealTimers() }
  })
  describe('funcionário parecido (cadastro sem ficha)', () => {
    const helena: FuncionarioParecido = { id: 'm7', nome: 'Ana Lima', funcao: 'Motorista', status: 'Desligado', celular: '+55 12 99000-0000', cpf: '***.982.247-**', temAcesso: false, motivos: ['nome', 'cpf'] }
    const carlos: FuncionarioParecido = { id: 'm1', nome: 'Ana Lima Souza', funcao: 'Motorista', status: 'Ativo', celular: '+5512991234567', cpf: '', temAcesso: true, motivos: ['celular'] }
    async function preencherECriar(cadastrar: AcessoSource['cadastrar'], parecidos: AcessoSource['parecidos']) {
      const r = renderDrawer(src(cadastrar, parecidos))
      fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
      fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
      fireEvent.change(screen.getByLabelText(/^CPF/), { target: { value: '52998224725' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
      return r
    }

    it('confere por nome, celular e CPF e lista os parecidos; quem já tem acesso não pode ser usado', async () => {
      const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
      const parecidos = vi.fn<AcessoSource['parecidos']>(async () => [helena, carlos])
      await preencherECriar(cadastrar, parecidos)
      expect(parecidos).toHaveBeenCalledWith({ nome: 'Ana Lima', celular: '12991234567', cpf: '52998224725' })
      await screen.findByText('Já existe um funcionário parecido')
      expect(cadastrar).not.toHaveBeenCalled()
      expect(screen.getByText(/Desligado.*\*\*\*\.982\.247-\*\*/)).toBeTruthy()
      expect((screen.getByRole('button', { name: 'Usar a ficha de Ana Lima Souza' }) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText('Já tem acesso. Use Reativar ou Encerrar na ficha.')).toBeTruthy()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Usar a ficha de Ana Lima' })) })
      await screen.findByText('Kx7#mQ2vR9pL4w')
      expect(cadastrar).toHaveBeenCalledWith(expect.objectContaining({ funcionarioId: 'm7', cpf: '52998224725', criarNovo: undefined }))
    })

    it('Criar ficha nova envia criarNovo; Cancelar volta ao formulário sem cadastrar', async () => {
      const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
      await preencherECriar(cadastrar, async () => [helena])
      await screen.findByText('Já existe um funcionário parecido')
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Já existe um funcionário parecido' })).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('button', { name: 'Criar ficha nova' })).toBeNull()
      expect(cadastrar).not.toHaveBeenCalled()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
      await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Criar ficha nova' })) })
      await screen.findByText('Kx7#mQ2vR9pL4w')
      expect(cadastrar).toHaveBeenCalledWith(expect.objectContaining({ criarNovo: true, funcionarioId: undefined }))
    })

    it('sem parecidos cadastra direto; CPF inválido bloqueia o envio', async () => {
      const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
      renderDrawer(src(cadastrar))
      fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
      fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
      fireEvent.change(screen.getByLabelText(/^CPF/), { target: { value: '111.111.111-11' } })
      expect(screen.getByText('CPF inválido.')).toBeTruthy()
      expect((screen.getByRole('button', { name: /Criar acesso/ }) as HTMLButtonElement).disabled).toBe(true)
      fireEvent.change(screen.getByLabelText(/^CPF/), { target: { value: '' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
      await screen.findByText('Kx7#mQ2vR9pL4w')
      expect(cadastrar).toHaveBeenCalledTimes(1)
    })

    it('HOMONIMO_ENCONTRADO do plugin sem parecido visível abre o aviso e permite Criar ficha nova', async () => {
      const cadastrar = vi.fn<AcessoSource['cadastrar']>().mockRejectedValueOnce(new AcessoError('HOMONIMO_ENCONTRADO', 'x', [])).mockResolvedValue(ok)
      await preencherECriar(cadastrar, async () => [])
      await screen.findByText(/não consegue ver/)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar ficha nova' })) })
      await screen.findByText('Kx7#mQ2vR9pL4w')
      expect(cadastrar).toHaveBeenLastCalledWith(expect.objectContaining({ criarNovo: true }))
    })

    it('ficha aberta pela ficha (inicial) não confere parecidos nem mostra CPF', async () => {
      const parecidos = vi.fn<AcessoSource['parecidos']>(async () => [helena])
      renderDrawer(src(async () => ok, parecidos), { inicial: { funcionarioId: 'f1', nomeCompleto: 'Ana Lima', celular: '12991234567' } })
      expect(screen.queryByLabelText(/^CPF/)).toBeNull()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
      await screen.findByText('Kx7#mQ2vR9pL4w')
      expect(parecidos).not.toHaveBeenCalled()
    })

    it('liberação pendente depois de Criar ficha nova: a retentativa manda o FuncionarioId e não repete criarNovo', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const pendente = { ...ok, funcionarioId: 'novo', etapas: [{ etapa: 'systemuser', estado: 'pendente' as const, detalhe: '' }] }
        const cadastrar = vi.fn<AcessoSource['cadastrar']>().mockResolvedValueOnce(pendente).mockResolvedValue(ok)
        await preencherECriar(cadastrar, async () => [helena])
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Criar ficha nova' })) })
        await screen.findByText('Conta criada, liberando no Dataverse')
        await act(async () => { await vi.advanceTimersByTimeAsync(RETENTATIVA_MS + 50) })
        await waitFor(() => expect(cadastrar).toHaveBeenCalledTimes(2))
        expect(cadastrar.mock.calls[1][0]).toMatchObject({ funcionarioId: 'novo', criarNovo: undefined, prefixoEmail: 'ana.lima' })
      } finally { vi.useRealTimers() }
    })
  })
})
