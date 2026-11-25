import { describe, expect, it } from 'vitest'
import { chaveDaMarca, contrasteComBranco, corLegivel, ehCor, estiloDaMarca } from './marca'

describe('marca do cliente', () => {
  it('chave do link: nome sem acento, minúsculo, com hífen', () => {
    expect(chaveDaMarca('Latasa')).toBe('latasa')
    expect(chaveDaMarca(' Recicla BR – Ânima ')).toBe('recicla-br-anima')
    expect(chaveDaMarca('')).toBe('')
  })

  it('só aceita #RRGGBB', () => {
    expect(ehCor('#0A7D4A')).toBe(true)
    for (const ruim of ['#fff', '0a7d4a', '#12345g', 'red', '', null, 12]) expect(ehCor(ruim)).toBe(false)
  })

  it('contraste com branco: preto 21, branco 1, amarelo claro não passa', () => {
    expect(contrasteComBranco('#000000')).toBeCloseTo(21, 0)
    expect(contrasteComBranco('#ffffff')).toBeCloseTo(1, 1)
    expect(corLegivel('#ffd400')).toBeUndefined()
    expect(corLegivel('#0A7D4A')).toBe('#0a7d4a')
    expect(corLegivel('#777777')).toBeUndefined() // 4,48:1
    expect(corLegivel('#767676')).toBe('#767676') // 4,54:1
    expect(corLegivel(undefined)).toBeUndefined()
  })

  it('cor ilegível não gera estilo: vale a cor padrão da Betinhos', () => {
    expect(estiloDaMarca('#ffd400')).toBeUndefined()
    expect(estiloDaMarca('#0a7d4a')).toMatchObject({ '--bt-color-brand': '#0a7d4a', '--pc-marca': '#0a7d4a' })
  })
})
