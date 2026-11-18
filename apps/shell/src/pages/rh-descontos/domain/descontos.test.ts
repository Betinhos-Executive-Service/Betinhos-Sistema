import { describe, expect, it } from 'vitest'
import type { ParcelaFolha } from '../../frota/data/types'
import { estadoParcela, motivoTexto, nomeArquivo, planilhaDoMes, porColaborador, somaValores } from './descontos'

const ana = { id: 'c1', nome: 'Ana Teste', cpf: '000.000.000-00' }
const bruno = { id: 'c2', nome: 'Bruno Teste', cpf: '111.111.111-11' }
const parcela = (p: Partial<ParcelaFolha> & Pick<ParcelaFolha, 'id' | 'valor'>): ParcelaFolha => ({
  numero: 1, total: 1, competencia: '2026-11-01', status: 'prevista', lancadoEm: null, origem: 'multa', colaborador: bruno,
  multa: { id: 'm1', auto: 'TST0002', placa: 'TST4B56', dataInfracao: '2026-09-15', infracao: 'Estacionar (fictício)' }, ...p,
})
const P = [
  parcela({ id: 'a', valor: 33.34, numero: 2, total: 3 }),
  parcela({ id: 'b', valor: 195.23, colaborador: ana, multa: { id: 'm2', auto: 'TST0001', placa: null, dataInfracao: null, infracao: null } }),
  parcela({ id: 'c', valor: 10.1, origem: 'termo', multa: null, status: 'descontada', lancadoEm: '2026-11-18' }),
]

describe('descontos', () => {
  it('somaValores soma em centavos', () => {
    expect(somaValores(P)).toBe(238.67)
  })

  it('planilhaDoMes tem colunas, subtotais e total geral', () => {
    const pl = planilhaDoMes(P, '2026-11')
    expect(pl.colunas.map((c) => c.titulo)).toEqual(['Colaborador', 'CPF', 'Competência', 'Nº do auto', 'Placa', 'Data da infração', 'Infração', 'Parcela', 'Valor', 'Situação'])
    expect(pl.linhas).toHaveLength(3 + 2 + 1)
    expect(pl.linhas[0]).toEqual(['Ana Teste', '000.000.000-00', '11/2026', 'TST0001', '', '', '', '1/1', { valor: 195.23, formato: 'moeda' }, 'Prevista'])
    expect(pl.linhas[1][0]).toEqual({ valor: 'Subtotal Ana Teste', negrito: true })
    expect(pl.linhas[1][8]).toEqual({ valor: 195.23, formato: 'moeda' })
    expect(pl.linhas[2][5]).toBe('15/09/2026')
    expect(pl.linhas[5][0]).toEqual({ valor: 'Total geral', negrito: true })
    expect(pl.linhas[5][8]).toEqual({ valor: 238.67, formato: 'moeda' })
    expect(pl.linhas[5][9]).toBeNull()
  })

  it('nomeArquivo', () => expect(nomeArquivo('2026-11')).toBe('descontos-folha-2026-11.xlsx'))

  it('porColaborador agrupa com subtotal e situação', () => {
    const g = porColaborador(P)
    expect(g.map((x) => [x.nome, x.subtotal])).toEqual([['Ana Teste', 195.23], ['Bruno Teste', 43.44]])
    expect(g[1].parcelas.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('motivoTexto mostra placa e parcela', () => {
    expect(motivoTexto(parcela({ id: 'x', valor: 1, numero: 2, total: 3 }))).toMatch(/^Multa .+ · parcela 2 de 3$/)
    expect(motivoTexto(parcela({ id: 'y', valor: 1, origem: 'termo', multa: null }))).toBe('Termo · à vista')
  })
  it('estadoParcela separa lançada, cancelada, atrasada e a lançar', () => {
    expect(P.map((p) => estadoParcela(p, '2026-11'))).toEqual(['futura', 'futura', 'lancada'])
    expect(estadoParcela(P[0], '2026-12')).toBe('atrasada')
    expect(estadoParcela({ ...P[0], status: 'cancelada' }, '2026-12')).toBe('cancelada')
  })
})
