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
        page: async (request) => {
          const page = await source.page(request)
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

/** A célula só vira editável quando a metadata chega: espera a classe do tipo aparecer na linha. */
const cellOf = (row: HTMLElement, kind: string) =>
  waitFor(() => {
    const cell = within(row).getAllByRole('gridcell').find((c) => c.className.includes(`gr-cell--${kind}`))
    if (!cell) throw new Error(`Sem célula ${kind}`)
    return cell
  })

describe('Geral', () => {
  it('abre a Agenda com as colunas da visão, pagina e ordena', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('columnheader', { name: /Status de Operação/, hidden: true })).toBeTruthy()
    // A linha do cabeçalho já existe antes dos dados: espera as 100 linhas chegarem.
    await waitFor(() => expect(screen.getAllByRole('row', { hidden: true }).length).toBeGreaterThan(10))
    expect(screen.getAllByText(PAGE1)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^Status de Operação$/, hidden: true }))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Status de Operação/, hidden: true }).getAttribute('aria-sort')).toBe('ascending'))
    // O primeiro teste paga a carga fria dos módulos: com a máquina ocupada passa dos 30 s do padrão.
  }, 60_000)

  it('abre na visão pedida pela URL e grava o estado sem empilhar histórico', async () => {
    window.location.hash = '#/geral?view=mock-sem-motorista'
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    try {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await waitFor(() => expect(screen.getByRole('combobox', { name: 'Visão' }).textContent).toContain('Sem motorista'))
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
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    // O painel do Select usa `popover`, que o jsdom não exibe: as opções existem, mas ficam fora da árvore acessível.
    fireEvent.click(await screen.findByRole('option', { name: 'Sem motorista', hidden: true }))
    await waitFor(() => expect(screen.queryAllByText(PAGE1)).toHaveLength(0))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
    await waitFor(() => expect(screen.getAllByText(/OS-10\d/).length).toBeGreaterThan(0), { timeout: 4000 })
  })

  it('ocultar coluna some da tabela e volta com restaurar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Colunas da visão' })).getByRole('button', { name: 'Restaurar colunas da visão' }))
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
  })

  it('o clique no cabeçalho cicla crescente, decrescente e ordem da visão', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const header = () => screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })
    const sort = () => fireEvent.click(screen.getByRole('button', { name: /^Trajeto$/, hidden: true }))
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
    await screen.findAllByText(PAGE1)
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findAllByText(PAGE1)
    sort()
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
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
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
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })

    // Sem alterações: fecha direto.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas da visão' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()

    // Com alterações: X abre a confirmação; "Continuar editando" mantém o diálogo.
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const again = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(again).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Fechar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Colunas da visão' })).toBeTruthy()

    // Esc também pede confirmação; "Descartar" fecha sem aplicar.
    fireEvent(again, new Event('cancel', { cancelable: true }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas da visão' })).toBeNull())
    expect(screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeTruthy()
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toBeNull()
  })

  it('edita texto na célula com Enter e mostra salvo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'text')
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
    const first = (await screen.findAllByRole('row', { hidden: true }))[1]
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
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'money')
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
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'lookup')
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
    const rows = screen.getAllByRole('row', { hidden: true })
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    expect(screen.getByText('2 selecionados')).toBeTruthy()
    // Os comandos estão sempre na barra; com 2 selecionados só o Editar (exige exatamente um) fica inerte.
    expect(screen.getByRole('button', { name: 'Editar' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Serviços' }))
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

  it('com 1 selecionado, Editar abre o formulário e Gerar Voucher avisa que só roda no Dataverse', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(screen.getAllByRole('row', { hidden: true })[1]).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Voucher' }))
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
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Sem motorista', hidden: true }))
    expect(await screen.findByRole('button', opener('OS-1217'))).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1000'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1052'))).toBeTruthy()
    // A busca é no servidor: some o que não bate, fica o que bate.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-1217' } })
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1052'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1217'))).toBeTruthy()
  })

  it('o cabeçalho mostra a ordem da visão e o primeiro clique nela inverte', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const header = () => screen.getByRole('columnheader', { name: /Data e horário de saída/, hidden: true })
    expect(header().getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(header()).getByRole('button', { name: /^Data e horário de saída$/ }))
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(header()).getByRole('button', { name: /^Data e horário de saída$/ }))
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
  })

  it('o aviso do motorista aparece no editor da célula', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'lookup')
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(await within(cell).findByTitle('Trocar o motorista dispara os avisos e a atribuição automática de veículo.')).toBeTruthy()
  })

  it('falha parcial ao desativar lista os ids que falharam e o primeiro erro', async () => {
    hooks.setState = async (ids) => ({ ok: [ids[0]], failed: [{ id: ids[1], message: 'Sem permissão' }] })
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const rows = screen.getAllByRole('row', { hidden: true })
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
    const rows = screen.getAllByRole('row', { hidden: true })
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
    fireEvent.click(within(screen.getAllByRole('row', { hidden: true })[1]).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Serviços' }))
    const dialog = await screen.findByRole('dialog', { name: 'Copiar serviços' })
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull())
    await new Promise((resolve) => { window.setTimeout(resolve, 700) })
    expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull()
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
  const blockedReason = { Editar: 'Selecione exatamente um serviço.', 'Gerar Voucher': 'Selecione ao menos um serviço.', 'Copiar Serviços': 'Selecione ao menos um serviço.', Desativar: 'Selecione ao menos um serviço.' }

  it('os comandos ficam sempre na barra: sem seleção os que dependem dela ficam inertes, com o motivo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const toolbar = screen.getByRole('toolbar', { name: 'Filtros de serviços' })
    expect(within(toolbar).getByRole('button', { name: 'Criar serviço' }).getAttribute('aria-disabled')).toBeNull()
    for (const [name, reason] of Object.entries(blockedReason)) {
      const button = within(toolbar).getByRole('button', { name })
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect((button as HTMLButtonElement).disabled).toBe(false)
      expect(button.getAttribute('title')).toBe(reason)
      expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toBe(reason)
    }
    expect(within(toolbar).queryByRole('button', { name: 'Ativar' })).toBeNull()
    expect(within(toolbar).queryByText(/selecionado/)).toBeNull()
    // Clicar num inerte não faz nada.
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Copiar Serviços' }))
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Editar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('com 1 selecionado os comandos se habilitam e a contagem aparece como badge', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(screen.getAllByRole('row', { hidden: true })[1]).getByRole('checkbox'))
    const toolbar = screen.getByRole('toolbar', { name: 'Filtros de serviços' })
    const count = within(toolbar).getByText('1 selecionado')
    expect(count.closest('.bt-badge')).not.toBeNull()
    for (const name of ['Editar', 'Gerar Voucher', 'Copiar Serviços', 'Desativar']) expect(within(toolbar).getByRole('button', { name }).getAttribute('aria-disabled')).toBeNull()
  })

  it('o cabeçalho tem só Atualizar e o total; Criar serviço fica na barra', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { name: 'Geral' })).toBeTruthy()
    expect(within(header).getByText(`100 de ${MOCK_ROW_COUNT} serviços`)).toBeTruthy()
    expect(within(header).getByRole('button', { name: 'Atualizar' })).toBeTruthy()
    expect(within(header).queryByRole('button', { name: 'Criar serviço' })).toBeNull()
  })

  it('cada título de coluna tem o rótulo completo em title (o texto pode ser cortado)', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const header = await screen.findByRole('columnheader', { name: /Status de faturamento/, hidden: true })
    expect(header.getAttribute('title')).toBe('Status de faturamento')
  })

  it('página fixa de 100: sem seletor de quantidade nem paginação numerada', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findAllByText(`100 de ${MOCK_ROW_COUNT} serviços`)).toHaveLength(2)
    expect(screen.queryByRole('combobox', { name: 'Serviços por página' })).toBeNull()
    expect(screen.queryByText(/Anterior|Próxima/)).toBeNull()
  })

  // Com 200+ linhas, consultas por papel (getByRole) percorrem milhares de nós no jsdom: aqui só consultas baratas.
  const rowCount = () => document.querySelectorAll('.gr-grid [role="row"]').length - 1
  const loadMoreButton = () => screen.getByText('Carregar mais').closest('button') as HTMLButtonElement

  it('Carregar mais acumula 100, 200 e 220 linhas e termina em Fim da lista', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(rowCount()).toBe(100)
    fireEvent.click(loadMoreButton())
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(rowCount()).toBe(200)
    fireEvent.click(loadMoreButton())
    await screen.findAllByText(`${MOCK_ROW_COUNT} serviços`)
    expect(rowCount()).toBe(MOCK_ROW_COUNT)
    expect(screen.getByText('Fim da lista')).toBeTruthy()
    expect(screen.queryByText('Carregar mais')).toBeNull()
  }, 90_000)

  it('ordenar depois de carregar mais volta ao topo com 100 linhas', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(loadMoreButton())
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    fireEvent.click(screen.getByText('Trajeto').closest('button') as HTMLButtonElement)
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

  it('no celular os cards usam a janela como raiz e o botão Carregar mais tem 44 px', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(document.querySelectorAll('.gr-cards > li')).toHaveLength(100)
    expect(loadMoreButton().classList.contains('bt-button--touch')).toBe(true)
    // O efeito que cria o observador roda depois da pintura: espera ele existir.
    await waitFor(() => expect(FakeObserver.instances.filter((o) => !o.closed).length).toBe(1))
    expect(FakeObserver.instances.filter((o) => !o.closed)[0].options?.root === null).toBe(true)
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(document.querySelectorAll('.gr-cards > li')).toHaveLength(200)
  }, 90_000)

  it('no desktop a barra usa controles compactos', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const toolbar = screen.getByRole('toolbar', { name: 'Filtros de serviços' })
    expect(within(toolbar).getByRole('combobox', { name: 'Visão' }).closest('.bt-control')?.classList.contains('bt-control--compact')).toBe(true)
    expect(within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' }).closest('.bt-control')?.classList.contains('bt-control--compact')).toBe(true)
    for (const name of ['Criar serviço', 'Colunas', 'Mais ações']) expect(within(toolbar).getByRole('button', { name }).classList.contains('bt-button--compact')).toBe(true)
  })

  it('no celular a barra usa tamanho de toque (44 px), nunca o compacto de 32 px', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByRole('listitem')
    const toolbar = screen.getByRole('toolbar', { name: 'Filtros de serviços' })
    for (const control of [
      within(toolbar).getByRole('combobox', { name: 'Visão' }).closest('.bt-control'),
      within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' }).closest('.bt-control'),
    ]) {
      expect(control?.classList.contains('bt-control--compact')).toBe(false)
      expect(control?.classList.contains('bt-control--touch')).toBe(true)
    }
    for (const name of ['Criar serviço', 'Mais ações']) {
      const button = within(toolbar).getByRole('button', { name })
      expect(button.classList.contains('bt-button--compact')).toBe(false)
      expect(button.classList.contains('bt-button--touch')).toBe(true)
    }
    // O botão Colunas some no celular (CSS), mas também sai do tamanho compacto.
    expect(within(toolbar).getByRole('button', { name: 'Colunas' }).classList.contains('bt-button--compact')).toBe(false)
  })
  describe('filtros por coluna', () => {
    const header = (name: RegExp) => screen.getByRole('columnheader', { name, hidden: true })

    it('o menu da coluna abre e ordena', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: 'Opções da coluna Trajeto', hidden: true }))
      expect((await screen.findAllByRole('menuitem', { hidden: true })).map((item) => item.textContent)).toEqual(['Ordenar A→Z', 'Ordenar Z→A', 'Filtrar por…', 'Ocultar coluna'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ordenar Z→A', hidden: true }))
      await waitFor(() => expect(header(/Trajeto/).getAttribute('aria-sort')).toBe('descending'))
    }, 60_000)

    it('filtrar Status por Confirmado reduz as linhas e cria o chip; remover restaura', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: 'Opções da coluna Status de Operação', hidden: true }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Filtrar por…', hidden: true }))
      const dialog = await screen.findByRole('dialog', { name: 'Filtrar Status de Operação' })
      fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Confirmado' }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
      const remove = await screen.findByRole('button', { name: 'Remover filtro Status de Operação' })
      expect(screen.getByText('Status de Operação: Confirmado')).toBeTruthy()
      await waitFor(() => expect(screen.queryAllByText(PAGE1)).toHaveLength(0))
      fireEvent.click(remove)
      await screen.findAllByText(PAGE1)
      expect(screen.queryByRole('button', { name: 'Remover filtro Status de Operação' })).toBeNull()
    }, 60_000)

    it('Editar filtros aplica o período Hoje de uma data', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const drawer = await screen.findByRole('dialog', { name: 'Editar filtros' })
      fireEvent.click(await within(drawer).findByRole('button', { name: /^Data e horário de saída/ }))
      fireEvent.click(within(drawer).getByRole('combobox', { name: 'Período' }))
      fireEvent.click(await screen.findByRole('option', { name: 'Hoje', hidden: true }))
      fireEvent.click(within(drawer).getByRole('button', { name: 'Aplicar' }))
      expect(await screen.findByText('Data e horário de saída: hoje')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Filtros (1)' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
      await screen.findAllByText(PAGE1)
      expect(screen.queryByRole('group', { name: 'Filtros ativos' })).toBeNull()
    }, 60_000)

    it('fechar o diálogo de filtro com rascunho pede confirmação, e o foco volta ao ▾ da coluna', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      const opener = () => screen.getByRole('button', { name: 'Opções da coluna Trajeto', hidden: true })
      fireEvent.click(opener())
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Filtrar por…', hidden: true }))
      const dialog = await screen.findByRole('dialog', { name: 'Filtrar Trajeto' })
      // Sem rascunho, fechar é direto e devolve o foco ao ▾.
      fireEvent.click(within(dialog).getByRole('button', { name: 'Limpar' }))
      await waitFor(() => expect(document.activeElement).toBe(opener()))
      // Com rascunho, pede confirmação.
      fireEvent.click(opener())
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Filtrar por…', hidden: true }))
      const again = await screen.findByRole('dialog', { name: 'Filtrar Trajeto' })
      fireEvent.change(within(again).getByRole('textbox', { name: 'Valor' }), { target: { value: 'Galeão' } })
      const close = within(again).queryByRole('button', { name: /Fechar/ })
      fireEvent.click(close ?? again.querySelector('button')!)
      const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtrar Trajeto' })).toBeNull())
      expect(screen.queryByRole('group', { name: 'Filtros ativos' })).toBeNull()
    }, 60_000)

    it('fechar o diálogo de filtro pelo X sem rascunho fecha direto; Continuar editando mantém aberto', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      const open = async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Opções da coluna Trajeto', hidden: true }))
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Filtrar por…', hidden: true }))
        return screen.findByRole('dialog', { name: 'Filtrar Trajeto' })
      }
      const dialog = await open()
      fireEvent.click(within(dialog).getByRole('button', { name: /Fechar/ }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtrar Trajeto' })).toBeNull())
      const again = await open()
      fireEvent.change(within(again).getByRole('textbox', { name: 'Valor' }), { target: { value: 'x' } })
      fireEvent.click(within(again).getByRole('button', { name: /Fechar/ }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Continuar editando' }))
      expect(await screen.findByRole('dialog', { name: 'Filtrar Trajeto' })).toBeTruthy()
    }, 60_000)

    it('sem metadata os filtros ficam indisponíveis e o chip restaurado da URL avisa', async () => {
      hooks.attributes = () => Promise.reject(new Error('sem metadata'))
      window.location.hash = '#/geral?f=' + encodeFilters({ cr40f_trajeto: { kind: 'text', op: 'contains', value: 'Galeão' } })
      render(<GeralPage host={{ mode: 'mock' }} />)
      const button = await screen.findByRole('button', { name: 'Filtros (1)' })
      await waitFor(() => expect(button.getAttribute('title')).toBe('Filtros indisponíveis: não foi possível carregar os campos.'))
      expect(button.getAttribute('title')).toBe('Filtros indisponíveis: não foi possível carregar os campos.')
      expect((await screen.findAllByTitle('Este filtro não está sendo aplicado')).length).toBeGreaterThan(0)
      fireEvent.click(button)
      const drawer = await screen.findByRole('dialog', { name: 'Editar filtros' })
      expect(within(drawer).getByText('Filtros indisponíveis: não foi possível carregar os campos.')).toBeTruthy()
      expect(within(drawer).queryByText('Carregando campos…')).toBeNull()
    }, 60_000)

    it('no celular mostra o botão Filtros em tamanho de toque e os chips', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByRole('listitem')
      const button = within(screen.getByRole('toolbar', { name: 'Filtros de serviços' })).getByRole('button', { name: 'Filtros' })
      expect(button.classList.contains('bt-button--touch')).toBe(true)
      fireEvent.click(button)
      const drawer = await screen.findByRole('dialog', { name: 'Editar filtros' })
      fireEvent.click(await within(drawer).findByRole('button', { name: /^Status de Operação/ }))
      fireEvent.click(within(drawer).getByRole('checkbox', { name: 'Confirmado' }))
      fireEvent.click(within(drawer).getByRole('button', { name: 'Aplicar' }))
      const chips = await screen.findByRole('group', { name: 'Filtros ativos' })
      expect(chips.classList.contains('gr-chips--touch')).toBe(true)
      expect(within(chips).getByText('Status de Operação: Confirmado')).toBeTruthy()
    }, 60_000)
  })
})

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

  it('coluna Sim/Não não tem alça', async () => {
    await open()
    const labels = screen.getAllByRole('columnheader', { hidden: true }).slice(1)
    const withHandle = labels.filter((h) => h.querySelector('.gr-resize')).length
    expect(withHandle).toBeLessThan(labels.length)
  })

  it('Alt+seta mantém o foco, preserva ocultas na ordem; Aplicar mantém larguras e Restaurar zera', async () => {
    const handle = await open()
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    let dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    const boxes = within(dialog).getAllByRole('checkbox')
    const hiddenName = boxes[boxes.length - 1].getAttribute('aria-label') ?? ''
    fireEvent.click(boxes[boxes.length - 1])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas da visão' })).toBeNull())
    expect(window.localStorage.getItem(LS)).toContain('widths')
    const names = () => screen.getAllByRole('columnheader', { hidden: true }).slice(1).map((h) => h.getAttribute('title'))
    const second = names()[1]
    const button = () => screen.getByRole('button', { name: new RegExp(`^${second}$`), hidden: true })
    button().focus()
    fireEvent.keyDown(button(), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(document.activeElement).toBe(button()))
    fireEvent.keyDown(button(), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(names().indexOf(second)).toBe(3))
    const saved = JSON.parse(window.localStorage.getItem(LS) ?? '{}') as Record<string, { hidden: string[]; order: string[] }>
    const pref = Object.values(saved)[0]
    if (hiddenName) expect(pref.order.length).toBeGreaterThan(names().length - 1)
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar colunas da visão' }))
    await waitFor(() => expect(window.localStorage.getItem(LS)).not.toContain('widths'))
  })
})
