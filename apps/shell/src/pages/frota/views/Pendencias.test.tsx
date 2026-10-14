// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT, PROPRIO, VEICULO } from '../data/schema'
import { EMPTY_DATA, } from '../data/source'
import type { FrotaData } from '../data/types'
import { Pendencias } from './Pendencias'

const today = '2026-10-14'

function dados(hodometro: number): FrotaData {
  return {
    ...EMPTY_DATA,
    veiculos: [{ id: 'v1', placa: 'TST1A11', marca: null, modelo: null, cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: PROPRIO, motorista: null, hodometro, hodometroEm: today }],
    planoPreventivo: [{ id: 'i1', nome: 'Troca de óleo', servico: 1, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 30, ativo: true }],
    manutencoes: [{ id: 'm1', codigo: 'M1', descricao: 'Óleo', status: MANUT.REALIZADO, grau: null, tipo: null, agendarPara: null, dataManutencao: '2026-07-14', valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 160000, veiculo: { id: 'v1', label: 'TST1A11' }, solicitante: null, criadoEm: '2026-07-14T12:00:00Z', servicos: [1], categorias: [], origemClassificacao: null, confiancaIa: null }],
  }
}

afterEach(cleanup)

describe('Pendencias - preventiva do plano', () => {
  it('mostra o grupo com "Em 850 km" e abre a ficha na seção Preventivas', () => {
    const onOpen = vi.fn()
    const onOpenVeiculo = vi.fn()
    render(<Pendencias data={dados(169150)} today={today} onOpen={onOpen} onOpenVeiculo={onOpenVeiculo} />)
    expect(screen.getByRole('heading', { name: 'Preventiva do plano' })).toBeTruthy()
    expect(screen.getByText('Em 850 km')).toBeTruthy()
    fireEvent.click(screen.getByText(/Troca de óleo/).closest('button')!)
    expect(onOpenVeiculo).toHaveBeenCalledWith('v1', 'preventivas')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('mostra "Vencido há 1.000 km" quando o km passou', () => {
    render(<Pendencias data={dados(171000)} today={today} onOpen={vi.fn()} onOpenVeiculo={vi.fn()} />)
    expect(screen.getByText('Vencido há 1.000 km')).toBeTruthy()
  })
})
