// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT } from '../data/schema'
import { EMPTY_DATA } from '../data/source'
import type { DespesaCombustivel, FrotaData, Manutencao } from '../data/types'
import { CustoTotal } from './CustoTotal'

const v1 = { id: 'v1', label: 'TST1A11' }
const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: '2026-09-20T12:00:00Z', valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: v1, solicitante: null, criadoEm: '2026-09-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })
const desp = (id: string, extra: Partial<DespesaCombustivel>): DespesaCombustivel => ({ id, dia: '2026-09-05', valor: null, veiculo: v1, manutencao: null, categoria: 'combustivel', ...extra })

const data: FrotaData = {
  ...EMPTY_DATA,
  manutencoes: [manut('m1', { valor: 1000 }), manut('m2', {}), manut('m3', { valor: 234.56 })],
  despesasCombustivel: [desp('d1', { valor: 300 }), desp('d2', { categoria: 'manutencao', valor: 80 }), desp('d3', { categoria: 'manutencao', valor: 40 })],
  telemetriaKm: [{ dia: '2026-09-10', veiculoId: 'v1', km: 1000 }, { dia: '2026-09-11', veiculoId: 'v1', km: 234 }],
}
const periodo = { de: '2025-10-02', ate: '2026-10-02' }

afterEach(cleanup)

const linha = (rotulo: string) => screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling as HTMLElement

describe('CustoTotal', () => {
  it('mostra total, R$/km, km rodados e cada fonte com registros', () => {
    render(<CustoTotal data={data} errors={{}} veiculoId="v1" periodo={periodo} onPeriodo={() => {}} />)
    const kpi = document.querySelector('.frota-kpi') as HTMLElement
    expect(kpi.querySelector('strong')?.textContent).toMatch(/^R\$\s1\.534,56$/)
    expect(kpi.querySelector('span')?.textContent).toMatch(/^R\$\s1,24 por km · 1\.234 km rodados$/)
    expect(linha('Manutenção').textContent).toMatch(/^R\$\s1\.234,56 · 3 registros · 1 sem valor$/)
    expect(linha('Combustível').textContent).toMatch(/^R\$\s300,00 · 1 registro$/)
    expect(linha('Multas').textContent).toBe('— · 0 registros')
    expect(linha('Documentos (IPVA e seguro)').textContent).toBe('— · 0 registros')
    expect(screen.getByText('1 sem valor')).toBeTruthy()
  })

  it('mostra a fonte que falhou como Indisponível', () => {
    render(<CustoTotal data={data} errors={{ despesasCombustivel: 'Falha', multas: 'Falha' }} veiculoId="v1" periodo={periodo} onPeriodo={() => {}} />)
    expect(linha('Combustível').textContent).toBe('Indisponível')
    expect(linha('Multas').textContent).toBe('Indisponível')
    expect(document.querySelector('.frota-kpi strong')?.textContent).toMatch(/^R\$\s1\.234,56$/)
  })

  it('mostra Não informado quando todos os registros da fonte estão sem valor', () => {
    const semValor: FrotaData = { ...data, manutencoes: [manut('m2', {})] }
    render(<CustoTotal data={semValor} errors={{}} veiculoId="v1" periodo={periodo} onPeriodo={() => {}} />)
    expect(linha('Manutenção').textContent).toBe('Não informado')
  })

  it('sem telemetria no período, avisa que o R$/km está indisponível', () => {
    render(<CustoTotal data={{ ...data, telemetriaKm: [] }} errors={{}} veiculoId="v1" periodo={periodo} onPeriodo={() => {}} />)
    expect(document.querySelector('.frota-kpi span')?.textContent).toBe('R$/km indisponível (sem telemetria no período)')
  })

  it('avisa as despesas de manutenção sem vínculo, que não entram na soma', () => {
    render(<CustoTotal data={data} errors={{}} veiculoId="v1" periodo={periodo} onPeriodo={() => {}} />)
    expect(screen.getByText('2 despesas de manutenção sem vínculo com uma manutenção (não somadas)')).toBeTruthy()
  })

  it('altera o período pelos campos De e Até e ignora período invertido', () => {
    const onPeriodo = vi.fn()
    render(<CustoTotal data={data} errors={{}} veiculoId="v1" periodo={periodo} onPeriodo={onPeriodo} />)
    const grupo = within(document.body)
    fireEvent.change(grupo.getByLabelText('De'), { target: { value: '2026-01-01' } })
    expect(onPeriodo).toHaveBeenCalledWith({ de: '2026-01-01', ate: '2026-10-02' })
    fireEvent.change(grupo.getByLabelText('Até'), { target: { value: '2024-01-01' } })
    expect(onPeriodo).toHaveBeenCalledTimes(1)
  })
})
