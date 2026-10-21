// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../data/source'
import type { EquipamentoResumo } from '../data/types'
import { EquipamentosTab } from './RelatedTabs'

afterEach(cleanup)

const item = (id: string, descricao: string): EquipamentoResumo => ({ id, descricao, tipo: 'Notebook', numeroSerie: '', status: 100000000 })

describe('useLoad (abas relacionadas)', () => {
  it('descarta a resposta atrasada de outro funcionário', async () => {
    let resolveA: (rows: EquipamentoResumo[]) => void = () => {}
    const equipamentos = vi.fn((id: string) => (id === 'a' ? new Promise<EquipamentoResumo[]>((resolve) => { resolveA = resolve }) : Promise.resolve([item('eb', 'Do B')])))
    const source = { equipamentos } as unknown as DataSource
    const { rerender } = render(<EquipamentosTab source={source} id="a" />)
    rerender(<EquipamentosTab source={source} id="b" />)
    expect(await screen.findByText('Do B')).toBeTruthy()
    await act(async () => { resolveA([item('ea', 'Do A')]) })
    expect(screen.queryByText('Do A')).toBeNull()
    expect(screen.getByText('Do B')).toBeTruthy()
  })

})
