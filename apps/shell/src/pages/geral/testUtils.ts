// Apoio comum aos arquivos GeralPage*.test.tsx. A suíte da Geral foi dividida em vários arquivos porque o Vitest
// paraleliza por arquivo: num arquivo só ela levava ~150 s no CI e era o piso do tempo total.
// Cada arquivo de teste declara o mock da fonte assim (o vi.mock só vale no próprio arquivo de teste):
//   vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>()))
// Este módulo não importa './data/source' em tempo de execução (só tipos): importá-lo de dentro do mock fecharia um ciclo.
import { cleanup, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { MOCK_ROW_COUNT } from './data/mock'
import type { Source } from './data/source'

type SourceModule = typeof import('./data/source')

// Ganchos para simular o que o mock não faz: falha parcial de estado, linha inativa e cópia lenta.
export const hooks = {
  setState: null as null | Source['setState'],
  copyRows: null as null | Source['copyRows'],
  update: null as null | Source['update'],
  attributes: null as null | Source['attributes'],
  mixedState: false,
  programada: false,
  gerarLink: null as null | Source['gerarLink'],
}

/**
 * Linhas por página nos testes de tela. A tela real pede 100; aqui bastam 20, porque renderizar e consultar por papel
 * 100 linhas no jsdom era a maior parte do custo destes arquivos. Quem testa a página cheia ou a rolagem
 * (GeralPage.densidade) passa `{ pageSize: 100 }` ao `mockSource`.
 */
export const TEST_PAGE_SIZE = 20

/** Fábrica do vi.mock de './data/source': a fonte do mock sem latência e com páginas menores, com os ganchos acima. */
export function mockSource(actual: SourceModule, { pageSize = TEST_PAGE_SIZE }: { pageSize?: number } = {}): SourceModule {
  return {
    ...actual,
    createSource: (host: Parameters<SourceModule['createSource']>[0]): Source => {
      // Sem a latência simulada do pnpm dev: os testes não esperam timers artificiais.
      const source = actual.createSource(host, { latency: 0, pageSize })
      return {
        ...source,
        setState: (ids, active) => (hooks.setState ? hooks.setState(ids, active) : source.setState(ids, active)),
        copyRows: (ids) => (hooks.copyRows ? hooks.copyRows(ids) : source.copyRows(ids)),
        attributes: (entity) => (hooks.attributes ? hooks.attributes(entity) : source.attributes(entity)),
        update: (id, patch) => (hooks.update ? hooks.update(id, patch) : source.update(id, patch)),
        gerarLink: (id) => (hooks.gerarLink ? hooks.gerarLink(id) : source.gerarLink(id)),
        page: async (request) => {
          const page = await source.page(request)
          if (hooks.programada) return { ...page, rows: page.rows.map((row, index) => (index === 0 ? { ...row, cr40f_status: 202410005, _cr40f_motorista_value: 'm1' } : index === 1 ? { ...row, cr40f_status: 202410001 } : row)) }
          return hooks.mixedState ? { ...page, rows: page.rows.map((row, index) => (index === 1 ? { ...row, statecode: 1 } : row)) } : page
        },
      }
    },
  }
}

/** Timeouts, stubs e limpeza entre testes, iguais em todos os arquivos da Geral. Chame no topo do arquivo. */
export function usarAmbienteGeral() {
  // O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
  configure({ asyncUtilTimeout: 8000 })
  vi.setConfig({ testTimeout: 60_000 })

  beforeEach(() => {
    window.localStorage.clear()
    // Desktop largo (≥1280 px): a linha de comando do DS mostra até 3 ações da seleção; abaixo disso, só 1.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width: 1280px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  })
  afterEach(() => {
    cleanup()
    // A tela grava o estado no hash; sem limpar, o teste seguinte abriria na visão e na busca do anterior.
    window.history.replaceState(null, '', window.location.pathname)
    vi.unstubAllGlobals()
    FakeObserver.instances = []
    hooks.setState = null
    hooks.copyRows = null
    hooks.update = null
    hooks.attributes = null
    hooks.mixedState = false
  })
}

/** Observador falso: guarda o callback e as opções; `trigger` simula a interseção do sentinela. */
export class FakeObserver {
  static instances: FakeObserver[] = []
  static trigger(entries: Array<{ isIntersecting: boolean }>) { for (const o of FakeObserver.instances.filter((i) => !i.closed)) o.callback(entries as IntersectionObserverEntry[], o as unknown as IntersectionObserver) }
  closed = false
  observed: Element[] = []
  constructor(public callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) { FakeObserver.instances.push(this) }
  observe(element: Element) { this.observed.push(element) }
  disconnect() { this.closed = true }
  unobserve() {}
  takeRecords() { return [] }
}

/**
 * Status da primeira página da Agenda sem filtro (cabeçalho e rodapé mostram o mesmo texto). O total entra no padrão
 * porque uma visão filtrada com mais de uma página (ex.: Sem motorista, 44) também mostra "20 de N serviços".
 */
export const PAGE1 = new RegExp(`^${TEST_PAGE_SIZE} de ${MOCK_ROW_COUNT} serviços$`)

export const dataRows = () => screen.getAllByRole('row', { hidden: true })
export const colFilter = () => document.querySelector<HTMLElement>('.bt-colfilter')
/** Painel "Filtrar por" da coluna (usa `popover`, que o jsdom deixa como display:none: o nome acessível sai vazio, então localiza pela classe). */
export async function openColumnFilter(name: RegExp, label: string) {
  await columnMenu(name, 'Filtrar por…')
  await waitFor(() => expect(colFilter()?.getAttribute('aria-label')).toBe(`Filtro da coluna ${label}`))
  return colFilter() as HTMLElement
}
/** O título da coluna abre o menu (como no model-driven): escolhe um item dele. */
export const columnMenu = async (name: RegExp, item: string) => {
  // Procura só na linha de títulos: pela tela inteira, o getByRole calcula o nome de todos os botões das linhas de dados.
  const header = document.querySelector<HTMLElement>('[role="columnheader"]')?.closest<HTMLElement>('[role="row"]')
  fireEvent.click((header ? within(header) : screen).getByRole('button', { name, hidden: true }))
  fireEvent.click(await screen.findByRole('menuitem', { name: item, hidden: true }))
}
export const findDataRows = async () => { await screen.findAllByRole('row', { hidden: true }); return dataRows() }

/** A célula só vira editável quando a metadata chega: espera a classe do tipo aparecer na linha. */
export const cellOf = (row: HTMLElement, kind: string) =>
  waitFor(() => {
    const cell = within(row).getAllByRole('gridcell').find((c) => c.className.includes(`gr-cell--${kind}`))
    if (!cell) throw new Error(`Sem célula ${kind}`)
    return cell
  })

/** O seletor de visão é o título da lista (DS §10.9.1): um botão "Visão: <nome>" que abre o menu das visões. */
// `hidden: true` pula a checagem de acessibilidade, que pede o estilo computado de cada ancestral e é cara no jsdom.
export const viewTrigger = () => screen.getByRole('button', { name: /^Visão: /, hidden: true })
export async function pickView(name: string) {
  fireEvent.click(viewTrigger())
  // O painel do Menu usa `popover`, que o jsdom não exibe: os itens existem, mas ficam fora da árvore acessível.
  fireEvent.click(await screen.findByRole('menuitemradio', { name, hidden: true }))
}

/** Desktop: Gerar Voucher, Copiar Serviços, Gerar OP e Disparar vivem no menu "Ações" da barra. */
/** Roda uma ação da seleção: o botão da linha de comando, se ela estiver lá (`inline`), ou o item do menu "Ações" (DS §10.9.6). */
export async function acao(name: string) {
  const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
  const inline = within(toolbar).queryByRole('button', { name })
  if (inline) { fireEvent.click(inline); return }
  fireEvent.click(within(toolbar).getByRole('button', { name: /^Ações/ }))
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${name}`), hidden: true }))
}
