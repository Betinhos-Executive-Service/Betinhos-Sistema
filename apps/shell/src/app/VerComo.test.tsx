// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import type { Host } from '../host'
import { findItem } from '../nav/menu'
import { AcessoSistema } from '../pages/funcionarios/components/AcessoSistema'
import { createSource } from '../pages/acessos/data/source'
import { AcessosProvider, useAcessos, type VerComo } from './AcessosProvider'
import { AppShell } from './AppShell'
import { RouteLayout } from './RouteLayout'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
vi.mock('../pages/despesas/DespesasPage', () => ({ DespesasPage: () => <p>Tela de despesas</p> }))

const host = { mode: 'mock' } as Host
const PROPS = { activeId: 'inicio', title: 'Início', entityLabels: new Map<string, string>(), connection: { ok: true, text: 'Conectado' } }

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/?acessos=acessos#/funcionarios')
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width: 821px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** A ficha some enquanto simula (a tela troca para o início) e volta ao sair, como na página. */
function Ficha({ email }: { email: string }) {
  const { verComo } = useAcessos()
  return verComo ? null : <AcessoSistema email={email} source={createSource(host)} />
}

const tela = (email: string) =>
  render(
    <ToastProvider>
      <AcessosProvider host={host}>
        <AppShell {...PROPS}><Ficha email={email} /></AppShell>
      </AcessosProvider>
    </ToastProvider>,
  )

const menu = (href: string) => document.querySelector(`a[href="${href}"]`)
const entrar = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Ver como esta pessoa' }))
  return screen.findByText(/Vendo como/)
}

describe('Ver como', () => {
  it('entrar pelo botão troca o menu pelos perfis da pessoa e mostra o banner com o nome', async () => {
    tela('bruno@exemplo.test')
    await waitFor(() => expect(menu('#/acessos')).toBeNull())
    expect(menu('#/despesas-operacionais')).toBeNull()
    expect(await entrar()).toHaveProperty('textContent', 'Vendo como Bruno Modelo')
    expect(screen.getByRole('status', { name: /Vendo como Bruno/ }).textContent).toContain('Vendo como Bruno Modelo')
    expect(menu('#/despesas-operacionais')).not.toBeNull()
    expect(menu('#/frota')).toBeNull()
    expect(menu('#/rh-descontos')).toBeNull()
    expect(screen.queryByText(/tem acesso amplo/)).toBeNull()
    expect(window.location.hash).toBe('#/inicio')
  })

  it('o rascunho não salvo entra na simulação', async () => {
    tela('bruno@exemplo.test')
    await screen.findByRole('button', { name: 'Salvar perfis' })
    fireEvent.click(screen.getAllByRole('radio', { name: 'Gestor' })[2])
    await entrar()
    expect(menu('#/frota')).not.toBeNull()
  })

  it('quem tem acesso amplo vê tudo e o banner avisa', async () => {
    tela('carlos.teste@betinhos.onmicrosoft.com')
    await entrar()
    expect(screen.getByText(/tem acesso amplo/)).toBeTruthy()
    expect(menu('#/frota')).not.toBeNull()
    expect(menu('#/despesas-operacionais')).not.toBeNull()
  })

  it('Sair volta aos próprios acessos, à tela de origem e ao rascunho', async () => {
    tela('bruno@exemplo.test')
    await screen.findByRole('button', { name: 'Salvar perfis' })
    fireEvent.click(screen.getAllByRole('radio', { name: 'Gestor' })[2])
    await entrar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(screen.queryByText(/Vendo como/)).toBeNull()
    expect(window.location.hash).toBe('#/funcionarios')
    expect(menu('#/despesas-operacionais')).toBeNull()
    await screen.findByRole('button', { name: 'Salvar perfis' })
    expect((screen.getAllByRole('radio', { name: 'Gestor' })[2] as HTMLInputElement).checked).toBe(true)
  })

  it('Esc no banner também sai', async () => {
    tela('bruno@exemplo.test')
    fireEvent.keyDown(await entrar(), { key: 'Escape' })
    expect(screen.queryByText(/Vendo como/)).toBeNull()
    expect(window.location.hash).toBe('#/funcionarios')
  })

  it('a guarda de rota barra o módulo fora dos perfis simulados', async () => {
    window.history.replaceState(null, '', '/?acessos=financeiro:operador')
    const found = findItem('despesas-operacionais')!
    const simulacao: VerComo = { nome: 'Pessoa Teste', pessoaId: 'x', acessos: { admin: false, areas: { frota: 'operador' }, acessos: false }, amplo: false, voltarPara: '' }
    function Entrar() {
      const { entrarVerComo } = useAcessos()
      return <button type="button" onClick={() => entrarVerComo?.(simulacao)}>simular</button>
    }
    render(
      <AcessosProvider host={host}>
        <Entrar />
        <RouteLayout host={host} group={found.group} item={found.item} label="Despesas" />
      </AcessosProvider>,
    )
    expect(await screen.findByText('Tela de despesas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'simular' }))
    expect(await screen.findByText('Sem acesso a este módulo')).toBeTruthy()
    expect(screen.queryByText('Tela de despesas')).toBeNull()
  })
})
