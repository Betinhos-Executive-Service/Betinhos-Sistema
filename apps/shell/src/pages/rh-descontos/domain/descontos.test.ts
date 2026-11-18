import { describe, expect, it } from 'vitest'
import type { ParcelaFolha } from '../../frota/data/types'
import { linhasDoMes, mascararCpf, nomeArquivo, planilhaDoMes, porColaborador, resumo, totaisPorMes } from './descontos'

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
  it('linhasDoMes ordena por colaborador e origem, com grupo, textos e subtotal', () => {
    const l = linhasDoMes(P)
    expect(l.map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(l[0].grupo).toBe('Ana Teste · R$ 195,23')
    expect(l[1].grupo).toBe('Bruno Teste · R$ 43,44')
    expect(l[1].origemTexto).toBe('Multa TST0002 · TST4B56')
    expect(l[1].parcelaTexto).toBe('2/3')
    expect(l[1].situacaoTexto).toBe('Prevista')
    expect(l[2].origemTexto).toBe('Termo')
    expect(l[2].situacaoTexto).toBe('Lançada em 18/11')
  })

  it('resumo soma e conta', () => {
    expect(resumo(P)).toEqual({ total: 238.67, colaboradores: 2, previstas: 2, lancadas: 1 })
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

  it('porColaborador agrupa com subtotal em centavos e situação', () => {
    const g = porColaborador(P)
    expect(g.map((x) => [x.nome, x.subtotal, x.tudoLancado])).toEqual([['Ana Teste', 19523, false], ['Bruno Teste', 4344, false]])
    expect(g[1].parcelas.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('totaisPorMes separa lançado, a lançar e atrasada', () => {
    const antiga = parcela({ id: 'd', valor: 60, competencia: '2026-09-01' })
    const t = totaisPorMes([...P, antiga], '2026-11')
    expect(t.get('2026-11')).toEqual({ lancado: 10.1, aLancar: 228.57, atrasada: 0 })
    expect(t.get('2026-09')).toEqual({ lancado: 0, aLancar: 0, atrasada: 60 })
  })

  it('mascararCpf', () => {
    expect(mascararCpf('111.111.111-11')).toBe('111.***.***-11')
    expect(mascararCpf(null)).toBe('')
  })
})
