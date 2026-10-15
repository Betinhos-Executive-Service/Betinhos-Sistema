// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT, VEICULO } from '../data/schema'
import { createMockSource } from '../data/mock'
import { EMPTY_DATA } from '../data/source'
import type { FrotaData, Veiculo } from '../data/types'
import { escolher } from '../testUtils'
import { Veiculos } from './Veiculos'

const source = createMockSource()

const base: Veiculo = { id: 'v1', placa: 'TST1A11', marca: 'Toyota', modelo: 'Corolla', cor: null, anoModelo: null, status: VEICULO.ATIVO, categoria: null, motorista: { id: 'f1', label: 'Ana' }, hodometro: null, hodometroEm: null }
const data: FrotaData = {
  ...EMPTY_DATA,
  veiculos: [
    base,
    { ...base, id: 'v4', placa: 'TST4D44', marca: null, modelo: null, status: null, motorista: null },
  ],
  manutencoes: [
    { id: 'm2', codigo: 'M2', descricao: 'Alinhamento', status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: '2026-09-25T12:00:00Z', valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'TST1A11' }, solicitante: null, criadoEm: '2026-09-21T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
  ],
}

afterEach(cleanup)

describe('Veiculos', () => {
  it('mostra quem está com o carro pela posse aberta, com "Na base" e fallback no cadastro', () => {
    const comPosses: FrotaData = {
      ...data,
      veiculos: [base, { ...base, id: 'v2', placa: 'TST2B22', motorista: { id: 'f9', label: 'Cadastro antigo' } }, { ...base, id: 'v3', placa: 'TST3C33' }],
      posses: [
        { id: 'p1', inicio: '2026-09-01T12:00:00Z', fim: null, veiculo: { id: 'v1', label: 'TST1A11' }, motorista: { id: 'f2', label: 'Bruno' }, localBase: null },
        { id: 'p2', inicio: '2026-09-15T12:00:00Z', fim: null, veiculo: { id: 'v2', label: 'TST2B22' }, motorista: null, localBase: { id: 'b1', label: 'Base Centro' } },
      ],
    }
    render(<Veiculos data={comPosses} today="2026-10-02" source={source} onOpenVeiculo={() => {}} />)
    expect(screen.getByText('Bruno')).toBeTruthy()
    expect(screen.getByText('Na base · Base Centro')).toBeTruthy()
    expect(screen.queryByText('Cadastro antigo')).toBeNull()
    expect(screen.getByText('Ana')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Buscar veículo'), { target: { value: 'base centro' } })
    expect(screen.getByText('TST2B22')).toBeTruthy()
    expect(screen.queryByText('TST1A11')).toBeNull()
  })

  it('abre filtrada em Ativo', () => {
    render(<Veiculos data={data} today="2026-10-02" source={source} onOpenVeiculo={() => {}} />)
    expect(screen.getByText('TST1A11')).toBeTruthy()
    expect(screen.queryByText('TST4D44')).toBeNull()
  })

  it('mostra veículo sem status com o selo no filtro "Sem status"', () => {
    render(<Veiculos data={data} today="2026-10-02" source={source} onOpenVeiculo={() => {}} />)
    escolher('Status do veículo', 'Sem status')
    expect(screen.getByText('TST4D44')).toBeTruthy()
    expect(screen.queryByText('TST1A11')).toBeNull()
    expect(document.querySelector('[role="row"] .bt-badge')?.textContent).toBe('Sem status')
  })

  it('mostra "sem valor" e nunca R$ 0,00 para manutenção realizada sem valor', () => {
    render(<Veiculos data={data} today="2026-10-02" source={source} onOpenVeiculo={() => {}} />)
    expect(screen.getByText(/1 sem valor/)).toBeTruthy()
    expect(screen.queryByText(/0,00/)).toBeNull()
  })

  it('abre a ficha ao clicar na linha', () => {
    const onOpenVeiculo = vi.fn()
    render(<Veiculos data={data} today="2026-10-02" source={source} onOpenVeiculo={onOpenVeiculo} />)
    fireEvent.click(screen.getByText('TST1A11'))
    expect(onOpenVeiculo).toHaveBeenCalledWith('v1')
  })
})
