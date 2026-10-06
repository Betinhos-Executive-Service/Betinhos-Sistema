// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import { EMPTY_DATA } from '../data/source'
import type { FrotaData } from '../data/types'
import { Indicadores, linhasCsv } from './Indicadores'

const data: FrotaData = {
  ...EMPTY_DATA,
  manutencoes: [
    { id: 'm1', codigo: 'M1', descricao: 'Troca de óleo', status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: '2026-09-20T12:00:00Z', valor: 200, estabelecimento: 'Oficina', servicoRealizado: 'Óleo', comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'TST1A11' }, solicitante: null, criadoEm: '2026-09-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
    { id: 'm2', codigo: 'M2', descricao: 'Alinhamento', status: MANUT.REALIZADO, grau: 1, tipo: 2, agendarPara: null, dataManutencao: '2026-09-25T12:00:00Z', valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'TST1A11' }, solicitante: null, criadoEm: '2026-09-21T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
  ],
  multas: [{ id: 'u1', titulo: 'AIT 1', status: 202410000, dataHora: '2026-09-25T12:00:00Z', local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: null, motorista: { id: 'f1', label: 'Ana' }, infracaoId: 'i1', criadoEm: '2026-09-26T12:00:00Z' }],
  infracoes: [{ id: 'i1', codigo: '7455', descricao: null, gravidade: 1, pontos: 4, valor: 130.16 }],
}

const semValores: FrotaData = {
  ...data,
  manutencoes: [{ ...data.manutencoes[1], id: 'm3', veiculo: { id: 'v2', label: 'SEM2B22' } }],
  multas: [{ ...data.multas[0], id: 'u2', motorista: { id: 'f2', label: 'Beto' }, infracaoId: 'i2' }],
  infracoes: [{ id: 'i2', codigo: '9999', descricao: null, gravidade: 1, pontos: 3, valor: null }],
}

afterEach(cleanup)

const painel = (titulo: string) => within(screen.getByRole('heading', { name: titulo }).closest('section') as HTMLElement)

describe('Indicadores', () => {
  it('mostra custo total, quantidade sem valor e tempo médio', () => {
    render(<Indicadores data={data} today="2026-10-02" />)
    expect(screen.getAllByText(/200,00/).length).toBeGreaterThan(0)
    expect(screen.getByText('1 sem valor informado')).toBeTruthy()
    expect(screen.getByText('7 dias')).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
  })

  it('monta o CSV das manutenções realizadas no período', () => {
    const csv = linhasCsv(data, { de: '2026-09-01', ate: '2026-10-02' })
    expect(csv.headers).toEqual(['Data', 'Veículo', 'Descrição', 'Tipo de reparo', 'Estabelecimento', 'Valor'])
    expect(csv.rows).toEqual([
      ['25/09/2026', 'TST1A11', 'Alinhamento', 'Corretiva não crítica', '', null],
      ['20/09/2026', 'TST1A11', 'Troca de óleo', 'Preventiva sistemática', 'Oficina', 200],
    ])
  })

  it('não mostra R$ 0,00 no custo quando todas as manutenções realizadas estão sem valor', () => {
    render(<Indicadores data={semValores} today="2026-10-02" />)
    const kpi = within(screen.getByLabelText('Resumo')).getByText('Custo de manutenção no período').closest('article') as HTMLElement
    expect(within(kpi).getByText('Não informado')).toBeTruthy()
    expect(kpi.textContent).not.toMatch(/0,00/)
    expect(within(kpi).getByText('1 sem valor informado')).toBeTruthy()
  })

  it('mostra R$ 0,00 no custo quando não há manutenção realizada no período', () => {
    render(<Indicadores data={EMPTY_DATA} today="2026-10-02" />)
    const kpi = within(screen.getByLabelText('Resumo')).getByText('Custo de manutenção no período').closest('article') as HTMLElement
    expect(kpi.textContent).toMatch(/0,00/)
    expect((screen.getByRole('button', { name: /Exportar/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('mostra Não informado, e não R$ 0,00, no custo por veículo sem valor', () => {
    render(<Indicadores data={semValores} today="2026-10-02" />)
    const porVeiculo = painel('Custo por veículo')
    expect(porVeiculo.getByText('SEM2B22')).toBeTruthy()
    expect(porVeiculo.getByText('Não informado')).toBeTruthy()
    expect(porVeiculo.getByText(/1 sem valor/)).toBeTruthy()
    expect(porVeiculo.queryByText(/0,00/)).toBeNull()
  })

  it('mostra Não informado, e não R$ 0,00, nas multas do motorista sem valor de catálogo', () => {
    render(<Indicadores data={semValores} today="2026-10-02" />)
    const linha = screen.getByText('Beto').closest('[role="row"]') as HTMLElement
    expect(within(linha).getByText('Não informado')).toBeTruthy()
    expect(within(linha).getByText(/1 sem valor/)).toBeTruthy()
    expect(linha.textContent).not.toMatch(/0,00/)
  })

  it('ignora período invertido', () => {
    render(<Indicadores data={data} today="2026-10-02" />)
    const de = screen.getByLabelText('De') as HTMLInputElement
    const ate = screen.getByLabelText('Até') as HTMLInputElement
    fireEvent.change(de, { target: { value: '2026-11-01' } })
    expect(de.value).toBe('2025-10-02')
    fireEvent.change(ate, { target: { value: '2024-01-01' } })
    expect(ate.value).toBe('2026-10-02')
  })
})
