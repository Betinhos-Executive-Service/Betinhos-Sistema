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

const [first, second] = initialCompositions
const hour = (client: string) => new RegExp(`${client}, Hora motorista:`)
const formula = { cr40f_valorhoramotorista: { expression: '=[Tempo de espera]*2', engineVersion: 1 } }
type Formulas = Map<string, typeof formula>

function observer() {
  let notify: (() => void) | undefined
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { notify = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    observe() {}
    disconnect() {}
  })
  return { ready: () => Boolean(notify), notify: () => notify!() }
}

it('PARK-T4a: fórmulas que falham bloqueiam a edição com aviso e a grade continua de pé', async () => {
  load.mockResolvedValue({ records: [first], source: 'dataverse', nextLink: null, formulas: Promise.reject(new Error('Sem acesso às fórmulas.')) })

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  const cell = await screen.findByLabelText(hour(first.client))
  expect(await screen.findByText(/Fórmulas indisponíveis: Sem acesso às fórmulas\./)).toBeTruthy()

  fireEvent.doubleClick(cell)
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()
  expect(screen.getByLabelText(hour(first.client))).toBeTruthy()
})

it('PARK-T4c: a edição espera as fórmulas da página da linha e abre com a fórmula', async () => {
  let release!: (map: Formulas) => void
  load.mockResolvedValue({ records: [first], source: 'dataverse', nextLink: null, formulas: new Promise<Formulas>((resolve) => { release = resolve }) })

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  fireEvent.doubleClick(await screen.findByLabelText(hour(first.client)))
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()

  await act(async () => { release(new Map([[first.id, formula]])) })

  const editor = await screen.findByRole('textbox', { name: 'Editar Hora motorista' })
  expect(String((editor as HTMLInputElement).value)).toMatch(/^=/)
})

it('PARK-T4b: fórmulas de outra página entram por id sem apagar as já carregadas', async () => {
  const observed = observer()
  const page = (records: typeof initialCompositions, formulas: Formulas, nextLink: string | null) => ({ records, source: 'dataverse', nextLink, formulas: Promise.resolve(formulas) })
  load.mockImplementation((link) => link === '?page=2'
    ? Promise.resolve(page([second], new Map([[second.id, formula]]), null))
    : Promise.resolve(page([first], new Map([[first.id, formula]]), '?page=2')))

  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await waitFor(() => expect(screen.getByLabelText(new RegExp(`${first.client}, Hora motorista:.*possui fórmula`))).toBeTruthy())
  await waitFor(() => expect(observed.ready()).toBe(true))
  act(() => observed.notify())

  await waitFor(() => expect(screen.getByLabelText(new RegExp(`${second.client}, Hora motorista:.*possui fórmula`))).toBeTruthy())
  expect(screen.getByLabelText(new RegExp(`${first.client}, Hora motorista:.*possui fórmula`))).toBeTruthy()
})
