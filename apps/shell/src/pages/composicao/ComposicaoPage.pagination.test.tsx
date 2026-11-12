// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { initialCompositions } from './data/compositions'
import { ComposicaoPage } from './ComposicaoPage'

const load = vi.hoisted(() => vi.fn())
vi.mock('./data/dataverse', async (original) => ({
  ...await original<typeof import('./data/dataverse')>(),
  loadCompositions: load,
  getDataverseEnvironmentLabel: () => 'DEV',
}))
vi.mock('./data/views', async (original) => ({
  ...await original<typeof import('./data/views')>(),
  loadColumnCatalog: async () => [],
  loadViews: async () => [], buildViews: () => [], fetchViewRows: async () => ({ personal: [], publicViews: [], pins: [] }),
}))

afterEach(() => { cleanup(); load.mockReset(); vi.unstubAllGlobals() })

function observeNextPage() {
  let notify: (() => void) | undefined
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      notify = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    observe() {}
    disconnect() {}
  })
  return {
    ready: () => Boolean(notify),
    notify: () => {
      if (!notify) throw new Error('IntersectionObserver ainda não foi registrado')
      notify()
    },
  }
}

it('não carrega a mesma página duas vezes quando o observador dispara em sequência', async () => {
  const observer = observeNextPage()
  let finishPage!: (page: unknown) => void
  const nextPage = new Promise((resolve) => { finishPage = resolve })
  load.mockImplementation((link) => link === '?page=2'
    ? nextPage
    : Promise.resolve({ records: [initialCompositions[0]], source: 'dataverse', nextLink: '?page=2', formulas: Promise.resolve(new Map()) }))

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByText('1+ registros')).toBeTruthy())
  await waitFor(() => expect(observer.ready()).toBe(true))
  expect(screen.getByText('1+ registros')).toBeTruthy()
  await act(async () => { observer.notify(); observer.notify() })
  expect(load.mock.calls.filter(([link]) => link === '?page=2')).toHaveLength(1)

  await act(async () => { finishPage({ records: [initialCompositions[1]], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) }) })
  await waitFor(() => expect(screen.getByText('2 registros')).toBeTruthy())
  expect(load.mock.calls.filter(([link]) => link === '?page=2')).toHaveLength(1)
})

it('mostra o indicador no fim da lista e antecipa a próxima página pelo scroll', async () => {
  observeNextPage()
  load.mockImplementation((link) => Promise.resolve(link === '?page=2'
    ? { records: [initialCompositions[1]], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) }
    : { records: [initialCompositions[0]], source: 'dataverse', nextLink: '?page=2', formulas: Promise.resolve(new Map()) }))

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByText('1+ registros')).toBeTruthy())
  expect(screen.getByText('Carregando mais registros…')).toBeTruthy()
  const region = screen.getByRole('region', { name: 'Tabela de composições' })
  Object.defineProperty(region, 'clientHeight', { configurable: true, value: 500 })
  Object.defineProperty(region, 'scrollHeight', { configurable: true, value: 3000 })
  Object.defineProperty(region, 'scrollTop', { configurable: true, value: 1600 })
  await act(async () => { fireEvent.scroll(region) })
  await waitFor(() => expect(screen.getByText('2 registros')).toBeTruthy())
  expect(load.mock.calls.filter(([link]) => link === '?page=2')).toHaveLength(1)
  expect(screen.queryByText('Carregando mais registros…')).toBeNull()
})

it('mostra a falha de paginação e permite tentar novamente', async () => {
  const observer = observeNextPage()
  let pageRequests = 0
  load.mockImplementation((link) => {
    if (link === '?page=2') {
      pageRequests++
      return pageRequests === 1
        ? Promise.reject(new Error('Conexão interrompida'))
        : Promise.resolve({ records: [initialCompositions[1]], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) })
    }
    return Promise.resolve({ records: [initialCompositions[0]], source: 'dataverse', nextLink: '?page=2', formulas: Promise.resolve(new Map()) })
  })

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByText('1+ registros')).toBeTruthy())
  await waitFor(() => expect(observer.ready()).toBe(true))
  await act(async () => { observer.notify() })
  expect(await screen.findByText('Conexão interrompida')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(screen.getByText('2 registros')).toBeTruthy())
  expect(pageRequests).toBe(2)
})

it('interrompe paginação quando o Dataverse devolve de novo as mesmas linhas em outra página', async () => {
  const observer = observeNextPage()
  load.mockImplementation((link) => Promise.resolve(link === '?page=2'
    ? { records: [initialCompositions[0]], source: 'dataverse', nextLink: '?page=3', formulas: Promise.resolve(new Map()) }
    : { records: [initialCompositions[0]], source: 'dataverse', nextLink: '?page=2', formulas: Promise.resolve(new Map()) }))

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByText('1+ registros')).toBeTruthy())
  await waitFor(() => expect(observer.ready()).toBe(true))
  await act(async () => { observer.notify() })

  expect((await screen.findByRole('alert')).textContent).toContain('Dataverse repetiu')
  expect(screen.getByText('1 registro')).toBeTruthy()
  expect(load.mock.calls.filter(([link]) => link === '?page=3')).toHaveLength(0)
})

it('Atualizar recarrega as páginas sem duplicar linhas quando o Dataverse repete o conteúdo', async () => {
  const observer = observeNextPage()
  let pageTwoCalls = 0
  load.mockImplementation((link) => {
    if (link === '?page=2') return Promise.resolve(++pageTwoCalls === 1
      ? { records: [initialCompositions[1]], source: 'dataverse', nextLink: '?page=3', formulas: Promise.resolve(new Map()) }
      : { records: [initialCompositions[0]], source: 'dataverse', nextLink: '?page=3', formulas: Promise.resolve(new Map()) })
    return Promise.resolve({ records: [initialCompositions[0]], source: 'dataverse', nextLink: '?page=2', formulas: Promise.resolve(new Map()) })
  })

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(observer.ready()).toBe(true))
  await act(async () => { observer.notify() })
  await waitFor(() => expect(screen.getByText('2+ registros')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))

  expect((await screen.findByRole('alert')).textContent).toContain('Dataverse repetiu')
  expect(screen.getByText('1 registro')).toBeTruthy()
  expect(load.mock.calls.filter(([link]) => link === '?page=3')).toHaveLength(0)
})

it('mostra falha inicial e recupera a grade após Atualizar', async () => {
  load.mockRejectedValueOnce(new Error('Dataverse indisponível'))
    .mockResolvedValue({ records: [initialCompositions[0]], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) })

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  expect((await screen.findByRole('alert')).textContent).toContain('Dataverse indisponível')
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  expect(await screen.findByText('1 registro')).toBeTruthy()
  expect(screen.queryByText('Dataverse indisponível')).toBeNull()
  expect(load).toHaveBeenCalledTimes(2)
})

it('mostra estado vazio sem habilitar comandos de seleção', async () => {
  load.mockResolvedValue({ records: [], source: 'dataverse', nextLink: null, formulas: Promise.resolve(new Map()) })

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  expect(await screen.findByText('Nenhuma composição encontrada')).toBeTruthy()
  expect(screen.getByText('0 registros')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Gerar OP' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Excluir' }).hasAttribute('disabled')).toBe(true)
})
