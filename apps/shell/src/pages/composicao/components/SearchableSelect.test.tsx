// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SearchableSelect } from './SearchableSelect'

afterEach(cleanup)

describe('select operacional', () => {
  it('busca com acentos, seleciona pelo teclado e preserva o valor', () => {
    function Example() {
      const [value, setValue] = useState('')
      return <SearchableSelect aria-label="Escolher cliente" value={value} onChange={setValue} options={[{ value: '1', label: 'São Paulo' }, { value: '2', label: 'Curitiba' }]} />
    }
    render(<Example />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Escolher cliente' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar escolher cliente' }), { target: { value: 'sao' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Buscar escolher cliente' }), { key: 'Enter' })
    expect(screen.getByRole('combobox', { name: 'Escolher cliente' }).textContent).toContain('São Paulo')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
