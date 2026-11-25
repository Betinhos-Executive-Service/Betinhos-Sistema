import { describe, expect, it } from 'vitest'
import { chaveDaMarca } from './marca'

describe('marca do cliente', () => {
  it('chave do link: nome sem acento, minúsculo, com hífen', () => {
    expect(chaveDaMarca('Latasa')).toBe('latasa')
    expect(chaveDaMarca(' Recicla BR – Ânima ')).toBe('recicla-br-anima')
    expect(chaveDaMarca('')).toBe('')
  })
})
