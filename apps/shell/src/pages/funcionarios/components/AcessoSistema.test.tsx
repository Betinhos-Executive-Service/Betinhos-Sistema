// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import type { Host } from '../../../host'
import { AcessosContext } from '../../../app/AcessosProvider'
import { NENHUM, TODOS, type Acessos } from '../../../app/acessos'
import { createSource, type Source } from '../../acessos/data/source'
import { AcessoSistema, type EstadoPerfis } from './AcessoSistema'

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
    fireEvent.click(screen.getByRole('button', { name: 'Salvar perfis' }))
    await waitFor(() => expect(estados.at(-1)).toEqual({ alterado: false, salvando: false }))
  })
})
