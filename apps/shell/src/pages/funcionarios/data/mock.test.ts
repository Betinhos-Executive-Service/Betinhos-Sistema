import { describe, expect, it } from 'vitest'
import { createMockSource } from './mock'

describe('createMockSource (Funcionários)', () => {
  it('get de id inexistente rejeita com mensagem, em vez de devolver undefined', async () => {
    const source = createMockSource()
    await expect(source.get('nao-existe')).rejects.toThrow('Colaborador não encontrado nos dados de exemplo.')
    expect((await source.get('m1')).id).toBe('m1')
  })
})

describe('createMockSource().equipamentos', () => {
  it('Carlos (m1) tem a maquininha; quem não tem equipamento recebe lista vazia', async () => {
    const source = createMockSource()
    expect(await source.equipamentos('m1')).toEqual([
      { id: 'eeeeeeee-0000-4000-8000-000000000005', descricao: 'Maquininha Carlos', tipo: 'Máquina de cartão', numeroSerie: 'S920-55410', status: 100000000 },
    ])
    expect((await source.equipamentos('m6')).map((item) => item.descricao)).toEqual(['Celular plantão'])
    expect(await source.equipamentos('m3')).toEqual([])
  })
})
