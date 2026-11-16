// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComprovantesServicoDrawer, IndicadorRecebimentos, type ServicoAberto } from './ComprovantesServicoDrawer'
import type { RecebimentosSource } from './source'

afterEach(cleanup)

const source: RecebimentosSource = {
  carregar: vi.fn(async () => []),
  contar: async () => new Map(),
  financeiro: vi.fn(async () => ({ valorAReceber: 450.5, receber: true, formaPagamento: 'Pix' })),
  arquivo: async () => { throw new Error('fora da tela') },
}

function Lista({ quantidade }: { quantidade: number | undefined }) {
  const [aberto, setAberto] = useState<ServicoAberto | null>(null)
  return (
    <>
      <IndicadorRecebimentos quantidade={quantidade} onClick={() => setAberto({ id: 's1', nome: 'OS-1000' })} />
      <ComprovantesServicoDrawer servico={aberto} source={source} mobile={false} onClose={() => setAberto(null)} />
    </>
  )
}

describe('indicador de comprovantes na lista', () => {
  it('sem contagem (nenhum ou falha) não aparece', () => {
    render(<><Lista quantidade={undefined} /><Lista quantidade={0} /></>)
    expect(screen.queryByRole('button', { name: /comprovante/ })).toBeNull()
  })

  it('mostra a contagem e abre o drawer do serviço', async () => {
    render(<Lista quantidade={4} />)
    const botao = screen.getByRole('button', { name: '4 comprovantes de recebimento' })
    expect(botao.textContent).toBe('4')
    fireEvent.click(botao)
    expect(await screen.findByText('Serviço OS-1000')).toBeTruthy()
    expect(screen.getByText('Recebimento')).toBeTruthy()
    expect(await screen.findByText('Nenhum comprovante enviado pelo motorista.')).toBeTruthy()
    expect(source.carregar).toHaveBeenCalledWith(['s1'])
  })

  it('mostra o financeiro do serviço (valor a receber, receber e forma) junto com os comprovantes', async () => {
    render(<Lista quantidade={2} />)
    fireEvent.click(screen.getByRole('button', { name: '2 comprovantes de recebimento' }))
    const financeiro = await screen.findByRole('region', { name: 'Financeiro' })
    expect(await screen.findByText('Pix')).toBeTruthy()
    expect(financeiro.textContent).toMatch(/Valor a receber\s*R\$\s*450,50/)
    expect(financeiro.textContent).toContain('ReceberSim')
    expect(source.financeiro).toHaveBeenCalledWith('s1')
  })

  it('falha no financeiro avisa sem esconder os comprovantes', async () => {
    vi.mocked(source.financeiro).mockRejectedValueOnce(new Error('sem acesso'))
    render(<Lista quantidade={2} />)
    fireEvent.click(screen.getByRole('button', { name: '2 comprovantes de recebimento' }))
    expect(await screen.findByText('Não foi possível carregar o financeiro')).toBeTruthy()
    expect(await screen.findByText('Nenhum comprovante enviado pelo motorista.')).toBeTruthy()
  })

  it('um só fica no singular', () => {
    render(<Lista quantidade={1} />)
    expect(screen.getByRole('button', { name: '1 comprovante de recebimento' })).toBeTruthy()
  })
})
