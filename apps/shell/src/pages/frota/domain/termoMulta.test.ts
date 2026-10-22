import { describe, expect, it } from 'vitest'
import { calcularParcelas, validarAcordo, type Acordo } from './termoMulta'

const folha: Acordo = { forma: 'folha', parcelas: 3, valorTotal: 195.23, primeiraCompetencia: '2026-11-01' }
const ctxOk = { temAditivo: true, recursoPendente: false, temMotorista: true, termoPendente: false }
const ctxTudoRuim = { temAditivo: false, recursoPendente: true, temMotorista: false, termoPendente: true }

const MSG = {
  motorista: 'A multa não tem motorista indicado.',
  aditivo: 'O motorista ainda não tem o aditivo de assinatura eletrônica registrado.',
  termo: 'Já existe um termo pendente para esta multa.',
  parcelas: 'Escolha de 1 a 3 parcelas.',
  competencia: 'Competência inválida.',
  valor: 'Informe um valor maior que zero.',
  recurso: 'Há recurso pendente: o desconto só pode ser acordado depois do resultado.',
}

describe('calcularParcelas', () => {
  it('divide em centavos, com a sobra nas primeiras parcelas e soma exata', () => {
    const parcelas = calcularParcelas(folha)
    expect(parcelas.map((p) => p.valor)).toEqual([65.08, 65.08, 65.07])
    expect(parcelas.map((p) => p.competencia)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3])
  })
  it('uma parcela leva o valor todo', () => {
    expect(calcularParcelas({ ...folha, parcelas: 1 })).toEqual([{ numero: 1, competencia: '2026-11-01', valor: 195.23 }])
  })
  it('virada de ano: dezembro, janeiro e fevereiro', () => {
    expect(calcularParcelas({ ...folha, primeiraCompetencia: '2026-12-01' }).map((p) => p.competencia)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01'])
  })
  it('90,00 em 3x é exato', () => {
    expect(calcularParcelas({ ...folha, valorTotal: 90 }).map((p) => p.valor)).toEqual([30, 30, 30])
  })
  it('2x com sobra de um centavo na primeira', () => {
    expect(calcularParcelas({ ...folha, parcelas: 2, valorTotal: 100.01 }).map((p) => p.valor)).toEqual([50.01, 50])
  })
  it('1,005 vira 1,01 centavo-a-centavo sem erro de ponto flutuante', () => {
    expect(calcularParcelas({ ...folha, parcelas: 1, valorTotal: 1.005 }).map((p) => p.valor)).toEqual([1.01])
  })
  it('guia não gera parcelas', () => {
    expect(calcularParcelas({ ...folha, forma: 'guia' })).toEqual([])
  })
  it('acordo de folha inválido lança erro, sem dividir por zero', () => {
    expect(() => calcularParcelas({ ...folha, parcelas: 0 as 1 })).toThrow()
    expect(() => calcularParcelas({ ...folha, parcelas: 4 as 3 })).toThrow()
    expect(() => calcularParcelas({ ...folha, primeiraCompetencia: '2026-11-15' })).toThrow()
  })
})

describe('validarAcordo', () => {
  it('acordo válido retorna null', () => {
    expect(validarAcordo(folha, ctxOk)).toBeNull()
    expect(validarAcordo({ ...folha, forma: 'guia' }, { ...ctxOk, recursoPendente: true })).toBeNull()
  })
  it('mensagens exatas de cada regra', () => {
    expect(validarAcordo(folha, { ...ctxOk, temMotorista: false })).toBe(MSG.motorista)
    expect(validarAcordo(folha, { ...ctxOk, temAditivo: false })).toBe(MSG.aditivo)
    expect(validarAcordo(folha, { ...ctxOk, termoPendente: true })).toBe(MSG.termo)
    expect(validarAcordo({ ...folha, valorTotal: 0 }, ctxOk)).toBe(MSG.valor)
    expect(validarAcordo({ ...folha, valorTotal: -5 }, ctxOk)).toBe(MSG.valor)
    expect(validarAcordo(folha, { ...ctxOk, recursoPendente: true })).toBe(MSG.recurso)
  })
  it('parcelas fora de 1 a 3 ou não inteiras', () => {
    expect(validarAcordo({ ...folha, parcelas: 0 as 1 }, ctxOk)).toBe(MSG.parcelas)
    expect(validarAcordo({ ...folha, parcelas: 4 as 3 }, ctxOk)).toBe(MSG.parcelas)
    expect(validarAcordo({ ...folha, parcelas: 1.5 as 1 }, ctxOk)).toBe(MSG.parcelas)
  })
  it('competência fora do formato YYYY-MM-01', () => {
    expect(validarAcordo({ ...folha, primeiraCompetencia: '2026-11-15' }, ctxOk)).toBe(MSG.competencia)
    expect(validarAcordo({ ...folha, primeiraCompetencia: '2026-13-01' }, ctxOk)).toBe(MSG.competencia)
    expect(validarAcordo({ ...folha, primeiraCompetencia: 'novembro' }, ctxOk)).toBe(MSG.competencia)
  })
  it('valor mínimo de R$ 0,01 por parcela e 1,005 arredondado', () => {
    expect(validarAcordo({ ...folha, valorTotal: 0.02 }, ctxOk)).toBe(MSG.valor)
    expect(validarAcordo({ ...folha, valorTotal: 0.03 }, ctxOk)).toBeNull()
    expect(validarAcordo({ ...folha, parcelas: 1, valorTotal: 1.005 }, ctxOk)).toBeNull()
  })
  it('ordem das validações, em pares', () => {
    const ruim = { ...folha, parcelas: 0 as 1, primeiraCompetencia: 'x', valorTotal: 0 }
    expect(validarAcordo(ruim, ctxTudoRuim)).toBe(MSG.motorista)
    expect(validarAcordo(ruim, { ...ctxTudoRuim, temMotorista: true })).toBe(MSG.aditivo)
    expect(validarAcordo(ruim, { ...ctxTudoRuim, temMotorista: true, temAditivo: true })).toBe(MSG.termo)
    expect(validarAcordo(ruim, { ...ctxOk, recursoPendente: true })).toBe(MSG.parcelas)
    expect(validarAcordo({ ...ruim, parcelas: 3 }, { ...ctxOk, recursoPendente: true })).toBe(MSG.competencia)
    expect(validarAcordo({ ...ruim, parcelas: 3, primeiraCompetencia: '2026-11-01' }, { ...ctxOk, recursoPendente: true })).toBe(MSG.valor)
  })
})
