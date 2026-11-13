// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComprovantesRecebimento } from './ComprovantesRecebimento'
import type { Recebimento } from './domain'
import type { RecebimentosSource } from './source'

afterEach(cleanup)

const rec = (id: string, ordem: number): Recebimento => ({ id, nome: `${id}.jpg`, url: `https://example.com/${id}`, midia: 'foto', reservaId: 's1', ordem, enviadoEm: new Date(2026, 10, 12, 9, ordem), motorista: 'Carlos Souza' })
const fonte = (carregar: RecebimentosSource['carregar']): RecebimentosSource => ({ carregar, contar: async () => new Map(), arquivo: vi.fn(async () => { throw new Error('fora da tela') }) })

describe('comprovantes de recebimento', () => {
  it('mostra os comprovantes na ordem do App, com data e motorista', async () => {
    render(<ComprovantesRecebimento source={fonte(async () => [rec('b', 2), rec('a', 1)])} reservaIds={['s1']} />)
    const cartoes = await screen.findAllByRole('button', { name: /^Ver / })
    expect(cartoes.map((c) => c.getAttribute('aria-label'))).toEqual(['Ver a.jpg', 'Ver b.jpg'])
    expect(screen.getAllByText(/12\/11\/2026.*· Carlos Souza/)).toHaveLength(2)
  })

  it('sem comprovante, diz que o motorista não enviou', async () => {
    render(<ComprovantesRecebimento source={fonte(async () => [])} reservaIds={['s1']} />)
    expect(await screen.findByText('Nenhum comprovante enviado pelo motorista.')).toBeTruthy()
  })

  it('falha na leitura oferece tentar de novo', async () => {
    const carregar = vi.fn().mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce([])
    render(<ComprovantesRecebimento source={fonte(carregar)} reservaIds={['s1']} />)
    expect(await screen.findByText(/HTTP 500/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Nenhum comprovante enviado pelo motorista.')).toBeTruthy()
    expect(carregar).toHaveBeenCalledTimes(2)
  })
})
