import { describe, expect, it } from 'vitest'
import { calcularParcelas, emCentavos, expiraEm, validarAcordo, type Acordo } from './termoMulta'

const folha: Acordo = { forma: 'folha', parcelas: 3, valorTotal: 195.23, primeiraCompetencia: '2026-11-01' }
const ctxOk = { temAditivo: true, recursoPendente: false, temMotorista: true, termoPendente: false, hoje: '2026-11-18', dataParaIndicar: '2026-12-10', avisado: false }
const ctxTudoRuim = { ...ctxOk, temAditivo: false, recursoPendente: true, temMotorista: false, termoPendente: true }

const MSG = {
  motorista: 'A multa não tem motorista indicado.',
  aditivo: 'O motorista ainda não tem o aditivo de assinatura eletrônica registrado.',
  termo: 'Já existe um termo pendente para esta multa.',
  parcelas: 'Escolha de 1 a 3 parcelas.',
  soFolha: 'O termo agora é só para desconto em folha.',
  janela: 'Escolha um mês entre 10/2026 e 11/2027.',
  etapa2: 'O termo só é enviado na etapa 2, antes do aviso ao motorista.',
  prazoCurto: 'Faltam menos de 3 dias para o prazo de indicação; avise pelo WhatsApp.',
  competencia: 'Competência inválida.',
  valor: 'Informe um valor maior que zero.',
  recurso: 'Há recurso pendente: o desconto só pode ser acordado depois do resultado.',
}

describe('calcularParcelas', () => {
  it('divide em centavos, com o resto na última parcela e soma exata', () => {
    const parcelas = calcularParcelas(folha)
    expect(parcelas.map((p) => p.valor)).toEqual([65.07, 65.07, 65.09])
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
  it('2x com sobra de um centavo na última', () => {
    expect(calcularParcelas({ ...folha, parcelas: 2, valorTotal: 100.01 }).map((p) => p.valor)).toEqual([50, 50.01])
  })
  it('termo antigo com 12 parcelas continua calculável, com o resto na última', () => {
    const p = calcularParcelas({ ...folha, parcelas: 12, valorTotal: 1000 })
    expect(p).toHaveLength(12)
    expect(p[11].valor).toBe(83.37)
    expect(p.reduce((s, x) => s + emCentavos(x.valor), 0)).toBe(100000)
  })
  it('1,005 vira 1,01 centavo-a-centavo sem erro de ponto flutuante', () => {
    expect(calcularParcelas({ ...folha, parcelas: 1, valorTotal: 1.005 }).map((p) => p.valor)).toEqual([1.01])
  })
  it('guia não gera parcelas', () => {
    expect(calcularParcelas({ ...folha, forma: 'guia' })).toEqual([])
  })
  it('acordo de folha inválido lança erro, sem dividir por zero', () => {
    expect(() => calcularParcelas({ ...folha, parcelas: 0 as 1 })).toThrow()
    expect(() => calcularParcelas({ ...folha, parcelas: 13 })).toThrow()
    expect(() => calcularParcelas({ ...folha, primeiraCompetencia: '2026-11-15' })).toThrow()
  })
})

const folhaF: Acordo = { ...folha, primeiraCompetencia: '2026-12-01' }
describe('validarAcordo (fase 3)', () => {
  it('acordo válido retorna null', () => {
    expect(validarAcordo(folhaF, ctxOk)).toBeNull()
    expect(validarAcordo({ ...folhaF, parcelas: 3, primeiraCompetencia: '2027-11-01' }, ctxOk)).toBeNull()
  })
  it('mensagens exatas de cada regra', () => {
    expect(validarAcordo(folhaF, { ...ctxOk, temMotorista: false })).toBe(MSG.motorista)
    expect(validarAcordo(folhaF, { ...ctxOk, temAditivo: false })).toBe(MSG.aditivo)
    expect(validarAcordo(folhaF, { ...ctxOk, termoPendente: true })).toBe(MSG.termo)
    expect(validarAcordo({ ...folhaF, forma: 'guia' }, ctxOk)).toBe(MSG.soFolha)
    expect(validarAcordo({ ...folhaF, valorTotal: 0 }, ctxOk)).toBe(MSG.valor)
    expect(validarAcordo(folhaF, { ...ctxOk, recursoPendente: true })).toBe(MSG.recurso)
    expect(validarAcordo(folhaF, { ...ctxOk, avisado: true })).toBe(MSG.etapa2)
    expect(validarAcordo(folhaF, { ...ctxOk, dataParaIndicar: '2026-11-20' })).toBe(MSG.prazoCurto)
    expect(validarAcordo(folhaF, { ...ctxOk, dataParaIndicar: '2026-11-21' })).toBeNull()
  })
  it('parcelas fora de 1 a 3 ou não inteiras', () => {
    expect(validarAcordo({ ...folhaF, parcelas: 0 }, ctxOk)).toBe(MSG.parcelas)
    expect(validarAcordo({ ...folhaF, parcelas: 4 }, ctxOk)).toBe(MSG.parcelas)
    expect(validarAcordo({ ...folhaF, parcelas: 1.5 }, ctxOk)).toBe(MSG.parcelas)
  })
  it('competência fora do formato e fora da janela do RH', () => {
    expect(validarAcordo({ ...folhaF, primeiraCompetencia: '2026-12-15' }, ctxOk)).toBe(MSG.competencia)
    expect(validarAcordo({ ...folhaF, primeiraCompetencia: 'novembro' }, ctxOk)).toBe(MSG.competencia)
    expect(validarAcordo({ ...folhaF, primeiraCompetencia: '2026-08-01' }, ctxOk)).toBe(MSG.janela)
    expect(validarAcordo({ ...folhaF, primeiraCompetencia: '2027-12-01' }, ctxOk)).toBe(MSG.janela)
    expect(validarAcordo({ ...folhaF, primeiraCompetencia: '2026-10-01' }, ctxOk)).toBeNull()
  })
  it('valor mínimo de R$ 0,01 por parcela e 1,005 arredondado', () => {
    expect(validarAcordo({ ...folhaF, valorTotal: 0.02 }, ctxOk)).toBe(MSG.valor)
    expect(validarAcordo({ ...folhaF, valorTotal: 0.03 }, ctxOk)).toBeNull()
    expect(validarAcordo({ ...folhaF, parcelas: 1, valorTotal: 1.005 }, ctxOk)).toBeNull()
  })
  it('ordem do plugin: etapa 2, prazo curto, motorista, aditivo, pendente, folhaF, parcelas, competência, janela, valor', () => {
    const ruim = { ...folhaF, forma: 'guia' as const, parcelas: 0, primeiraCompetencia: 'x', valorTotal: 0 }
    expect(validarAcordo(ruim, { ...ctxTudoRuim, avisado: true, dataParaIndicar: '2026-11-19' })).toBe(MSG.etapa2)
    expect(validarAcordo(ruim, { ...ctxTudoRuim, dataParaIndicar: '2026-11-19' })).toBe(MSG.prazoCurto)
    expect(validarAcordo(ruim, ctxTudoRuim)).toBe(MSG.motorista)
    expect(validarAcordo(ruim, { ...ctxTudoRuim, temMotorista: true })).toBe(MSG.aditivo)
    expect(validarAcordo(ruim, { ...ctxTudoRuim, temMotorista: true, temAditivo: true })).toBe(MSG.termo)
    expect(validarAcordo(ruim, ctxOk)).toBe(MSG.soFolha)
    expect(validarAcordo({ ...ruim, forma: 'folha' }, ctxOk)).toBe(MSG.parcelas)
    expect(validarAcordo({ ...ruim, forma: 'folha', parcelas: 3 }, ctxOk)).toBe(MSG.competencia)
    expect(validarAcordo({ ...ruim, forma: 'folha', parcelas: 3, primeiraCompetencia: '2026-08-01' }, ctxOk)).toBe(MSG.janela)
    expect(validarAcordo({ ...ruim, forma: 'folha', parcelas: 3, primeiraCompetencia: '2026-12-01' }, { ...ctxOk, recursoPendente: true })).toBe(MSG.valor)
  })
})

describe('prazo e rótulo do termo (v2)', () => {
  it('expira 7 dias depois do envio, no dia de São Paulo', () => {
    expect(expiraEm('2026-10-20T13:00:00Z')).toBe('2026-10-27')
    expect(expiraEm('2026-10-21T01:30:00Z')).toBe('2026-10-27')
    expect(expiraEm(null)).toBeNull()
  })
  it('expira no que vier primeiro: 7 dias ou 3 dias antes do prazo de indicação', () => {
    expect(expiraEm('2026-10-20T13:00:00Z', '2026-11-30')).toBe('2026-10-27')
    expect(expiraEm('2026-10-20T13:00:00Z', '2026-10-25')).toBe('2026-10-22')
  })
})
