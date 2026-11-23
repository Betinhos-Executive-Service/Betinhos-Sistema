// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AcessosContext, type ValorAcessos } from './AcessosProvider'
import { AppShell } from './AppShell'
import { lerPapeis } from './acessos'

const PROPS = { activeId: 'inicio', title: 'Início', entityLabels: new Map<string, string>(), connection: { ok: true, text: 'Conectado' } }

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width: 821px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const shell = (valor: ValorAcessos) =>
  render(
    <AcessosContext.Provider value={valor}>
      <AppShell {...PROPS}><p>conteúdo</p></AppShell>
    </AcessosContext.Provider>,
  )

describe('AppShell com perfis', () => {
  it('esconde do menu o que o perfil não alcança', () => {
    shell({ status: 'pronto', acessos: lerPapeis(['Perfil - Financeiro - Operador']), recarregar: () => {} })
    expect(document.querySelector('a[href="#/despesas-operacionais"]')).not.toBeNull()
    expect(document.querySelector('a[href="#/geral"]')).toBeNull()
  })

  it('falha ao ler os acessos: só as telas livres e aviso com "Tentar de novo"', () => {
    const recarregar = vi.fn()
    shell({ status: 'erro', recarregar })
    expect(screen.getByText('Não foi possível carregar seus acessos')).toBeTruthy()
    expect(document.querySelector('a[href="#/geral"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(recarregar).toHaveBeenCalledOnce()
  })
})
