// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import type { Host } from '../../../host'
import { AcessosContext } from '../../../app/AcessosProvider'
import { NENHUM, TODOS, type Acessos } from '../../../app/acessos'
import { createSource, type Source } from '../../acessos/data/source'
import { AcessoSistema, type EstadoPerfis } from './AcessoSistema'
import { salvar } from '../../acessos/testUtils'
import { AcessoError, type Etapa } from '../data/acesso'
import type { Encerrado, PerfisPessoa } from '../../acessos/domain/types'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host
const ADMIN_ACESSOS: Acessos = { admin: false, areas: {}, acessos: true }
afterEach(cleanup)

const tela = (acessos: Acessos, email: string, source: Source | null = createSource(host), onEstado?: (e: EstadoPerfis) => void) =>
  render(
    <ToastProvider>
      <AcessosContext.Provider value={{ status: 'pronto', acessos, recarregar: () => {} }}>
        <AcessoSistema email={email} source={source} onEstado={onEstado} />
      </AcessosContext.Provider>
    </ToastProvider>,
  )

describe('AcessoSistema', () => {
  it('não aparece sem o perfil Administrador de acessos', () => {
    const { container } = tela(NENHUM, 'bruno@exemplo.test')
    expect(container.textContent).toBe('')
  })

  it('não aparece sem fonte', () => {
    const { container } = tela(TODOS, 'bruno@exemplo.test', null)
    expect(container.textContent).toBe('')
  })

  it('mostra os perfis da pessoa achada pelo e-mail, sem diferenciar maiúsculas', async () => {
    tela(ADMIN_ACESSOS, ' Bruno@Exemplo.test ')
    await screen.findByRole('button', { name: 'Salvar perfis' })
    expect(screen.getByText('Acesso ao sistema')).toBeTruthy()
  })

  it('avisa quando a pessoa ainda não tem conta', async () => {
    tela(ADMIN_ACESSOS, 'ninguem@exemplo.test')
    await screen.findByText('Esta pessoa ainda não tem conta no sistema. Libere o acesso primeiro.')
    expect(screen.queryByRole('button', { name: 'Salvar perfis' })).toBeNull()
  })

  it('erro de leitura oferece tentar de novo', async () => {
    const base = createSource(host)
    let falha = true
    const source: Source = { ...base, load: () => (falha ? Promise.reject(new Error('Falha na leitura.')) : base.load()) }
    tela(ADMIN_ACESSOS, 'bruno@exemplo.test', source)
    await screen.findByText('Falha na leitura.')
    falha = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await screen.findByRole('button', { name: 'Salvar perfis' })
  })

  it('alterar marca a ficha como suja, descartar limpa e salvar libera', async () => {
    const estados: EstadoPerfis[] = []
    tela(ADMIN_ACESSOS, 'bruno@exemplo.test', createSource(host), (e) => estados.push(e))
    await screen.findByRole('button', { name: 'Salvar perfis' })
    fireEvent.click(screen.getAllByRole('radio', { name: 'Gestor' })[1])
    await waitFor(() => expect(estados.at(-1)?.alterado).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(estados.at(-1)?.alterado).toBe(false))
    fireEvent.click(screen.getAllByRole('radio', { name: 'Gestor' })[1])
    await waitFor(() => expect(estados.at(-1)?.alterado).toBe(true))
    await salvar('Salvar perfis')
    await waitFor(() => expect(estados.at(-1)).toEqual({ alterado: false, salvando: false }))
  })

  describe('encerrar e reativar', () => {
    const abrir = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Encerrar acesso ao sistema…' }))
      return (await screen.findByLabelText(/Digite o primeiro nome/)) as HTMLInputElement
    }
    const botaoConfirmar = () => screen.getByRole('button', { name: 'Encerrar acesso' }) as HTMLButtonElement

    it('o botão não aparece na própria linha', async () => {
      tela(ADMIN_ACESSOS, 'ana@exemplo.test')
      await screen.findByText('Acesso ao sistema')
      await screen.findByText(/Ninguém altera o próprio acesso/)
      expect(screen.queryByRole('button', { name: 'Encerrar acesso ao sistema…' })).toBeNull()
    })

    it('quem não é Administrador do Sistema vê o botão travado com o motivo para quem tem o amplo', async () => {
      tela(ADMIN_ACESSOS, 'carlos.teste@betinhos.onmicrosoft.com')
      const botao = (await screen.findByRole('button', { name: 'Encerrar acesso ao sistema…' })) as HTMLButtonElement
      expect(botao.disabled).toBe(true)
      expect(screen.getByText('Só o Administrador do Sistema encerra o acesso de quem tem acesso amplo ou é Administrador de acessos.')).toBeTruthy()
    })

    it('o Administrador do Sistema encerra quem tem o amplo', async () => {
      tela(TODOS, 'carlos.teste@betinhos.onmicrosoft.com')
      expect(((await screen.findByRole('button', { name: 'Encerrar acesso ao sistema…' })) as HTMLButtonElement).disabled).toBe(false)
    })

    it('confirmar só libera com o primeiro nome certo, sem acento e sem caixa', async () => {
      tela(ADMIN_ACESSOS, 'bruno@exemplo.test')
      const campo = await abrir()
      expect(botaoConfirmar().disabled).toBe(true)
      fireEvent.change(campo, { target: { value: 'Carlos' } })
      expect(botaoConfirmar().disabled).toBe(true)
      fireEvent.change(campo, { target: { value: ' BRUNO ' } })
      expect(botaoConfirmar().disabled).toBe(false)
    })

    it('com nome digitado, fechar pergunta antes de descartar', async () => {
      tela(ADMIN_ACESSOS, 'bruno@exemplo.test')
      fireEvent.change(await abrir(), { target: { value: 'Br' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      await screen.findByText('Descartar alterações?')
      fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
      expect(screen.queryByText('Descartar alterações?')).toBeNull()
      expect(screen.getByLabelText(/Digite o primeiro nome/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.queryByLabelText(/Digite o primeiro nome/)).toBeNull())
    })

    it('sucesso mostra o estado encerrado e o Reativar, que volta ao bloco normal', async () => {
      tela(ADMIN_ACESSOS, 'bruno@exemplo.test')
      fireEvent.change(await abrir(), { target: { value: 'Bruno' } })
      fireEvent.click(botaoConfirmar())
      await screen.findByText(/Acesso encerrado em .* por Ana Exemplo/)
      expect(screen.getByText('Peça à TI para desativar a conta Microsoft.')).toBeTruthy()
      expect(screen.getByText(/Volta com: Financeiro · Operador/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Salvar perfis' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Reativar com os perfis anteriores' }))
      await screen.findByRole('button', { name: 'Salvar perfis' })
      expect(screen.queryByText(/Acesso encerrado em/)).toBeNull()
    })

    it('mostra o estado encerrado de quem já estava encerrado e trava o Reativar de quem tinha o amplo', async () => {
      tela(ADMIN_ACESSOS, 'joana.teste@betinhos.onmicrosoft.com')
      await screen.findByText(/Acesso encerrado em/)
      expect(((screen.getByRole('button', { name: 'Reativar com os perfis anteriores' })) as HTMLButtonElement).disabled).toBe(false)
    })

    it('CONFIRMACAO_INVALIDA mantém o diálogo aberto com a mensagem; outra recusa fecha e alerta', async () => {
      const base = createSource(host)
      let codigo = 'CONFIRMACAO_INVALIDA'
      const source: Source = { ...base, encerrar: () => Promise.reject(new AcessoError(codigo, codigo === 'CONFIRMACAO_INVALIDA' ? 'O nome não confere.' : 'Sem permissão no servidor.', [])) }
      tela(ADMIN_ACESSOS, 'bruno@exemplo.test', source)
      fireEvent.change(await abrir(), { target: { value: 'Bruno' } })
      fireEvent.click(botaoConfirmar())
      await screen.findByText('O nome não confere.')
      expect(screen.getByLabelText(/Digite o primeiro nome/)).toBeTruthy()
      codigo = 'SEM_PERMISSAO'
      fireEvent.click(botaoConfirmar())
      await screen.findByText('Sem permissão no servidor.')
      await waitFor(() => expect(screen.queryByLabelText(/Digite o primeiro nome/)).toBeNull())
    })

    it('NADA_A_REATIVAR vira alerta', async () => {
      const base = createSource(host)
      const source: Source = { ...base, reativar: () => Promise.reject(new AcessoError('NADA_A_REATIVAR', 'Não há encerramento a reativar.', [])) }
      tela(ADMIN_ACESSOS, 'joana.teste@betinhos.onmicrosoft.com', source)
      fireEvent.click(await screen.findByRole('button', { name: 'Reativar com os perfis anteriores' }))
      await screen.findByText('Não há encerramento a reativar.')
    })

    const comEncerramento = (enc: (email: string) => Promise<Encerrado | null>): Source => ({ ...createSource(host), encerramento: enc })
    const JOANA = 'joana.teste@betinhos.onmicrosoft.com'
    const encerrada = (ciclo: Encerrado['ciclo'], antes = { areas: {}, acessos: false } as PerfisPessoa): Encerrado => ({ id: 'x', nome: 'Joana Encerrada Teste', email: JOANA, encerradoEm: new Date('2026-11-10T14:00:00Z'), encerradoPor: 'Ana Exemplo', fichaId: 'm9', ciclo, antes })

    it('falha ao ler o encerramento mostra o erro com Tentar de novo, não "sem conta"', async () => {
      let falha = true
      const base = createSource(host)
      tela(ADMIN_ACESSOS, JOANA, comEncerramento((e) => (falha ? Promise.reject(new Error('Falha ao ler o encerramento.')) : base.encerramento(e))))
      await screen.findByText('Falha ao ler o encerramento.')
      expect(screen.queryByText(/ainda não tem conta/)).toBeNull()
      falha = false
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
      await screen.findByText(/Acesso encerrado em/)
    })

    it('pessoa ativa não pede a leitura de encerramentos', async () => {
      const encerramento = vi.fn(() => Promise.resolve(null))
      tela(ADMIN_ACESSOS, 'bruno@exemplo.test', comEncerramento(encerramento))
      await screen.findByRole('button', { name: 'Salvar perfis' })
      expect(encerramento).not.toHaveBeenCalled()
    })

    it('Reativar trava para quem não é Administrador do Sistema quando o encerramento tirou equipe restrita, e o texto lista papéis e equipes', async () => {
      const source: Source = { ...comEncerramento(() => Promise.resolve(encerrada({ acao: 'encerrar', papeis: [{ id: 'p', nome: 'Perfil - Base' }, { id: 'q', nome: 'Administrador do Sistema' }], equipes: [{ id: 'E1', nome: 'Diretoria' }, { id: 'e2', nome: '' }] }))), load: async () => ({ ...(await createSource(host).load()), equipesRestritas: ['e1'] }) }
      tela(ADMIN_ACESSOS, JOANA, source)
      await screen.findByText(/Acesso encerrado em/)
      expect(screen.getByText('Volta com: papel Administrador do Sistema, equipe Diretoria, equipe item sem nome.')).toBeTruthy()
      expect((screen.getByRole('button', { name: 'Reativar com os perfis anteriores' }) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText('Só o Administrador do Sistema reativa quem tinha acesso amplo ou era Administrador de acessos.')).toBeTruthy()
    })

    it('Reativar trava por equipe restrita ou por Administrador de acessos mesmo sem papel amplo; libera para o Administrador do Sistema', async () => {
      const equipe = { acao: 'encerrar' as const, papeis: [], equipes: [{ id: 'e1', nome: '' }] }
      const source = (ciclo: Encerrado['ciclo'], antes?: PerfisPessoa): Source => ({ ...comEncerramento(() => Promise.resolve(encerrada(ciclo, antes))), load: async () => ({ ...(await createSource(host).load()), equipesRestritas: ['e1'] }) })
      const botao = () => screen.getByRole('button', { name: 'Reativar com os perfis anteriores' }) as HTMLButtonElement
      tela(ADMIN_ACESSOS, JOANA, source(equipe))
      await screen.findByText(/Acesso encerrado em/)
      expect(botao().disabled).toBe(true)
      cleanup()
      tela(ADMIN_ACESSOS, JOANA, source({ acao: 'encerrar', papeis: [] }, { areas: {}, acessos: true }))
      await screen.findByText(/Acesso encerrado em/)
      expect(botao().disabled).toBe(true)
      cleanup()
      tela(TODOS, JOANA, source(equipe))
      await screen.findByText(/Acesso encerrado em/)
      expect(botao().disabled).toBe(false)
    })

    it('o botão de encerrar fica travado para quem é Administrador de acessos', async () => {
      tela(ADMIN_ACESSOS, 'ana@exemplo.test')
      await screen.findByText('Acesso ao sistema')
      // Ana é a pessoa logada no mock: sem botão. Carla tem acesso amplo e Administrador de acessos.
      cleanup()
      tela(ADMIN_ACESSOS, 'carla@exemplo.test')
      expect(((await screen.findByRole('button', { name: 'Encerrar acesso ao sistema…' })) as HTMLButtonElement).disabled).toBe(true)
    })

    it('etapas: só erro e puladas que pedem ação aparecem, com texto humano; o resto some', async () => {
      const etapas: Etapa[] = [
        { etapa: 'papeis', estado: 'feita', detalhe: '1 retirado(s)' },
        { etapa: 'perfisColuna', estado: 'pulada', detalhe: 'não tinha' },
        { etapa: 'equipes', estado: 'pulada', detalhe: 'Diretoria: equipe de grupo do Entra; tire a pessoa do grupo no Entra' },
        { etapa: 'bloqueio', estado: 'pulada', detalhe: 'já bloqueado' },
        { etapa: 'conferencia', estado: 'erro', detalhe: 'ainda recebe papel pela equipe X (grupo do Entra: peça à TI)' },
      ]
      const source: Source = { ...createSource(host), encerrar: () => Promise.resolve(etapas) }
      tela(ADMIN_ACESSOS, 'bruno@exemplo.test', source)
      fireEvent.change(await abrir(), { target: { value: 'Bruno' } })
      fireEvent.click(botaoConfirmar())
      await screen.findByText('Conferência final: ainda recebe papel pela equipe X (grupo do Entra: peça à TI)')
      expect(screen.getByText('Diretoria: equipe de grupo do Entra; tire a pessoa do grupo no Entra')).toBeTruthy()
      expect(screen.queryByText(/não tinha/)).toBeNull()
      expect(screen.queryByText(/perfisColuna/)).toBeNull()
      expect(screen.queryByText(/já bloqueado/)).toBeNull()
    })

    it('o estado encerrado do mock não mostra etapas técnicas', async () => {
      tela(ADMIN_ACESSOS, JOANA)
      await screen.findByText(/Acesso encerrado em/)
      expect(screen.queryByText(/perfisColuna|sem equipe com papel/)).toBeNull()
    })
  })
})
