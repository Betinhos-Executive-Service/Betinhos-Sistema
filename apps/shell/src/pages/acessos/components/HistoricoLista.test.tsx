// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Historico } from '../domain/types'
import { HistoricoLista } from './HistoricoLista'

afterEach(cleanup)

const perfis = { areas: {}, acessos: false }
const entrada = (id: string, extra: Partial<Historico>): Historico => ({ id, usuarioId: 'u1', usuario: 'Carlos Exemplo', alteradoPor: 'Ana Exemplo', quando: new Date('2026-11-26T12:00:00Z'), antes: perfis, depois: perfis, ...extra })
const retirada = entrada('h2', { amplo: { acao: 'retirar', papeis: [{ id: 'r1', nome: 'DEV - Usuário' }] } })

describe('HistoricoLista: acesso amplo', () => {
  it('mostra a retirada e devolve depois da confirmação', async () => {
    const onDevolver = vi.fn().mockResolvedValue(undefined)
    render(<HistoricoLista itens={[retirada]} onDevolver={onDevolver} />)
    expect(screen.getByText('Acesso amplo retirado: DEV - Usuário')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Devolver acesso amplo' }))
    expect(onDevolver).not.toHaveBeenCalled()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Devolver acesso amplo' })).at(-1)!)
    await waitFor(() => expect(onDevolver).toHaveBeenCalledWith(retirada))
  })

  it('sem permissão, ou depois de devolvido, não oferece o botão', () => {
    const { rerender } = render(<HistoricoLista itens={[retirada]} />)
    expect(screen.queryByRole('button', { name: 'Devolver acesso amplo' })).toBeNull()
    const devolvida = entrada('h3', { amplo: { acao: 'devolver', papeis: [] } })
    rerender(<HistoricoLista itens={[devolvida, retirada]} onDevolver={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Devolver acesso amplo' })).toBeNull()
  })

  it('falha ao devolver fica na lista, com o diálogo aberto', async () => {
    render(<HistoricoLista itens={[retirada]} onDevolver={vi.fn().mockRejectedValue(new Error('NADA_A_DEVOLVER: nada a devolver'))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Devolver acesso amplo' }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Devolver acesso amplo' })).at(-1)!)
    expect(await screen.findByText('Não foi possível devolver o acesso amplo')).toBeTruthy()
  })
})
