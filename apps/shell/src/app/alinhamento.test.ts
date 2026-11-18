import { describe, expect, it } from 'vitest'

// Decisão do Renan, 12/11/2026: toda coluna de tabela fica alinhada à esquerda, inclusive valores e ações.
const fontes = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('alinhamento das tabelas', () => {
  it('nenhuma coluna usa align diferente de esquerda', () => {
    const fora = Object.entries(fontes).flatMap(([arquivo, texto]) =>
      texto.split('\n').flatMap((linha, i) => (/\balign:\s*'(end|center|right)'/.test(linha) ? [`${arquivo}:${i + 1}`] : [])),
    )
    expect(fora).toEqual([])
  })
})
