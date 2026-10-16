// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IA_DECISAO, IA_STATUS, IA_VAZIA, type AnaliseIA as Analise } from '../domain/ia'
import { AnaliseIA } from './AnaliseIA'

afterEach(cleanup)
const concluida: Analise = {
  ...IA_VAZIA, status: IA_STATUS.concluida, decisao: IA_DECISAO.corrigir, motivos: ['Valor diverge.', 'Cupom ilegível.'],
  valorLido: 51.9, dataLida: '2026-10-15', cnpjLido: '12.345.678/0001-90', estabelecimentoLido: 'Restaurante X',
  confianca: 0.87, modelo: 'claude-x', analisadaEm: new Date('2026-10-15T15:30:00Z'),
}
const section = () => screen.getByRole('region', { name: 'Análise da IA' })

describe('seção Análise da IA', () => {
  it('concluída: decisão, motivos, dados lidos com diferença, confiança, data e modelo', () => {
    render(<AnaliseIA ia={concluida} valor={50} />)
    const s = within(section())
    expect(s.getByText('Precisa corrigir')).toBeTruthy()
    expect(s.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Valor diverge.', 'Cupom ilegível.'])
    expect(s.getByText(/R\$\s?51,90/)).toBeTruthy()
    expect(s.getByText(/R\$\s?1,90 acima do lançado/)).toBeTruthy()
    expect(s.getByText('15/10/2026')).toBeTruthy()
    expect(s.getByText('Restaurante X')).toBeTruthy()
    expect(s.getByText('12.345.678/0001-90')).toBeTruthy()
    expect(s.getByText('87%')).toBeTruthy()
    expect(s.getByText('Analisada em 15/10/2026 12:30 · claude-x')).toBeTruthy()
  })

  it('validada sem diferença de valor não mostra destaque', () => {
    render(<AnaliseIA ia={{ ...concluida, decisao: IA_DECISAO.validar, valorLido: 50.2 }} valor={50} />)
    expect(within(section()).getByText('Validar')).toBeTruthy()
    expect(within(section()).queryByText(/do lançado/)).toBeNull()
  })

  it('sem análise, processando e erro', () => {
    const { rerender } = render(<AnaliseIA ia={IA_VAZIA} valor={50} />)
    expect(within(section()).getByText('Ainda não analisada')).toBeTruthy()
    rerender(<AnaliseIA ia={{ ...IA_VAZIA, status: IA_STATUS.pendente }} valor={50} />)
    expect(within(section()).getByText('Ainda não analisada')).toBeTruthy()
    rerender(<AnaliseIA ia={{ ...IA_VAZIA, status: IA_STATUS.processando }} valor={50} />)
    expect(within(section()).getByText('Processando: a IA está lendo o comprovante.')).toBeTruthy()
    rerender(<AnaliseIA ia={{ ...IA_VAZIA, status: IA_STATUS.erro, motivos: ['Timeout na API.'] }} valor={50} />)
    expect(within(section()).getByText('Erro na análise')).toBeTruthy()
    expect(within(section()).getByText('Timeout na API.')).toBeTruthy()
  })
})
