import { describe, expect, it } from 'vitest'
import { createMockData } from '../pages/documentos/data/mock'
import { contarUrgentes } from './useDocumentosBadge'

describe('contador de documentos', () => {
  it('soma vencidos e até 7 dias das duas categorias', () => {
    // mock: Ana CNH vencida, Bruno CNH em 6 dias, ABC1D23 CRLV em 3 dias, ABC1D23 IPVA vencido
    expect(contarUrgentes(createMockData('2026-10-13'), '2026-10-13')).toBe(4)
  })
})
