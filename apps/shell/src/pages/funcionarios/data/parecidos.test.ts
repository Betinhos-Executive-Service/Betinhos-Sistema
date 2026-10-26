import { describe, expect, it } from 'vitest'
import { cpfMascarado, encontrarParecidos, type LinhaFuncionario } from './parecidos'

const base: LinhaFuncionario = { id: 'a', nome: 'João da Silva Ávila', telefones: ['+55 12 99000-0000'], cpf: null, funcao: 202410000, status: 0, emailMicrosoft: null }
const ativos = new Set(['joao@x.com'])

describe('encontrarParecidos', () => {
  it('casa nome ignorando acentos, caixa e espaços extras, de qualquer função e status', () => {
    const r = encontrarParecidos({ nome: '  joao  DA silva avila ', celular: '11988887777' }, [{ ...base, funcao: 202410001, status: 1 }], ativos)
    expect(r).toEqual([{ id: 'a', nome: 'João da Silva Ávila', funcao: 'Administrativo', status: 'Desligado', celular: '+55 12 99000-0000', cpf: '', temAcesso: false, motivos: ['nome'] }])
  })

  it('casa celular normalizado (com ou sem 55) e CPF só quando informado', () => {
    const linhas = [{ ...base, id: 'b', nome: 'Outro Nome', telefones: [null, '+5512991234567'] }, { ...base, id: 'c', nome: 'Terceiro Nome', telefones: [], cpf: '529.982.247-25' }]
    expect(encontrarParecidos({ nome: 'Maria Souza', celular: '(12) 99123-4567' }, linhas, ativos).map((p) => p.id)).toEqual(['b'])
    expect(encontrarParecidos({ nome: 'Maria Souza', celular: '', cpf: '52998224725' }, linhas, ativos).map((p) => [p.id, p.motivos, p.cpf])).toEqual([['c', ['cpf'], '***.982.247-**']])
  })

  it('marca acesso só com e-mail Microsoft e systemuser habilitado', () => {
    const r = encontrarParecidos({ nome: base.nome, celular: '' }, [{ ...base, emailMicrosoft: 'JOAO@x.com' }, { ...base, id: 'z', emailMicrosoft: 'velho@x.com' }], ativos)
    expect(r.map((p) => p.temAcesso)).toEqual([true, false])
  })

  it('não casa nada com dados vazios', () => {
    expect(encontrarParecidos({ nome: '', celular: '', cpf: '' }, [{ ...base, nome: '', telefones: [] }], ativos)).toEqual([])
  })
})

describe('cpfMascarado', () => {
  it('esconde o início e o dígito verificador', () => { expect(cpfMascarado('52998224725')).toBe('***.982.247-**'); expect(cpfMascarado('123')).toBe('') })
})
