// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GeralPage } from './GeralPage'
import { usarAmbienteGeral } from './testUtils'

const chamadas = vi.hoisted(() => [] as unknown[])
// Fonte do mock sem latência, registrando as opções que a página passa a `createSource`.
vi.mock('./data/source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/source')>()
  return { ...actual, createSource: (host: Parameters<typeof actual.createSource>[0], options?: Parameters<typeof actual.createSource>[1]) => { chamadas.push(options); return actual.createSource(host, { ...options, latency: 0 }) } }
})
usarAmbienteGeral()

describe('Geral › fonte do mock', () => {
  it('no modo mock a página liga as linhas de manutenção do mock (aparecem no dev e nos prints)', async () => {
    window.location.hash = '#/geral?q=OS-900'
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('button', { name: /^Abrir manutenção Manutenção fictícia m2/, hidden: true })).toBeTruthy()
    expect(chamadas[0]).toMatchObject({ manutencoes: true })
  })
})
