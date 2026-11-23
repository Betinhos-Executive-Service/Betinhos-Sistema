// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findItem } from '../nav/menu'
import { AcessosContext, type ValorAcessos } from './AcessosProvider'
import { RouteLayout } from './RouteLayout'
import { lerPapeis } from './acessos'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
vi.mock('../pages/despesas/DespesasPage', () => ({ DespesasPage: () => <p>Tela de despesas</p> }))

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function rota(id: string, valor: ValorAcessos) {
  const found = findItem(id)!
  return render(
    <AcessosContext.Provider value={valor}>
      <RouteLayout host={{ mode: 'mock' }} group={found.group} item={found.item} label={found.item.label ?? id} />
    </AcessosContext.Provider>,
  )
}

describe('guarda de perfil', () => {
  it('sem o perfil: "Sem acesso a este módulo", com o nome do perfil, e a tela não monta', async () => {
    rota('despesas-operacionais', { status: 'pronto', acessos: lerPapeis(['Perfil - Frota - Operador']), recarregar: () => {} })
    expect(screen.getByText('Sem acesso a este módulo')).toBeTruthy()
    expect(screen.getByText(/Esta tela pede o perfil Financeiro\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ir para a Página Inicial' })).toBeTruthy()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Tela de despesas')).toBeNull()
  })

  it('com o perfil a tela abre', async () => {
    rota('despesas-operacionais', { status: 'pronto', acessos: lerPapeis(['Perfil - Financeiro - Operador']), recarregar: () => {} })
    expect(await screen.findByText('Tela de despesas')).toBeTruthy()
  })

  it('enquanto lê os acessos mostra o carregamento, sem montar a tela', () => {
    rota('despesas-operacionais', { status: 'carregando', recarregar: () => {} })
    expect(screen.getByRole('status', { name: /Carregando/ })).toBeTruthy()
    expect(screen.queryByText('Sem acesso a este módulo')).toBeNull()
  })

  it('falha na leitura: aviso com "Tentar de novo"', () => {
    const recarregar = vi.fn()
    rota('despesas-operacionais', { status: 'erro', recarregar })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(recarregar).toHaveBeenCalledOnce()
  })
})
