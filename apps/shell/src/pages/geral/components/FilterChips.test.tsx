// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FilterSet } from '../domain/filters'
import type { AttributeMap } from '../domain/types'
import { FilterChips } from './FilterChips'

afterEach(cleanup)

const attributes: AttributeMap = new Map([
  ['cr40f_trajeto', { logicalName: 'cr40f_trajeto', type: 'String', label: 'Trajeto', updatable: true, targets: [], options: [] }],
])
const filters: FilterSet = {
  cr40f_trajeto: { kind: 'text', op: 'contains', value: 'Galeão' },
  vazio: { kind: 'text', op: 'contains', value: '  ' },
}

describe('FilterChips', () => {
  it('mostra um chip por filtro com valor, ignora os vazios e dispara editar, remover e limpar', () => {
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    const onClearAll = vi.fn()
    render(<FilterChips filters={filters} attributes={attributes} mobile={false} onEdit={onEdit} onRemove={onRemove} onClearAll={onClearAll} />)
    expect(screen.getAllByRole('button', { name: /^Remover filtro/ })).toHaveLength(1)
    fireEvent.click(screen.getByText('Trajeto: contém Galeão'))
    expect(onEdit).toHaveBeenCalledWith('cr40f_trajeto')
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Trajeto' }))
    expect(onRemove).toHaveBeenCalledWith('cr40f_trajeto')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onClearAll).toHaveBeenCalled()
  })

  it('não renderiza nada sem filtros', () => {
    const { container } = render(<FilterChips filters={{}} attributes={attributes} mobile onEdit={vi.fn()} onRemove={vi.fn()} onClearAll={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
