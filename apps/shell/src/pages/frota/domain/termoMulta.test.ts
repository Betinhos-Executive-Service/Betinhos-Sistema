import { describe, expect, it } from 'vitest'
import { calcularParcelas, validarAcordo, type Acordo } from './termoMulta'

const folha: Acordo = { forma: 'folha', parcelas: 3, valorTotal: 195.23, primeiraCompetencia: '2026-11-01' }
const ctxOk = { temAditivo: true, recursoPendente: false, temMotorista: true, termoPendente: false }

describe('calcularParcelas', () => {
  it('divide em centavos, com a sobra nas primeiras parcelas e soma exata', () => {
    const parcelas = calcularParcelas(folha)
    expect(parcelas.map((p) => p.valor)).toEqual([65.08, 65.08, 65.07])
    expect(parcelas.map((p) => p.competencia)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3])
    expect(Math.round(parcelas.reduce((s, p) => s + p.valor * 100, 0))).toBe(19523)
  })
  it('uma parcela leva o valor todo', () => {
    expect(calcularParcelas({ ...folha, parcelas: 1 })).toEqual([{ numero: 1, competencia: '2026-11-01', valor: 195.23 }])
  })
  it('guia não gera parcelas', () => {
    expect(calcularParcelas({ ...folha, forma: 'guia' })).toEqual([])
  })
})

describe('validarAcordo', () => {
  it('acordo válido retorna null', () => {
    expect(validarAcordo(folha, ctxOk)).toBeNull()
    expect(validarAcordo({ ...folha, forma: 'guia' }, { ...ctxOk, recursoPendente: true })).toBeNull()
  })
  it('exige motorista, aditivo, termo não pendente, valor e recurso resolvido', () => {
    expect(validarAcordo(folha, { ...ctxOk, temMotorista: false })).toMatch(/motorista/)
    expect(validarAcordo(folha, { ...ctxOk, temAditivo: false })).toBe('O motorista ainda não tem o aditivo de assinatura eletrônica registrado.')
    expect(validarAcordo(folha, { ...ctxOk, termoPendente: true })).toMatch(/pendente/)
    expect(validarAcordo({ ...folha, valorTotal: 0 }, ctxOk)).toMatch(/valor/)
    expect(validarAcordo(folha, { ...ctxOk, recursoPendente: true })).toBe('Há recurso pendente: o desconto só pode ser acordado depois do resultado.')
  })
  it('segue a ordem das regras', () => {
    expect(validarAcordo({ ...folha, valorTotal: -1 }, { temMotorista: false, temAditivo: false, termoPendente: true, recursoPendente: true })).toMatch(/motorista/)
  })
})
