import { describe, expect, it } from 'vitest'
import { DOC_MAX_BYTES } from '../../funcionarios/data/sharepoint'
import { CONTRATO_MAX_BYTES, maxBytesDoTipo, mbDoTipo } from './tamanho'

describe('limite de arquivo por tipo', () => {
  it('contrato aceita até 25 MB; os outros tipos seguem 10 MB', () => {
    expect(maxBytesDoTipo({ codigo: 'CONTRATO' })).toBe(CONTRATO_MAX_BYTES)
    expect(mbDoTipo({ codigo: 'CONTRATO' })).toBe(25)
    expect(maxBytesDoTipo({ codigo: 'CNH' })).toBe(DOC_MAX_BYTES)
    expect(mbDoTipo({ codigo: 'RG' })).toBe(10)
  })
})
