// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DespesasPage } from './DespesasPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Despesas operacionais', () => {
  it('abre a ficha com vínculos e comprovantes, sem ações de escrita', async () => {
    render(<DespesasPage host={{ mode: 'mock' }} />)
    const linhas = await screen.findAllByText('Posto Shell Faria Lima')
    fireEvent.click(linhas[0].closest('button')!)
    const ficha = await screen.findByRole('dialog', { name: 'Posto Shell Faria Lima' })
    expect(within(ficha).getByText('Carlos Oliveira', { selector: 'dd' })).toBeTruthy()
    expect(await within(ficha).findByText('painel-km.jpg')).toBeTruthy()
    expect(within(ficha).getAllByRole('link', { name: /Abrir/ }).length).toBeGreaterThan(0)
    expect(within(ficha).queryByRole('button', { name: /Validar|Pagar|Cancelar|Salvar/ })).toBeNull()
  })

  it('abre o comprovante no visualizador e navega entre os arquivos', async () => {
    // jsdom não implementa <dialog>.showModal: o mínimo para o visualizador abrir e fechar.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
    render(<DespesasPage host={{ mode: 'mock' }} />)
    fireEvent.click((await screen.findAllByText('Posto Shell Faria Lima'))[0].closest('button')!)
    const ficha = await screen.findByRole('dialog', { name: 'Posto Shell Faria Lima' })
    fireEvent.click(await within(ficha).findByRole('button', { name: 'Ver painel-km.jpg' }))
    const viewer = await screen.findByRole('dialog', { name: 'Comprovante painel-km.jpg' })
    expect(await within(viewer).findByRole('img', { name: 'painel-km.jpg' })).toBeTruthy()
    expect(within(viewer).getByText('2 de 2')).toBeTruthy()
    fireEvent.click(within(viewer).getByRole('button', { name: 'Próximo comprovante' }))
    expect(await screen.findByRole('dialog', { name: 'Comprovante cupom-desp-5001.jpg' })).toBeTruthy()
    expect((await within(viewer).findByRole('link', { name: 'Baixar arquivo' })).getAttribute('download')).toBe('cupom-desp-5001.jpg')
  })

  it('a visão Possível duplicidade mostra só as marcadas', async () => {
    render(<DespesasPage host={{ mode: 'mock' }} />)
    await screen.findAllByText('Posto Shell Faria Lima')
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    const opcao = await waitFor(() => {
      const el = screen.getAllByText('Possível duplicidade').map((e) => e.closest('[role="option"]')).find(Boolean)
      if (!el) throw new Error('opção não apareceu')
      return el
    })
    fireEvent.click(opcao)
    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(3))
  })
})
