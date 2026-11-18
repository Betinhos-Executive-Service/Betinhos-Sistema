// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColumnHeader, type ActiveColumnFilter } from './ColumnHeader'

afterEach(cleanup)

const setup = (filters: ActiveColumnFilter[] = []) => {
  const props = { onApply: vi.fn(), onClear: vi.fn(), onSort: vi.fn(), onHide: vi.fn(), onTogglePin: vi.fn(), onBeforeOpen: vi.fn(), onClose: vi.fn() }
  render(<ColumnHeader id="cr40f_valor" label="Valor" type="Money" filters={filters} sort={undefined} displayValue={(value) => value} canHide pinned={false} {...props} />)
  return props
}

const menuItem = async (label: string) => (await screen.findByText(label)).closest('button') as HTMLButtonElement

const openFilter = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Valor/ }))
  fireEvent.click(await menuItem('Filtrar por…'))
  await screen.findByText('Filtrar por Valor')
  return document.querySelector('[aria-label="Filtro da coluna Valor"]') as HTMLElement
}

describe('título da coluna no padrão do DS', () => {
  it('ordena pelo menu e fecha a edição', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /Valor/ }))
    fireEvent.click(await menuItem('Ordenar Z→A'))
    expect(props.onSort).toHaveBeenCalledWith(true)
    expect(props.onClose).toHaveBeenCalled()
  })

  it('abre o painel com o filtro valendo e Aplicar grava os filtros da view', async () => {
    const props = setup([{ filter: { id: 'cr40f_valor', operator: 'gt', value: '100' }, index: 0 }])
    const dialog = await openFilter()
    const input = dialog.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(input.value).toContain('100'))
    fireEvent.click(screen.getByText('Aplicar'))
    expect(props.onApply).toHaveBeenCalledWith([{ id: 'cr40f_valor', operator: 'gt', value: '100' }])
  })

  it('Limpar no painel remove o filtro da coluna', async () => {
    const props = setup([{ filter: { id: 'cr40f_valor', operator: 'gt', value: '100' }, index: 0 }])
    await openFilter()
    fireEvent.click(screen.getByText('Limpar'))
    expect(props.onClear).toHaveBeenCalled()
    expect(props.onApply).not.toHaveBeenCalled()
  })
})
