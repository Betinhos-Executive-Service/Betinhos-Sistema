// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brl } from '../domain/format'
import { AnaliseCard } from './AnaliseCard'
import { BotaoCopiar, paraTsv, tabelaCopia } from './Copiar'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Copiar tabela', () => {
  it('monta TSV com cabeçalho, números pt-BR e sem tab, quebra ou espaço fixo dentro da célula', () => {
    const t = tabelaCopia([{ nome: 'Tenaris\tSP', qtd: 1234, valor: 1500.5 }], [['Cliente', (r) => r.nome], ['Serviços', (r) => r.qtd], ['Faturamento', (r) => brl(r.valor)]])
    expect(paraTsv(t)).toBe('Cliente\tServiços\tFaturamento\nTenaris SP\t1.234\tR$ 1.500,50')
  })

  it('copia pelo navigator.clipboard e avisa com o toast "Tabela copiada."', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<ToastProvider><BotaoCopiar nome="de Clientes" tabela={{ colunas: ['A', 'B'], linhas: [['1', '2']] }} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar tabela de Clientes' }))
    expect(await screen.findByText('Tabela copiada.')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('A\tB\n1\t2')
  })

  it('sem clipboard e sem execCommand, avisa o erro com o próximo passo', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    document.execCommand = vi.fn(() => false)
    render(<ToastProvider><BotaoCopiar nome="de X" tabela={{ colunas: ['A'], linhas: [['1']] }} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar tabela de X' }))
    expect(await screen.findByText(/Não foi possível copiar a tabela/)).toBeTruthy()
  })

  it('o AnaliseCard só mostra o botão quando há linhas para copiar', () => {
    render(<AnaliseCard titulo="Clientes" periodo="out/26" unidade="R$" copiar={{ colunas: ['A'], linhas: [] }} />)
    expect(screen.queryByRole('button', { name: /Copiar tabela/ })).toBeNull()
    cleanup()
    render(<AnaliseCard titulo="Clientes" periodo="out/26" unidade="R$" copiar={{ colunas: ['A'], linhas: [['1']] }} />)
    expect(screen.getByRole('button', { name: 'Copiar tabela de Clientes' })).toBeTruthy()
  })
})
