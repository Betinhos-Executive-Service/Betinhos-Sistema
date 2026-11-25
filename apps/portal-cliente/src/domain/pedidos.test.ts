import { describe, expect, it } from 'vitest'
import { celularValido, chaveNome, emailValido, errosPassageiros, normalizarPedido, textoCortesia, textoDoEndereco, validarPedido } from './pedidos'

const T0 = Date.parse('2026-11-01T12:00:00Z')
const pedido = (passageiros: Parameters<typeof normalizarPedido>[0]['passageiros']) =>
  normalizarPedido({ passageiros, origem: 'A', destino: 'B', saida: '2026-11-03T10:00:00Z' })

describe('contato do passageiro', () => {
  it('celular com 10 ou 11 dígitos, aceitando máscara e +55', () => {
    expect(celularValido('(12) 99999-0001')).toBe(true)
    expect(celularValido('+55 12 99999-0001')).toBe(true)
    expect(celularValido('1233334444')).toBe(true)
    expect(celularValido('99999-0001')).toBe(false)
    expect(celularValido('123')).toBe(false)
  })
  it('e-mail de formato básico', () => {
    expect(emailValido('ana@exemplo.com')).toBe(true)
    expect(emailValido('ana@exemplo')).toBe(false)
    expect(emailValido('ana exemplo.com')).toBe(false)
  })
  it('sem celular nem e-mail: "Informe celular ou e-mail."', () => {
    expect(validarPedido(pedido([{ nome: 'Ana' }]), T0).passageiros).toBe('Informe celular ou e-mail.')
  })
  it('celular ou e-mail inválido é recusado; um dos dois válido basta', () => {
    expect(validarPedido(pedido([{ nome: 'Ana', telefone: '123' }]), T0).passageiros).toMatch(/Celular inválido/)
    expect(validarPedido(pedido([{ nome: 'Ana', email: 'x' }]), T0).passageiros).toMatch(/E-mail inválido/)
    expect(validarPedido(pedido([{ nome: 'Ana', email: 'ana@exemplo.com' }]), T0)).toEqual({})
    expect(validarPedido(pedido([{ nome: 'Ana', telefone: '12999990001' }]), T0)).toEqual({})
  })
})

describe('passageiros do pedido', () => {
  it('1 a 4; mais que isso o normalizador corta e a lista vazia é recusada', () => {
    const cinco = ['A', 'B', 'C', 'D', 'E'].map((nome) => ({ nome, email: `${nome}@x.co` }))
    expect(pedido(cinco).passageiros).toHaveLength(4)
    expect(validarPedido(pedido([]), T0).passageiros).toBe('Informe pelo menos um passageiro.')
  })
  it('repetido pelo mesmo id ou pelo mesmo nome (sem caixa, acento nem espaço extra) é erro', () => {
    const c = { email: 'a@b.co' }
    expect(errosPassageiros([{ id: 'x', nome: 'Ana', ...c }, { id: 'x', nome: 'Outra', ...c }])[1]).toMatch(/já está/)
    expect(errosPassageiros([{ nome: 'João  Silva', ...c }, { nome: 'joao silva', ...c }])[1]).toMatch(/já está/)
    expect(errosPassageiros([{ nome: 'Ana', ...c }, { nome: 'Bia', ...c }])).toEqual([undefined, undefined])
    expect(chaveNome(' João  Silva ')).toBe('joao silva')
  })
  it('normaliza: aparas, contato vazio some, nome vazio sai', () => {
    expect(pedido([{ nome: ' Ana ', telefone: ' ', email: ' a@b.co ' }, { nome: ' ' }]).passageiros).toEqual([{ nome: 'Ana', email: 'a@b.co' }])
  })
  it('cortesia "Nome – contato; Nome – contato" (celular antes do e-mail)', () => {
    expect(textoCortesia([{ nome: 'Ana', telefone: '12999990001', email: 'a@b.co' }, { nome: 'Bia', email: 'b@b.co' }])).toBe('Ana – 12999990001; Bia – b@b.co')
  })
})

describe('data, hora e veículo', () => {
  it('saída vazia, passada ou além de um ano é recusada', () => {
    const ok = [{ nome: 'Ana', email: 'a@b.co' }]
    expect(validarPedido({ ...pedido(ok), saida: '' }, T0).saida).toMatch(/data e a hora/)
    expect(validarPedido({ ...pedido(ok), saida: '2026-10-01T10:00:00Z' }, T0).saida).toMatch(/daqui para a frente/)
    expect(validarPedido({ ...pedido(ok), saida: '2028-01-01T10:00:00Z' }, T0).saida).toMatch(/um ano/)
  })
  it('tipo de veículo fora da lista é recusado; sem valor, fica sem preferência', () => {
    const ok = [{ nome: 'Ana', email: 'a@b.co' }]
    expect(validarPedido({ ...pedido(ok), tipoVeiculo: 202410003 }, T0)).toEqual({})
    expect(validarPedido({ ...pedido(ok), tipoVeiculo: 5 }, T0).tipoVeiculo).toMatch(/inválido/)
    expect(validarPedido(pedido(ok), T0)).toEqual({})
  })
})

describe('texto do endereço sugerido', () => {
  it('junta rótulo e endereço; não repete o rótulo quando o endereço já o traz; respeita o limite', () => {
    expect(textoDoEndereco({ rotulo: 'Aeroporto de Congonhas', endereco: 'Av. Washington Luís, São Paulo' })).toBe('Aeroporto de Congonhas, Av. Washington Luís, São Paulo')
    expect(textoDoEndereco({ rotulo: 'Avenida Paulista, 1000', endereco: 'Avenida Paulista, 1000, São Paulo' })).toBe('Avenida Paulista, 1000, São Paulo')
    expect(textoDoEndereco({ rotulo: 'x', endereco: 'y'.repeat(500) }).length).toBe(300)
  })
})
