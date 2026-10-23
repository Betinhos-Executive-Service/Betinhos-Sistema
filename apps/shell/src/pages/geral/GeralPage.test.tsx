// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Source } from './data/source'
import { MOCK_ROW_COUNT } from './data/mock'
import { GeralPage } from './GeralPage'
import { encodeFilters } from './domain/filters'

// Ganchos para simular o que o mock não faz: falha parcial de estado, linha inativa e cópia lenta.
const hooks = vi.hoisted(() => ({
  setState: null as null | Source['setState'],
  copyRows: null as null | Source['copyRows'],
  update: null as null | Source['update'],
  attributes: null as null | Source['attributes'],
  mixedState: false,
  programada: false,
  gerarLink: null as null | Source['gerarLink'],
}))
vi.mock('./data/source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/source')>()
  return {
    ...actual,
    createSource: (host: Parameters<typeof actual.createSource>[0]): Source => {
      // Sem a latência simulada do pnpm dev: os testes não esperam timers artificiais.
      const source = actual.createSource(host, { latency: 0 })
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
})

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })

/** Observador falso: guarda o callback e as opções; `trigger` simula a interseção do sentinela. */
class FakeObserver {
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

/** Status da primeira página (cabeçalho e rodapé mostram o mesmo texto). */
const PAGE1 = /^100 de \d+ serviços$/
vi.setConfig({ testTimeout: 60_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
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

const dataRows = () => screen.getAllByRole('row', { hidden: true })
const colFilter = () => document.querySelector<HTMLElement>('.bt-colfilter')
/** Painel "Filtrar por" da coluna (usa `popover`, que o jsdom deixa como display:none: o nome acessível sai vazio, então localiza pela classe). */
async function openColumnFilter(name: RegExp, label: string) {
  await columnMenu(name, 'Filtrar por…')
  await waitFor(() => expect(colFilter()?.getAttribute('aria-label')).toBe(`Filtro da coluna ${label}`))
  return colFilter() as HTMLElement
}
/** O título da coluna abre o menu (como no model-driven): escolhe um item dele. */
const columnMenu = async (name: RegExp, item: string) => {
  fireEvent.click(screen.getByRole('button', { name, hidden: true }))
  fireEvent.click(await screen.findByRole('menuitem', { name: item, hidden: true }))
}
const findDataRows = async () => { await screen.findAllByRole('row', { hidden: true }); return dataRows() }

/** A célula só vira editável quando a metadata chega: espera a classe do tipo aparecer na linha. */
const cellOf = (row: HTMLElement, kind: string) =>
  waitFor(() => {
    const cell = within(row).getAllByRole('gridcell').find((c) => c.className.includes(`gr-cell--${kind}`))
    if (!cell) throw new Error(`Sem célula ${kind}`)
    return cell
  })


/** O seletor de visão é o título da lista (DS §10.9.1): um botão "Visão: <nome>" que abre o menu das visões. */
const viewTrigger = () => screen.getByRole('button', { name: /^Visão: / })
async function pickView(name: string) {
  fireEvent.click(viewTrigger())
  // O painel do Menu usa `popover`, que o jsdom não exibe: os itens existem, mas ficam fora da árvore acessível.
  fireEvent.click(await screen.findByRole('menuitemradio', { name, hidden: true }))
}

/** Desktop: Gerar Voucher, Copiar Serviços, Gerar OP e Disparar vivem no menu "Ações" da barra. */
async function acao(name: string) {
  const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
  fireEvent.click(within(toolbar).getByRole('button', { name: /^Ações/ }))
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${name}`), hidden: true }))
}

describe('Geral', () => {
  it('abre a Agenda com as colunas da visão, pagina e ordena', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('columnheader', { name: /Status de Operação/, hidden: true })).toBeTruthy()
    // A linha do cabeçalho já existe antes dos dados: espera as 100 linhas chegarem.
    await waitFor(() => expect(dataRows().length).toBeGreaterThan(10))
    expect(screen.getAllByText(PAGE1)).toHaveLength(1)
    await columnMenu(/^Status de Operação$/, 'Ordenar A→Z')
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Status de Operação/, hidden: true }).getAttribute('aria-sort')).toBe('ascending'))
    // O primeiro teste paga a carga fria dos módulos: com a máquina ocupada passa dos 30 s do padrão.
  }, 60_000)

  it('abre na visão pedida pela URL e grava o estado sem empilhar histórico', async () => {
    window.location.hash = '#/geral?view=mock-sem-motorista'
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    try {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await waitFor(() => expect(viewTrigger().textContent).toContain('Sem motorista'))
      await waitFor(() => expect(window.location.hash).toBe('#/geral?view=mock-sem-motorista'))
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
      await waitFor(() => expect(window.location.hash).toBe('#/geral?view=mock-sem-motorista&q=OS-10'))
      expect(replace).toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
    } finally {
      replace.mockRestore()
      push.mockRestore()
      window.location.hash = ''
    }
  })

  it('troca de visão e busca por palavra-chave', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    await pickView('Sem motorista')
    await waitFor(() => expect(screen.queryAllByText(PAGE1)).toHaveLength(0))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
    await waitFor(() => expect(screen.getAllByText(/OS-10\d/).length).toBeGreaterThan(0), { timeout: 4000 })
  })

  it('ocultar coluna some da tabela e volta com restaurar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const restore = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(restore).getByRole('button', { name: 'Restaurar colunas' }))
    fireEvent.click(within(restore).getByRole('button', { name: 'Aplicar' }))
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
  })

  it('o menu do título ordena crescente e decrescente; Restaurar padrão volta à ordem da visão', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const header = () => screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })
    await columnMenu(/^Trajeto$/, 'Ordenar A→Z')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
    await screen.findAllByText(PAGE1)
    await columnMenu(/^Trajeto$/, 'Ordenar Z→A')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findAllByText(PAGE1)
    fireEvent.click(viewTrigger())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar padrão', hidden: true }))
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('none'))
  }, 60_000)

  it('busca sem resultado mostra o estado vazio e limpar busca volta à lista', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'zzzz-nada' } })
    const empty = (await screen.findByText('Nenhum serviço nesta visão', {}, { timeout: 4000 })).closest('section') as HTMLElement
    // A caixa de busca também tem um "Limpar busca"; o do estado vazio é o que está dentro da seção.
    fireEvent.click(within(empty).getByRole('button', { name: 'Limpar busca' }))
    await screen.findAllByText(PAGE1)
  })

  it('a coluna oculta fica salva por visão e volta ao reabrir a tela', async () => {
    const first = render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mover Trajeto para cima' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull())
    first.unmount()
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Status de Operação/, hidden: true })
    expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull()
  })

  it('fechar o diálogo de colunas com alterações pede confirmação antes de descartar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas' })

    // Sem alterações: fecha direto.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar painel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()

    // Com alterações: X abre a confirmação; "Continuar editando" mantém o diálogo.
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const again = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(again).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Fechar painel' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Colunas' })).toBeTruthy()

    // Esc também pede confirmação; "Descartar" fecha sem aplicar.
    fireEvent(again, new Event('cancel', { cancelable: true }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas' })).toBeNull())
    expect(screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeTruthy()
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toBeNull()
  })

  it('edita texto na célula com Enter e mostra salvo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'text')
    fireEvent.keyDown(cell, { key: 'Enter' })
    const input = within(cell).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Rota editada' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await within(cell).findByLabelText('Salvo')).toBeTruthy()
    expect(within(cell).getByText('Rota editada')).toBeTruthy()
  })

  it('erro do servidor restaura o valor, mostra aviso e permite tentar de novo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral', hidden: true })
    const row = opener.closest('[role="row"]') as HTMLElement
    const cell = await cellOf(row, 'text')
    const before = cell.textContent
    fireEvent.doubleClick(cell)
    const input = within(cell).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Não vai' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await within(cell).findByText('Sem permissão para alterar este serviço.')).toBeTruthy()
    expect(cell.getAttribute('aria-invalid')).toBe('true')
    expect(within(cell).getByText(before!.replace(/Somente leitura/, '').trim() || '—')).toBeTruthy()
    expect(within(cell).getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('Esc cancela sem gravar e status abre um select', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const first = (await findDataRows())[1]
    const text = await cellOf(first, 'text')
    const original = text.textContent
    fireEvent.keyDown(text, { key: 'Enter' })
    fireEvent.change(within(text).getByRole('textbox'), { target: { value: 'descartar' } })
    fireEvent.keyDown(within(text).getByRole('textbox'), { key: 'Escape' })
    expect(text.textContent).toBe(original)
    const status = await cellOf(first, 'choice')
    fireEvent.keyDown(status, { key: 'Enter' })
    // O painel do Select usa `popover`, que o jsdom não exibe: a opção existe, mas fica fora da árvore acessível.
    expect(await within(status).findByRole('option', { name: 'Confirmado', hidden: true })).toBeTruthy()
  })

  it('dinheiro inválido mostra o erro local e mantém o campo aberto sem gravar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'money')
    fireEvent.keyDown(cell, { key: 'Enter' })
    const input = within(cell).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await within(cell).findByText('Valor inválido.')).toBeTruthy()
    expect(cell.getAttribute('aria-invalid')).toBe('true')
    expect(within(cell).getByRole('textbox')).toBe(input)
    expect(within(cell).queryByLabelText('Salvo')).toBeNull()
  })

  it('tentar de novo reabre a edição com o último valor digitado', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral', hidden: true })
    const cell = await cellOf(opener.closest('[role="row"]') as HTMLElement, 'text')
    fireEvent.doubleClick(cell)
    fireEvent.change(within(cell).getByRole('textbox'), { target: { value: 'Não vai' } })
    fireEvent.keyDown(within(cell).getByRole('textbox'), { key: 'Enter' })
    fireEvent.click(await within(cell).findByRole('button', { name: 'Tentar de novo' }))
    expect((within(cell).getByRole('textbox') as HTMLInputElement).value).toBe('Não vai')
    expect(cell.getAttribute('aria-invalid')).toBeNull()
  })

  it('escolher outro motorista grava e mostra salvo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'lookup')
    fireEvent.keyDown(cell, { key: 'Enter' })
    fireEvent.click(await within(cell).findByRole('option', { name: 'Bruno Dias', hidden: true }))
    expect(await within(cell).findByLabelText('Salvo')).toBeTruthy()
    expect(within(cell).getByText('Bruno Dias')).toBeTruthy()
  })

  it('tentar de novo regrava o Sim/Não que falhou', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral', hidden: true })
    const cell = await cellOf(opener.closest('[role="row"]') as HTMLElement, 'boolean')
    const before = (within(cell).getByRole('switch') as HTMLInputElement).checked
    fireEvent.click(within(cell).getByRole('switch'))
    fireEvent.click(await within(cell).findByRole('button', { name: 'Tentar de novo' }))
    // Regravar volta ao estado "gravando" e, como a OS-1013 segue bloqueada, termina no erro de novo.
    expect(within(cell).getByLabelText('Gravando')).toBeTruthy()
    expect(await within(cell).findByText('Sem permissão para alterar este serviço.')).toBeTruthy()
    expect((within(cell).getByRole('switch') as HTMLInputElement).checked).toBe(before)
  })

  it('seleção mostra comandos; copiar abre a prévia com o bloco; desativar pede confirmação', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    // A linha do cabeçalho existe antes dos dados: espera as linhas chegarem.
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    expect(screen.getByText('2 selecionados')).toBeTruthy()
    // A linha de comando vira a barra da seleção; Editar (exige exatamente um) não aparece com 2 selecionados.
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    await acao('Copiar Serviços')
    const copy = await screen.findByRole('dialog', { name: 'Copiar serviços' })
    expect((await within(copy).findByText(/\*ID:\* OS-/)).textContent).toContain('*Trajeto:*')
    // O X do Dialog também se chama "Fechar": o botão de ação é o último.
    fireEvent.click(within(copy).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Desativar 2 serviços?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByText('2 serviços desativados.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('2 selecionados')).toBeNull())
  })

  it('em mock, criar avisa que o formulário abre no Dataverse', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByRole('row', { hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Criar serviço' }))
    expect(await screen.findByRole('dialog', { name: 'Formulário Geral abre no Dataverse' })).toBeTruthy()
  })

  it('novo=1 na URL (atalho da Página Inicial) abre a criação e tira o parâmetro do link', async () => {
    window.location.hash = '#/geral?novo=1'
    try {
      render(<GeralPage host={{ mode: 'mock' }} />)
      expect(await screen.findByRole('dialog', { name: 'Formulário Geral abre no Dataverse' })).toBeTruthy()
      await waitFor(() => expect(window.location.hash).not.toContain('novo='))
    } finally {
      window.location.hash = ''
    }
  })

  it('clique direito: na seleção age sobre ela; fora dela troca a seleção; Ctrl mantém o menu do navegador', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    // Linha já selecionada: o menu vale para os 2, e Editar (exige um) fica desabilitado.
    expect(fireEvent.contextMenu(rows[2], { clientX: 40, clientY: 40 })).toBe(false)
    const editar = await screen.findByRole('menuitem', { name: /^Editar/, hidden: true })
    expect((editar as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('2 selecionados')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copiar Serviços', hidden: true }))
    expect(await screen.findByRole('dialog', { name: 'Copiar serviços' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Copiar serviços' })).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    // Linha fora da seleção: vira a única selecionada e Editar se habilita.
    fireEvent.contextMenu(rows[3], { clientX: 40, clientY: 80 })
    await waitFor(() => expect(screen.getByText('1 selecionado')).toBeTruthy())
    expect((screen.getByRole('menuitem', { name: 'Editar', hidden: true }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.keyDown(screen.getByRole('menu', { hidden: true }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { hidden: true })).toBeNull())
    // Ctrl + clique direito: o navegador abre o próprio menu.
    expect(fireEvent.contextMenu(rows[4], { ctrlKey: true })).toBe(true)
    expect(screen.queryByRole('menu', { hidden: true })).toBeNull()
  })

  it('com 1 selecionado, Editar abre o formulário e Gerar Voucher avisa que só roda no Dataverse', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
    await acao('Gerar Voucher')
    expect(await screen.findByText('O voucher abre dentro do Dataverse.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(await screen.findByRole('dialog', { name: 'Formulário Geral abre no Dataverse' })).toBeTruthy()
  })
  it('no celular mostra cards e edita pela sheet', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    const card = (await screen.findAllByRole('listitem'))[0]
    fireEvent.click(within(card).getByRole('button', { name: 'Editar campos' }))
    const sheet = await screen.findByRole('dialog', { name: /Serviço OS-/ })
    const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
    fireEvent.change(trajeto, { target: { value: 'Rota pelo celular' } })
    fireEvent.blur(trajeto)
    expect(await within(sheet).findByText('Salvo ✓')).toBeTruthy()
  })
  it('no celular, fechar a sheet com o campo em edição grava o que foi digitado', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    const card = (await screen.findAllByRole('listitem'))[0]
    fireEvent.click(within(card).getByRole('button', { name: 'Editar campos' }))
    const sheet = await screen.findByRole('dialog', { name: /Serviço OS-/ })
    const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
    trajeto.focus()
    fireEvent.change(trajeto, { target: { value: 'Rota sem blur' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
    expect(await within((await screen.findAllByRole('listitem'))[0]).findByText('Rota sem blur')).toBeTruthy()
  })
})

describe('Geral: correções finais', () => {
  const opener = (name: string) => ({ name: `Abrir serviço ${name} no Formulário Geral`, hidden: true })

  it('trocar de visão e buscar mudam de fato as linhas', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    // OS-1217 não tem motorista, mas fica além da primeira página (100 linhas) da Agenda; OS-1000 tem motorista.
    expect(screen.queryByRole('button', opener('OS-1217'))).toBeNull()
    expect(screen.getByRole('button', opener('OS-1000'))).toBeTruthy()
    await pickView('Sem motorista')
    expect(await screen.findByRole('button', opener('OS-1217'))).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1000'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1052'))).toBeTruthy()
    // A busca é no servidor: some o que não bate, fica o que bate.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-1217' } })
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1052'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1217'))).toBeTruthy()
  })

  it('o cabeçalho mostra a ordem da visão e o menu do título a inverte', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const header = () => screen.getByRole('columnheader', { name: /Data e horário de saída/, hidden: true })
    expect(header().getAttribute('aria-sort')).toBe('ascending')
    await columnMenu(/^Data e horário de saída$/, 'Ordenar Z→A')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findAllByText(PAGE1)
    await columnMenu(/^Data e horário de saída$/, 'Ordenar A→Z')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
  })

  it('o aviso do motorista aparece no editor da célula', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'lookup')
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(await within(cell).findByTitle('Trocar o motorista dispara os avisos e a atribuição automática de veículo.')).toBeTruthy()
  })

  it('falha parcial ao desativar lista os ids que falharam e o primeiro erro', async () => {
    hooks.setState = async (ids) => ({ ok: [ids[0]], failed: [{ id: ids[1], message: 'Sem permissão' }] })
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
    const failedName = within(rows[2]).getByRole('button', { name: /Abrir serviço/ }).textContent
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Desativar 2 serviços?' })).getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByText(`1 de 2 serviços desativados; falharam: ${failedName}. Sem permissão`)).toBeTruthy()
  })

  it('Desativar e Ativar com seleção mista ficam focáveis, explicam o motivo e não fazem nada', async () => {
    hooks.mixedState = true
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    const reason = 'Selecione só serviços ativos ou só inativos.'
    for (const name of ['Desativar', 'Ativar']) {
      const button = screen.getByRole('button', { name })
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect((button as HTMLButtonElement).disabled).toBe(false)
      expect(button.getAttribute('title')).toBe(reason)
      expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toBe(reason)
      fireEvent.click(button)
    }
    expect(screen.queryByRole('dialog', { name: /serviços?\?/ })).toBeNull()
  })

  it('fechar a prévia de cópia antes do texto chegar não a reabre', async () => {
    hooks.copyRows = () => new Promise((resolve) => { window.setTimeout(() => resolve([]), 400) })
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
    await acao('Copiar Serviços')
    const dialog = await screen.findByRole('dialog', { name: 'Copiar serviços' })
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull())
    await new Promise((resolve) => { window.setTimeout(resolve, 700) })
    expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull()
  })

  describe('Gerar link', () => {
    const writeText = vi.fn()
    beforeEach(() => { hooks.programada = true; writeText.mockReset().mockResolvedValue(undefined); vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } }) })
    afterEach(() => { hooks.programada = false; hooks.gerarLink = null; vi.unstubAllGlobals() })
    const item = async () => {
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: /^Ações/ }))
      return screen.findByRole('menuitem', { name: /^Gerar link/, hidden: true })
    }

    it('fica inerte quando o serviço não está Programado', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[2]).getByRole('checkbox'))
      const menuitem = await item()
      expect(menuitem.getAttribute('aria-disabled') === 'true' || (menuitem as HTMLButtonElement).disabled).toBe(true)
      expect(menuitem.textContent).toContain('Programado')
    })

    it('mostra o link para abrir e copia ao clicar', async () => {
      hooks.gerarLink = async () => ({ ok: true, link: 'https://acompanhe.test/x', expiraEm: '2099-01-01T12:00:00Z' })
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
      fireEvent.click(await item())
      const dialog = await screen.findByRole('dialog', { name: /Link de acompanhamento/ })
      const abrir = await within(dialog).findByRole('link', { name: /Abrir link de acompanhamento/ })
      expect(abrir.getAttribute('href')).toBe('https://acompanhe.test/x')
      expect(within(dialog).getByText(/Válido até 01\/01 09:00/)).toBeTruthy()
      expect(writeText).not.toHaveBeenCalled()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar link' }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://acompanhe.test/x'))
      expect(await screen.findByText('Link copiado.')).toBeTruthy()
    })

    it('explica quando o ambiente não está configurado', async () => {
      hooks.gerarLink = async () => ({ ok: false, erro: 'Link de acompanhamento não configurado.' })
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
      fireEvent.click(await item())
      expect(await screen.findByText('Link de acompanhamento não configurado neste ambiente')).toBeTruthy()
      expect(screen.getByText(/Peça ao TI/)).toBeTruthy()
    })

    it('mostra o erro devolvido', async () => {
      hooks.gerarLink = async () => ({ ok: false, erro: 'Sem rastreador.' })
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
      fireEvent.click(await item())
      expect(await screen.findByText('Sem rastreador.')).toBeTruthy()
      expect(writeText).not.toHaveBeenCalled()
    })
  })

  describe('no celular', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    })
    const openSheet = async (name?: string) => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      const cards = await screen.findAllByRole('listitem')
      const card = name ? cards.find((c) => c.textContent?.includes(name)) : cards[0]
      fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Editar campos' }))
      return screen.findByRole('dialog', { name: /Serviço OS-/ })
    }

    it('não fecha enquanto um campo grava e anuncia o estado numa região viva', async () => {
      // A gravação só termina quando o teste libera: o estado "gravando" não depende da velocidade da máquina.
      let release: () => void = () => undefined
      hooks.update = () => new Promise<void>((resolve) => { release = resolve })
      const sheet = await openSheet()
      const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
      fireEvent.change(trajeto, { target: { value: 'Rota lenta' } })
      fireEvent.blur(trajeto)
      expect(await within(sheet).findByText('Gravando…')).toBeTruthy()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      // O Sheet anima a saída, pede o fechamento ao pai e, recusado, volta: espera esse retorno.
      await waitFor(() => expect(sheet.hasAttribute('data-closing')).toBe(false))
      expect(within(sheet).getByText('Gravando…')).toBeTruthy()
      expect(screen.getByRole('dialog', { name: /Serviço OS-/ })).toBeTruthy()
      await act(async () => { release() })
      const saved = await within(sheet).findByText('Salvo ✓')
      expect(saved.closest('[aria-live="polite"]')).not.toBeNull()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
    })

    it('com valor inválido digitado pede confirmação antes de descartar', async () => {
      const sheet = await openSheet()
      const cotacao = within(sheet).getByLabelText('Cotação') as HTMLInputElement
      cotacao.focus()
      fireEvent.change(cotacao, { target: { value: 'abc' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
      expect(screen.getByRole('dialog', { name: /Serviço OS-/ })).toBeTruthy()
      expect(await within(sheet).findByText('Valor inválido.')).toBeTruthy()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
    })

    it('erro de gravação com a sheet já fechada vira aviso com campo, serviço e motivo', async () => {
      const sheet = await openSheet('OS-1013')
      const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
      trajeto.focus()
      fireEvent.change(trajeto, { target: { value: 'Não vai' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
      expect(await screen.findByText('Não foi possível salvar Trajeto do serviço OS-1013: Sem permissão para alterar este serviço.')).toBeTruthy()
    })

    it('o aviso do motorista aparece no campo da sheet', async () => {
      const sheet = await openSheet()
      expect(within(sheet).getByTitle('Trocar o motorista dispara os avisos e a atribuição automática de veículo.')).toBeTruthy()
    })
  })
})

describe('Geral: espaço e densidade', () => {
  it('sem seleção a linha de comando tem só busca, Atualizar, Mais ações e Criar serviço (a primária, por último)', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    expect(toolbar.classList.contains('is-selecting')).toBe(false)
    for (const name of ['Editar', 'Desativar', 'Ativar', 'Limpar seleção']) expect(within(toolbar).queryByRole('button', { name })).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: /^Ações/ })).toBeNull()
    expect(within(toolbar).queryByText(/selecionado/)).toBeNull()
    const buttons = within(toolbar).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    // Ordem da direita: …, Atualizar, Mais ações e a primária por último.
    expect(buttons.slice(-3)).toEqual(['Atualizar', 'Mais ações', 'Criar serviço'])
    expect(buttons.indexOf('Colunas')).toBeLessThan(buttons.indexOf('Atualizar'))
  })

  it('com 1 selecionado os comandos se habilitam e a contagem aparece como badge', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    expect(toolbar.classList.contains('is-selecting')).toBe(true)
    const count = within(toolbar).getByText('1 selecionado')
    expect(count.closest('.bt-badge')).not.toBeNull()
    for (const name of ['Editar', 'Desativar', 'Limpar seleção']) expect(within(toolbar).getByRole('button', { name }).getAttribute('aria-disabled')).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: 'Criar serviço' })).toBeNull()
    expect(within(toolbar).queryByRole('searchbox', { name: 'Buscar serviços' })).toBeNull()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Ações (1)' }))
    for (const name of ['Gerar Voucher', 'Copiar Serviços']) expect(((await screen.findByRole('menuitem', { name, hidden: true })) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Limpar seleção' }))
    await waitFor(() => expect(within(toolbar).queryByText(/selecionado/)).toBeNull())
    expect(within(toolbar).getByRole('button', { name: 'Criar serviço' })).toBeTruthy()
  })

  it('lista sem cabeçalho de página: o título é a visão e Atualizar fica na linha de comando', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(screen.queryByRole('banner')).toBeNull()
    expect(viewTrigger().textContent).toContain('Agenda')
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    expect(within(toolbar).getByRole('button', { name: 'Atualizar' }).getAttribute('title')).toBe(`100 de ${MOCK_ROW_COUNT} serviços`)
    expect(within(toolbar).getByRole('button', { name: 'Criar serviço' })).toBeTruthy()
  })

  it('cada título de coluna tem o rótulo completo em title (o texto pode ser cortado)', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const header = await screen.findByRole('columnheader', { name: /Status de faturamento/, hidden: true })
    expect(header.getAttribute('title')).toBe('Status de faturamento')
  })

  it('página fixa de 100: sem seletor de quantidade nem paginação numerada', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findAllByText(`100 de ${MOCK_ROW_COUNT} serviços`)).toHaveLength(1)
    expect(screen.queryByRole('combobox', { name: 'Serviços por página' })).toBeNull()
    expect(screen.queryByText(/Anterior|Próxima/)).toBeNull()
  })

  // Com 200+ linhas, consultas por papel (getByRole) percorrem milhares de nós no jsdom: aqui só consultas baratas.
  const rowCount = () => document.querySelectorAll('.gr-grid [role="row"]').length - 1
  /** Rolar até o fim: o sentinela entra na área do observador (espera o observador da página atual existir). */
  const scrollToEnd = async () => {
    await waitFor(() => expect(FakeObserver.instances.some((o) => !o.closed)).toBe(true))
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
  }

  it('rolar até o fim acumula 100, 200 e 220 linhas sem botão e para no Fim da lista', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(rowCount()).toBe(100)
    expect(screen.queryByText(/Carregar mais$/)).toBeNull()
    await scrollToEnd()
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(rowCount()).toBe(200)
    await scrollToEnd()
    await screen.findAllByText(`${MOCK_ROW_COUNT} serviços`)
    expect(rowCount()).toBe(MOCK_ROW_COUNT)
    expect(screen.getByText('Fim da lista')).toBeTruthy()
    // Fim dos dados: sem sentinela, ninguém pede mais.
    expect(FakeObserver.instances.every((o) => o.closed)).toBe(true)
    expect(document.querySelector('.gr-sentinel')).toBeNull()
  }, 90_000)

  it('ordenar depois de rolar volta ao topo com 100 linhas', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    await scrollToEnd()
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    await columnMenu(/^Trajeto$/, 'Ordenar A→Z')
    await screen.findAllByText(PAGE1)
    expect(rowCount()).toBe(100)
  }, 90_000)

  it('o observador carrega a próxima página sem clique e a seleção dos carregados é mantida', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const grid = document.querySelector('.gr-grid') as HTMLElement
    // O sentinela vive dentro do contêiner de rolagem, que é a raiz do observador.
    await waitFor(() => expect(FakeObserver.instances.some((o) => !o.closed)).toBe(true))
    const live = FakeObserver.instances.filter((o) => !o.closed)
    // Comparações booleanas: se falhar, o diff de um elemento DOM inteiro travaria o jsdom.
    expect(live.length).toBe(1)
    expect(live[0].options?.root === grid).toBe(true)
    expect(grid.contains(live[0].observed[0])).toBe(true)
    // "Selecionar carregados" marca as linhas carregadas até aqui; carregar mais não desfaz a seleção.
    // (Consulta direta ao DOM: getByLabelText percorre centenas de rótulos e trava o jsdom.)
    const selectAll = document.querySelector('.gr-grid [role="columnheader"] input[type="checkbox"]') as HTMLInputElement
    expect(selectAll.closest('label')?.textContent).toBe('Selecionar carregados')
    fireEvent.click(selectAll)
    await screen.findByText('100 selecionados')
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(document.querySelectorAll('.gr-grid [role="row"]').length - 1).toBe(200)
    expect(screen.getByText('100 selecionados')).toBeTruthy()
  }, 90_000)

  it('no celular os cards usam a janela como raiz e carregam mais ao rolar, sem botão', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(document.querySelectorAll('.gr-cards > li')).toHaveLength(100)
    expect(screen.queryByText(/Carregar mais$/)).toBeNull()
    // O efeito que cria o observador roda depois da pintura: espera ele existir.
    await waitFor(() => expect(FakeObserver.instances.filter((o) => !o.closed).length).toBe(1))
    expect(FakeObserver.instances.filter((o) => !o.closed)[0].options?.root === null).toBe(true)
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(document.querySelectorAll('.gr-cards > li')).toHaveLength(200)
  }, 90_000)

  it('no desktop todos os comandos da lista têm o tamanho padrão do DS (40 px), igual a Colunas e Filtros', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    const search = within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' }).closest('.bt-control')
    expect(search?.classList.contains('bt-control--compact')).toBe(false)
    expect(search?.classList.contains('bt-control--touch')).toBe(false)
    for (const name of ['Colunas', 'Filtros', 'Criar serviço', 'Mais ações', 'Atualizar']) {
      const button = within(toolbar).getByRole('button', { name })
      expect(button.classList.contains('bt-button--compact')).toBe(false)
      expect(button.classList.contains('bt-button--touch')).toBe(false)
    }
    expect(within(toolbar).getByRole('button', { name: 'Colunas' })).toBeTruthy()
    // O filtro por coluna mora no menu do título (DS 1.13): a barra não tem mais o botão "Filtro rápido".
    expect(within(toolbar).queryByRole('button', { name: 'Filtro rápido' })).toBeNull()
  })

  it('no celular a barra usa tamanho de toque (44 px), nunca o compacto de 32 px', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByRole('listitem')
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    const search = within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' }).closest('.bt-control')
    expect(search?.classList.contains('bt-control--compact')).toBe(false)
    expect(search?.classList.contains('bt-control--touch')).toBe(true)
    for (const name of ['Criar serviço', 'Mais ações', 'Colunas', 'Filtros']) {
      const button = within(toolbar).getByRole('button', { name })
      expect(button.classList.contains('bt-button--compact')).toBe(false)
      expect(button.classList.contains('bt-button--touch')).toBe(true)
    }
    // No celular não há linha de filtro rápido: os filtros ficam no painel.
    expect(within(toolbar).queryByRole('button', { name: 'Filtro rápido' })).toBeNull()
  })
  describe('filtros (DS §10.9.2)', () => {
    const header = (name: RegExp) => screen.getByRole('columnheader', { name, hidden: true })
    const chips = () => screen.queryByRole('group', { name: 'Filtros ativos' })

    it('o menu da coluna abre e ordena', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: /^Trajeto$/, hidden: true }))
      expect((await screen.findAllByRole('menuitem', { hidden: true })).map((item) => item.textContent)).toEqual(['Ordenar A→Z', 'Ordenar Z→A', 'Filtrar por…', 'Ocultar coluna'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ordenar Z→A', hidden: true }))
      await waitFor(() => expect(header(/Trajeto/).getAttribute('aria-sort')).toBe('descending'))
    }, 60_000)

    it('filtrar Status por Confirmado no painel da coluna reduz as linhas e cria o chip; remover restaura', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      const panel = await openColumnFilter(/^Status de Operação$/, 'Status de Operação')
      expect(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }).textContent).toContain('é um de')
      expect(within(panel).getByRole('button', { name: 'Aplicar', hidden: true }).hasAttribute('disabled')).toBe(true)
      fireEvent.click(within(panel).getByRole('combobox', { name: 'Valores de Status de Operação', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: 'Confirmado', hidden: true }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar', hidden: true }))
      await waitFor(() => expect(colFilter()).toBeNull())
      expect(await screen.findByText('Status de Operação: Confirmado')).toBeTruthy()
      await waitFor(() => expect(screen.queryAllByText(PAGE1)).toHaveLength(0))
      expect(viewTrigger().textContent).toContain('Alterada')
      fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Status de Operação: Confirmado' }))
      await screen.findAllByText(PAGE1)
      expect(chips()).toBeNull()
      expect(viewTrigger().textContent).not.toContain('Alterada')
    }, 60_000)

    it('Filtrar por… abre o painel com operador e valor; Aplicar grava, reabrir mostra o filtro ativo, Limpar tira', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      let panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      expect(within(panel).queryByRole('status', { hidden: true })).toBeNull()
      expect(within(panel).getByRole('button', { name: 'Limpar', hidden: true }).hasAttribute('disabled')).toBe(true)
      // Operador do tipo texto, como no model-driven: troca para "começa com".
      fireEvent.click(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: 'começa com', hidden: true }))
      const text = within(panel).getByRole('textbox', { name: 'Texto de Trajeto', hidden: true })
      fireEvent.change(text, { target: { value: 'Galeão' } })
      fireEvent.keyDown(text, { key: 'Enter' })
      await waitFor(() => expect(colFilter()).toBeNull())
      expect(await screen.findByText('Trajeto: começa com Galeão')).toBeTruthy()
      await waitFor(() => expect(window.location.hash).toContain('f='))
      expect(document.activeElement?.textContent).toContain('Trajeto')
      // Reabrir: mostra o filtro ativo e a condição já preenchida.
      panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      expect(within(panel).getByRole('status', { hidden: true }).textContent).toBe('Filtro ativo: Trajeto: começa com Galeão')
      expect(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }).textContent).toContain('começa com')
      expect((within(panel).getByRole('textbox', { name: 'Texto de Trajeto', hidden: true }) as HTMLInputElement).value).toBe('Galeão')
      // Esc fecha sem mexer no filtro.
      fireEvent.keyDown(panel, { key: 'Escape' })
      await waitFor(() => expect(colFilter()).toBeNull())
      expect(screen.getByText('Trajeto: começa com Galeão')).toBeTruthy()
      // Limpar tira o filtro e fecha.
      panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      fireEvent.click(within(panel).getByRole('button', { name: 'Limpar', hidden: true }))
      await waitFor(() => expect(colFilter()).toBeNull())
      await waitFor(() => expect(screen.queryByText('Trajeto: começa com Galeão')).toBeNull())
    }, 60_000)

    it('o painel Filtros aplica uma condição avançada, conta no botão e Limpar filtros tira tudo', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('tab', { name: /^Avançado/ }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Condição' }))
      expect(within(panel).getByText('Digite um texto.')).toBeTruthy()
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Texto de ID' }), { target: { value: 'OS-1005' } })
      fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar' }))
      expect(await screen.findByText('ID: OS-1005')).toBeTruthy()
      await waitFor(() => expect(screen.getByRole('button', { name: /^Filtros/ }).textContent).toContain('1'))
      fireEvent.click(within(chips() as HTMLElement).getByRole('button', { name: 'Limpar filtros' }))
      await screen.findAllByText(PAGE1)
      expect(chips()).toBeNull()
    }, 60_000)

    it('fechar o painel com rascunho pede confirmação', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('tab', { name: /^Avançado/ }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Condição' }))
      fireEvent(panel, new Event('cancel', { cancelable: true }))
      const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
      expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()
      fireEvent(panel, new Event('cancel', { cancelable: true }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtros' })).toBeNull())
      expect(chips()).toBeNull()
    }, 60_000)

    it('sem metadata o filtro restaurado da URL (link antigo) aparece como não aplicado', async () => {
      hooks.attributes = () => Promise.reject(new Error('sem metadata'))
      window.location.hash = '#/geral?f=' + encodeFilters({ cr40f_trajeto: { kind: 'text', op: 'contains', value: 'Galeão' } })
      render(<GeralPage host={{ mode: 'mock' }} />)
      expect(await screen.findByRole('img', { name: 'Filtro não aplicado', hidden: true })).toBeTruthy()
      expect(within(chips() as HTMLElement).getByText(/não aplicado/)).toBeTruthy()
    }, 60_000)

    it('no celular o botão Filtros tem tamanho de toque e o painel aplica por coluna', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByRole('listitem')
      const button = within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: 'Filtros' })
      expect(button.classList.contains('bt-button--touch')).toBe(true)
      fireEvent.click(button)
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('combobox', { name: 'Filtrar Status de Operação', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: 'Confirmado', hidden: true }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar' }))
      expect(within(await screen.findByRole('group', { name: 'Filtros ativos' })).getByText('Status de Operação: Confirmado')).toBeTruthy()
    }, 60_000)
  })
})

const BOOLEAN_LABELS = ['Receber']
describe('Geral: redimensionar e reordenar colunas', () => {
  const track = (name: RegExp) => {
    const grid = screen.getByRole('grid', { name: 'Serviços', hidden: true })
    const labels = screen.getAllByRole('columnheader', { hidden: true })
    const index = labels.findIndex((h) => name.test(h.getAttribute('title') ?? ''))
    return grid.style.getPropertyValue('--gr-columns').split(/ (?![^(]*\))/)[index]
  }
  const px = (t: string) => Number(/minmax\((\d+)px/.exec(t)?.[1])

  it('setas na alça mudam 16 px e persistem; Enter volta ao padrão', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    const before = px(track(/Trajeto/))
    const handle = screen.getByRole('separator', { name: 'Redimensionar coluna Trajeto', hidden: true })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(before + 16))
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toContain(`${before + 16}`)
    fireEvent.keyDown(handle, { key: 'Enter' })
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(before))
  })

  it('arrastar a alça com o ponteiro cresce a trilha e grava ao soltar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    const before = px(track(/Trajeto/))
    const handle = screen.getByRole('separator', { name: 'Redimensionar coluna Trajeto', hidden: true })
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 160, pointerId: 1, buttons: 1 })
    expect(px(track(/Trajeto/))).toBe(before + 60)
    fireEvent.pointerUp(handle, { clientX: 160, pointerId: 1 })
    expect(px(track(/Trajeto/))).toBe(before + 60)
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toContain(`${before + 60}`)
  })

  it('Alt+seta no cabeçalho move a coluna e avisa a nova posição', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    const names = () => screen.getAllByRole('columnheader', { hidden: true }).slice(1).map((h) => h.getAttribute('title'))
    const [first, second, third] = names()
    fireEvent.keyDown(screen.getByRole('button', { name: new RegExp(`^${second}$`), hidden: true }), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(names().slice(0, 3)).toEqual([first, third, second]))
    expect(screen.getByText(`Coluna ${second} movida para a posição 3`)).toBeTruthy()
  })

  const LS = 'betinhos.geral.colunas.v1'
  const open = async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    return screen.getByRole('separator', { name: 'Redimensionar coluna Trajeto', hidden: true })
  }

  it('largura personalizada vira trilha fixa; pointercancel encerra e grava; movimento sem botão é ignorado', async () => {
    const handle = await open()
    const before = px(track(/Trajeto/))
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1, buttons: 0 })
    expect(px(track(/Trajeto/))).toBe(before)
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1, buttons: 1 })
    fireEvent.pointerCancel(handle, { pointerId: 1 })
    await waitFor(() => expect(track(/Trajeto/)).toBe(`minmax(${before + 40}px, ${before + 40}px)`))
    expect(window.localStorage.getItem(LS)).toContain(`${before + 40}`)
  })

  it('duplo clique volta ao padrão; limites 90 e 1200', async () => {
    const handle = await open()
    const before = px(track(/Trajeto/))
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 5000, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(1200))
    fireEvent.pointerDown(handle, { clientX: 5000, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: -5000, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(90))
    fireEvent.doubleClick(handle)
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(before))
    expect(handle.getAttribute('aria-valuemin')).toBe('90')
  })

  it('arrastar a alça não inicia reordenação; sem a alça o arraste do cabeçalho segue', async () => {
    const handle = await open()
    const header = screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })
    const data = { setData: () => undefined, getData: () => '', types: [] as string[], effectAllowed: '' }
    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 })
    expect(fireEvent.dragStart(header, { dataTransfer: data })).toBe(false)
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(fireEvent.dragStart(header, { dataTransfer: data })).toBe(true)
  })

  it('coluna Sim/Não não tem alça e as demais têm', async () => {
    await open()
    const headers = screen.getAllByRole('columnheader', { hidden: true }).slice(1)
    const without = headers.filter((h) => h.querySelector('.gr-resize') === null)
    expect(without.map((h) => h.getAttribute('title'))).toEqual(BOOLEAN_LABELS)
  })

  it('Alt+seta mantém o foco, preserva ocultas na ordem; Aplicar mantém larguras e Restaurar zera', async () => {
    const handle = await open()
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    let dialog = await screen.findByRole('dialog', { name: 'Colunas' })
    const boxes = within(dialog).getAllByRole('checkbox')
    const hiddenName = (boxes[boxes.length - 1] as HTMLInputElement).labels?.[0]?.textContent ?? ''
    expect(hiddenName).not.toBe('')
    fireEvent.click(boxes[boxes.length - 1])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas' })).toBeNull())
    expect(window.localStorage.getItem(LS)).toContain('widths')
    const names = () => Array.from(document.querySelectorAll('.bt-table__head [role=columnheader]')).slice(1).map((h) => h.getAttribute('title'))
    const second = names()[1]
    const button = () => Array.from(document.querySelectorAll<HTMLElement>('.bt-colhead')).find((b) => b.textContent === second) as HTMLElement
    button().focus()
    fireEvent.keyDown(button(), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(document.activeElement).toBe(button()))
    fireEvent.keyDown(button(), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(names().indexOf(second)).toBe(3))
    const saved = JSON.parse(window.localStorage.getItem(LS) ?? '{}') as Record<string, { hidden: string[]; order: string[] }>
    const pref = Object.values(saved)[0]
    expect(pref.hidden.length).toBe(1)
    expect(pref.order).toContain(pref.hidden[0])
    expect(names()).not.toContain(hiddenName)
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    dialog = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar colunas' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(window.localStorage.getItem(LS)).not.toContain('widths'))
  })
})

describe('Geral: visões pessoais e link compartilhável', () => {
  const openMenu = () => fireEvent.click(viewTrigger())
  const choose = async (name: string) => fireEvent.click(await screen.findByRole('menuitem', { name, hidden: true }))
  const actions = async () => (await screen.findAllByRole('menuitem', { hidden: true })).map((item) => item.textContent)
  const viewName = () => viewTrigger().textContent ?? ''

  async function saveAs(name: string) {
    openMenu()
    await choose('Salvar como…')
    const dialog = await screen.findByRole('dialog', { name: 'Salvar como visão' })
    fireEvent.change(within(dialog).getByLabelText(/Nome da visão/), { target: { value: name } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar visão' }))
    await waitFor(() => expect(viewName()).toContain(name))
  }

  it('visão do sistema só oferece salvar como; as visões aparecem agrupadas', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    openMenu()
    expect(await actions()).toEqual(['Salvar como…'])
    expect(screen.getByRole('menuitemradio', { name: /Agenda/, hidden: true }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: 'Sem motorista', hidden: true })).toBeTruthy()
  }, 60_000)

  it('salvar como cria a visão pessoal com o filtro dentro; renomear e excluir', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    // Filtro avulso: Status = Confirmado.
    const panel = await openColumnFilter(/^Status de Operação$/, 'Status de Operação')
    fireEvent.click(within(panel).getByRole('combobox', { name: 'Valores de Status de Operação', hidden: true }))
    fireEvent.click(await screen.findByRole('option', { name: 'Confirmado', hidden: true }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar', hidden: true }))
    await screen.findByText('Status de Operação: Confirmado')

    await saveAs('Confirmados')
    expect(await screen.findByText('Visão salva. Ela fica só para você.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Status de Operação: Confirmado')).toBeNull())
    await waitFor(() => expect(window.location.hash).toContain('view=mock-minha-1'))
    expect(window.location.hash).not.toContain('f=')
    // O filtro foi para dentro da visão: a lista continua filtrada.
    await waitFor(() => expect(screen.queryAllByText(PAGE1)).toHaveLength(0))

    openMenu()
    expect(await actions()).toEqual(['Salvar como…', 'Renomear…', 'Restaurar padrão', 'Excluir visão…'])
    await choose('Renomear…')
    const rename = await screen.findByRole('dialog', { name: 'Renomear visão' })
    fireEvent.change(within(rename).getByLabelText(/Nome da visão/), { target: { value: 'Só confirmados' } })
    fireEvent.click(within(rename).getByRole('button', { name: 'Renomear' }))
    await waitFor(() => expect(viewName()).toContain('Só confirmados'))
    expect(await screen.findByText('Visão renomeada.')).toBeTruthy()

    openMenu()
    await choose('Excluir visão…')
    const confirm = await screen.findByRole('dialog', { name: 'Excluir esta visão?' })
    expect(within(confirm).getByText(/Só confirmados/)).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Excluir visão' }))
    expect(await screen.findByText('Visão excluída.')).toBeTruthy()
    await waitFor(() => expect(viewName()).toContain('Agenda'))
    await screen.findAllByText(PAGE1)
  }, 60_000)

  it('Salvar regrava a visão pessoal com a ordenação atual', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    await saveAs('Minha agenda')
    await screen.findAllByText(PAGE1)
    await columnMenu(/^Trajeto$/, 'Ordenar A→Z')
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Trajeto/, hidden: true }).getAttribute('aria-sort')).toBe('ascending'))
    await waitFor(() => expect(viewName()).toContain('Alterada'))
    openMenu()
    await choose('Salvar')
    expect(await screen.findByText('Visão salva.')).toBeTruthy()
    // A ordem agora é da visão: a coluna segue ordenada e a ordenação avulsa da URL some.
    await waitFor(() => expect(window.location.hash).not.toContain('sort='))
    expect(screen.getByRole('columnheader', { name: /Trajeto/, hidden: true }).getAttribute('aria-sort')).toBe('ascending')
  }, 60_000)

  it('Compartilhar link copia a URL atual com visão e ordenação e avisa', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      await columnMenu(/^Trajeto$/, 'Ordenar A→Z')
      await waitFor(() => expect(window.location.hash).toContain('sort='))
      fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Compartilhar link', hidden: true }))
      expect(await screen.findByText('Link copiado.')).toBeTruthy()
      expect(writeText).toHaveBeenCalledTimes(1)
      const url = writeText.mock.calls[0][0]
      expect(url).toBe(window.location.href)
      expect(url).toContain('view=')
      expect(url).toContain('sort=cr40f_trajeto')
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  }, 60_000)

  it('sem área de transferência o link não copia e o aviso orienta', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Compartilhar link', hidden: true }))
    expect(await screen.findByText(/Não foi possível copiar o link/)).toBeTruthy()
  }, 60_000)
})

describe('Geral: comandos Auditoria, Gerar OP, Disparar e Registrar Erro', () => {
  const pick = async (...ids: string[]) => {
    await screen.findAllByText(PAGE1)
    for (const id of ids) {
      const row = dataRows().find((r) => within(r).queryByText(id))
      if (!row) throw new Error(`Sem linha ${id}`)
      fireEvent.click(within(row).getByRole('checkbox'))
    }
  }
  const toolbar = () => screen.getByRole('toolbar', { name: 'Comandos de serviços' })

  it('sem seleção o menu Ações não existe; com seleção, Gerar OP e Disparar aparecem habilitados', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(within(toolbar()).queryByRole('button', { name: /^Ações/ })).toBeNull()
    await pick('OS-1004')
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Ações (1)' }))
    for (const name of ['Gerar OP', 'Disparar']) {
      const item = await screen.findByRole('menuitem', { name, hidden: true })
      expect((item as HTMLButtonElement).disabled).toBe(false)
    }
  })

  it('Gerar OP com um serviço que já tem OP mostra o diálogo parcial e, ao confirmar, avisa o sucesso', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1004', 'OS-1005')
    await acao('Gerar OP')
    const dialog = await screen.findByRole('dialog', { name: 'Gerar OP' })
    expect(within(dialog).getByText('Serviços com OP existente')).toBeTruthy()
    expect(within(dialog).getByText('OS-1004')).toBeTruthy()
    expect(within(dialog).getByText('Criar OP para 1 serviço(s) restante(s)?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sim, continuar' }))
    expect(await screen.findByText('OP criada para 1 serviço(s).')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Gerar OP' })).toBeNull())
  })

  it('Gerar OP só com serviços que já têm OP avisa e não abre o diálogo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1004')
    await acao('Gerar OP')
    expect(await screen.findByText('Todos os serviços selecionados já possuem OP.')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Gerar OP' })).toBeNull()
  })

  it('Disparar com a OS-1013 reporta a falha parcial', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1013', 'OS-1005')
    await acao('Disparar')
    const dialog = await screen.findByRole('dialog', { name: 'Marcar 2 serviço(s) como Programado?' })
    expect(within(dialog).getByText('Serviços sem motorista são recusados pelo servidor.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disparar' }))
    expect(await screen.findByText(/1 de 2 programados; falharam: OS-1013\./)).toBeTruthy()
  })

  it('Auditoria e Registrar Erro em mock mostram os avisos', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1005')
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Auditoria', hidden: true }))
    expect(await screen.findByText('A auditoria abre dentro do Dataverse.')).toBeTruthy()
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Registrar Erro', hidden: true }))
    expect(await screen.findByText('A Gestão de Qualidade abre dentro do Dataverse.')).toBeTruthy()
  })

  it('Contagem de Serviços abre o painel com os motoristas do mock', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Contagem de Serviços', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Serviços por motorista', hidden: true })
    for (const nome of ['Carlos Lima', 'Ana Souza', 'Bruno Dias', 'Teste']) expect(await within(dialog).findByText(nome)).toBeTruthy()
    expect(within(dialog).getByText(/^Total — /)).toBeTruthy()
  })

  it('Registrar Erro fica inerte com 2 selecionados', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1005', 'OS-1006')
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    const item = (await screen.findByRole('menuitem', { name: /Registrar Erro/, hidden: true })) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    expect(within(item).getByText('Selecione exatamente um serviço.')).toBeTruthy()
  })
})

describe('Geral: seleção pela linha', () => {
  const rowOf = async (id: string) => {
    await screen.findAllByText(PAGE1)
    const row = dataRows().find((r) => within(r).queryByText(id))
    if (!row) throw new Error(`Sem linha ${id}`)
    return row
  }
  const selectedRows = () => dataRows().filter((r) => r.getAttribute('aria-selected') === 'true')
  const cellText = (row: HTMLElement) => within(row).getAllByRole('gridcell')[2]

  it('clique simples na linha seleciona só ela; Ctrl+clique soma; Shift+clique marca o intervalo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const a = await rowOf('OS-1005')
    fireEvent.click(cellText(a))
    expect(selectedRows()).toHaveLength(1)
    fireEvent.click(cellText(await rowOf('OS-1007')), { ctrlKey: true })
    expect(selectedRows()).toHaveLength(2)
    fireEvent.click(cellText(await rowOf('OS-1009')))
    expect(selectedRows()).toHaveLength(1)
    expect(selectedRows()[0].textContent).toContain('OS-1009')
    fireEvent.click(cellText(await rowOf('OS-1011')), { shiftKey: true })
    const ids = selectedRows().map((r) => r.textContent ?? '')
    expect(ids).toHaveLength(3)
    expect(ids.some((t) => t.includes('OS-1010'))).toBe(true)
  })

  it('clicar em Abrir serviço não muda a seleção', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const row = await rowOf('OS-1005')
    fireEvent.click(within(row).getByRole('button', { name: /Abrir serviço OS-1005/ }))
    expect(selectedRows()).toHaveLength(0)
  })

  it('entrar em edição pela célula seleciona a linha', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const row = await rowOf('OS-1005')
    const cell = await cellOf(row, 'text')
    fireEvent.doubleClick(cell)
    await waitFor(() => expect(row.getAttribute('aria-selected')).toBe('true'))
    expect(selectedRows()).toHaveLength(1)
  })

  it('clicar dentro da célula em edição (mesmo com Shift) não altera a seleção', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const row = await rowOf('OS-1005')
    fireEvent.doubleClick(await cellOf(row, 'text'))
    await waitFor(() => expect(row.getAttribute('aria-selected')).toBe('true'))
    const editing = row.querySelector('.gr-cell--editing') as HTMLElement
    expect(editing).toBeTruthy()
    fireEvent.click(editing.querySelector('input, textarea') ?? editing, { shiftKey: true })
    expect(selectedRows()).toHaveLength(1)
    expect(selectedRows()[0]).toBe(row)
  })

  it('no celular, tocar no corpo do card alterna a seleção', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    const card = (await screen.findAllByRole('listitem'))[0]
    fireEvent.click(card.querySelector('.gr-card__line') as HTMLElement)
    expect(card.className).toContain('is-selected')
    fireEvent.click(card.querySelector('.gr-card__line') as HTMLElement)
    expect(card.className).not.toContain('is-selected')
    fireEvent.click(within(card).getByRole('button', { name: /Abrir serviço/ }))
    expect(card.className).not.toContain('is-selected')
  })

  describe('modo Tabela | Cards (desktop)', () => {
    it('alterna para Cards, lembra a escolha ao remontar e volta para a Tabela', async () => {
      const first = render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findByRole('grid', { name: 'Serviços' })
      fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
      expect((await screen.findByRole('menuitemradio', { name: 'Ver como tabela', hidden: true })).getAttribute('aria-checked')).toBe('true')
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Ver como cards', hidden: true }))
      await waitFor(() => expect(document.querySelectorAll('.gr-card').length).toBeGreaterThan(10))
      expect(screen.queryByRole('grid', { name: 'Serviços' })).toBeNull()
      expect(document.querySelector('.gr-cards--grid')).toBeTruthy()
      expect(window.localStorage.getItem('betinhos.geral.modo.v1')).toBe('cards')
      first.unmount()
      render(<GeralPage host={{ mode: 'mock' }} />)
      await waitFor(() => expect(document.querySelectorAll('.gr-card').length).toBeGreaterThan(10))
      fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
      fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Ver como tabela', hidden: true }))
      expect(await screen.findByRole('grid', { name: 'Serviços' })).toBeTruthy()
      expect(window.localStorage.getItem('betinhos.geral.modo.v1')).toBe('tabela')
    })

    it('nos cards do desktop o clique seleciona e "Editar campos" abre a sheet', async () => {
      window.localStorage.setItem('betinhos.geral.modo.v1', 'cards')
      render(<GeralPage host={{ mode: 'mock' }} />)
      await waitFor(() => expect(document.querySelectorAll('.gr-card').length).toBeGreaterThan(10))
      const card = document.querySelector('.gr-card') as HTMLElement
      fireEvent.click(card)
      expect(card.className).toContain('is-selected')
      expect(screen.queryByRole('group', { name: 'Ações sobre os selecionados' })).toBeNull()
      fireEvent.click(within(card).getByRole('button', { name: /Editar campos/ }))
      expect(await screen.findByRole('dialog')).toBeTruthy()
    })

    it('no celular o alternador não aparece', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
      render(<GeralPage host={{ mode: 'mock' }} />)
      await waitFor(() => expect(document.querySelectorAll('.gr-card').length).toBeGreaterThan(0))
      fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
      await screen.findByRole('menuitem', { name: 'Compartilhar link', hidden: true })
      expect(screen.queryByRole('menuitemradio', { name: 'Ver como cards', hidden: true })).toBeNull()
    })
  })
})
