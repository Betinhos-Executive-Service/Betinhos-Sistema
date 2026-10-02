import { expect, it } from 'vitest'
import { formatBuild } from './BuildBadge'

it('formata versão e data/hora em America/Sao_Paulo', () => {
  expect(formatBuild('0.0.1', '2026-10-02T10:30:00.000Z')).toBe('v0.0.1 · 02/10/2026 07:30')
})
