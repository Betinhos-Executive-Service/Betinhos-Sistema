// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeralPage } from './GeralPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
    expect(await screen.findByRole('columnheader', { name: /Status de Operação/ })).toBeTruthy()
    // A linha do cabeçalho já existe antes dos dados: espera as 50 linhas chegarem.
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(10))
    expect(screen.getByText(/Linhas 1–50 de/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Status de Operação/ }))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Status de Operação/ }).getAttribute('aria-sort')).toBe('ascending'))
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    await screen.findByText(/Linhas 51–/)
  })

  it('troca de visão e busca por palavra-chave', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50/)
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    // O painel do Select usa `popover`, que o jsdom não exibe: as opções existem, mas ficam fora da árvore acessível.
    fireEvent.click(await screen.findByRole('option', { name: 'Sem motorista', hidden: true }))
    await waitFor(() => expect(screen.queryByText(/Linhas 1–50/)).toBeNull())
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
    await waitFor(() => expect(screen.getAllByText(/OS-10\d/).length).toBeGreaterThan(0), { timeout: 4000 })
  })

  it('ocultar coluna some da tabela e volta com restaurar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/ })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/ })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Colunas da visão' })).getByRole('button', { name: 'Restaurar colunas da visão' }))
    await screen.findByRole('columnheader', { name: /Trajeto/ })
  })

  it('o clique no cabeçalho cicla crescente, decrescente e ordem da visão', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const header = () => screen.getByRole('columnheader', { name: /Trajeto/ })
    const sort = () => fireEvent.click(screen.getByRole('button', { name: /Trajeto/ }))
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
    await screen.findByText(/Linhas 1–50 de/)
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findByText(/Linhas 1–50 de/)
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('none'))
  })

  it('busca sem resultado mostra o estado vazio e limpar busca volta à lista', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'zzzz-nada' } })
    const empty = (await screen.findByText('Nenhum serviço nesta visão', {}, { timeout: 4000 })).closest('section') as HTMLElement
    // A caixa de busca também tem um "Limpar busca"; o do estado vazio é o que está dentro da seção.
    fireEvent.click(within(empty).getByRole('button', { name: 'Limpar busca' }))
    await screen.findByText(/Linhas 1–50 de/)
  })

  it('a coluna oculta fica salva por visão e volta ao reabrir a tela', async () => {
    const first = render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/ })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mover Trajeto para cima' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/ })).toBeNull())
    first.unmount()
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Status de Operação/ })
    expect(screen.queryByRole('columnheader', { name: /Trajeto/ })).toBeNull()
  })

  it('fechar o diálogo de colunas com alterações pede confirmação antes de descartar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/ })
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
    expect(screen.getByRole('columnheader', { name: /Trajeto/ })).toBeTruthy()
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toBeNull()
  })

  it('edita texto na célula com Enter e mostra salvo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const cell = await cellOf((await screen.findAllByRole('row'))[1], 'text')
    fireEvent.keyDown(cell, { key: 'Enter' })
    const input = within(cell).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Rota editada' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await within(cell).findByLabelText('Salvo')).toBeTruthy()
    expect(within(cell).getByText('Rota editada')).toBeTruthy()
  })

  it('erro do servidor restaura o valor, mostra aviso e permite tentar de novo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral' })
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
    await screen.findByText(/Linhas 1–50 de/)
    const first = (await screen.findAllByRole('row'))[1]
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
    await screen.findByText(/Linhas 1–50 de/)
    const cell = await cellOf((await screen.findAllByRole('row'))[1], 'money')
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
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral' })
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
    await screen.findByText(/Linhas 1–50 de/)
    const cell = await cellOf((await screen.findAllByRole('row'))[1], 'lookup')
    fireEvent.keyDown(cell, { key: 'Enter' })
    fireEvent.click(await within(cell).findByRole('option', { name: 'Bruno Dias', hidden: true }))
    expect(await within(cell).findByLabelText('Salvo')).toBeTruthy()
    expect(within(cell).getByText('Bruno Dias')).toBeTruthy()
  })
})
