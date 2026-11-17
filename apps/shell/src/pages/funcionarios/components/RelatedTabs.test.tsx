// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '../data/source'
import type { EquipamentoResumo } from '../data/types'
import { EquipamentosTab, MultasTab } from './RelatedTabs'

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

describe('aba Multas', () => {
  it('mostra a etapa e abre a multa no drawer da Frota', async () => {
    const multas = vi.fn(async () => [{ id: 'x1', titulo: 'Excesso de velocidade', status: 202410001, dataHora: '2026-11-10T16:00:00Z', placa: 'TST1A11', local: 'Rod. de Teste km 10' }])
    render(<MultasTab source={{ multas } as unknown as DataSource} id="f1" />)
    expect(await screen.findByText('3. Pagar')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Abrir multa Excesso de velocidade' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('#/frota-multas?registro=multa%3Ax1')
  })
})
