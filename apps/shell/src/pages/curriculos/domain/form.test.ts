import { describe, expect, it } from 'vitest'
import { daysAgo, digits, formatMoney, maskCpf, maskPhone, maskUf, normalize } from './text'
import { changePayload, createPayload, emptyForm, isDirty, parseDecimal, payloadSignature, toForm, validateForm } from './form'
import { makeCurriculo } from './fixtures'

const curriculo = makeCurriculo({
  id: 'a', nome: 'Ana', cpf: '123.456.789-01', email: 'ana@exemplo.com', telefone: '(11) 98888-2001', cidade: 'São Paulo',
  estado: 'SP', cargo: 'Motorista', pretensao: 3500.5, nota: 8, cnh: 100000001, status: 100000001,
})

describe('texto', () => {
  it('normaliza e extrai dígitos', () => {
    expect(normalize(' São JOÃO ')).toBe('sao joao')
    expect(digits('(11) 9-8')).toBe('1198')
  })
  it('mascara CPF, telefone e UF', () => {
    expect(maskCpf('12345678901')).toBe('123.456.789-01')
    expect(maskCpf('1234')).toBe('123.4')
    expect(maskCpf('123.456.789-0199')).toBe('123.456.789-01')
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321')
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
    expect(maskPhone('119')).toBe('(11) 9')
    expect(maskPhone('1')).toBe('1')
    expect(maskUf('sp1')).toBe('SP')
  })
  it('conta os dias no fuso de São Paulo', () => {
    const now = new Date('2026-10-05T10:00:00-03:00')
    expect(daysAgo(new Date('2026-10-05T00:30:00-03:00'), now)).toBe('hoje')
    expect(daysAgo(new Date('2026-10-04T23:59:00-03:00'), now)).toBe('ontem')
    expect(daysAgo(new Date('2026-09-25T12:00:00-03:00'), now)).toBe('há 10 dias')
    expect(daysAgo(null, now)).toBe('')
  })
  it('formata moeda', () => {
    expect(formatMoney(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
  })
})

describe('formulário', () => {
  it('valida obrigatórios e formatos', () => {
    const form = { ...emptyForm(100000000), cpf: '123', email: 'ana@', estado: 'S', pretensao: '3.500,00', nota: '11', link: 'www.x.com' }
    expect(validateForm(form)).toEqual({
      nome: 'Informe o nome completo.',
      cpf: 'O CPF precisa ter 11 dígitos.',
      email: 'Use um e-mail no formato nome@dominio.com.',
      estado: 'Use a sigla com 2 letras, ex.: SP.',
      cargo: 'Informe o cargo de interesse.',
      pretensao: 'Use só números, ex.: 3500,00.',
      nota: 'Use um número inteiro de 0 a 10.',
      link: 'Use um endereço que comece com http:// ou https://.',
    })
    expect(validateForm(toForm(curriculo))).toEqual({})
  })
  it('monta o payload de criação só com o preenchido', () => {
    const form = { ...emptyForm(100000000), nome: ' Ana ', cargo: 'Motorista', pretensao: '3500,50', nota: '0', cnh: '100000001' }
    expect(createPayload(form)).toEqual({
      new_nomecompleto: 'Ana', new_cargointeresse: 'Motorista', new_pretensaosalarial: 3500.5, new_nota: 0,
      new_categoriacnh: 100000001, new_statuscurriculo: 100000000,
    })
  })
  it('monta o payload de alteração só com o que mudou', () => {
    const before = toForm(curriculo)
    const after = { ...before, email: '', nota: '9', cidade: 'São Paulo ' }
    expect(changePayload(before, after)).toEqual({ new_email: null, new_nota: 9 })
    expect(isDirty(before, before)).toBe(false)
    expect(isDirty(before, after)).toBe(true)
  })
  it('assina o payload sem depender da ordem das chaves', () => {
    expect(payloadSignature({ b: 1, a: 'x' })).toBe(payloadSignature({ a: 'x', b: 1 }))
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('abc')).toBeNull()
  })
})
