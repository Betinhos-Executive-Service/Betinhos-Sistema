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
import { AcessoError } from '../data/acesso'

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
      fireEvent.click(await screen.findByRole('button', { name: 'Encerrar acesso…' }))
      return (await screen.findByLabelText(/Digite o primeiro nome/)) as HTMLInputElement
    }
    const botaoConfirmar = () => screen.getByRole('button', { name: 'Encerrar acesso' }) as HTMLButtonElement

    it('o botão não aparece na própria linha', async () => {
      tela(ADMIN_ACESSOS, 'ana@exemplo.test')
      await screen.findByText('Acesso ao sistema')
      await screen.findByText(/Ninguém altera o próprio acesso/)
      expect(screen.queryByRole('button', { name: 'Encerrar acesso…' })).toBeNull()
    })

    it('quem não é Administrador do Sistema vê o botão travado com o motivo para quem tem o amplo', async () => {
      tela(ADMIN_ACESSOS, 'carlos.teste@betinhos.onmicrosoft.com')
      const botao = (await screen.findByRole('button', { name: 'Encerrar acesso…' })) as HTMLButtonElement
      expect(botao.disabled).toBe(true)
      expect(screen.getByText('Só o Administrador do Sistema encerra o acesso de quem tem acesso amplo.')).toBeTruthy()
    })

    it('o Administrador do Sistema encerra quem tem o amplo', async () => {
      tela(TODOS, 'carlos.teste@betinhos.onmicrosoft.com')
      expect(((await screen.findByRole('button', { name: 'Encerrar acesso…' })) as HTMLButtonElement).disabled).toBe(false)
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
  })
})
