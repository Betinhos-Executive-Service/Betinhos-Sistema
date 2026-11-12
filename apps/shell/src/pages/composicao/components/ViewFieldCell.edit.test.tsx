// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditableViewFieldCell } from './ViewFieldCell'
import type { CatalogField } from '../data/views'
import type { SavedFieldValue } from '../data/related-field-edit'
import { gridFieldValue } from '../data/grid-field-value'

const mocks = vi.hoisted(() => ({ save: vi.fn(), choices: vi.fn(), lookups: vi.fn(), date: vi.fn() }))
vi.mock('../data/related-field-edit', async (importOriginal) => {
  const original = await importOriginal<typeof import('../data/related-field-edit')>()
  return { ...original, saveRelatedField: mocks.save, choiceOptions: mocks.choices, lookupOptions: mocks.lookups, dateFieldConfig: mocks.date }
})

const field: CatalogField = { id: 'servico@lookup.cr40f_valor', label: 'Valor externo', table: 'cr40f_reservadeveculos', attribute: 'cr40f_valor', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], primaryIdAttribute: 'cr40f_reservadeveculosid', type: 'Money', available: true, writable: true }
const guid = '11111111-2222-4333-8444-555555555555'
function setup(type = 'Money', value: unknown = 1234.5, extra: Record<string, unknown> = {}) {
  return render(<table><tbody><tr><td><EditableViewFieldCell field={{ ...field, type }} value={value} viewFields={{ 'r1.cr40f_reservadeveculosid': guid }} valueKey="r1.cr40f_valor" baseRecordId={guid} editable {...extra} /></td><td><div tabIndex={0} data-grid-cell="next" data-grid-editable="true">Próxima célula</div></td></tr></tbody></table>)
}
function edit() { fireEvent.doubleClick(screen.getByLabelText(/Valor externo:/)) }
const editor = () => screen.getByRole('textbox', { name: 'Editar Valor externo' })

describe('edição externa com o contrato da grade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.save.mockImplementation(async (field: CatalogField, recordId: string, value: unknown, option?: { label: string }) => ({ table: field.table, attribute: field.attribute, recordId, value, formatted: option?.label } satisfies SavedFieldValue))
    mocks.choices.mockResolvedValue([{ value: '1', label: 'Cartão de crédito' }, { value: '2', label: 'Boleto' }])
    mocks.lookups.mockResolvedValue([{ value: guid, label: 'OP-57', table: 'cr40f_ordens', entitySet: 'cr40f_ordenss', navigation: 'cr40f_op' }])
    mocks.date.mockResolvedValue({ behavior: 'UserLocal', dateOnly: false })
  })
  afterEach(cleanup)

  it('usa o mesmo input monetário, sem ações empilhadas, e salva por Tab', async () => {
    const onSaved = vi.fn()
    setup('Money', 1234.5, { onSaved })
    expect(screen.getByText(/R\$\s*1\.234,50/)).toBeTruthy()
    edit()
    expect(editor().classList.contains('money-editor')).toBe(true)
    expect((editor() as HTMLInputElement).value).toBe('1234,5')
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    fireEvent.change(editor(), { target: { value: '2.345,67' } })
    fireEvent.keyDown(editor(), { key: 'Tab' })
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ table: field.table }), guid, 2345.67, undefined))
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Próxima célula'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ value: 2345.67 })))
  })

  it('inicia texto ao digitar e salva no blur', async () => {
    setup('String', 'Antes')
    fireEvent.keyDown(screen.getByLabelText(/Valor externo:/), { key: 'N' })
    expect((editor() as HTMLInputElement).value).toBe('N')
    fireEvent.change(editor(), { target: { value: 'Novo texto' } })
    fireEvent.blur(editor())
    screen.getByText('Próxima célula').focus()
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.anything(), guid, 'Novo texto', undefined))
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Próxima célula'))
  })

  it('Escape cancela o rascunho sem gravar', () => {
    setup('String', 'Antes')
    edit()
    fireEvent.change(editor(), { target: { value: 'Cancelar' } })
    fireEvent.keyDown(editor(), { key: 'Escape' })
    expect(mocks.save).not.toHaveBeenCalled()
    expect(screen.getByText('Antes')).toBeTruthy()
  })

  it('lookup tem apenas um combobox e salva pela escolha no dropdown', async () => {
    setup('Lookup', null)
    edit()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(document.querySelector('select')).toBeNull()
    const option = await screen.findByRole('option', { name: 'OP-57' })
    expect(option.closest('table')).toBeNull()
    fireEvent.click(option)
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.anything(), guid, guid, expect.objectContaining({ navigation: 'cr40f_op' })))
    await waitFor(() => expect(screen.getByText('OP-57')).toBeTruthy())
  })

  it('choice abre por F2 e confirma opção com teclado', async () => {
    setup('Picklist', 1, { formatted: 'Cartão de crédito' })
    fireEvent.keyDown(screen.getByLabelText(/Valor externo:/), { key: 'F2' })
    await screen.findByRole('option', { name: 'Boleto' })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.anything(), guid, 2, expect.objectContaining({ label: 'Boleto' })))
  })

  it('Tab não troca lookup por outro registro quando o atual não está nos resultados', async () => {
    setup('Lookup', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', { formatted: 'OP-56' })
    edit()
    await screen.findByRole('option', { name: 'OP-57' })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Tab' })
    expect(mocks.save).not.toHaveBeenCalled()
    expect(screen.getByText('OP-56')).toBeTruthy()
  })

  it('booleano usa as opções do metadata', async () => {
    mocks.choices.mockResolvedValue([{ value: 'true', label: 'Programado' }, { value: 'false', label: 'Não programado' }])
    setup('Boolean', false)
    edit()
    fireEvent.click(await screen.findByRole('option', { name: 'Programado' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.anything(), guid, true, expect.anything()))
  })

  it('date only preserva a data sem conversão de fuso', async () => {
    mocks.date.mockResolvedValue({ behavior: 'DateOnly', dateOnly: true })
    setup('DateTime', '2026-09-30T00:00:00Z')
    edit()
    await waitFor(() => expect(screen.getByLabelText('Editar Valor externo').getAttribute('type')).toBe('date'))
    fireEvent.change(screen.getByLabelText('Editar Valor externo'), { target: { value: '2026-10-02' } })
    fireEvent.keyDown(screen.getByLabelText('Editar Valor externo'), { key: 'Enter' })
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.anything(), guid, '2026-10-02T00:00:00Z', undefined))
  })

  it('salva o valor visível da data nativa e preserva o rascunho ao atualizar props', async () => {
    const dateField = { ...field, type: 'DateTime' }
    const props = { field: dateField, value: '2026-09-30T15:30:00Z', viewFields: { 'r1.cr40f_reservadeveculosid': guid }, valueKey: 'r1.cr40f_valor', baseRecordId: guid, editable: true }
    const view = render(<EditableViewFieldCell {...props} />)
    edit()
    await waitFor(() => expect(mocks.date).toHaveBeenCalledTimes(1))
    const input = screen.getByLabelText('Editar Valor externo') as HTMLInputElement
    fireEvent.input(input, { target: { value: '2026-10-01T09:45' } })
    view.rerender(<EditableViewFieldCell {...props} field={{ ...dateField }} />)
    expect(input.value).toBe('2026-10-01T09:45')
    expect(mocks.date).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.anything(), guid, new Date('2026-10-01T09:45').toISOString(), undefined))
  })

  it.each([false, true])('limita o ano digitado ou colado a quatro dígitos (dateOnly=%s)', async (dateOnly) => {
    expect(() => gridFieldValue({ ...field, type: 'DateTime' }, '42424-02-24T23:24')).toThrow('ano de quatro dígitos')
    mocks.date.mockResolvedValue({ behavior: dateOnly ? 'DateOnly' : 'UserLocal', dateOnly })
    setup('DateTime', '2026-09-30T15:30:00Z')
    edit()
    const input = screen.getByLabelText('Editar Valor externo') as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    expect(input.max).toBe(dateOnly ? '9999-12-31' : '9999-12-31T23:59')
    fireEvent.input(input, { target: { value: dateOnly ? '42424-02-24' : '42424-02-24T23:24' } })
    expect(input.value).toBe(dateOnly ? '4242-02-24' : '4242-02-24T23:24')
  })

  it('erro de gravação restaura o valor e permite recuperar o rascunho por F2', async () => {
    mocks.save.mockRejectedValue({ message: 'Sem permissão para atualizar.' })
    setup()
    edit()
    fireEvent.change(editor(), { target: { value: '250,00' } })
    fireEvent.keyDown(editor(), { key: 'Enter' })
    await screen.findByRole('alert')
    expect(screen.getByText(/R\$\s*1\.234,50/)).toBeTruthy()
    fireEvent.keyDown(screen.getByLabelText(/Valor externo:/), { key: 'F2' })
    expect((editor() as HTMLInputElement).value).toBe('250,00')
  })

  it('número inválido mantém o input e o erro sem enviar payload', async () => {
    setup('Integer', 10)
    edit()
    fireEvent.change(editor(), { target: { value: '1,5' } })
    fireEvent.keyDown(editor(), { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toContain('número válido')
    expect(editor()).toBeTruthy()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('não edita sem id relacionado ou metadata gravável', () => {
    setup('String', 'Leitura', { viewFields: {} })
    fireEvent.doubleClick(screen.getByLabelText(/Valor externo:/))
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('valida identificador personalizado quando o metadata permite atualização', async () => {
    setup('Uniqueidentifier', guid)
    edit()
    fireEvent.change(editor(), { target: { value: 'inválido' } })
    fireEvent.keyDown(editor(), { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toContain('identificador válido')
    expect(mocks.save).not.toHaveBeenCalled()
    const next = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    fireEvent.change(editor(), { target: { value: next } })
    fireEvent.keyDown(editor(), { key: 'Enter' })
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.anything(), guid, next, undefined))
  })
})
