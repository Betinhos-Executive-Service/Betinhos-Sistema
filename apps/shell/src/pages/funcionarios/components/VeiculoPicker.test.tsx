// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../data/source'
import type { Lookup } from '../data/types'
import { VeiculoPicker } from './VeiculoPicker'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('VeiculoPicker', () => {
  it('descarta a resposta de uma busca antiga que chega depois da nova', async () => {
    vi.useFakeTimers()
    const pending = new Map<string, (rows: Lookup[]) => void>()
    const source = { searchVeiculos: vi.fn((q: string) => new Promise<Lookup[]>((resolve) => pending.set(q, resolve))), openForm: vi.fn() } as unknown as DataSource
    render(<VeiculoPicker source={source} value={null} changed={false} onChange={() => {}} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ab' } })
    act(() => { vi.advanceTimersByTime(250) })
    fireEvent.change(input, { target: { value: 'abc' } })
    act(() => { vi.advanceTimersByTime(250) })
    expect([...pending.keys()]).toEqual(['ab', 'abc'])
    await act(async () => pending.get('abc')!([{ id: 'v1', label: 'ABC1D23 · Versa' }]))
    await act(async () => pending.get('ab')!([{ id: 'v9', label: 'AB9Z99 · Antigo' }]))
    expect(screen.getByText('ABC1D23 · Versa')).toBeTruthy()
    expect(screen.queryByText('AB9Z99 · Antigo')).toBeNull()
  })
})
