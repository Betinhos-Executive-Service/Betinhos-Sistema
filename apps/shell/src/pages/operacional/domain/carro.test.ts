import { describe, expect, it } from 'vitest'
import { carroDoServico, descreverCarro, linkValido, mensagemCliente } from './carro'
import type { Motorista, Reserva, Veiculo } from './types'

const ruh: Veiculo = { id: 'v1', placa: 'RUH7G45', modelo: 'Corolla', cor: 'Prata' }
const fcb: Veiculo = { id: 'v2', placa: 'FCB8B61', modelo: 'Compass', cor: 'PRETA' }
const motorista: Motorista = { id: 'm1', nome: 'João da Silva', apelido: 'João', celular: '', veiculoAtualId: 'v1', terceiro: false }
const base = { statusValue: 202410005, status: 'Programado', veiculoId: null, linkAcompanhamento: '', linkExpiraEm: null } as unknown as Reserva

describe('carroDoServico', () => {
  it('antes de concluir usa o carro atual do motorista', () => {
    expect(carroDoServico(base, motorista, [ruh, fcb])).toEqual(ruh)
  })
  it('depois de concluir usa o carro gravado no serviço', () => {
    const concluida = { ...base, statusValue: 202410008, status: 'Concluído', veiculoId: 'v2' }
    expect(carroDoServico(concluida, motorista, [ruh, fcb])).toEqual(fcb)
  })
  it('sem motorista ou sem carro devolve null', () => {
    expect(carroDoServico(base, undefined, [ruh])).toBeNull()
    expect(carroDoServico(base, { ...motorista, veiculoAtualId: null }, [ruh])).toBeNull()
  })
})

describe('descreverCarro', () => {
  it('modelo, cor e placa; caixa alta suavizada', () => {
    expect(descreverCarro(ruh)).toBe('Corolla Prata · RUH7G45')
    expect(descreverCarro(fcb)).toBe('Compass Preta · FCB8B61')
    expect(descreverCarro({ ...ruh, cor: '' })).toBe('Corolla · cor não cadastrada · RUH7G45')
  })
})

describe('mensagemCliente', () => {
  it('monta o texto do WhatsApp', () => {
    expect(mensagemCliente({ motorista: 'João', carro: ruh, link: 'https://l/r/x' })).toBe(
      '*Seu motorista:* João\n• *Carro:* Corolla Prata\n• *Placa:* RUH7G45\n• *Acompanhe:* https://l/r/x')
  })
  it('omite carro e link ausentes', () => {
    expect(mensagemCliente({ motorista: 'João', carro: null, link: null })).toBe('*Seu motorista:* João')
  })
})

describe('linkValido', () => {
  it('só devolve link não expirado', () => {
    const now = new Date('2026-10-13T12:00:00Z')
    expect(linkValido({ ...base, linkAcompanhamento: 'https://l', linkExpiraEm: new Date('2026-10-13T13:00:00Z') }, now)).toBe('https://l')
    expect(linkValido({ ...base, linkAcompanhamento: 'https://l', linkExpiraEm: new Date('2026-10-13T11:00:00Z') }, now)).toBeNull()
    expect(linkValido({ ...base, linkAcompanhamento: '', linkExpiraEm: new Date('2026-10-13T13:00:00Z') }, now)).toBeNull()
  })
})
