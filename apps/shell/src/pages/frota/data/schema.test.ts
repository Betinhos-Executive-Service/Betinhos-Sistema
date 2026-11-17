import { describe, expect, it } from 'vitest'
import { MULTA_STATUS } from '../../funcionarios/data/schema'
import { MULTA, STATUS_OPTIONS, TONE, label } from './schema'

describe('rótulos da multa', () => {
  it('são os das etapas, na ordem do passo a passo, com a opção Cancelada', () => {
    expect(STATUS_OPTIONS.multa.map((o) => o.label)).toEqual(['1. Identificar o responsável', '2. Indicar no órgão', '3. Pagar', '4. Acertar', 'Encerrada', 'Em recurso', 'Cancelada', 'Descontado (antigo)'])
    expect(label(STATUS_OPTIONS.multa, MULTA.CANCELADA)).toBe('Cancelada')
    expect(TONE.multa[MULTA.CANCELADA]).toBe('neutral')
  })

  it('funcionários usam a mesma lista', () => {
    expect(MULTA_STATUS).toBe(STATUS_OPTIONS.multa)
  })
})
