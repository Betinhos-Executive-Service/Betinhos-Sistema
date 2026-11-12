import { describe, expect, it } from 'vitest'
import { fitTemplate } from './VirtualTable'

describe('fitTemplate', () => {
  it('limita cada coluna larga à largura salva e à fatia proporcional do espaço livre', () => {
    expect(fitTemplate('40px 200px 100px minmax(0, 1fr)')).toBe(
      '40px max(48px, min(200px, calc((100% - 3 * var(--bt-table-gap, 0px) - 40px) * 0.6666666666666666))) '
        + 'max(48px, min(100px, calc((100% - 3 * var(--bt-table-gap, 0px) - 40px) * 0.3333333333333333))) minmax(0, 1fr)',
    )
  })
  it('sem coluna larga devolve o modelo como veio', () => {
    expect(fitTemplate('minmax(0, 1fr) 24px')).toBe('minmax(0, 1fr) 24px')
    expect(fitTemplate('')).toBe('')
  })
})
