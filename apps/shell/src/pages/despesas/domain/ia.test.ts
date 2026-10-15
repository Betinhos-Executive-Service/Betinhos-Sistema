import { describe, expect, it } from 'vitest'
import { createMockDespesas } from '../data/mock'
import { mapDespesa } from '../data/queries'
import { BUILTIN_VIEWS, EMPTY_FILTERS, filterDespesas, parseStoredFilters, viewFilters } from './filters'
import { IA_DECISAO, IA_STATUS, diferencaValor, suspeitaIA } from './ia'

describe('análise da IA', () => {
  it('mapeia as colunas cr40f_ia* e quebra os motivos por linha', () => {
    const d = mapDespesa({
      cr40f_valor: 50, cr40f_iastatusanalise: IA_STATUS.concluida, cr40f_iadecisao: IA_DECISAO.corrigir,
      cr40f_iamotivos: ' Valor lido diverge do lançado.\r\n\n Data fora do dia do gasto. ', cr40f_iavalorlido: 51.9,
      cr40f_iadatalida: '2026-10-15', cr40f_iacnpjlido: '12.345.678/0001-90', cr40f_iaestabelecimentolido: ' Restaurante X ',
      cr40f_iaconfianca: 0.87, cr40f_iamodelo: 'claude-x', cr40f_iadataanalise: '2026-10-15T15:30:00Z',
    })
    expect(d.ia).toEqual({
      status: IA_STATUS.concluida, decisao: IA_DECISAO.corrigir, motivos: ['Valor lido diverge do lançado.', 'Data fora do dia do gasto.'],
      valorLido: 51.9, dataLida: '2026-10-15', cnpjLido: '12.345.678/0001-90', estabelecimentoLido: 'Restaurante X',
      confianca: 0.87, modelo: 'claude-x', analisadaEm: new Date('2026-10-15T15:30:00Z'),
    })
    expect(mapDespesa({}).ia.status).toBeNull()
    expect(mapDespesa({}).ia.motivos).toEqual([])
  })

  it('diferença de valor só acima da tolerância de R$ 0,50', () => {
    expect(diferencaValor(50, 51.9)).toBeCloseTo(1.9)
    expect(diferencaValor(50, 50.4)).toBeNull()
    expect(diferencaValor(null, 10)).toBeNull()
    expect(diferencaValor(10, null)).toBeNull()
  })

  it('visão pronta Suspeitas da IA filtra decisão Precisa corrigir', () => {
    const list = createMockDespesas(new Date(2026, 9, 9, 12))
    const view = BUILTIN_VIEWS.find((v) => v.id === 'ia-suspeita')!
    expect(view.nome).toBe('Suspeitas da IA')
    const out = filterDespesas(list, viewFilters(view))
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((d) => d.ia.decisao === IA_DECISAO.corrigir && suspeitaIA(d))).toBe(true)
    expect(filterDespesas(list, EMPTY_FILTERS).length).toBeGreaterThan(out.length)
    expect(parseStoredFilters({ periodo: '90', alertas: ['ia-suspeita'] })?.alertas).toEqual(['ia-suspeita'])
  })
})
