import { describe, expect, it } from 'vitest'
import { tipoServicoDoPedido, trajetoDoPedido } from './campos'

const LATASA = 'Latasa Reciclagem, Pindamonhangaba - SP'
const GRU = 'Aeroporto de Guarulhos (GRU), Guarulhos - SP'

describe('tipoServicoDoPedido', () => {
  it('cidade do destino primeiro, depois a da origem', () => {
    expect(tipoServicoDoPedido(LATASA, GRU)).toBe(202410000) // Guarulhos
    expect(tipoServicoDoPedido(GRU, LATASA)).toBe(202410005) // Pindamonhangaba
    expect(tipoServicoDoPedido('Av. Paulista, 1000, São Paulo - SP', 'Aeroporto de Congonhas')).toBe(202410007) // Congonhas
    expect(tipoServicoDoPedido('São Paulo', 'São Paulo')).toBe(202410009)
  })
  it('siglas e apelidos', () => {
    expect(tipoServicoDoPedido('Latasa', 'GRU')).toBe(202410000)
    expect(tipoServicoDoPedido('Latasa', 'CGH')).toBe(202410007)
    expect(tipoServicoDoPedido('Latasa', 'Viracopos')).toBe(202410008)
    expect(tipoServicoDoPedido('Latasa', 'GIG')).toBe(202410004)
    expect(tipoServicoDoPedido('Rua X', 'Latasa, Pinda')).toBe(202410005)
    expect(tipoServicoDoPedido('Rua X', 'Aeroporto')).toBe(202410000)
  })
  it('nome de rua com cidade não conta', () => {
    expect(tipoServicoDoPedido('Rua X', 'Av. São Paulo, 500, Centro, Taubaté - SP, 12020-000')).toBe(202410002)
    expect(tipoServicoDoPedido('Rua X', 'Rua Campinas, 100, Pinheiros, São Paulo - SP')).toBe(202410009)
  })
  it('sem cidade conhecida cai em Outras Cidades', () => {
    expect(tipoServicoDoPedido('Rua X', 'Rua Y')).toBe(202410002)
  })
})

describe('trajetoDoPedido', () => {
  it('primeiro trecho (antes da vírgula) de origem e destino, unidos por " / "', () => {
    expect(trajetoDoPedido('Latasa Reciclagem, Pinda', 'GRU')).toBe('Latasa Reciclagem / GRU')
  })
})
