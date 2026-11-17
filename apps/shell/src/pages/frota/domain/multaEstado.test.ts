import { describe, expect, it } from 'vitest'
import { MULTA, MOTIVO_EMPRESA, RESPONSAVEL } from '../data/schema'
import type { Multa } from '../data/types'
import { EMPRESA, estadoDaMulta, responsavelDaMulta, situacaoDaMulta, urgenciaDoPrazo } from './multaEstado'

const base: Multa = { id: 'u1', codigo: 'NT-1073', titulo: 'AIT 1', status: MULTA.NOTIFICAR, dataHora: '2026-11-10T16:00:00Z', local: null, dataParaIndicar: '2026-11-30', indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'TST1A11' }, motorista: { id: 'f1', label: 'Ana (fictício)' }, infracaoId: null, criadoEm: '2026-11-11T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }

describe('multa → estado das regras', () => {
  it('leva o motorista, as datas e os campos novos', () => {
    expect(estadoDaMulta({ ...base, status: MULTA.INDICADA, vencimento: '2026-12-01', valorPago: null })).toMatchObject({ status: MULTA.INDICADA, motoristaId: 'f1', dataParaIndicar: '2026-11-30', vencimento: '2026-12-01', recursoPendente: false })
  })

  it('texto vazio nas datas vira null: o espelho das regras testa == null', () => {
    const e = estadoDaMulta({ ...base, dataAviso: '', dataIndicacao: '', aceiteEm: '', vencimento: '', pagaEm: '', competencia: '', acertoEm: '', encerradaEm: '', canceladaEm: '', motivoCancelamento: '' })
    expect([e.dataAviso, e.dataIndicacao, e.aceiteEm, e.vencimento, e.pagaEm, e.competencia, e.acertoEm, e.encerradaEm, e.canceladaEm, e.motivoCancelamento]).toEqual(Array(10).fill(null))
  })

  it('responsável: Empresa quando gravado; nas antigas, o motorista do lookup', () => {
    expect(responsavelDaMulta({ ...base, responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.PRAZO_PERDIDO })).toBe(EMPRESA)
    expect(responsavelDaMulta(base)).toEqual({ id: 'f1', label: 'Ana (fictício)' })
    expect(responsavelDaMulta({ ...base, motorista: null })).toBeNull()
  })

  it('prazo vencido vem das regras espelhadas', () => {
    expect(situacaoDaMulta({ ...base, dataParaIndicar: '2026-11-16' }, '2026-11-17').pendentes).toEqual(['PrazoVencido'])
  })
})

describe('urgência do prazo', () => {
  it('vermelho quando vencido, âmbar com 7 dias ou menos, normal depois', () => {
    expect(urgenciaDoPrazo('2026-11-30', true, '2026-11-17')).toBe('vencido')
    expect(urgenciaDoPrazo('2026-11-16', false, '2026-11-17')).toBe('vencido')
    expect(urgenciaDoPrazo('2026-11-17', false, '2026-11-17')).toBe('atencao')
    expect(urgenciaDoPrazo('2026-11-24', false, '2026-11-17')).toBe('atencao')
    expect(urgenciaDoPrazo('2026-11-25', false, '2026-11-17')).toBe('normal')
    expect(urgenciaDoPrazo(null, false, '2026-11-17')).toBe('normal')
  })
})
