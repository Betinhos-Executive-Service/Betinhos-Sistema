import { describe, expect, it } from 'vitest'
import { createMockSource } from './mock'

describe('createMockSource (Funcionários)', () => {
  it('get de id inexistente rejeita com mensagem, em vez de devolver undefined', async () => {
    const source = createMockSource()
    await expect(source.get('nao-existe')).rejects.toThrow('Colaborador não encontrado nos dados de exemplo.')
    expect((await source.get('m1')).id).toBe('m1')
  })
})
