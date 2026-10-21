// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PessoasPage } from './PessoasPage'
import type { Host } from '../../host'
import { STATUS } from './domain/choices'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = '' })

const row = async (nome: string) => (await screen.findAllByText(nome))[0].closest('.bt-table__row') as HTMLElement

describe('Pessoas', () => {
  it('clique na linha abre a ficha com histórico e duplicados', async () => {
    render(<PessoasPage host={{ mode: 'mock' }} />)
    fireEvent.click((await row('Mari Albuquerque')).querySelectorAll('[role="cell"]')[3])
    const ficha = await screen.findByRole('dialog', { name: 'Mari Albuquerque' })
    expect(within(ficha).getByText('Possível cadastro duplicado')).toBeTruthy()
    expect(await within(ficha).findByText(/no total/)).toBeTruthy()
    expect(within(ficha).getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/5511998124410')
  })

  it('edita, salva só o que mudou e atualiza a lista', async () => {
    render(<PessoasPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await row('John Carter')).getByRole('button', { name: /^John Carter/ }))
    const ficha = await screen.findByRole('dialog', { name: 'John Carter' })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Editar cadastro' }))
    await screen.findByRole('button', { name: 'Salvar alterações' })
    fireEvent.change(document.querySelector('input[name="departamento"]') as HTMLInputElement, { target: { value: 'Compras' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Cadastro de John Carter salvo.')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText(/Compras/).length).toBeGreaterThan(0))
  })

  it('link antigo com filtro na URL abre filtrado e passa a usar f=', async () => {
    window.location.hash = `#/pessoas?status=${STATUS.inativo}`
    render(<PessoasPage host={{ mode: 'mock' }} />)
    await row('Paulo Tavares')
    await waitFor(() => expect(screen.queryAllByText('John Carter')).toHaveLength(0))
    await waitFor(() => expect(window.location.hash).toMatch(/[?&]f=/))
    expect(window.location.hash).not.toMatch(/[?&]status=/)
  })

  it('cadastro avisa duplicado, valida e pede confirmação ao fechar com alterações', async () => {
    render(<PessoasPage host={{ mode: 'mock' }} />)
    await row('John Carter')
    fireEvent.click(screen.getByRole('button', { name: 'Nova pessoa' }))
    await screen.findByRole('dialog', { name: 'Nova pessoa' })
    const nome = document.querySelector('input[name="nome"]') as HTMLInputElement
    fireEvent.change(nome, { target: { value: 'X' } })
    fireEvent.change((document.querySelector('input[name="telefone"]') as HTMLInputElement), { target: { value: '11998124410' } })
    expect((await screen.findAllByText(/mesmo celular/)).length).toBe(2)
    expect((document.querySelector('input[name="telefone"]') as HTMLInputElement).value).toBe('(11) 99812-4410')

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar pessoa' }))
    expect(await screen.findByText('Nome muito curto.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
    expect(screen.getByRole('dialog', { name: 'Nova pessoa' })).toBeTruthy()

    fireEvent.change(nome, { target: { value: 'Ana Beatriz Lima' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar pessoa' }))
    expect(await screen.findByText('Ana Beatriz Lima cadastrado.')).toBeTruthy()
    expect(await screen.findByRole('dialog', { name: 'Ana Beatriz Lima' })).toBeTruthy()
  })

  it('voltar à lista usa o cache: aparece na hora, sem esqueleto nem nova carga', async () => {
    const host: Host = { mode: 'mock' }
    const first = render(<PessoasPage host={host} />)
    await row('John Carter')
    first.unmount()
    render(<PessoasPage host={host} />)
    // Sem `await`: a lista vem do cache no primeiro render.
    expect(screen.getAllByText('John Carter').length).toBeGreaterThan(0)
    expect(screen.queryByText(/carregando o restante/)).toBeNull()
  })

  it('edição aparece ao voltar para a lista (cache atualizado e marcado para revalidar)', async () => {
    const host: Host = { mode: 'mock' }
    const first = render(<PessoasPage host={host} />)
    fireEvent.click(within(await row('John Carter')).getByRole('button', { name: /^John Carter/ }))
    const ficha = await screen.findByRole('dialog', { name: 'John Carter' })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Editar cadastro' }))
    await screen.findByRole('button', { name: 'Salvar alterações' })
    fireEvent.change(document.querySelector('input[name="departamento"]') as HTMLInputElement, { target: { value: 'Compras' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Cadastro de John Carter salvo.')).toBeTruthy()
    first.unmount()
    window.location.hash = '#/pessoas'
    render(<PessoasPage host={host} />)
    expect(screen.getAllByText(/Compras/).length).toBeGreaterThan(0)
  })

  it('lista grande: primeira página logo, o resto em segundo plano e rolagem sem botão de paginação', async () => {
    window.history.replaceState(null, '', '/?volume=400')
    try {
      render(<PessoasPage host={{ mode: 'mock' }} />)
      // Com a máquina lenta, outros lotes (até o último) podem chegar antes desta leitura, ainda com o aviso na tela.
      const parcial = await screen.findByText(/carregando o restante/)
      const [, visiveis, total] = /^(\d+) de (\d+) ·/.exec(parcial.textContent ?? '') ?? []
      expect(Number(visiveis)).toBe(Number(total))
      expect(Number(total)).toBeGreaterThanOrEqual(100)
      expect(Number(total)).toBeLessThanOrEqual(410)
      await screen.findByText(/^410 de 410 ·/, undefined, { timeout: 5000 })
      expect(screen.queryByText(/carregando o restante/)).toBeNull()
      expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull()
      // Sem IntersectionObserver no jsdom, o rodapé revela os lotes sozinho; com ele, revelaria ao rolar.
      await waitFor(() => expect(document.querySelectorAll('.bt-table__row').length).toBe(410), { timeout: 20_000 })
    } finally {
      window.history.replaceState(null, '', '/')
    }
  }, 60_000)
})
