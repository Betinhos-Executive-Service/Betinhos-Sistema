// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Detalhe } from '../domain/detalhes'
import { Lista } from './ListaDetalhe'

const GUID = '0f8fad5b-d9cb-469f-a165-70867728950e'
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const SERVICOS: Detalhe = {
  tipo: 'servicos', titulo: 'A receber', descricao: 'Regra.', comOp: true,
  linhas: [
    { id: GUID, dia: '2026-10-02', codigo: 'CP-1', op: 'OP-1', cliente: 'Tenaris', motorista: 'Oliveira', status: 'Concluído', valor: 1500 },
    { id: 'legacy-2026-0001', dia: '2026-10-03', codigo: '', op: '', cliente: 'Embraer', motorista: 'Sem motorista', status: 'Concluído', valor: 500 },
  ],
}

describe('Lista do card ampliado', () => {
  it('resumo, colunas e link "Abrir no Dataverse" só para registros com GUID no modo Dataverse', () => {
    render(<Lista detalhe={SERVICOS} clientUrl="https://org.crm2.dynamics.com" />)
    expect(screen.getByText(/2 serviços · R\$\s2\.000,00/)).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Data', 'Código', 'OP', 'Cliente', 'Motorista', 'Valor', 'Abrir no Dataverse'])
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe(`https://org.crm2.dynamics.com/main.aspx?etn=cr40f_reservadeveculos&id=${GUID}&pagetype=entityrecord`)
  })

  it('modo exemplo: sem link para o Dataverse', () => {
    render(<Lista detalhe={SERVICOS} clientUrl={null} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('CNH com a situação em texto e multas com infração', () => {
    render(<Lista clientUrl={null} detalhe={{ tipo: 'cnh', titulo: 'CNH em atenção', descricao: '', linhas: [{ id: 'f1', motorista: 'Bia', validade: '2026-10-05', dias: -10 }] }} />)
    expect(screen.getByText('Vencida há 10 dias')).toBeTruthy()
    cleanup()
    render(<Lista clientUrl={null} detalhe={{ tipo: 'multas', titulo: 'Multas pendentes', descricao: '', linhas: [{ id: 'm1', dia: '2026-10-02', motorista: 'Ana', infracao: '745-50', status: 'Notificar' }] }} />)
    expect(within(document.body).getByText('745-50')).toBeTruthy()
    expect(screen.getByText('1 multa')).toBeTruthy()
  })
})
