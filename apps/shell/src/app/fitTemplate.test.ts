import { describe, expect, it } from 'vitest'
import { fitTemplate, minimoDaColuna } from './VirtualTable'

describe('fitTemplate', () => {
  it('limita cada coluna larga à largura da visão, à fatia proporcional e ao mínimo tirado da própria largura', () => {
    expect(fitTemplate('40px 200px 100px minmax(0, 1fr)')).toBe(
      '40px max(130px, min(200px, calc((100% - 3 * var(--bt-table-gap, 0px) - 40px) * 0.6666666666666666))) '
        + 'max(72px, min(100px, calc((100% - 3 * var(--bt-table-gap, 0px) - 40px) * 0.3333333333333333))) minmax(0, 1fr)',
    )
  })
  it('sem coluna larga devolve o modelo como veio', () => {
    expect(fitTemplate('minmax(0, 1fr) 24px')).toBe('minmax(0, 1fr) 24px')
    expect(fitTemplate('')).toBe('')
  })
})

describe('minimoDaColuna', () => {
  it('segue a largura da visão: coluna alargada pelo usuário encolhe menos', () => {
    expect(minimoDaColuna(300)).toBe(195)
    expect(minimoDaColuna(160)).toBe(104)
  })
  it('nunca fica abaixo de 72px nem acima da própria largura', () => {
    expect(minimoDaColuna(90)).toBe(72)
    expect(minimoDaColuna(64)).toBe(64)
  })
})
