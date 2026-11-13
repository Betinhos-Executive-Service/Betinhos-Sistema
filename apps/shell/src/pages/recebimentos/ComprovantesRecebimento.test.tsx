// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComprovantesRecebimento, ListaRecebimentos, resumoRecebimentos } from './ComprovantesRecebimento'
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

  it('na OP, agrupa por serviço na ordem da ficha, com ID, data e destino no título', () => {
    const lista = [{ ...rec('x', 1), reservaId: 's2' }, rec('a', 1), { ...rec('y', 2), reservaId: 's2' }]
    const servicos = [{ id: 'S2', codigo: 'OS-2', data: new Date('2026-11-11T12:00:00-03:00'), destino: 'Embraer' }, { id: 's1', codigo: '', data: null, destino: '' }, { id: 's3', codigo: 'OS-3', data: null, destino: 'GRU' }]
    render(<ListaRecebimentos estado={{ lista }} recarregar={() => {}} source={fonte(async () => [])} servicos={servicos} />)
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['OS-2 · 11/11/2026 · Embraer', 'Serviço sem ID · — · Sem destino'])
    expect(screen.getAllByRole('button', { name: /^Ver / }).map((c) => c.getAttribute('aria-label'))).toEqual(['Ver x.jpg', 'Ver y.jpg', 'Ver a.jpg'])
    expect(resumoRecebimentos({ lista })).toBe('3 comprovantes · 2 serviços')
  })
})
