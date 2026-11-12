// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ComposicaoPage } from './ComposicaoPage'

afterEach(cleanup)

const auroraHour = /Aurora Logística, Hora motorista:/

/** A grade ainda pode re-renderizar após a primeira carga; repete o clique até a seleção valer. */
async function selectCell(label: RegExp) {
  await screen.findByLabelText(label)
  await waitFor(() => {
    fireEvent.pointerDown(screen.getByLabelText(label), { button: 0 })
    expect(screen.getByLabelText(label).className).toContain('money-cell--selected')
  })
  return screen.getByLabelText(label)
}

it('seleciona no clique, edita com duplo clique e cancela com Escape', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  const cell = await selectCell(auroraHour)
  expect(cell.getAttribute('data-grid-cell')).toBe('mock-1:cr40f_valorhoramotorista')
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()
  expect(await screen.findByRole('textbox', { name: 'Fórmula de Hora motorista' })).toHaveProperty('value', '52,00')

  fireEvent.doubleClick(screen.getByLabelText(/Aurora Logística, Hora motorista:/))
  const editor = screen.getByRole('textbox', { name: 'Editar Hora motorista' }) as HTMLInputElement
  expect(editor.value).toBe('52,00')
  fireEvent.change(editor, { target: { value: '=100+50' } })
  fireEvent.keyDown(editor, { key: 'Escape' })
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()
  expect(screen.getByLabelText(/Aurora Logística, Hora motorista: R\$\s*52,00/)).toBeTruthy()
})

it('orienta a usar = em contas digitadas sem prefixo', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await selectCell(auroraHour)
  fireEvent.keyDown(screen.getByLabelText(/Aurora Logística, Hora motorista:/), { key: '1' })
  const editor = await screen.findByRole('textbox', { name: 'Editar Hora motorista' })
  fireEvent.change(editor, { target: { value: '100+50' } })
  fireEvent.keyDown(editor, { key: 'Enter' })
  expect(await screen.findByRole('status', { name: 'Informe um valor ou comece a fórmula com =, como =100+50.' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Editar Hora motorista' })).toHaveProperty('value', '100+50')
})

it('fecha a edição ao sair da célula e preserva rascunhos inválidos para correção', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await selectCell(auroraHour)
  fireEvent.keyDown(screen.getByLabelText(/Aurora Logística, Hora motorista:/), { key: '=' })
  expect(await screen.findByRole('textbox', { name: 'Editar Hora motorista' })).toHaveProperty('value', '=')
  fireEvent.pointerDown(screen.getByLabelText(/Horizonte Sistemas, Tempo de espera:/), { button: 0 })
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()
  expect(screen.getByLabelText(/Aurora Logística, Hora motorista: R\$\s*52,00/)).toBeTruthy()

  fireEvent.doubleClick(screen.getByLabelText(/Aurora Logística, Hora motorista:/))
  const editor = screen.getByRole('textbox', { name: 'Editar Hora motorista' })
  fireEvent.change(editor, { target: { value: '=[Campo inexistente]' } })
  fireEvent.pointerDown(screen.getByLabelText(/Horizonte Sistemas, Tempo de espera:/), { button: 0 })
  expect(screen.queryByRole('textbox', { name: 'Editar Hora motorista' })).toBeNull()
  expect(screen.getByRole('status', { name: 'Campo desconhecido: Campo inexistente.' })).toBeTruthy()
  fireEvent.doubleClick(screen.getByLabelText(/Aurora Logística, Hora motorista:/))
  expect(screen.getByRole('textbox', { name: 'Editar Hora motorista' })).toHaveProperty('value', '=[Campo inexistente]')
}, 15000)

it('sugere campos na célula, insere no cursor e mantém o editor aberto', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await selectCell(auroraHour)
  fireEvent.keyDown(screen.getByLabelText(/Aurora Logística, Hora motorista:/), { key: '=' })
  const editor = await screen.findByRole('textbox', { name: 'Editar Hora motorista' }) as HTMLInputElement
  fireEvent.change(editor, { target: { value: '=[Pe' } })
  const option = await screen.findByRole('option', { name: 'Pedágios' })
  fireEvent.pointerDown(option, { button: 0 })
  expect(screen.getByRole('textbox', { name: 'Editar Hora motorista' })).toHaveProperty('value', '=[Pedágios]')
  expect(screen.queryByRole('option', { name: 'Pedágios' })).toBeNull()
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'Editar Hora motorista' }) as HTMLInputElement).selectionStart).toBe('=[Pedágios]'.length))
  fireEvent.pointerDown(screen.getByLabelText(/Aurora Logística, Locação:/), { button: 0 })
  expect(screen.getByRole('textbox', { name: 'Editar Hora motorista' })).toHaveProperty('value', '=[Pedágios][Locação]')
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar Hora motorista' }), { key: 'Escape' })
})

it('sugere campos na barra e confirma por teclado sem salvar prematuramente', async () => {
  render(<ComposicaoPage host={{ mode: 'mock' }} />)
  await selectCell(auroraHour)
  const bar = screen.getByPlaceholderText('Selecione uma célula para ver ou inserir uma fórmula') as HTMLInputElement
  expect(bar.getAttribute('aria-label')).toBe('Fórmula de Hora motorista')
  fireEvent.focus(bar)
  fireEvent.change(bar, { target: { value: '=Lo' } })
  expect(screen.getByRole('option', { name: 'Locação' })).toBeTruthy()
  fireEvent.keyDown(bar, { key: 'Tab' })
  expect(bar.value).toBe('=[Locação]')
  expect(screen.getByRole('textbox', { name: 'Fórmula de Hora motorista' })).toBe(bar)
  fireEvent.change(bar, { target: { value: '=100+pe' } })
  expect(screen.getByRole('option', { name: 'Pedágios' })).toBeTruthy()
  fireEvent.keyDown(bar, { key: 'Tab' })
  expect(bar.value).toBe('=100+[Pedágios]')
  fireEvent.keyDown(bar, { key: 'Enter' })
  await waitFor(() => expect(screen.getByLabelText(/Aurora Logística, Hora motorista: R\$\s*\d/)).toBeTruthy())
}, 15000)
