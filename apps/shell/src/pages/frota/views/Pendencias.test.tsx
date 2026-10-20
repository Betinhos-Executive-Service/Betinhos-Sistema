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

  /** Item com km e meses: a data da próxima fica no futuro (2027-07-14). */
  function comMeses(hodometro: number): FrotaData {
    const base = dados(hodometro)
    return { ...base, planoPreventivo: [{ ...base.planoPreventivo[0], intervaloMeses: 12 }] }
  }

  it('vencida por km com prazo futuro: badge de km em perigo, sem "Vence em", e conta como atrasada', () => {
    render(<Pendencias data={comMeses(171000)} today={today} onOpen={vi.fn()} onOpenVeiculo={vi.fn()} />)
    const badge = screen.getByText('Vencido há 1.000 km').closest('.bt-badge')!
    expect(badge.className).toContain('bt-badge--danger')
    expect(screen.queryByText(/Vence em/)).toBeNull()
    expect(screen.getByText(/Troca de óleo/).closest('button')!.getAttribute('data-urgencia')).toBe('atrasado')
    expect(screen.getByText('Atrasadas').closest('.bt-metric')!.querySelector('.bt-metric__value')!.textContent).toBe('1')
  })

  it('a vencer por km: "Em 800 km" em alerta, sem o prazo da data', () => {
    render(<Pendencias data={comMeses(169200)} today={today} onOpen={vi.fn()} onOpenVeiculo={vi.fn()} />)
    const badge = screen.getByText('Em 800 km').closest('.bt-badge')!
    expect(badge.className).toContain('bt-badge--warning')
    expect(screen.queryByText(/Vence em/)).toBeNull()
  })

  it('sem o plano preventivo: avisa que as preventivas estão indisponíveis e mostra as demais pendências', () => {
    const data = { ...dados(171000), manutencoes: [{ ...dados(0).manutencoes[0], id: 'm2', descricao: 'Freio', status: MANUT.SOLICITADO }] }
    render(<Pendencias data={data} errors={{ planoPreventivo: 'Sem privilégio' }} today={today} onOpen={vi.fn()} onOpenVeiculo={vi.fn()} />)
    expect(screen.getByText('Preventivas indisponíveis: Sem privilégio')).toBeTruthy()
    expect(screen.getByText('Freio')).toBeTruthy()
    expect(screen.queryByText(/Troca de óleo/)).toBeNull()
  })
})
