// apps/shell/src/pages/frota/components/ManutencaoResumo.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { avaliar } from '../domain/manutencaoEtapas'
import { CabecalhoManutencao, HistoricoManutencao, MaisAcoes, PedidoManutencao } from './ManutencaoResumo'

afterEach(cleanup)
const HOJE = '2026-11-17'
// Mesmos fixtures do ManutencaoPassoAPasso.test.tsx.
const base: DetalheManutencao = {
  id: 'm1', codigo: 'OM-1', descricao: 'Revisão fictícia', status: MANUT.SOLICITADO, grau: 2, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null,
  dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 60000,
  veiculo: { id: 'v1', label: 'TST4D44' }, solicitante: { id: 'p1', label: 'Motorista Fictício' }, criadoEm: '2026-11-14T12:00:00Z', servicos: [], categorias: [],
  origemClassificacao: null, confiancaIa: null, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [],
  linkNotaFiscal: null, fotosFinais: [], programacao: null, despesa: null,
}
const m = (patch: Partial<DetalheManutencao>): DetalheManutencao => ({ ...base, ...patch })
const agendada = m({ status: MANUT.AGENDADO, janelaInicio: '2026-11-23', janelaFim: '2026-11-29', dataAprovacao: '2026-11-17', programacao: { geralId: 'g1', motorista: null, saida: '2026-11-23T03:00:00.000Z' } })
const programada = m({ ...agendada, status: MANUT.PROGRAMADO, programacao: { geralId: 'g1', motorista: { id: 'p2', label: 'Outro Fictício' }, saida: '2026-11-24T13:00:00.000Z' } })

describe('CabecalhoManutencao', () => {
  it('mostra grau, status, prazo e quem pediu', () => {
    render(<CabecalhoManutencao m={base} situacao={avaliar(base, HOJE)} />)
    expect(screen.getByText('Média')).toBeTruthy()
    expect(screen.getByText('Solicitado')).toBeTruthy()
    expect(screen.getByText('há 3 dias')).toBeTruthy()
    expect(screen.getByText(/pedido por Motorista Fictício em 14\/11/)).toBeTruthy()
  })
  it('programada: diz quem leva e quando, no lugar de quem pediu', () => {
    render(<CabecalhoManutencao m={programada} situacao={avaliar(programada, HOJE)} />)
    expect(screen.getByText(/Outro Fictício leva em/)).toBeTruthy()
    expect(screen.queryByText(/pedido por/)).toBeNull()
  })
  it('o prazo atrasado diz "Atrasada" em texto, não só na cor', () => {
    const atrasada = m({ ...agendada, janelaInicio: '2026-11-09', janelaFim: '2026-11-15' })
    render(<CabecalhoManutencao m={atrasada} situacao={avaliar(atrasada, HOJE)} />)
    expect(screen.getByText('desde 15/11').closest('[data-perigo]')?.textContent).toContain('Atrasada')
  })
})

describe('MaisAcoes', () => {
  it('Programado oferece Concluir por ele', async () => {
    const onExtra = vi.fn()
    render(<MaisAcoes situacao={avaliar(programada, HOJE)} onExtra={onExtra} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Concluir por ele', hidden: true }))
    expect(onExtra).toHaveBeenCalledWith('concluir')
  })
  it('Reprovada: sem "⋯"', () => {
    const reprovada = m({ status: MANUT.REPROVADO, comentarioAprovador: 'Duplicada' })
    render(<MaisAcoes situacao={avaliar(reprovada, HOJE)} onExtra={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()
  })
})

describe('PedidoManutencao', () => {
  it('cita a descrição e mostra só os campos preenchidos', () => {
    render(<PedidoManutencao m={base} />)
    const pedido = screen.getByRole('region', { name: 'Pedido' })
    expect(within(pedido).getByText('“Revisão fictícia”')).toBeTruthy()
    expect(within(pedido).getByText('60.000 km')).toBeTruthy()
    expect(within(pedido).queryByText('Tipo de reparo')).toBeNull()
    expect(within(pedido).queryByText('Comentário ao motorista')).toBeNull()
  })
  it('com tipo, comentário e veículo: mostra e abre o veículo', () => {
    const onOpenVeiculo = vi.fn()
    render(<PedidoManutencao m={m({ tipo: 1, comentarioAoMotorista: 'Levar cedo' })} onOpenVeiculo={onOpenVeiculo} />)
    expect(screen.getByText('Tipo de reparo')).toBeTruthy()
    expect(screen.getByText('Levar cedo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver o veículo TST4D44' }))
    expect(onOpenVeiculo).toHaveBeenCalledWith('v1')
  })
})

describe('HistoricoManutencao', () => {
  it('lista o que já foi feito', () => {
    render(<HistoricoManutencao situacao={avaliar(programada, HOJE)} />)
    expect(screen.getByRole('region', { name: 'Histórico' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
  })
  it('sem nada feito: não aparece', () => {
    render(<HistoricoManutencao situacao={{ ...avaliar(base, HOJE), feitos: [] }} />)
    expect(screen.queryByRole('region', { name: 'Histórico' })).toBeNull()
  })
})
