// apps/shell/src/pages/frota/views/FilaEncaixe.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'
import { FilaEncaixe } from './FilaEncaixe'

const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.SOLICITADO, grau: 1, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: null, solicitante: null, criadoEm: '2026-11-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })

afterEach(cleanup)

describe('FilaEncaixe', () => {
  it('lista as Solicitadas por grau e antiguidade, com veículo, grau e espera; o clique abre a manutenção', () => {
    const onOpen = vi.fn()
    render(<FilaEncaixe hoje="2026-11-18" onOpen={onOpen} onNovo={() => {}} manutencoes={[
      manut('baixa', { grau: 1, criadoEm: '2026-11-10T12:00:00Z' }),
      manut('urgente', { grau: 4, criadoEm: '2026-11-17T12:00:00Z', veiculo: { id: 'v1', label: 'ABC1D23' } }),
      manut('feita', { status: MANUT.REALIZADO }),
    ]} />)
    const itens = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toContain('urgente')
    expect(itens[0]).toContain('ABC1D23')
    expect(itens[0]).toContain('Urgente')
    expect(itens[0]).toContain('Há 1 dia')
    expect(itens[1]).toContain('Há 8 dias')
    fireEvent.click(screen.getByRole('button', { name: /urgente/ }))
    expect(onOpen).toHaveBeenCalledWith('urgente')
  })

  it('sem pedidos mostra o vazio; "Nova manutenção" chama a gaveta nova', () => {
    const onNovo = vi.fn()
    render(<FilaEncaixe hoje="2026-11-18" manutencoes={[]} onOpen={() => {}} onNovo={onNovo} />)
    expect(screen.getByText('Nenhuma manutenção esperando encaixe')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nova manutenção' }))
    expect(onNovo).toHaveBeenCalledTimes(1)
  })
})
