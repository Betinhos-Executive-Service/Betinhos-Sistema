// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CurriculosPage } from './CurriculosPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})

describe('Currículos: busca', () => {
  it('várias palavras (E) filtram o quadro e marcam onde achou', async () => {
    const marcados = new Set<Range>()
    vi.stubGlobal('Highlight', class extends Set<Range> {})
    vi.stubGlobal('CSS', { highlights: { set: (_: string, h: Set<Range>) => { h.add = marcados.add.bind(marcados); h.delete = marcados.delete.bind(marcados) }, delete: () => undefined } })
    window.location.hash = '#/curriculos?q=carlos%20paula'
    render(<CurriculosPage host={{ mode: 'mock' }} />)
    await screen.findByText('Ana Paula Ribeiro')
    await waitFor(() => expect(screen.queryByText('Bruno Teixeira')).toBeNull())
    expect(screen.getByText('Ana Paula Ribeiro')).toBeTruthy()
    await waitFor(() => expect([...marcados].map((r) => r.toString().toLowerCase())).toContain('paula'))
  })
})
