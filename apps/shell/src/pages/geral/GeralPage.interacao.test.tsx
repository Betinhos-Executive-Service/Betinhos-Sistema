// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeralPage } from './GeralPage'
import { cellOf, columnMenu, dataRows, openColumnFilter, PAGE1, usarAmbienteGeral, viewTrigger } from './testUtils'

vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>()))
usarAmbienteGeral()

const BOOLEAN_LABELS = ['Receber']
describe('Geral: redimensionar e reordenar colunas', () => {
  const track = (name: RegExp) => {
    const grid = screen.getByRole('grid', { name: 'Serviços', hidden: true })
    const labels = screen.getAllByRole('columnheader', { hidden: true })
    const index = labels.findIndex((h) => name.test(h.getAttribute('title') ?? ''))
    return grid.style.getPropertyValue('--gr-columns').split(/ (?![^(]*\))/)[index]
  }
  const px = (t: string) => Number(/minmax\((\d+)px/.exec(t)?.[1])
  // jsdom não desenha: o cabeçalho mede a largura da própria trilha e a borda direita fica em x = 100.
  let rect: { mockRestore: () => void }
  beforeEach(() => {
    rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const title = this.getAttribute('role') === 'columnheader' ? this.getAttribute('title') : null
      const width = title ? px(track(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))) : 0
      return { x: 100 - width, y: 0, width, height: 32, top: 0, left: 100 - width, right: 100, bottom: 32, toJSON: () => ({}) } as DOMRect
    })
  })
  afterEach(() => rect.mockRestore())

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
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(before + 60))
    fireEvent.pointerUp(handle, { clientX: 160, pointerId: 1 })
    expect(px(track(/Trajeto/))).toBe(before + 60)
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toContain(`${before + 60}`)
  })

  it('a largura fica ao soltar mesmo se a tabela renderizar no meio do arraste', async () => {
    const host = { mode: 'mock' as const }
    const { rerender } = render(<GeralPage host={host} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    const before = px(track(/Trajeto/))
    const handle = screen.getByRole('separator', { name: 'Redimensionar coluna Trajeto', hidden: true })
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 160, pointerId: 1, buttons: 1 })
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(before + 60))
    expect(document.documentElement.classList.contains('gr-resizing')).toBe(true)
    // Render no meio do arraste (no DEV vem do virtualizador, da carga etc.): o React passa a conhecer a largura do arraste.
    rerender(<GeralPage host={host} />)
    fireEvent.pointerUp(handle, { clientX: 160, pointerId: 1 })
    await new Promise((r) => setTimeout(r, 50))
    expect(px(track(/Trajeto/))).toBe(before + 60)
    expect(document.documentElement.classList.contains('gr-resizing')).toBe(false)
  })

  it('Esc no meio do arraste volta à largura de antes e não grava', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    const before = track(/Trajeto/)
    const handle = screen.getByRole('separator', { name: 'Redimensionar coluna Trajeto', hidden: true })
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 180, pointerId: 1, buttons: 1 })
    await waitFor(() => expect(px(track(/Trajeto/))).toBe(px(before) + 80))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(track(/Trajeto/)).toBe(before)
    fireEvent.pointerMove(handle, { clientX: 220, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(handle, { clientX: 220, pointerId: 1 })
    await new Promise((r) => setTimeout(r, 50))
    expect(track(/Trajeto/)).toBe(before)
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1') ?? '').not.toContain(`${px(before) + 80}`)
    expect(document.documentElement.classList.contains('gr-resizing')).toBe(false)
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
    // A última marcada (a coluna virtual Portal vem desligada no fim do painel).
    const last = within(dialog).getAllByRole('checkbox').filter((b) => (b as HTMLInputElement).checked).at(-1) as HTMLInputElement
    const hiddenName = last.labels?.[0]?.textContent ?? ''
    expect(hiddenName).not.toBe('')
    fireEvent.click(last)
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
    // A coluna virtual Portal continua oculta por padrão; conta só a ocultada aqui.
    const ocultas = pref.hidden.filter((k) => k !== 'portal')
    expect(ocultas.length).toBe(1)
    expect(pref.order).toContain(ocultas[0])
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
