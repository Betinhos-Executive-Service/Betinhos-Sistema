// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComprovantesOpDrawer } from './ComprovantesOpDrawer'
import type { Recebimento } from './domain'
import type { RecebimentosSource } from './source'

afterEach(cleanup)

const servicos = [
  { id: 's1', codigo: 'OS-1001', data: new Date(2026, 10, 12), destino: 'Aeroporto de Guarulhos', status: 'Concluído', valor: null },
  { id: 's2', codigo: 'OS-1002', data: new Date(2026, 10, 13), destino: 'Hotel Unique', status: 'Concluído', valor: null },
  { id: 's3', codigo: 'OS-1003', data: new Date(2026, 10, 14), destino: 'Sem comprovante', status: 'Concluído', valor: null },
]
const rec = (id: string, reservaId: string, nome: string): Recebimento => ({ id, nome, url: null, midia: 'foto', reservaId, ordem: 1, enviadoEm: null, motorista: 'Carlos Souza', tipo: 'Comprovante', status: 100000001, statusTexto: 'Enviado' })

const source: RecebimentosSource = {
  carregar: vi.fn(async () => [rec('a', 's1', 'a.jpg'), rec('b', 's1', 'b.jpg'), rec('c', 's2', 'c.jpg')]),
  contar: async () => new Map(),
  contarPorOp: async () => new Map(),
  financeiro: async () => { throw new Error('a OP não mostra financeiro') },
  arquivo: async () => { throw new Error('fora da tela') },
}

describe('drawer de comprovantes da OP', () => {
  it('eyebrow Recebimento, título da OP e comprovantes agrupados por serviço (só os que têm)', async () => {
    render(<ComprovantesOpDrawer op={{ id: 'op1', nome: 'OP-401' }} source={source} servicos={async () => servicos} mobile={false} onClose={() => undefined} />)
    const drawer = await screen.findByRole('dialog', { name: 'OP-401' })
    expect(within(drawer).getByText('Recebimento')).toBeTruthy()
    expect(await within(drawer).findByText(/OS-1001 · .* · Aeroporto de Guarulhos/)).toBeTruthy()
    expect(within(drawer).getByText(/OS-1002 · .* · Hotel Unique/)).toBeTruthy()
    expect(within(drawer).queryByText(/OS-1003/)).toBeNull()
    expect(within(drawer).getByText('3 comprovantes · 2 serviços')).toBeTruthy()
    expect(source.carregar).toHaveBeenCalledWith(['s1', 's2', 's3'])
    expect(within(drawer).queryByRole('region', { name: 'Financeiro' })).toBeNull()
  })

  it('falha ao carregar os serviços avisa e oferece nova tentativa', async () => {
    const servicosFalha = vi.fn().mockRejectedValueOnce(new Error('sem acesso')).mockResolvedValue(servicos)
    render(<ComprovantesOpDrawer op={{ id: 'op1', nome: 'OP-401' }} source={source} servicos={servicosFalha} mobile={false} onClose={() => undefined} />)
    expect(await screen.findByText('Não foi possível carregar os serviços da OP')).toBeTruthy()
    screen.getByRole('button', { name: 'Tentar de novo' }).click()
    expect(await screen.findByText(/OS-1001/)).toBeTruthy()
  })
})
